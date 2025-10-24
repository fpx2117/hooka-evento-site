export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jwtVerify } from "jose";
import type { Prisma, PrismaClient } from "@prisma/client";
import {
  PaymentStatus as PS,
  TicketType as TT,
  TableLocation as TL,
} from "@prisma/client";
import { ensureSixDigitCode } from "@/lib/validation-code";
import { getVipSequentialRanges } from "@/lib/vip-tables";

/* ============ Auth ============ */
const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "your-secret-key-change-in-production"
);
async function verifyAuth(request: NextRequest) {
  const token = request.cookies.get("admin-token")?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload;
  } catch {
    return null;
  }
}

/* ============ Utils ============ */
type DB = Prisma.TransactionClient | PrismaClient;

const normNumber = (v: unknown): number | undefined => {
  if (v == null || v === "") return undefined;
  const n = Number(v);
  return Number.isNaN(n) ? undefined : n;
};

function generateQr(prefix = "TICKET") {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

async function adjustVipSoldCount(
  tx: DB,
  eventId: string,
  location: TL,
  delta: number
) {
  if (!delta) return;
  const cfg = await tx.vipTableConfig.findUnique({
    where: { eventId_location: { eventId, location } },
    select: { id: true, stockLimit: true, soldCount: true },
  });
  if (!cfg) throw new Error("vip_cfg_not_found");
  const next = cfg.soldCount + delta;
  if (next < 0) throw new Error("vip_sold_negative");
  if (next > cfg.stockLimit) throw new Error("vip_sold_exceeds_stock");
  await tx.vipTableConfig.update({
    where: { id: cfg.id },
    data: { soldCount: next },
  });
}

/** Convierte número de mesa GLOBAL -> LOCAL si entra en el rango del sector */
async function toLocalTableNumber(
  eventId: string,
  location: TL,
  inputNumber: number
): Promise<{ localNumber: number; stockLimit: number }> {
  const cfg = await prisma.vipTableConfig.findUnique({
    where: { eventId_location: { eventId, location } },
    select: { stockLimit: true },
  });
  if (!cfg) throw new Error("vip_cfg_not_found");
  const stockLimit = cfg.stockLimit;

  const { ranges } = await getVipSequentialRanges({ prisma, eventId });
  const r = ranges.find((x) => x.location === location);
  if (r && inputNumber >= r.startNumber && inputNumber <= r.endNumber) {
    const local = inputNumber - r.offset;
    if (local >= 1 && local <= stockLimit)
      return { localNumber: local, stockLimit };
  }
  // si no es global válido, tratamos el número como LOCAL directo
  if (inputNumber >= 1 && inputNumber <= stockLimit) {
    return { localNumber: inputNumber, stockLimit };
  }
  throw new Error("table_out_of_range");
}

async function assertVipTableAvailable(
  eventId: string,
  location: TL,
  tableNumberLocal: number,
  excludeTicketId?: string
) {
  const taken = await prisma.ticket.findFirst({
    where: {
      eventId,
      ticketType: TT.vip,
      vipLocation: location,
      tableNumber: tableNumberLocal,
      paymentStatus: { in: [PS.approved, PS.in_process] },
      ...(excludeTicketId ? { id: { not: excludeTicketId } } : {}),
    },
    select: { id: true },
  });
  if (taken) throw new Error("table_taken");
}

/* ============ Core: restore ============ */
/**
 * Restaura 1 registro de TicketArchive -> Ticket
 * - Revalida mesa VIP y ajusta stock si estaba approved.
 * - Maneja colisiones de unicidad (qrCode). Para paymentId podés forzar null.
 */
async function restoreOne(
  tx: DB,
  archiveId: string,
  opts?: { regenerateCodes?: boolean; forcePaymentIdNull?: boolean }
) {
  const a = await tx.ticketArchive.findUnique({ where: { id: archiveId } });
  if (!a) throw new Error("archive_not_found");

  // VIP: validar mesa y convertir a LOCAL si el archivo guardó número "global"
  let tableNumberLocal: number | null = a.tableNumber ?? null;
  if (a.ticketType === TT.vip && a.vipLocation && a.tableNumber != null) {
    const { localNumber } = await toLocalTableNumber(
      a.eventId,
      a.vipLocation,
      a.tableNumber
    );
    await assertVipTableAvailable(a.eventId, a.vipLocation, localNumber);
    tableNumberLocal = localNumber;
  }

  // Prepara campos únicos
  const newQr = generateQr(a.ticketType === TT.vip ? "VIP" : "TICKET");
  const qrCode = opts?.regenerateCodes ? newQr : (a.qrCode ?? newQr);

  // paymentId: si forzás null evitás colisiones con activos
  const paymentId = opts?.forcePaymentIdNull ? null : a.paymentId;

  // Creamos Ticket activo
  let created: { id: string };
  let attempts = 0;
  while (attempts < 5) {
    try {
      created = await tx.ticket.create({
        data: {
          eventId: a.eventId,
          eventDate: a.eventDate,
          ticketType: a.ticketType,
          gender: a.gender ?? null,
          quantity: a.quantity ?? 1,

          vipLocation: a.vipLocation ?? null,
          vipTables: a.vipTables ?? (a.ticketType === TT.vip ? 1 : null),
          capacityPerTable:
            a.capacityPerTable ?? (a.ticketType === TT.vip ? 10 : null),
          tableNumber: tableNumberLocal,

          totalPrice: a.totalPrice,
          customerName: a.customerName,
          customerEmail: a.customerEmail,
          customerPhone: a.customerPhone,
          customerDni: a.customerDni,

          paymentId: paymentId ?? null,
          paymentStatus: a.paymentStatus,
          paymentMethod: a.paymentMethod,

          // Códigos
          qrCode, // único → regenerado si hace falta
          validationCode: null, // se vuelve a emitir si está approved

          validated: false,
          validatedAt: null,

          purchaseDate: a.purchaseDate ?? new Date(),
          expiresAt: a.expiresAt ?? null,

          ticketConfigId: a.ticketConfigId ?? null,
          emailSentAt: a.emailSentAt ?? null,
        },
        select: { id: true },
      });
      break;
    } catch (e: any) {
      if (e?.code === "P2002") {
        // choque de unicidad: regenero QR y reintento
        attempts++;
        continue;
      }
      throw e;
    }
  }
  if (!created!) throw new Error("unique_collision");

  // Si el estado era approved:
  // - VIP: reajustar soldCount
  // - emitir validationCode
  if (a.paymentStatus === PS.approved) {
    if (a.ticketType === TT.vip && a.vipLocation) {
      const delta = a.vipTables ?? 1;
      await adjustVipSoldCount(tx, a.eventId, a.vipLocation, +delta);
    }
    await ensureSixDigitCode(tx as any, { id: created!.id });
  }

  // borrar el archivo
  await tx.ticketArchive.delete({ where: { id: a.id } });

  const restored = await tx.ticket.findUnique({ where: { id: created!.id } });
  return restored;
}

/* ============ Handler ============ */
/**
 * POST /api/admin/tickets/restore
 * Body:
 * {
 *   "ids": ["archiveId1","archiveId2", ...] | "id": "archiveId",
 *   "regenerateCodes": true | false,           // opcional, default: true
 *   "forcePaymentIdNull": true | false         // opcional, default: false
 * }
 */
export async function POST(request: NextRequest) {
  const auth = await verifyAuth(request);
  if (!auth)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body: any = await request.json().catch(() => ({}));
    const oneId = typeof body.id === "string" ? body.id : undefined;
    const ids: string[] = Array.isArray(body.ids)
      ? body.ids.filter((x: any) => typeof x === "string")
      : oneId
        ? [oneId]
        : [];

    if (!ids.length) {
      return NextResponse.json(
        { error: "Provide id or ids[]" },
        { status: 400 }
      );
    }

    const regenerateCodes =
      body.regenerateCodes === undefined ? true : !!body.regenerateCodes;
    const forcePaymentIdNull = !!body.forcePaymentIdNull;

    const results = await prisma.$transaction(async (tx) => {
      const out = [];
      for (const archiveId of ids) {
        const restored = await restoreOne(tx, archiveId, {
          regenerateCodes,
          forcePaymentIdNull,
        });
        out.push(restored);
      }
      return out;
    });

    return NextResponse.json({ ok: true, restored: results });
  } catch (error: any) {
    if (error?.message === "archive_not_found") {
      return NextResponse.json(
        { error: "Archive ID not found" },
        { status: 404 }
      );
    }
    if (error?.message === "vip_cfg_not_found") {
      return NextResponse.json(
        { error: "No hay configuración VIP para esa ubicación" },
        { status: 400 }
      );
    }
    if (error?.message === "table_out_of_range") {
      return NextResponse.json(
        { error: "tableNumber fuera de rango" },
        { status: 400 }
      );
    }
    if (error?.message === "table_taken") {
      return NextResponse.json(
        { error: "La mesa indicada ya está ocupada" },
        { status: 409 }
      );
    }
    if (error?.message === "unique_collision") {
      return NextResponse.json(
        { error: "Colisión de unicidad al restaurar, reintente." },
        { status: 500 }
      );
    }
    console.error("[tickets/restore][POST] Error:", error);
    return NextResponse.json(
      { error: "Failed to restore tickets" },
      { status: 500 }
    );
  }
}

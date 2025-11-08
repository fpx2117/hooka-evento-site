export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jwtVerify } from "jose";
import type { Prisma, PrismaClient } from "@prisma/client";
import {
  PaymentStatus as PS,
  TicketType as TT,
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

/**
 * Ajusta el contador de mesas vendidas para la ubicación VIP
 * usando la clave única compuesta (eventId, vipLocationId).
 */
async function adjustVipSoldCount(
  tx: DB,
  eventId: string,
  vipLocationId: string,
  delta: number
) {
  if (!delta) return;

  const cfg = await tx.vipTableConfig.findUnique({
    where: { eventId_vipLocationId: { eventId, vipLocationId } }, // ✅ clave compuesta correcta
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

/**
 * Convierte número de mesa GLOBAL → LOCAL, si entra en el rango del sector,
 * usando vipLocationId (string). Si no matchea, se trata como local.
 */
async function toLocalTableNumber(
  eventId: string,
  vipLocationId: string,
  inputNumber: number
): Promise<{ localNumber: number; stockLimit: number }> {
  const cfg = await prisma.vipTableConfig.findUnique({
    where: { eventId_vipLocationId: { eventId, vipLocationId } }, // ✅
    select: { stockLimit: true },
  });
  if (!cfg) throw new Error("vip_cfg_not_found");

  const stockLimit = cfg.stockLimit;

  // Buscamos rangos globales → locales, idealmente por vipLocationId
  const { ranges } = await getVipSequentialRanges({ prisma, eventId });

  // Intentamos distintos nombres de campo para robustez
  const r = ranges.find(
    (x: any) =>
      x.vipLocationId === vipLocationId ||
      x.locationId === vipLocationId
  );

  if (r && inputNumber >= r.startNumber && inputNumber <= r.endNumber) {
    const local = inputNumber - r.startNumber + 1;
    if (local >= 1 && local <= stockLimit) {
      return { localNumber: local, stockLimit };
    }
  }

  // Si no corresponde a rango global válido, tratamos como local directo
  if (inputNumber >= 1 && inputNumber <= stockLimit) {
    return { localNumber: inputNumber, stockLimit };
  }

  throw new Error("table_out_of_range");
}

/**
 * Verifica que la mesa VIP esté libre antes de restaurar.
 * Chequea por vipLocationId y tableNumber (local).
 */
async function assertVipTableAvailable(
  eventId: string,
  vipLocationId: string,
  tableNumberLocal: number,
  excludeTicketId?: string
) {
  const taken = await prisma.ticket.findFirst({
    where: {
      eventId,
      ticketType: TT.vip,
      vipLocationId, // ✅ ahora por id
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

  // --- VIP: validar mesa y convertir a LOCAL si el archivo guardó número "global"
  let tableNumberLocal: number | null = a.tableNumber ?? null;

  if (a.ticketType === TT.vip) {
    // Necesitamos el vipLocationId para operar con la config actual
    const vipLocationId =
      (a as any).vipLocationId ??
      null;

    if (!vipLocationId) {
      // Si tu archivo viejo no tenía vipLocationId, en este punto
      // deberías resolverlo buscando la ubicación por eventId + algún campo
      // o fallar con un error claro:
      throw new Error("vip_cfg_not_found");
    }

    if (a.tableNumber != null) {
      const { localNumber } = await toLocalTableNumber(
        a.eventId,
        vipLocationId,
        a.tableNumber
      );
      await assertVipTableAvailable(a.eventId, vipLocationId, localNumber);
      tableNumberLocal = localNumber;
    }
  }

  // Prepara campos únicos
  const newQr = generateQr(a.ticketType === TT.vip ? "VIP" : "TICKET");
  const qrCode = opts?.regenerateCodes ? newQr : (a.qrCode ?? newQr);

  // paymentId: si forzás null evitás colisiones con activos
  const paymentId = opts?.forcePaymentIdNull ? null : a.paymentId;

  // Creamos Ticket activo (reintentos por colisión de QR)
  let created: { id: string } | null = null;
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

          // ✅ Esquema nuevo por id
          vipLocationId: (a as any).vipLocationId ?? null,
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
          qrCode,
          validationCode: null,

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

  if (!created) throw new Error("unique_collision");

  // Si el estado era approved:
  // - VIP: reajustar soldCount
  // - emitir validationCode
  if (a.paymentStatus === PS.approved) {
    if (a.ticketType === TT.vip) {
      const vipLocationId =
        (a as any).vipLocationId ?? null;

      if (!vipLocationId) throw new Error("vip_cfg_not_found");

      const delta = a.vipTables ?? 1;
      await adjustVipSoldCount(tx, a.eventId, vipLocationId, +delta); // ✅
    }
    await ensureSixDigitCode(tx as any, { id: created.id });
  }

  // borrar el archivo restaurado
  await tx.ticketArchive.delete({ where: { id: a.id } });

  const restored = await tx.ticket.findUnique({ where: { id: created.id } });
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
    const errors: Record<string, string> = {
      archive_not_found: "Archive ID not found",
      vip_cfg_not_found:
        "No hay configuración/ubicación VIP válida para esa ubicación",
      table_out_of_range: "tableNumber fuera de rango",
      table_taken: "La mesa indicada ya está ocupada",
      unique_collision: "Colisión de unicidad al restaurar, reintente.",
      vip_sold_negative: "El contador VIP no puede ser negativo",
      vip_sold_exceeds_stock: "El contador VIP excede el stock",
    };

    const msg = errors[error?.message];
    if (msg) return NextResponse.json({ error: msg }, { status: 400 });

    console.error("[tickets/restore][POST] Error:", error);
    return NextResponse.json(
      { error: "Failed to restore tickets" },
      { status: 500 }
    );
  }
}

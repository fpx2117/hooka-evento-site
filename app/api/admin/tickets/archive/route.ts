export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jwtVerify } from "jose";
import type { Prisma } from "@prisma/client";
import {
  ArchiveReason as AR,
  TicketType as TT,
  PaymentStatus as PS,
} from "@prisma/client";

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

/* ============ Helpers ============ */
const parseEnum = <T extends object>(e: T, raw?: string | null) => {
  if (!raw) return undefined;
  const key = raw.trim().replace(/-/g, "_");
  // @ts-ignore
  return e[key] ?? undefined;
};

const parseIntSafe = (v: string | null, def: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : def;
};

const parseOrder = (v: string | null) => (v === "asc" ? "asc" : "desc");

/* ============ GET /api/admin/tickets/archive ============ */
export async function GET(request: NextRequest) {
  const auth = await verifyAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);

  const q = searchParams.get("q")?.trim() || "";
  const reason = parseEnum(AR, searchParams.get("reason")); // ArchiveReason?
  const type = parseEnum(TT, searchParams.get("type")); // TicketType?
  const status = parseEnum(PS, searchParams.get("status")); // PaymentStatus?

  // Filtros de fecha (ISO) sobre archivedAt
  const archivedFromRaw = searchParams.get("archivedFrom");
  const archivedToRaw = searchParams.get("archivedTo");
  const archivedFrom = archivedFromRaw ? new Date(archivedFromRaw) : undefined;
  const archivedTo = archivedToRaw ? new Date(archivedToRaw) : undefined;

  // Ordenación
  const orderByField =
    (searchParams.get("orderBy") as "archivedAt" | "purchaseDate" | null) ||
    "archivedAt";
  const order = parseOrder(searchParams.get("order"));

  // Paginación
  const page = Math.max(1, parseIntSafe(searchParams.get("page"), 1));
  const pageSize = Math.min(200, parseIntSafe(searchParams.get("pageSize"), 50));
  const skip = (page - 1) * pageSize;

  // Construir where
  const where: Prisma.TicketArchiveWhereInput = {};

  if (q) {
    where.OR = [
      { customerName: { contains: q, mode: "insensitive" } },
      { customerEmail: { contains: q, mode: "insensitive" } },
      { customerDni: { contains: q, mode: "insensitive" } },
    ];
  }
  if (reason) where.archiveReason = reason;
  if (type) where.ticketType = type;
  if (status) where.paymentStatus = status;

  if (archivedFrom || archivedTo) {
    where.archivedAt = {};
    if (archivedFrom) where.archivedAt.gte = archivedFrom;
    if (archivedTo) where.archivedAt.lte = archivedTo;
  }

  try {
    const [total, rows] = await Promise.all([
      prisma.ticketArchive.count({ where }),
      prisma.ticketArchive.findMany({
        where,
        orderBy: { [orderByField]: order },
        skip,
        take: pageSize,
        // Usamos SELECT explícito para incluir sólo campos existentes + relaciones necesarias
        select: {
          id: true,
          archivedAt: true,
          archivedBy: true,
          archiveReason: true,
          archiveNotes: true,

          ticketType: true,
          gender: true,
          quantity: true,

          vipLocationId: true,
          vipTableId: true,

          totalPrice: true,

          customerName: true,
          customerEmail: true,
          customerPhone: true,
          customerDni: true,

          paymentStatus: true,
          paymentMethod: true,

          validated: true,
          validatedAt: true,

          purchaseDate: true,
          eventDate: true,

          // Relaciones (para datos derivados)
          vipLocation: {
            select: { name: true },
          },
          vipTable: {
            select: {
              tableNumber: true, // número local (si la mesa sigue existiendo)
              vipTableConfig: {
                select: { capacityPerTable: true },
              },
            },
          },
          // Si querés mostrar datos del evento archivado:
          // event: { select: { name: true, date: true } },
        },
      }),
    ]);

    // Aplanamos para el frontend (evitamos exponer objetos anidados)
    const tickets = rows.map((r) => ({
      id: r.id,
      archivedAt: r.archivedAt,
      archivedBy: r.archivedBy,
      archiveReason: r.archiveReason,
      archiveNotes: r.archiveNotes,

      ticketType: r.ticketType,
      gender: r.gender,
      quantity: r.quantity,

      vipLocationId: r.vipLocationId,
      vipLocationName: r.vipLocation?.name ?? null,
      vipTableId: r.vipTableId,
      tableNumberLocal: r.vipTable?.tableNumber ?? null,
      capacityPerTable: r.vipTable?.vipTableConfig?.capacityPerTable ?? null,

      totalPrice: r.totalPrice,

      customerName: r.customerName,
      customerEmail: r.customerEmail,
      customerPhone: r.customerPhone,
      customerDni: r.customerDni,

      paymentStatus: r.paymentStatus,
      paymentMethod: r.paymentMethod,

      validated: r.validated,
      validatedAt: r.validatedAt,

      purchaseDate: r.purchaseDate,
      eventDate: r.eventDate,
      // Si incluís event arriba, podés aplanar también:
      // eventName: r.event?.name ?? null,
      // eventDateExact: r.event?.date ?? null,
    }));

    return NextResponse.json({
      ok: true,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
      tickets,
    });
  } catch (e) {
    console.error("[archive][GET] error:", e);
    return NextResponse.json(
      { error: "Failed to fetch archive" },
      { status: 500 }
    );
  }
}

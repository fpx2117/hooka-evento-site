// lib/vip-tables.ts
import { PrismaClient, PaymentStatus, TableLocation } from "@prisma/client";

export function coerceLocation(loc?: string | null): TableLocation | null {
  const v = (loc || "").trim().toLowerCase();
  if (v === "dj") return "dj";
  if (v === "piscina") return "piscina";
  if (v === "general") return "general";
  return null;
}

/**
 * Devuelve el eventId a usar:
 * 1) Si viene eventId válido → lo devuelve si existe.
 * 2) Si viene eventCode → lo resuelve.
 * 3) Si no viene nada → busca el evento activo más próximo (date >= now) o el último activo.
 */
export async function getActiveEventId({
  prisma,
  eventId,
  eventCode,
}: {
  prisma: PrismaClient;
  eventId?: string;
  eventCode?: string;
}): Promise<string | null> {
  if (eventId) {
    const ev = await prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true },
    });
    if (ev?.id) return ev.id;
  }
  if (eventCode) {
    const ev = await prisma.event.findUnique({
      where: { code: eventCode },
      select: { id: true, isActive: true },
    });
    if (ev?.id) return ev.id;
  }

  const now = new Date();
  // 1) activo y futuro más cercano
  const upcoming = await prisma.event.findFirst({
    where: { isActive: true, date: { gte: now } },
    orderBy: { date: "asc" },
    select: { id: true },
  });
  if (upcoming?.id) return upcoming.id;

  // 2) si no hay futuros, último activo (por fecha desc)
  const lastActive = await prisma.event.findFirst({
    where: { isActive: true },
    orderBy: { date: "desc" },
    select: { id: true },
  });
  if (lastActive?.id) return lastActive.id;

  return null;
}

/**
 * Snapshot público por ubicación: price, limit, sold, remaining, capacityPerTable
 */
export async function getVipTablesSnapshot({
  prisma,
  eventId,
}: {
  prisma: PrismaClient;
  eventId: string;
}) {
  const rows = await prisma.vipTableConfig.findMany({
    where: { eventId },
    select: {
      location: true,
      price: true,
      stockLimit: true,
      soldCount: true,
      capacityPerTable: true,
    },
    orderBy: { location: "asc" },
  });

  return rows.map((r) => ({
    location: r.location,
    price: Number(r.price),
    limit: r.stockLimit,
    sold: r.soldCount,
    remaining: Math.max(0, r.stockLimit - r.soldCount),
    capacityPerTable: r.capacityPerTable,
  }));
}

/**
 * Valida (servidor) que una mesa exista en la ubicación, esté en rango 1..limit
 * y no esté ocupada por tickets en estado approved o in_process.
 * Lanza error con mensaje entendible si no está disponible.
 */
export async function ensureVipTableAvailability({
  prisma,
  eventId,
  location,
  tableNumber,
}: {
  prisma: PrismaClient;
  eventId: string;
  location: TableLocation;
  tableNumber: number;
}) {
  // 1) chequear que exista config de esa ubicación
  const cfg = await prisma.vipTableConfig.findUnique({
    where: { eventId_location: { eventId, location } },
    select: { stockLimit: true },
  });
  if (!cfg) {
    throw new Error("No hay configuración de mesas para esta ubicación.");
  }

  // 2) chequear que el número esté en 1..limit
  if (
    typeof tableNumber !== "number" ||
    tableNumber < 1 ||
    tableNumber > cfg.stockLimit
  ) {
    throw new Error("Número de mesa inválido para esta ubicación.");
  }

  // 3) chequear ocupación por tickets confirmados/reservados
  const already = await prisma.ticket.findFirst({
    where: {
      eventId,
      ticketType: "vip",
      vipLocation: location,
      tableNumber,
      paymentStatus: { in: [PaymentStatus.approved, PaymentStatus.in_process] },
    },
    select: { id: true },
  });
  if (already) {
    throw new Error("Esa mesa ya fue asignada. Elegí otra.");
  }

  // Si llegamos acá, está OK
}

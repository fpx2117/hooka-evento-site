// lib/vip-tables.ts
import { PrismaClient, PaymentStatus, TableLocation } from "@prisma/client";

/** Orden fijo para numeración secuencial global (1..N) por evento */
export const VIP_SECTOR_ORDER: TableLocation[] = ["dj", "piscina", "general"];

/** Coerce seguro de ubicación */
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
 * 2) Si viene eventCode → lo resuelve (se acepta aunque no esté isActive para permitir vista histórica).
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
      select: { id: true },
    });
    if (ev?.id) return ev.id;
  }

  const now = new Date();

  // 1) Activo y futuro más cercano
  const upcoming = await prisma.event.findFirst({
    where: { isActive: true, date: { gte: now } },
    orderBy: { date: "asc" },
    select: { id: true },
  });
  if (upcoming?.id) return upcoming.id;

  // 2) Si no hay futuros, último activo
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
 * — evita NaN y valores negativos.
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
      price: true, // Decimal | null
      stockLimit: true, // number
      soldCount: true, // number
      capacityPerTable: true, // number | null
    },
    orderBy: { location: "asc" },
  });

  return rows.map((r) => {
    const price = r.price != null ? Number(r.price) : null;
    const limit = Number.isFinite(r.stockLimit) ? r.stockLimit : 0;
    const sold = Number.isFinite(r.soldCount) ? r.soldCount : 0;
    const remaining = Math.max(0, limit - sold);

    return {
      location: r.location as TableLocation,
      price,
      limit,
      sold,
      remaining,
      capacityPerTable: r.capacityPerTable ?? null,
    };
  });
}

/** Utilidad: asegura entero positivo dentro de [1..max] */
function isValidLocalTable(n: unknown, max: number): n is number {
  return (
    typeof n === "number" &&
    Number.isFinite(n) &&
    Number.isInteger(n) &&
    n >= 1 &&
    n <= Math.max(0, max)
  );
}

/** Estructura de rango secuencial global por sector. */
export type VipSectorRange = {
  location: TableLocation;
  offset: number; // mesas acumuladas antes de este sector
  startNumber: number; // primer número global del sector (offset + 1)
  endNumber: number; // último número global del sector (offset + stockLimit)
  stockLimit: number;
};

/**
 * Calcula la numeración secuencial global por evento, devolviendo:
 * - total global (suma de stockLimit)
 * - rangos por sector con offset/start/end
 */
export async function getVipSequentialRanges({
  prisma,
  eventId,
}: {
  prisma: PrismaClient;
  eventId: string;
}): Promise<{ total: number; ranges: VipSectorRange[] }> {
  const cfgs = await prisma.vipTableConfig.findMany({
    where: { eventId },
    select: { location: true, stockLimit: true },
  });

  const byLoc = new Map<TableLocation, number>();
  for (const c of cfgs) {
    const stock = Number.isFinite(c.stockLimit) ? c.stockLimit : 0;
    byLoc.set(c.location as TableLocation, Math.max(0, stock));
  }

  const ranges: VipSectorRange[] = [];
  let offset = 0;

  for (const loc of VIP_SECTOR_ORDER) {
    const stockLimit = byLoc.get(loc) ?? 0;
    if (stockLimit > 0) {
      ranges.push({
        location: loc,
        offset,
        startNumber: offset + 1,
        endNumber: offset + stockLimit,
        stockLimit,
      });
    }
    offset += stockLimit;
  }

  return { total: offset, ranges };
}

/** Convierte número local de un sector (1..stockLimit) a número global (sumando offset). */
export function vipLocalToGlobal(
  localNumber: number,
  ranges: VipSectorRange[],
  location: TableLocation
): number | null {
  const r = ranges.find((x) => x.location === location);
  if (!r || !isValidLocalTable(localNumber, r.stockLimit)) return null;
  return r.offset + localNumber;
}

/** Convierte número global (1..total) a par {location, localNumber}. */
export function vipGlobalToLocal(
  globalNumber: number,
  ranges: VipSectorRange[]
): { location: TableLocation; localNumber: number } | null {
  if (
    typeof globalNumber !== "number" ||
    !Number.isFinite(globalNumber) ||
    !Number.isInteger(globalNumber) ||
    globalNumber < 1
  ) {
    return null;
  }
  const r = ranges.find(
    (x) => globalNumber >= x.startNumber && globalNumber <= x.endNumber
  );
  if (!r) return null;
  return {
    location: r.location,
    localNumber: globalNumber - r.offset,
  };
}

/** Normaliza un número entrante (puede venir como local o global) y devuelve ambos. */
export async function normalizeVipNumber({
  prisma,
  eventId,
  location,
  tableNumber, // local (1..limit)
  tableNumberGlobal, // global (1..total)
}: {
  prisma: PrismaClient;
  eventId: string;
  location: TableLocation;
  tableNumber?: number | null;
  tableNumberGlobal?: number | null;
}): Promise<{ local: number; global: number }> {
  const { ranges } = await getVipSequentialRanges({ prisma, eventId });

  // Si viene global válido → convertir a local
  if (
    typeof tableNumberGlobal === "number" &&
    Number.isInteger(tableNumberGlobal) &&
    tableNumberGlobal > 0
  ) {
    const resolved = vipGlobalToLocal(tableNumberGlobal, ranges);
    if (!resolved || resolved.location !== location) {
      throw new Error("Número de mesa (global) no corresponde a ese sector.");
    }
    return { local: resolved.localNumber, global: tableNumberGlobal };
  }

  // Si viene local → convertir a global
  if (
    typeof tableNumber === "number" &&
    Number.isInteger(tableNumber) &&
    tableNumber > 0
  ) {
    const g = vipLocalToGlobal(tableNumber, ranges, location);
    if (!g) throw new Error("Número de mesa fuera de rango para ese sector.");
    return { local: tableNumber, global: g };
  }

  throw new Error("Debes especificar un número de mesa válido.");
}

/**
 * Valida (servidor) que una mesa exista en la ubicación, esté en rango 1..limit,
 * y no esté ocupada por tickets en estado approved o in_process.
 * Lanza Error con mensaje entendible si no está disponible.
 *
 * ➕ Soporta `ticketIdToIgnore` para updates (evita colisión consigo mismo).
 * ➕ Acepta `tableNumber` (local) o `tableNumberGlobal` (global).
 */
export async function ensureVipTableAvailability({
  prisma,
  eventId,
  location,
  tableNumber,
  tableNumberGlobal,
  ticketIdToIgnore = null,
}: {
  prisma: PrismaClient;
  eventId: string;
  location: TableLocation;
  tableNumber?: number; // local 1..limit
  tableNumberGlobal?: number; // global 1..total
  ticketIdToIgnore?: string | null;
}) {
  // Normalizar a (local, global)
  const normalized = await normalizeVipNumber({
    prisma,
    eventId,
    location,
    tableNumber,
    tableNumberGlobal,
  });

  // 1) existe config de esa ubicación
  const cfg = await prisma.vipTableConfig.findUnique({
    where: { eventId_location: { eventId, location } },
    select: { stockLimit: true },
  });

  const stock = Number.isFinite(cfg?.stockLimit ?? NaN)
    ? (cfg!.stockLimit as number)
    : 0;

  if (!cfg || stock <= 0) {
    throw new Error("Sector sin configuración de mesas VIP.");
  }

  // 2) número válido local (entero, dentro de rango)
  if (!isValidLocalTable(normalized.local, stock)) {
    throw new Error(`tableNumber fuera de rango (1..${stock}).`);
  }

  // 3) colisión (ocupada o reservada) — ignorando el propio ticket en updates
  const exists = await prisma.ticket.findFirst({
    where: {
      eventId,
      ticketType: "vip",
      vipLocation: location,
      tableNumber: normalized.local,
      paymentStatus: { in: [PaymentStatus.approved, PaymentStatus.in_process] },
      ...(ticketIdToIgnore ? { NOT: { id: ticketIdToIgnore } } : {}),
    },
    select: { id: true },
  });

  if (exists) {
    throw new Error("Esa mesa ya está ocupada/reservada.");
  }
}

/**
 * Devuelve las mesas tomadas de un sector como:
 *  - localNumbers: números locales (1..limit)
 *  - globalNumbers: números globales (1..total)
 */
export async function getTakenVipTables({
  prisma,
  eventId,
  location,
}: {
  prisma: PrismaClient;
  eventId: string;
  location: TableLocation;
}): Promise<{ localNumbers: number[]; globalNumbers: number[] }> {
  const cfg = await prisma.vipTableConfig.findUnique({
    where: { eventId_location: { eventId, location } },
    select: { stockLimit: true },
  });
  const stock = Number.isFinite(cfg?.stockLimit ?? NaN)
    ? (cfg!.stockLimit as number)
    : 0;

  if (!cfg || stock <= 0) {
    return { localNumbers: [], globalNumbers: [] };
  }

  // Leemos tickets que bloquean mesas (approved/in_process)
  const rows = await prisma.ticket.findMany({
    where: {
      eventId,
      ticketType: "vip",
      vipLocation: location,
      paymentStatus: { in: [PaymentStatus.approved, PaymentStatus.in_process] },
      tableNumber: { not: null },
    },
    select: { tableNumber: true },
  });

  const localSet = new Set<number>();
  for (const r of rows) {
    const n = Number(r.tableNumber);
    if (isValidLocalTable(n, stock)) localSet.add(n);
  }

  const { ranges } = await getVipSequentialRanges({ prisma, eventId });
  const global: number[] = [];
  const range = ranges.find((r) => r.location === location);
  if (range) {
    for (const ln of localSet) {
      const gn = vipLocalToGlobal(ln, ranges, location);
      if (gn) global.push(gn);
    }
  }

  return {
    localNumbers: Array.from(localSet).sort((a, b) => a - b),
    globalNumbers: global.sort((a, b) => a - b),
  };
}

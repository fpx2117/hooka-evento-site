// lib/vip-tables.ts
import { PrismaClient, VipTableStatus } from "@prisma/client";

/* ============================================================
   Resolver eventId activo (por id o code)
============================================================ */
export async function getActiveEventId({
  prisma,
  eventId,
  eventCode,
}: {
  prisma: PrismaClient;
  eventId?: string | null;
  eventCode?: string | null;
}): Promise<string> {
  if (eventId) {
    const existing = await prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true },
    });
    if (existing?.id) return existing.id;
  }

  if (eventCode) {
    const event = await prisma.event.findUnique({
      where: { code: eventCode },
      select: { id: true },
    });
    if (event?.id) return event.id;
  }

  const active = await prisma.event.findFirst({
    where: { isActive: true },
    orderBy: { date: "asc" },
    select: { id: true },
  });

  if (!active?.id) throw new Error("No hay evento activo disponible.");
  return active.id;
}

/* ============================================================
   Snapshot de configuraciones de mesas VIP
============================================================ */
export async function getVipTablesSnapshot({
  prisma,
  eventId,
}: {
  prisma: PrismaClient;
  eventId: string;
}) {
  const configs = await prisma.vipTableConfig.findMany({
    where: { eventId },
    include: {
      vipLocation: { select: { id: true, name: true, order: true } },
    },
    orderBy: { vipLocation: { order: "asc" } },
  });

  return configs.map((cfg) => {
    const limit = Number(cfg.stockLimit ?? 0);
    const sold = Number(cfg.soldCount ?? 0);
    return {
      vipLocationId: cfg.vipLocationId,
      locationName: cfg.vipLocation?.name ?? "Ubicación",
      price: Number(cfg.price ?? 0),
      stockLimit: limit,
      soldCount: sold,
      remaining: Math.max(0, limit - sold),
      capacityPerTable: cfg.capacityPerTable ?? 0,
      order: cfg.vipLocation?.order ?? 0,
    };
  });
}

/* ============================================================
   Rango global (1..N) de mesas por orden de ubicación
============================================================ */
export async function getVipSequentialRanges({
  prisma,
  eventId,
}: {
  prisma: PrismaClient;
  eventId: string;
}) {
  const configs = await prisma.vipTableConfig.findMany({
    where: { eventId },
    include: { vipLocation: { select: { id: true, name: true, order: true } } },
    orderBy: { vipLocation: { order: "asc" } },
  });

  let offset = 0;
  const ranges = [];

  for (const cfg of configs) {
    const stock = Number(cfg.stockLimit ?? 0);
    if (stock <= 0) continue;

    const startNumber = offset + 1;
    const endNumber = offset + stock;
    ranges.push({
      vipLocationId: cfg.vipLocationId,
      locationName: cfg.vipLocation?.name ?? "Ubicación",
      startNumber,
      endNumber,
      stockLimit: stock,
    });
    offset += stock;
  }

  return { total: offset, ranges };
}

/* ============================================================
   Normalizar número local/global (usa tableNumber)
============================================================ */
export async function normalizeVipNumber({
  prisma,
  eventId,
  vipLocationId,
  tableNumber,
  tableNumberGlobal,
}: {
  prisma: PrismaClient;
  eventId: string;
  vipLocationId: string;
  tableNumber?: number | null;
  tableNumberGlobal?: number | null;
}): Promise<{ local: number; global: number; tableId: string }> {
  const tables = await prisma.vipTable.findMany({
    where: { eventId, vipLocationId },
    select: { id: true, tableNumber: true },
    orderBy: { tableNumber: "asc" },
  });

  if (!tables.length) {
    throw new Error("No hay mesas configuradas para esta ubicación VIP.");
  }

  const byGlobal =
    typeof tableNumberGlobal === "number"
      ? tables.find((t) => t.tableNumber === tableNumberGlobal)
      : undefined;
  const byLocal =
    typeof tableNumber === "number"
      ? tables.find((t) => t.tableNumber === tableNumber)
      : undefined;

  const found = byGlobal ?? byLocal;
  if (!found) throw new Error("Número de mesa no válido para esta ubicación VIP.");

  return {
    local: found.tableNumber,
    global: found.tableNumber,
    tableId: found.id,
  };
}

/* ============================================================
   Validar disponibilidad (usa VipTable.status)
============================================================ */
export async function ensureVipTableAvailability({
  prisma,
  eventId,
  vipLocationId,
  tableId,
}: {
  prisma: PrismaClient;
  eventId: string;
  vipLocationId: string;
  tableId: string;
}) {
  const table = await prisma.vipTable.findFirst({
    where: { id: tableId, eventId, vipLocationId },
    select: { id: true, status: true },
  });

  if (!table) throw new Error("La mesa seleccionada no existe.");
  if (table.status !== VipTableStatus.available) {
    throw new Error("La mesa ya está reservada o vendida.");
  }
}

/* ============================================================
   Listado con disponibilidad de mesas
============================================================ */
export async function getVipTablesAvailability({
  prisma,
  eventId,
  vipLocationId,
}: {
  prisma: PrismaClient;
  eventId: string;
  vipLocationId: string;
}) {
  const rows = await prisma.vipTable.findMany({
    where: { eventId, vipLocationId },
    select: {
      id: true,
      tableNumber: true,
      status: true,
      price: true,
      capacityPerTable: true,
    },
    orderBy: { tableNumber: "asc" },
  });

  return {
    total: rows.length,
    detail: rows.map((t) => ({
      id: t.id,
      tableNumber: t.tableNumber,
      status: t.status,
      price: Number(t.price),
      capacityPerTable: t.capacityPerTable ?? 0,
      available: t.status === VipTableStatus.available,
    })),
    takenNumbers: rows
      .filter((t) => t.status !== VipTableStatus.available)
      .map((t) => t.tableNumber),
    freeNumbers: rows
      .filter((t) => t.status === VipTableStatus.available)
      .map((t) => t.tableNumber),
  };
}

export interface AddVipForm {
  customerName: string;
  customerDni: string;
  customerEmail: string;
  customerPhone: string;
  vipLocationId: string | null;
  tableNumber?: number | null; // ✅ asegurate de tener esto
}

/* ============================================================
   Actualizar estado de mesa específica
============================================================ */
export async function updateVipTableStatus({
  prisma,
  tableId,
  status,
}: {
  prisma: PrismaClient;
  tableId: string;
  status: VipTableStatus;
}) {
  await prisma.vipTable.update({
    where: { id: tableId },
    data: { status },
  });
}

// /lib/tickets.ts
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

export async function getActiveEventId() {
  const e = await prisma.event.findFirst({
    where: { isActive: true },
    select: { id: true },
  });
  if (!e) throw new Error("no_active_event");
  return e.id;
}

export function peopleFromTicket(t: {
  ticketType: "general" | "vip";
  quantity?: number | null;
  vipTables?: number | null;
  capacityPerTable?: number | null;
}) {
  if (t.ticketType === "vip") {
    return Math.max(
      0,
      Number(t.vipTables || 0) * Math.max(1, Number(t.capacityPerTable || 0))
    );
  }
  return Math.max(0, Number(t.quantity || 0));
}

export async function priceForGeneral(
  eventId: string,
  gender: "hombre" | "mujer",
  qty: number
) {
  const cfg = await prisma.ticketConfig.findFirst({
    where: { eventId, ticketType: "general", gender },
    select: { id: true, price: true },
  });
  if (!cfg) throw new Error("price_cfg_not_found");
  const unit = new Prisma.Decimal(cfg.price);
  return { ticketConfigId: cfg.id, total: unit.mul(qty) };
}

export async function priceForVip(
  eventId: string,
  location: "dj" | "piscina" | "general",
  tables: number
) {
  const cfg = await prisma.vipTableConfig.findUnique({
    where: { eventId_location: { eventId, location } },
    select: {
      id: true,
      price: true,
      capacityPerTable: true,
      stockLimit: true,
      soldCount: true,
    },
  });
  if (!cfg) throw new Error("vip_cfg_not_found");
  const remaining = Math.max(0, cfg.stockLimit - cfg.soldCount);
  if (tables > remaining) throw new Error("vip_tables_insufficient_stock");
  const unit = new Prisma.Decimal(cfg.price);
  return {
    vipConfigId: cfg.id,
    capacityPerTable: Number(cfg.capacityPerTable || 10),
    total: unit.mul(tables),
  };
}

export async function adjustVipSoldCount(
  tx: Prisma.TransactionClient,
  eventId: string,
  location: "dj" | "piscina" | "general",
  tablesDelta: number
) {
  if (tablesDelta === 0) return;
  const cfg = await tx.vipTableConfig.findUnique({
    where: { eventId_location: { eventId, location } },
    select: { id: true, stockLimit: true, soldCount: true },
  });
  if (!cfg) throw new Error("vip_cfg_not_found");

  const next = cfg.soldCount + tablesDelta;
  if (next < 0) throw new Error("vip_sold_negative");
  if (next > cfg.stockLimit) throw new Error("vip_sold_exceeds_stock");

  await tx.vipTableConfig.update({
    where: { id: cfg.id },
    data: { soldCount: next },
  });
}

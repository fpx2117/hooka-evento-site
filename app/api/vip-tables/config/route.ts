// app/api/vip-tables/config/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getActiveEventId,
  getVipSequentialRanges,
  VIP_SECTOR_ORDER,
} from "@/lib/vip-tables";
import { PaymentStatus, TableLocation } from "@prisma/client";

/**
 * GET /api/vip-tables/config?eventId=...&eventCode=...
 * ...
 */

// ===== Config bloqueos =====
const LOCK_WINDOW_MINUTES = Number(process.env.VIP_LOCK_WINDOW_MINUTES ?? 20);

function minutesAgo(d: Date, m: number) {
  return new Date(d.getTime() - m * 60_000);
}

function json(payload: any, init?: number | ResponseInit) {
  const initObj: ResponseInit =
    typeof init === "number" ? { status: init } : init || {};
  const headers = new Headers(initObj.headers || {});
  headers.set(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, proxy-revalidate"
  );
  headers.set("Pragma", "no-cache");
  headers.set("Expires", "0");
  headers.set("Content-Type", "application/json; charset=utf-8");
  return NextResponse.json(payload, { ...initObj, headers });
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const eventIdParam = (searchParams.get("eventId") || "").trim();
    const eventCodeParam = (searchParams.get("eventCode") || "").trim();

    // 1) Evento
    const eventId = await getActiveEventId({
      prisma,
      eventId: eventIdParam || undefined,
      eventCode: eventCodeParam || undefined,
    });
    if (!eventId) {
      return json({ ok: false, error: "No se encontró un evento activo" }, 404);
    }

    // 2) Configs VIP
    const cfgs = await prisma.vipTableConfig.findMany({
      where: { eventId },
      select: {
        location: true,
        price: true,
        capacityPerTable: true,
        stockLimit: true,
      },
    });

    // 3) Rangos globales
    const { total: totalTables, ranges } = await getVipSequentialRanges({
      prisma,
      eventId,
    });
    const rangeByLoc = new Map(ranges.map((r) => [r.location, r]));
    const cfgByLoc = new Map(cfgs.map((c) => [c.location as TableLocation, c]));

    // 4) Tomadas = approved + in_process recientes
    const now = new Date();
    const takenGroups = await prisma.ticket.groupBy({
      by: ["vipLocation"],
      where: {
        eventId,
        ticketType: "vip",
        tableNumber: { not: null },
        vipLocation: { not: null }, // 👈 evita grupo null
        OR: [
          { paymentStatus: PaymentStatus.approved },
          {
            paymentStatus: PaymentStatus.in_process,
            updatedAt: { gte: minutesAgo(now, LOCK_WINDOW_MINUTES) },
          },
        ],
      },
      _count: { _all: true },
    });

    const soldByLoc = new Map<TableLocation, number>(
      takenGroups.map((g) => [g.vipLocation as TableLocation, g._count._all])
    );

    // 5) Respuesta ordenada
    const vipTables = VIP_SECTOR_ORDER.map((loc) => {
      const cfg = cfgByLoc.get(loc);
      const range = rangeByLoc.get(loc);

      const limit = Number.isFinite(cfg?.stockLimit ?? NaN)
        ? Number(cfg!.stockLimit)
        : 0;
      const sold = soldByLoc.get(loc) ?? 0;
      const remaining = Math.max(0, limit - sold);

      return {
        location: loc,
        price: cfg?.price != null ? Number(cfg.price) : null,
        limit,
        sold,
        remaining,
        capacityPerTable:
          cfg?.capacityPerTable != null ? Number(cfg.capacityPerTable) : null,
        startNumber: range ? range.startNumber : null,
        endNumber: range ? range.endNumber : null,
      };
    });

    return json({ ok: true, eventId, totalTables, vipTables });
  } catch (err) {
    console.error("[vip-tables/config] Error:", err);
    return json(
      { ok: false, error: "Error obteniendo configuración VIP" },
      500
    );
  }
}

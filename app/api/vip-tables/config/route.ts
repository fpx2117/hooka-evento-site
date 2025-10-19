// app/api/vip-tables/config/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getActiveEventId,
  getVipTablesSnapshot,
  getVipSequentialRanges,
  VIP_SECTOR_ORDER,
} from "@/lib/vip-tables";

// Helper de respuesta con no-store (igual que otros routes)
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

/**
 * GET /api/vip-tables/config?eventId=...&eventCode=...
 * Respuesta:
 * {
 *   ok: true,
 *   eventId: string,
 *   totalTables: number,
 *   vipTables: [{ location, price, limit, sold, remaining, capacityPerTable, startNumber, endNumber }]
 * }
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const eventIdParam = (searchParams.get("eventId") || "").trim();
    const eventCodeParam = (searchParams.get("eventCode") || "").trim();

    const eventId = await getActiveEventId({
      prisma,
      eventId: eventIdParam || undefined,
      eventCode: eventCodeParam || undefined,
    });

    if (!eventId) {
      return json({ ok: false, error: "No se encontró un evento activo" }, 404);
    }

    // Datos por sector (precio, stock, etc.)
    const snapshot = await getVipTablesSnapshot({ prisma, eventId });

    // Rangos secuenciales globales + total global
    const { total: totalTables, ranges } = await getVipSequentialRanges({
      prisma,
      eventId,
    });

    // Mapas auxiliares
    const snapByLoc = new Map(snapshot.map((s) => [s.location, s]));
    const rangeByLoc = new Map(ranges.map((r) => [r.location, r]));

    // Respuesta ordenada por orden fijo
    const vipTables = VIP_SECTOR_ORDER.map((loc) => {
      const s = snapByLoc.get(loc);
      const r = rangeByLoc.get(loc);
      return {
        location: loc,
        price: s?.price ?? null,
        limit: s?.limit ?? 0, // mesas del sector
        sold: s?.sold ?? 0,
        remaining: s?.remaining ?? 0,
        capacityPerTable: s?.capacityPerTable ?? null,
        startNumber: r ? r.startNumber : null, // numeración GLOBAL del sector
        endNumber: r ? r.endNumber : null,
      };
    });

    return json({
      ok: true,
      eventId,
      totalTables, // numeración global 1..totalTables
      vipTables,
    });
  } catch (err) {
    console.error("[vip-tables/config] Error:", err);
    return json(
      { ok: false, error: "Error obteniendo configuración VIP" },
      500
    );
  }
}

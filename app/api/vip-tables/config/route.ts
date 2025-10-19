// app/api/vip-tables/config/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getActiveEventId,
  getVipTablesSnapshot,
  getVipSequentialRanges,
  VIP_SECTOR_ORDER,
} from "@/lib/vip-tables";

/**
 * GET /api/vip-tables/config?eventId=...&eventCode=...
 * Respuesta:
 * {
 *   ok: true,
 *   eventId: string,
 *   totalTables: number, // suma global de mesas del evento (numeración 1..totalTables)
 *   vipTables: [
 *     {
 *       location: "dj" | "piscina" | "general",
 *       price: number|null,
 *       limit: number,              // mesas del SECTOR
 *       sold: number,
 *       remaining: number,
 *       capacityPerTable: number|null,
 *       startNumber: number|null,   // primer número GLOBAL del sector (p.ej. 1 para DJ)
 *       endNumber: number|null      // último número GLOBAL del sector (p.ej. 4 para DJ)
 *     }
 *   ]
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
      return NextResponse.json(
        { ok: false, error: "No se encontró un evento activo" },
        { status: 404 }
      );
    }

    // Datos por sector (precio, stock, etc.)
    const snapshot = await getVipTablesSnapshot({ prisma, eventId });

    // Rangos secuenciales globales por sector (start/end/offset) + total global
    const { total: totalTables, ranges } = await getVipSequentialRanges({
      prisma,
      eventId,
    });

    // Mapeo rápido por location
    const snapByLoc = new Map(snapshot.map((s) => [s.location, s]));
    const rangeByLoc = new Map(ranges.map((r) => [r.location, r]));

    // Construir respuesta por orden fijo de sectores
    const vipTables = VIP_SECTOR_ORDER.map((loc) => {
      const s = snapByLoc.get(loc);
      const r = rangeByLoc.get(loc);

      return {
        location: loc,
        price: s?.price ?? null,
        limit: s?.limit ?? 0, // límite del SECTOR
        sold: s?.sold ?? 0,
        remaining: s?.remaining ?? 0,
        capacityPerTable: s?.capacityPerTable ?? null,
        startNumber: r ? r.startNumber : null, // numeración GLOBAL para el sector
        endNumber: r ? r.endNumber : null,
      };
    });

    return NextResponse.json({
      ok: true,
      eventId,
      totalTables, // numeración global 1..totalTables
      vipTables,
    });
  } catch (err) {
    console.error("[vip-tables/config] Error:", err);
    return NextResponse.json(
      { ok: false, error: "Error obteniendo configuración VIP" },
      { status: 500 }
    );
  }
}

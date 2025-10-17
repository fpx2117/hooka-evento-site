// app/api/vip-tables/config/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveEventId, getVipTablesSnapshot } from "@/lib/vip-tables";

/**
 * GET /api/vip-tables/config?eventId=...&eventCode=...
 * Respuesta:
 * {
 *   ok: true,
 *   eventId: string,
 *   vipTables: [
 *     { location, price, limit, sold, remaining, capacityPerTable }
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

    const snapshot = await getVipTablesSnapshot({ prisma, eventId });

    return NextResponse.json({
      ok: true,
      eventId,
      vipTables: snapshot,
    });
  } catch (err) {
    console.error("[vip-tables/config] Error:", err);
    return NextResponse.json(
      { ok: false, error: "Error obteniendo configuración VIP" },
      { status: 500 }
    );
  }
}

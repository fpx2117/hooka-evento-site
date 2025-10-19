// app/api/vip-tables/availability/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { PaymentStatus, TableLocation } from "@prisma/client";
import { coerceLocation, getActiveEventId } from "@/lib/vip-tables";

/**
 * GET /api/vip-tables/availability?location=dj|piscina|general&eventId=...&eventCode=...
 * Respuesta:
 * {
 *   ok: true,
 *   eventId: string,
 *   location: "dj" | "piscina" | "general",
 *   limit: number,                 // mesas totales configuradas (1..limit) del EVENTO
 *   startNumber: number|null,      // primer número de mesa del sector (global)
 *   endNumber: number|null,        // último número de mesa del sector (global)
 *   taken: number[],               // mesas OCUPADAS en numeración global (del sector solicitado)
 *   remainingTables: number|null,  // mesas libres del sector (si hay VipTableConfig)
 *   price: number|null,            // precio por mesa (sector)
 *   capacityPerTable: number|null  // personas por mesa (sector)
 * }
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const locParam = (searchParams.get("location") || "").trim().toLowerCase();
    const eventIdParam = (searchParams.get("eventId") || "").trim();
    const eventCodeParam = (searchParams.get("eventCode") || "").trim();

    // Validar ubicación
    const location = coerceLocation(locParam);
    if (!location) {
      return NextResponse.json(
        { ok: false, error: "Parámetro 'location' inválido" },
        { status: 400 }
      );
    }

    // Resolver evento activo / por id / por code
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

    // Traer TODAS las configuraciones de mesas VIP del evento
    const allCfg = await prisma.vipTableConfig.findMany({
      where: { eventId },
      select: {
        location: true,
        stockLimit: true,
        soldCount: true,
        price: true,
        capacityPerTable: true,
      },
    });

    // Mapa por ubicación para fácil acceso
    const cfgByLoc = new Map<TableLocation, (typeof allCfg)[number]>();
    for (const c of allCfg) cfgByLoc.set(c.location as TableLocation, c);

    // Orden fijo de sectores para numeración secuencial
    const ORDER: TableLocation[] = [
      TableLocation.dj,
      TableLocation.piscina,
      TableLocation.general,
    ];

    // Total de mesas del evento (suma de stockLimit)
    const totalLimit =
      allCfg.reduce((acc, c) => acc + (c.stockLimit ?? 0), 0) || 0;

    // Config del sector solicitado
    const cfg = cfgByLoc.get(location as TableLocation);

    // Si no hay config para el sector, devolvemos sin rango ni datos de sector
    if (!cfg) {
      return NextResponse.json({
        ok: true,
        eventId,
        location,
        limit: totalLimit,
        startNumber: null,
        endNumber: null,
        taken: [],
        remainingTables: null,
        price: null,
        capacityPerTable: null,
      });
    }

    // Calcular offset del sector: mesas de sectores anteriores en el orden definido
    const idx = ORDER.indexOf(location as TableLocation);
    const offset = ORDER.slice(0, Math.max(0, idx)).reduce((acc, loc) => {
      const c = cfgByLoc.get(loc);
      return acc + (c?.stockLimit ?? 0);
    }, 0);

    // Rango global del sector (1-indexed)
    const startNumber = cfg.stockLimit ? offset + 1 : null;
    const endNumber =
      cfg.stockLimit && cfg.stockLimit > 0 ? offset + cfg.stockLimit : null;

    // Tickets “ocupados” del sector (pagos aprobados o en proceso)
    const tickets = await prisma.ticket.findMany({
      where: {
        eventId,
        ticketType: "vip",
        vipLocation: location as TableLocation,
        tableNumber: { not: null }, // tableNumber guardado a nivel SECTOR (1..stockLimit)
        paymentStatus: {
          in: [PaymentStatus.approved, PaymentStatus.in_process],
        },
      },
      select: { tableNumber: true },
    });

    // Convertir numeración local (sector) a numeración GLOBAL sumando el offset
    const taken =
      tickets
        .map((t) => t.tableNumber)
        .filter((n): n is number => typeof n === "number" && Number.isFinite(n))
        .map((n) => n + offset) ?? [];

    const remainingTables =
      typeof cfg.stockLimit === "number" && typeof cfg.soldCount === "number"
        ? Math.max(0, cfg.stockLimit - cfg.soldCount)
        : null;

    return NextResponse.json({
      ok: true,
      eventId,
      location, // sector consultado
      limit: totalLimit, // total global del evento (1..limit)
      startNumber, // primer número global de este sector
      endNumber, // último número global de este sector
      taken, // números globales ocupados (del sector)
      remainingTables, // libres en este sector
      price: cfg.price != null ? Number(cfg.price) : null,
      capacityPerTable: cfg.capacityPerTable ?? null,
    });
  } catch (err) {
    console.error("[vip-tables/availability] Error:", err);
    return NextResponse.json(
      { ok: false, error: "Error obteniendo disponibilidad" },
      { status: 500 }
    );
  }
}

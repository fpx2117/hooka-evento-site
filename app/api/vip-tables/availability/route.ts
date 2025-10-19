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
 *   limit: number,                 // mesas totales del EVENTO (1..limit)
 *   startNumber: number|null,      // primer número global del sector
 *   endNumber: number|null,        // último número global del sector
 *   taken: number[],               // mesas ocupadas en numeración global (solo del sector consultado)
 *   remainingTables: number|null,  // libres en el sector (si hay VipTableConfig)
 *   price: number|null,
 *   capacityPerTable: number|null,
 *   _debug?: { invalidTablesCount: number, examples: number[] } // opcional
 * }
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const locParam = (searchParams.get("location") || "").trim().toLowerCase();
    const eventIdParam = (searchParams.get("eventId") || "").trim();
    const eventCodeParam = (searchParams.get("eventCode") || "").trim();

    // 1) Validación de ubicación
    const location = coerceLocation(locParam);
    if (!location) {
      return NextResponse.json(
        { ok: false, error: "Parámetro 'location' inválido" },
        { status: 400 }
      );
    }

    // 2) Resolver evento
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

    // 3) Traer TODAS las configuraciones VIP del evento
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

    const cfgByLoc = new Map<TableLocation, (typeof allCfg)[number]>();
    for (const c of allCfg) cfgByLoc.set(c.location as TableLocation, c);

    // 4) Orden fijo → numera secuencialmente por evento
    const ORDER: TableLocation[] = [
      TableLocation.dj,
      TableLocation.piscina,
      TableLocation.general,
    ];

    // Total de mesas del evento
    const totalLimit =
      allCfg.reduce((acc, c) => acc + (c.stockLimit ?? 0), 0) || 0;

    // Config del sector solicitado
    const cfg = cfgByLoc.get(location as TableLocation);

    // Si no hay config para el sector, respondemos datos mínimos
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

    // 5) Offset del sector (suma stockLimit de sectores anteriores)
    const idx = ORDER.indexOf(location as TableLocation);
    const offset = ORDER.slice(0, Math.max(0, idx)).reduce((acc, loc) => {
      const c = cfgByLoc.get(loc);
      return acc + (c?.stockLimit ?? 0);
    }, 0);

    // Rango global del sector
    const startNumber = cfg.stockLimit ? offset + 1 : null;
    const endNumber =
      cfg.stockLimit && cfg.stockLimit > 0 ? offset + cfg.stockLimit : null;

    // 6) Tickets ocupados del sector (aprobado o en proceso)
    const tickets = await prisma.ticket.findMany({
      where: {
        eventId,
        ticketType: "vip",
        vipLocation: location as TableLocation,
        tableNumber: { not: null }, // guardado local (1..stockLimit)
        paymentStatus: {
          in: [PaymentStatus.approved, PaymentStatus.in_process],
        },
      },
      select: { tableNumber: true },
    });

    // 7) Filtrar fuera de rango (local) y mapear a global
    const stock = cfg.stockLimit ?? 0;
    const isValidLocal = (n: unknown): n is number =>
      typeof n === "number" && Number.isFinite(n) && n >= 1 && n <= stock;

    const localNumbers = tickets.map((t) => t.tableNumber);
    const validLocal = localNumbers.filter(isValidLocal);
    const invalidLocal = localNumbers.filter(
      (n) => typeof n === "number" && Number.isFinite(n) && !isValidLocal(n)
    );

    const taken = validLocal.map((n) => n + offset);

    // 8) Libres del sector (según cfg)
    const remainingTables =
      typeof cfg.stockLimit === "number" && typeof cfg.soldCount === "number"
        ? Math.max(0, cfg.stockLimit - cfg.soldCount)
        : null;

    return NextResponse.json({
      ok: true,
      eventId,
      location,
      limit: totalLimit,
      startNumber,
      endNumber,
      taken, // sólo válidos en numeración GLOBAL
      remainingTables,
      price: cfg.price != null ? Number(cfg.price) : null,
      capacityPerTable: cfg.capacityPerTable ?? null,
      // Quitar si no querés exponer debug
      _debug: invalidLocal.length
        ? {
            invalidTablesCount: invalidLocal.length,
            examples: invalidLocal.slice(0, 5),
          }
        : undefined,
    });
  } catch (err) {
    console.error("[vip-tables/availability] Error:", err);
    return NextResponse.json(
      { ok: false, error: "Error obteniendo disponibilidad" },
      { status: 500 }
    );
  }
}

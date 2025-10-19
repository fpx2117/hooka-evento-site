// app/api/vip-tables/availability/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { PaymentStatus, TableLocation } from "@prisma/client";
import {
  coerceLocation,
  getActiveEventId,
  getVipSequentialRanges,
} from "@/lib/vip-tables";

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
 *   taken: number[],               // mesas ocupadas en numeración GLOBAL (solo del sector consultado)
 *   remainingTables: number|null,  // libres en el sector (si hay VipTableConfig)
 *   price: number|null,
 *   capacityPerTable: number|null,
 *   _debug?: { invalidTablesCount: number, examples: number[] } // opcional
 * }
 */

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
    const locParam = (searchParams.get("location") || "").trim().toLowerCase();
    const eventIdParam = (searchParams.get("eventId") || "").trim();
    const eventCodeParam = (searchParams.get("eventCode") || "").trim();

    // 1) Validación de ubicación
    const location = coerceLocation(locParam);
    if (!location) {
      return json({ ok: false, error: "Parámetro 'location' inválido" }, 400);
    }

    // 2) Resolver evento
    const eventId = await getActiveEventId({
      prisma,
      eventId: eventIdParam || undefined,
      eventCode: eventCodeParam || undefined,
    });
    if (!eventId) {
      return json({ ok: false, error: "No se encontró un evento activo" }, 404);
    }

    // 3) Traer TODAS las configuraciones VIP del evento (para price/capacity y sold/stock)
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

    // 4) Rango SECUENCIAL GLOBAL consistente con el helper (evita desalineaciones)
    const { total: totalLimit, ranges } = await getVipSequentialRanges({
      prisma,
      eventId,
    });
    const rangeByLoc = new Map(ranges.map((r) => [r.location, r]));

    const cfg = allCfg.find((c) => c.location === location);
    const sectorRange = rangeByLoc.get(location);

    // Si no hay config para el sector → devolver datos mínimos (sin start/end)
    if (!cfg || !sectorRange) {
      return json({
        ok: true,
        eventId,
        location,
        limit: totalLimit,
        startNumber: null,
        endNumber: null,
        taken: [],
        remainingTables: null,
        price: cfg?.price != null ? Number(cfg.price) : null,
        capacityPerTable: cfg?.capacityPerTable ?? null,
      });
    }

    // 5) Tickets ocupados del sector (aprobado o en proceso) — tableNumber LOCAL
    const tickets = await prisma.ticket.findMany({
      where: {
        eventId,
        ticketType: "vip",
        vipLocation: location,
        tableNumber: { not: null },
        paymentStatus: {
          in: [PaymentStatus.approved, PaymentStatus.in_process],
        },
      },
      select: { tableNumber: true },
    });

    // 6) Validar local y mapear a GLOBAL usando el offset del rango
    const stock = cfg.stockLimit ?? 0;
    const isValidLocal = (n: unknown): n is number =>
      typeof n === "number" &&
      Number.isFinite(n) &&
      Number.isInteger(n) &&
      n >= 1 &&
      n <= stock;

    const locals = tickets.map((t) => t.tableNumber);
    const validLocal = locals.filter(isValidLocal);
    const invalidLocal = locals.filter(
      (n) => typeof n === "number" && Number.isFinite(n) && !isValidLocal(n)
    );

    const taken = validLocal.map((n) => sectorRange.offset + (n as number));

    // 7) Libres del sector (según cfg)
    const remainingTables =
      typeof cfg.stockLimit === "number" && typeof cfg.soldCount === "number"
        ? Math.max(0, cfg.stockLimit - cfg.soldCount)
        : null;

    return json({
      ok: true,
      eventId,
      location,
      limit: totalLimit,
      startNumber: sectorRange.startNumber,
      endNumber: sectorRange.endNumber,
      taken, // numeración GLOBAL válida del sector
      remainingTables,
      price: cfg.price != null ? Number(cfg.price) : null,
      capacityPerTable: cfg.capacityPerTable ?? null,
      _debug: invalidLocal.length
        ? {
            invalidTablesCount: invalidLocal.length,
            examples: invalidLocal.slice(0, 5),
          }
        : undefined,
    });
  } catch (err) {
    console.error("[vip-tables/availability] Error:", err);
    return json({ ok: false, error: "Error obteniendo disponibilidad" }, 500);
  }
}

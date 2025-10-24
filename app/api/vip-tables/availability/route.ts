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
 *   taken: number[],               // mesas ocupadas (GLOBAL) del sector
 *   takenLocal?: number[],         // (opcional) mesas ocupadas (LOCAL) 1..stockLimit
 *   remainingTables: number|null,  // libres en el sector
 *   price: number|null,
 *   capacityPerTable: number|null,
 *   _debug?: { invalidTablesCount: number, examples: number[] }
 * }
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
    const locParam = (searchParams.get("location") || "").trim().toLowerCase();
    const eventIdParam = (searchParams.get("eventId") || "").trim();
    const eventCodeParam = (searchParams.get("eventCode") || "").trim();

    // 1) Validación de ubicación
    const location = coerceLocation(locParam);
    if (!location) {
      return json({ ok: false, error: "Parámetro 'location' inválido" }, 400);
    }

    // 2) Resolver evento (activo, por id o code, o fallback)
    const eventId = await getActiveEventId({
      prisma,
      eventId: eventIdParam || undefined,
      eventCode: eventCodeParam || undefined,
    });
    if (!eventId) {
      return json({ ok: false, error: "No se encontró un evento activo" }, 404);
    }

    // 3) Config VIP del evento y del sector
    const allCfg = await prisma.vipTableConfig.findMany({
      where: { eventId },
      select: {
        location: true,
        stockLimit: true,
        price: true,
        capacityPerTable: true,
      },
    });
    const sectorCfg = allCfg.find((c) => c.location === location);

    // 4) Rango secuencial GLOBAL por sector (consistente con helpers)
    const { total: totalLimit, ranges } = await getVipSequentialRanges({
      prisma,
      eventId,
    });
    const rangeByLoc = new Map(ranges.map((r) => [r.location, r]));
    const sectorRange = rangeByLoc.get(location);

    // Si no hay config o rango para el sector, devolver mínimos
    if (!sectorCfg || !sectorRange) {
      return json({
        ok: true,
        eventId,
        location,
        limit: totalLimit,
        startNumber: null,
        endNumber: null,
        taken: [],
        remainingTables: null,
        price: sectorCfg?.price != null ? Number(sectorCfg.price) : null,
        capacityPerTable: sectorCfg?.capacityPerTable ?? null,
      });
    }

    const stockLimit = sectorCfg.stockLimit ?? 0;

    // 5) Tickets bloqueantes del sector
    const now = new Date();
    const tickets = await prisma.ticket.findMany({
      where: {
        eventId,
        ticketType: "vip",
        vipLocation: location,
        tableNumber: { not: null },
        OR: [
          { paymentStatus: PaymentStatus.approved },
          {
            paymentStatus: PaymentStatus.in_process,
            updatedAt: { gte: minutesAgo(now, LOCK_WINDOW_MINUTES) },
          },
        ],
      },
      select: { tableNumber: true },
    });

    // 6) Validar local (1..stockLimit) y mapear a GLOBAL usando el offset
    const isValidLocal = (n: unknown): n is number =>
      typeof n === "number" &&
      Number.isFinite(n) &&
      Number.isInteger(n) &&
      n >= 1 &&
      n <= stockLimit;

    const locals = tickets.map((t) => t.tableNumber);
    const validLocal = locals.filter(isValidLocal) as number[];
    const invalidLocal = locals.filter(
      (n) => typeof n === "number" && Number.isFinite(n) && !isValidLocal(n)
    );

    const takenGlobal = validLocal.map((n) => sectorRange.offset + n);

    // 7) Libres del sector → stockLimit - tomadas (derivado desde Ticket)
    const remainingTables = Math.max(0, stockLimit - validLocal.length);

    return json({
      ok: true,
      eventId,
      location,
      limit: totalLimit, // total global del evento
      startNumber: sectorRange.startNumber,
      endNumber: sectorRange.endNumber,
      taken: takenGlobal.sort((a, b) => a - b),
      takenLocal: validLocal.sort((a, b) => a - b),
      remainingTables,
      price: sectorCfg.price != null ? Number(sectorCfg.price) : null,
      capacityPerTable: sectorCfg.capacityPerTable ?? null,
      _debug: invalidLocal.length
        ? {
            invalidTablesCount: invalidLocal.length,
            examples: (invalidLocal as number[]).slice(0, 5),
          }
        : undefined,
    });
  } catch (err) {
    console.error("[vip-tables/availability] Error:", err);
    return json({ ok: false, error: "Error obteniendo disponibilidad" }, 500);
  }
}

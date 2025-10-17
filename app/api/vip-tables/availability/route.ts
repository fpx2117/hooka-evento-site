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
 *   limit: number,                 // mesas totales configuradas (1..limit)
 *   taken: number[],               // mesas ocupadas
 *   remainingTables: number|null,  // mesas libres (si hay VipTableConfig)
 *   price: number|null,            // precio por mesa
 *   capacityPerTable: number|null  // personas por mesa
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

    // Config VIP por ubicación
    const cfg = await prisma.vipTableConfig.findUnique({
      where: {
        eventId_location: {
          eventId,
          location: location as TableLocation,
        },
      },
      select: {
        stockLimit: true,
        soldCount: true,
        price: true,
        capacityPerTable: true,
      },
    });

    // Tomamos como "ocupadas" aquellas mesas de tickets con pago
    // approved o in_process (reservadas). Podés ajustar este conjunto.
    const tickets = await prisma.ticket.findMany({
      where: {
        eventId,
        ticketType: "vip",
        vipLocation: location as TableLocation,
        tableNumber: { not: null },
        paymentStatus: {
          in: [PaymentStatus.approved, PaymentStatus.in_process],
        },
      },
      select: { tableNumber: true },
    });

    const taken = tickets
      .map((t) => t.tableNumber)
      .filter((n): n is number => typeof n === "number" && Number.isFinite(n));

    const limit = cfg?.stockLimit ?? null;
    const remainingTables =
      typeof cfg?.stockLimit === "number" && typeof cfg?.soldCount === "number"
        ? Math.max(0, cfg.stockLimit - cfg.soldCount)
        : null;

    return NextResponse.json({
      ok: true,
      eventId,
      location,
      limit,
      taken,
      remainingTables,
      price: cfg?.price != null ? Number(cfg.price) : null,
      capacityPerTable: cfg?.capacityPerTable ?? null,
    });
  } catch (err) {
    console.error("[vip-tables/availability] Error:", err);
    return NextResponse.json(
      { ok: false, error: "Error obteniendo disponibilidad" },
      { status: 500 }
    );
  }
}

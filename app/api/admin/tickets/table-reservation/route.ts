// app/api/table-reservations/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { PaymentStatus, PaymentMethod, TableLocation } from "@prisma/client";

/** ========= Helpers ========= */
const s = (v: unknown) =>
  v === undefined || v === null ? undefined : String(v).trim();
const n = (v: unknown, d = 0) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : d;
};
const onlyDigits = (v?: string) => (v || "").replace(/\D+/g, "");
const parseLocation = (v?: string | null): TableLocation => {
  const k = (v || "").toLowerCase();
  if (k === "dj") return "dj";
  if (k === "piscina") return "piscina";
  return "general";
};

/**
 * GET /api/table-reservations
 * Query params:
 * - page, pageSize
 * - eventId, eventCode
 * - status (pending|approved|in_process|rejected|cancelled|refunded|charged_back|failed_preference)
 * - location (dj|piscina|general)
 * - email, dni, from (ISO), to (ISO)
 */
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const page = Math.max(1, n(url.searchParams.get("page"), 1));
    const pageSize = Math.min(
      100,
      Math.max(1, n(url.searchParams.get("pageSize"), 20))
    );

    const eventId = s(url.searchParams.get("eventId"));
    const eventCode = s(url.searchParams.get("eventCode"));
    const status = s(url.searchParams.get("status")) as
      | keyof typeof PaymentStatus
      | undefined;
    const rawLoc = s(url.searchParams.get("location"));
    const email = s(url.searchParams.get("email"));
    const dni = onlyDigits(s(url.searchParams.get("dni")));
    const from = s(url.searchParams.get("from"));
    const to = s(url.searchParams.get("to"));

    // Resolver event desde code si corresponde
    let finalEventId = eventId;
    if (!finalEventId && eventCode) {
      const ev = await prisma.event.findUnique({
        where: { code: eventCode },
        select: { id: true },
      });
      finalEventId = ev?.id;
    }

    const where: any = {};
    if (finalEventId) where.eventId = finalEventId;
    if (status && PaymentStatus[status]) where.paymentStatus = status;
    if (rawLoc) where.location = parseLocation(rawLoc);
    if (email) where.customerEmail = { contains: email, mode: "insensitive" };
    if (dni) where.customerDni = dni;
    if (from || to) {
      where.reservationDate = {};
      if (from) where.reservationDate.gte = new Date(from);
      if (to) where.reservationDate.lte = new Date(to);
    }

    const [total, rows] = await Promise.all([
      prisma.tableReservation.count({ where }),
      prisma.tableReservation.findMany({
        where,
        orderBy: { reservationDate: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          eventId: true,
          location: true,
          tables: true,
          capacity: true,
          guests: true,
          totalPrice: true,
          customerName: true,
          customerEmail: true,
          customerPhone: true,
          customerDni: true,
          reservationDate: true,
          paymentStatus: true,
          paymentMethod: true,
          vipTableConfigId: true,
        },
      }),
    ]);

    return NextResponse.json({
      data: rows,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    });
  } catch (e) {
    console.error("[table-reservations][GET] error:", e);
    return NextResponse.json(
      { error: "Error listando reservas" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/table-reservations
 * Body:
 * {
 *   eventId?: string
 *   eventCode?: string
 *   location: "dj" | "piscina" | "general"
 *   tables: number
 *   customer: { name, email, phone, dni }
 *   paymentMethod?: "mercadopago" | "transferencia" | "efectivo" (default: mercadopago)
 * }
 * Crea una reserva PENDING y valida stock de MESAS por ubicación.
 * No descuenta cupo global de personas aquí; eso sucede al aprobar (webhook o endpoint /approve).
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const eventIdBody = s(body.eventId);
    const eventCode = s(body.eventCode);
    const rawLoc = s(body.location);
    const location = parseLocation(rawLoc);

    const tables = Math.max(1, Math.floor(n(body.tables, 1)));
    const customerName = s(body.customer?.name) ?? "";
    const customerEmail = s(body.customer?.email) ?? "";
    const customerPhone = onlyDigits(s(body.customer?.phone));
    const customerDni = onlyDigits(s(body.customer?.dni));
    const paymentMethod =
      (s(body.paymentMethod) as keyof typeof PaymentMethod) ?? "mercadopago";

    // Resolver evento
    let event =
      (eventIdBody
        ? await prisma.event.findUnique({
            where: { id: eventIdBody },
            select: { id: true, date: true },
          })
        : null) ||
      (eventCode
        ? await prisma.event.findUnique({
            where: { code: eventCode },
            select: { id: true, date: true },
          })
        : null) ||
      (await prisma.event.findFirst({
        where: { isActive: true },
        orderBy: { date: "desc" },
        select: { id: true, date: true },
      }));

    if (!event) {
      return NextResponse.json(
        { error: "Evento no encontrado" },
        { status: 400 }
      );
    }

    // Config VIP por ubicación
    const cfg = await prisma.vipTableConfig.findFirst({
      where: { eventId: event.id, location },
      select: {
        id: true,
        price: true,
        stockLimit: true,
        soldCount: true,
        capacityPerTable: true,
      },
    });
    if (!cfg) {
      return NextResponse.json(
        { error: "Ubicación VIP no configurada" },
        { status: 400 }
      );
    }

    // Bloqueo de MESAS (stock de mesas). Contar pendientes e in_process para evitar overbooking operativo.
    const pendingSum = await prisma.tableReservation.aggregate({
      where: {
        eventId: event.id,
        vipTableConfigId: cfg.id,
        location,
        paymentStatus: { in: ["pending", "in_process"] as PaymentStatus[] },
      },
      _sum: { tables: true },
    });
    const reservedPending = Number(pendingSum._sum.tables || 0);
    const limitTables = Math.max(0, Number(cfg.stockLimit || 0));
    const soldTables = Math.max(0, Number(cfg.soldCount || 0));
    const remainingTables = Math.max(
      0,
      limitTables - soldTables - reservedPending
    );

    if (remainingTables < tables) {
      return NextResponse.json(
        { error: "Sin mesas disponibles en esa ubicación", remainingTables },
        { status: 409 }
      );
    }

    const cap = Math.max(1, Number(cfg.capacityPerTable || 10));
    const unitPrice = Number(cfg.price) || 0;
    const totalPrice = unitPrice * tables;

    const created = await prisma.tableReservation.create({
      data: {
        eventId: event.id,
        vipTableConfigId: cfg.id,
        packageType: "mesa",
        location,
        tables,
        capacity: tables * cap,
        guests: 0,
        totalPrice,
        customerName,
        customerEmail,
        customerPhone,
        customerDni,
        reservationDate: new Date(),
        paymentStatus: "pending",
        paymentMethod: paymentMethod as PaymentMethod,
      },
      select: {
        id: true,
        eventId: true,
        vipTableConfigId: true,
        location: true,
        tables: true,
        capacity: true,
        totalPrice: true,
        paymentStatus: true,
        paymentMethod: true,
        customerName: true,
        customerEmail: true,
        customerPhone: true,
        customerDni: true,
        reservationDate: true,
      },
    });

    return NextResponse.json({ data: created });
  } catch (e) {
    console.error("[table-reservations][POST] error:", e);
    return NextResponse.json(
      { error: "Error creando la reserva" },
      { status: 500 }
    );
  }
}

// app/api/admin/tickets/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jwtVerify } from "jose";
import {
  Prisma,
  PaymentMethod as PM,
  PaymentStatus as PS,
} from "@prisma/client";
import {
  ensureSixDigitCode,
  normalizeSixDigitCode,
} from "@/lib/validation-code";

/* ========================= Auth ========================= */
const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "your-secret-key-change-in-production"
);
async function verifyAuth(request: NextRequest) {
  const token = request.cookies.get("admin-token")?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload;
  } catch {
    return null;
  }
}

/* ========================= Helpers ========================= */
function normString(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined;
  const s = String(v).trim();
  return s.length ? s : undefined;
}
function normEmail(v: unknown): string | undefined {
  const s = normString(v);
  if (!s) return undefined;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return undefined;
  return s.toLowerCase();
}
function normNumber(v: unknown): number | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  const n = Number(v);
  if (Number.isNaN(n)) return undefined;
  return n;
}
function extractCustomerDni(obj: any): string | undefined {
  return (
    normString(obj?.customerDni) ??
    normString(obj?.customerDNI) ??
    normString(obj?.customer_dni) ??
    (obj?.dni !== undefined ? normString(obj?.dni) : undefined)
  );
}
function generateQr(prefix = "TICKET"): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/* ========================= Enum mappers ========================= */
function toPaymentMethod(v?: string): PM | undefined {
  switch ((v || "").toLowerCase()) {
    case "mercadopago":
      return PM.mercadopago;
    case "transferencia":
      return PM.transferencia;
    case "efectivo":
      return PM.efectivo;
    default:
      return undefined;
  }
}
function toPaymentStatus(v?: string): PS | undefined {
  switch ((v || "").toLowerCase()) {
    case "pending":
      return PS.pending;
    case "approved":
      return PS.approved;
    case "rejected":
      return PS.rejected;
    case "in_process":
      return PS.in_process;
    case "failed_preference":
      return PS.failed_preference;
    case "cancelled":
      return PS.cancelled;
    case "refunded":
      return PS.refunded;
    case "charged_back":
      return PS.charged_back;
    default:
      return undefined;
  }
}
const ALL_STATUSES: PS[] = [
  PS.pending,
  PS.approved,
  PS.rejected,
  PS.in_process,
  PS.failed_preference,
  PS.cancelled,
  PS.refunded,
  PS.charged_back,
];

/* =========================================================
   GET /api/admin/tickets
   — Unifica Ticket + TableReservation (ventas)
   Query:
     - status?: PaymentStatus
     - q?: string
     - type?: ticket | vip-table
     - orderBy?: date | totalPrice | purchaseDate | reservationDate
     - order?: asc | desc
     - page?: number  (1..)
     - pageSize?: number (1..200)
========================================================= */
export async function GET(request: NextRequest) {
  const auth = await verifyAuth(request);
  if (!auth)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { searchParams } = new URL(request.url);

    const status = searchParams.get("status");
    const q = normString(searchParams.get("q"));
    const typeFilter = (normString(searchParams.get("type")) || "") as
      | "ticket"
      | "vip-table"
      | "";

    const orderByRaw = (searchParams.get("orderBy") || "date").toLowerCase();
    const orderByField =
      orderByRaw === "totalprice"
        ? "totalPrice"
        : orderByRaw === "purchasedate" || orderByRaw === "reservationdate"
          ? "date"
          : "date";
    const order: "asc" | "desc" =
      (searchParams.get("order") as any) === "asc" ? "asc" : "desc";

    const page = Math.max(1, Number(searchParams.get("page") || "1"));
    const pageSize = Math.min(
      200,
      Math.max(1, Number(searchParams.get("pageSize") || "50"))
    );
    const skip = (page - 1) * pageSize;

    const whereTicket: any = {};
    const whereVip: any = {};
    if (status && ALL_STATUSES.includes(status as PS)) {
      whereTicket.paymentStatus = status as PS;
      whereVip.paymentStatus = status as PS;
    }
    if (q) {
      const orQ = [
        { customerName: { contains: q, mode: "insensitive" } },
        { customerEmail: { contains: q, mode: "insensitive" } },
        { customerDni: { contains: q, mode: "insensitive" } },
      ];
      whereTicket.OR = orQ;
      whereVip.OR = orQ;
    }

    const wantTickets = typeFilter !== "vip-table";
    const wantVip = typeFilter !== "ticket";

    const [tickets, reservations] = await Promise.all([
      wantTickets
        ? prisma.ticket.findMany({
            where: whereTicket,
            select: {
              id: true,
              eventId: true,
              ticketType: true,
              gender: true,
              quantity: true,
              totalPrice: true,
              customerName: true,
              customerEmail: true,
              customerPhone: true,
              customerDni: true,
              paymentId: true,
              paymentStatus: true,
              paymentMethod: true,
              qrCode: true,
              validationCode: true,
              validated: true,
              validatedAt: true,
              purchaseDate: true,
            },
          })
        : Promise.resolve([]),
      wantVip
        ? prisma.tableReservation.findMany({
            where: whereVip,
            select: {
              id: true,
              eventId: true,
              packageType: true,
              location: true,
              tables: true,
              capacity: true,
              guests: true,
              totalPrice: true,
              customerName: true,
              customerEmail: true,
              customerPhone: true,
              customerDni: true,
              paymentId: true,
              paymentStatus: true,
              paymentMethod: true,
              qrCode: true,
              validationCode: true,
              validated: true,
              validatedAt: true,
              reservationDate: true,
            },
          })
        : Promise.resolve([]),
    ]);

    type Unified = {
      type: "ticket" | "vip-table";
      id: string;
      eventId: string;
      date: Date;
      totalPrice: number;
      customerName: string;
      customerEmail: string;
      customerPhone: string;
      customerDni: string;
      paymentId?: string | null;
      paymentStatus: PS;
      paymentMethod: PM;
      qrCode?: string | null;
      validationCode?: string | null;
      validated: boolean;
      validatedAt?: Date | null;

      ticketType?: string | null;
      gender?: "hombre" | "mujer" | null;
      quantity?: number | null;

      location?: "piscina" | "dj" | "general" | null;
      tables?: number | null;
      capacity?: number | null;
      guests?: number | null;
    };

    const unified: Unified[] = [
      ...tickets.map((t) => ({
        type: "ticket" as const,
        id: t.id,
        eventId: t.eventId,
        date: t.purchaseDate ?? new Date(0),
        totalPrice: Number(t.totalPrice || 0),
        customerName: t.customerName,
        customerEmail: t.customerEmail,
        customerPhone: t.customerPhone,
        customerDni: t.customerDni,
        paymentId: t.paymentId || null,
        paymentStatus: t.paymentStatus,
        paymentMethod: t.paymentMethod,
        qrCode: t.qrCode || null,
        validationCode: t.validationCode || null,
        validated: t.validated,
        validatedAt: t.validatedAt,
        ticketType: t.ticketType,
        gender: t.gender as any,
        quantity: t.quantity ?? 1,
        location: null,
        tables: null,
        capacity: null,
        guests: null,
      })),
      ...reservations.map((r) => ({
        type: "vip-table" as const,
        id: r.id,
        eventId: r.eventId,
        date: r.reservationDate ?? new Date(0),
        totalPrice: Number(r.totalPrice || 0),
        customerName: r.customerName,
        customerEmail: r.customerEmail,
        customerPhone: r.customerPhone,
        customerDni: r.customerDni,
        paymentId: r.paymentId || null,
        paymentStatus: r.paymentStatus,
        paymentMethod: r.paymentMethod,
        qrCode: r.qrCode || null,
        validationCode: r.validationCode || null,
        validated: r.validated,
        validatedAt: r.validatedAt,
        ticketType: null,
        gender: null,
        quantity: r.tables ?? 1,
        location: r.location as any,
        tables: r.tables ?? 1,
        capacity: r.capacity ?? null,
        guests: r.guests ?? null,
      })),
    ];

    unified.sort((a, b) => {
      if (orderByField === "totalPrice") {
        const cmp = (a.totalPrice || 0) - (b.totalPrice || 0);
        return order === "asc" ? cmp : -cmp;
      }
      const da = a.date?.valueOf() || 0;
      const db = b.date?.valueOf() || 0;
      const cmp = da - db;
      return order === "asc" ? cmp : -cmp;
    });

    const total = unified.length;
    const pageItems = unified.slice(skip, skip + pageSize);

    return NextResponse.json({
      ok: true,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
      items: pageItems,
    });
  } catch (error) {
    console.error("[tickets][GET unified] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch sales" },
      { status: 500 }
    );
  }
}

/* =========================================================
   POST /api/admin/tickets  (UNIFICADO)
   Crea venta GENERAL (Ticket) o VIP por ubicación (TableReservation)
   Body común:
     - type: "general" | "vip" | "vip-table"
     - customerName, customerEmail, customerPhone, customerDni
     - paymentMethod?: mercadopago|transferencia|efectivo (default: mercadopago)
     - paymentStatus?: ver enum PaymentStatus (default: approved)
   General:
     - gender: "hombre" | "mujer"
     - quantity: number
     - totalPrice?: number (override opcional si forceTotalPrice = true)
     - forceTotalPrice?: boolean
   VIP:
     - location: "dj" | "piscina" | "general"
     - tables: number
     - packageType?: string (default: "mesa")
========================================================= */
export async function POST(request: NextRequest) {
  const auth = await verifyAuth(request);
  if (!auth)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = (await request.json().catch(() => ({}))) as any;

    // Evento activo
    const event = await prisma.event.findFirst({
      where: { isActive: true },
      select: { id: true, date: true },
    });
    if (!event) {
      return NextResponse.json(
        { error: "No hay evento activo" },
        { status: 400 }
      );
    }

    // Datos cliente
    const customerName = normString(body.customerName);
    const customerEmail = normEmail(body.customerEmail);
    const customerPhone = normString(body.customerPhone);
    const customerDni = extractCustomerDni(body);
    if (!customerName)
      return NextResponse.json(
        { error: "customerName requerido" },
        { status: 400 }
      );
    if (!customerEmail)
      return NextResponse.json(
        { error: "customerEmail inválido" },
        { status: 400 }
      );
    if (!customerPhone)
      return NextResponse.json(
        { error: "customerPhone requerido" },
        { status: 400 }
      );
    if (!customerDni)
      return NextResponse.json(
        { error: "customerDni requerido" },
        { status: 400 }
      );

    // Pago
    const paymentMethod =
      toPaymentMethod(normString(body.paymentMethod)) ?? PM.mercadopago;
    const paymentStatus =
      toPaymentStatus(normString(body.paymentStatus)) ?? PS.approved;

    // Tipo (general o vip-table)
    const rawType = (normString(body.type) || "general").toLowerCase();
    const type: "general" | "vip-table" =
      rawType === "vip" || rawType === "vip-table" ? "vip-table" : "general";

    /* ---------- GENERAL (Ticket) ---------- */
    if (type === "general") {
      const rawGender = normString(body.gender);
      const gender: "hombre" | "mujer" | undefined =
        rawGender === "mujer"
          ? "mujer"
          : rawGender === "hombre"
            ? "hombre"
            : undefined;
      const quantity = Math.max(1, normNumber(body.quantity) ?? 1);

      // Precio desde BD (ticketConfig por género)
      const cfg = await prisma.ticketConfig.findFirst({
        where: {
          eventId: event.id,
          ticketType: "general",
          gender: (gender as any) ?? undefined,
        },
        select: { id: true, price: true },
      });

      const overrideTotal = normNumber(body.totalPrice);
      const forceOverride =
        body.forceTotalPrice === true || body.forceTotalPrice === "true";

      let totalPriceDecimal: Prisma.Decimal;
      let ticketConfigId: string | undefined;

      if (forceOverride && overrideTotal !== undefined) {
        if (overrideTotal < 0) {
          return NextResponse.json(
            { error: "totalPrice no puede ser negativo" },
            { status: 400 }
          );
        }
        totalPriceDecimal = new Prisma.Decimal(overrideTotal);
        if (cfg) ticketConfigId = cfg.id;
      } else if (cfg) {
        const unit = new Prisma.Decimal(cfg.price);
        totalPriceDecimal = unit.mul(quantity);
        ticketConfigId = cfg.id;
      } else {
        return NextResponse.json(
          { error: "No existe configuración de precio en BD para el género" },
          { status: 400 }
        );
      }

      // Crear ticket (con QR)
      let attempts = 0;
      while (attempts < 5) {
        const qr = generateQr("TICKET");
        try {
          const created = await prisma.ticket.create({
            data: {
              eventId: event.id,
              eventDate: event.date,
              ticketType: "general",
              ...(gender ? { gender: gender as any } : {}),
              quantity,
              totalPrice: totalPriceDecimal,
              customerName,
              customerEmail,
              customerPhone,
              customerDni,
              paymentMethod,
              paymentStatus,
              qrCode: qr,
              ...(ticketConfigId ? { ticketConfigId } : {}),
            },
            select: { id: true },
          });

          // ⚠️ Para evitar el error de tipos con TransactionClient,
          // llamamos ensureSixDigitCode DESPUÉS (si está approved).
          if (paymentStatus === PS.approved) {
            await ensureSixDigitCode(prisma, {
              type: "ticket",
              id: created.id,
            });
          }

          const ticket = await prisma.ticket.findUnique({
            where: { id: created.id },
          });
          return NextResponse.json({ ok: true, type: "ticket", ticket });
        } catch (e: any) {
          if (e?.code === "P2002") {
            attempts++;
            continue;
          }
          throw e;
        }
      }
      return NextResponse.json(
        { error: "No se pudo crear (colisiones de unicidad)." },
        { status: 500 }
      );
    }

    /* ---------- VIP por ubicación (TableReservation) ---------- */
    const location = (normString(body.location) || "").toLowerCase();
    if (!["dj", "piscina", "general"].includes(location)) {
      return NextResponse.json({ error: "location inválida" }, { status: 400 });
    }
    const tables = Math.max(1, normNumber(body.tables) ?? 1);
    const packageType = normString(body.packageType) || "mesa";

    // Config por ubicación
    const cfg = await prisma.vipTableConfig.findFirst({
      where: { eventId: event.id, location: location as any },
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
        { error: "No hay configuración VIP para esa ubicación" },
        { status: 400 }
      );
    }
    const pricePerTable = Number(cfg.price || 0);
    if (!(pricePerTable >= 0)) {
      return NextResponse.json(
        { error: "Precio por mesa inválido en configuración" },
        { status: 400 }
      );
    }
    const capacityPerTable = Math.max(1, Number(cfg.capacityPerTable || 10));
    const totalPrice = new Prisma.Decimal(pricePerTable).mul(tables);
    const capacity = tables * capacityPerTable;

    // Transacción: crear reserva y actualizar stock si approved
    const createdRes = await prisma.$transaction(async (tx) => {
      if (paymentStatus === PS.approved) {
        const fresh = await tx.vipTableConfig.findUnique({
          where: { id: cfg.id },
          select: { stockLimit: true, soldCount: true },
        });
        const remaining = Math.max(
          0,
          (fresh?.stockLimit || 0) - (fresh?.soldCount || 0)
        );
        if (tables > remaining) {
          throw new Error("stock_insuficiente");
        }
      }

      const res = await tx.tableReservation.create({
        data: {
          eventId: event.id,
          packageType,
          location: location as any,
          tables,
          capacity,
          guests: 0,
          totalPrice,
          customerName,
          customerEmail,
          customerPhone,
          customerDni,
          reservationDate: new Date(),
          paymentMethod,
          paymentStatus,
          qrCode: generateQr("VIP"),
          vipTableConfigId: cfg.id,
        },
        select: { id: true },
      });

      if (paymentStatus === PS.approved) {
        await tx.vipTableConfig.update({
          where: { id: cfg.id },
          data: { soldCount: { increment: tables } },
        });
      }

      return res;
    });

    // Asegurar validationCode post-transacción (evita error de tipos con tx)
    if (paymentStatus === PS.approved) {
      await ensureSixDigitCode(prisma, {
        type: "vip-table",
        id: createdRes.id,
      });
    }

    const reservation = await prisma.tableReservation.findUnique({
      where: { id: createdRes.id },
    });

    return NextResponse.json({ ok: true, type: "vip-table", reservation });
  } catch (error: any) {
    if (error?.message === "stock_insuficiente") {
      return NextResponse.json(
        { error: "No hay stock suficiente en esa ubicación" },
        { status: 409 }
      );
    }
    console.error("[tickets][POST unified] Error:", error);
    return NextResponse.json(
      { error: "Failed to create sale" },
      { status: 500 }
    );
  }
}

/* =========================================================
   PUT /api/admin/tickets  — SOLO Ticket (general)
========================================================= */
export async function PUT(request: NextRequest) {
  const auth = await verifyAuth(request);
  if (!auth)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = (await request.json().catch(() => ({}))) as any;
    const id = normString(body.id);
    if (!id)
      return NextResponse.json({ error: "ID required" }, { status: 400 });

    const current = await prisma.ticket.findUnique({
      where: { id },
      select: {
        ticketType: true,
        paymentStatus: true,
        validationCode: true,
        qrCode: true,
      },
    });
    if (!current)
      return NextResponse.json({ error: "Not found" }, { status: 404 });

    const dataToUpdate: any = {};
    if (body.ticketType !== undefined) {
      const tt = (normString(body.ticketType) || "").toLowerCase();
      if (tt && tt !== "general") {
        return NextResponse.json(
          {
            error:
              "ticketType inválido. Solo 'general' aquí. VIP se gestiona como vip-table.",
          },
          { status: 400 }
        );
      }
      dataToUpdate.ticketType = "general";
    }

    if (body.gender !== undefined) {
      const g = normString(body.gender);
      dataToUpdate.gender = g === "hombre" || g === "mujer" ? g : null;
    }

    const customerName = normString(body.customerName);
    if (customerName) dataToUpdate.customerName = customerName;

    const customerEmail = normEmail(body.customerEmail);
    if (customerEmail) dataToUpdate.customerEmail = customerEmail;

    const customerPhone = normString(body.customerPhone);
    if (customerPhone) dataToUpdate.customerPhone = customerPhone;

    const customerDni = extractCustomerDni(body);
    if (customerDni) dataToUpdate.customerDni = customerDni;

    const pm = toPaymentMethod(normString(body.paymentMethod));
    if (pm) dataToUpdate.paymentMethod = pm;

    const totalPrice = normNumber(body.totalPrice);
    if (totalPrice !== undefined) {
      if (totalPrice < 0)
        return NextResponse.json(
          { error: "totalPrice no puede ser negativo" },
          { status: 400 }
        );
      dataToUpdate.totalPrice = new Prisma.Decimal(totalPrice);
    }

    const quantity = normNumber(body.quantity);
    if (quantity !== undefined) dataToUpdate.quantity = Math.max(1, quantity);

    if (body.eventDate !== undefined) {
      dataToUpdate.eventDate = body.eventDate ? new Date(body.eventDate) : null;
    }

    const nextPs = toPaymentStatus(normString(body.paymentStatus));
    if (nextPs) dataToUpdate.paymentStatus = nextPs;

    await prisma.ticket.update({ where: { id }, data: dataToUpdate });

    const finalPs = nextPs ?? current.paymentStatus;
    const hasValidCode = !!normalizeSixDigitCode(current.validationCode);
    if (finalPs === PS.approved && !hasValidCode) {
      await ensureSixDigitCode(prisma, { type: "ticket", id });
    }

    const ticket = await prisma.ticket.findUnique({ where: { id } });
    return NextResponse.json({ ok: true, ticket });
  } catch (error) {
    console.error("[tickets][PUT] Error:", error);
    return NextResponse.json(
      { error: "Failed to update ticket" },
      { status: 500 }
    );
  }
}

/* =========================================================
   PATCH /api/admin/tickets — SOLO Ticket (general)
========================================================= */
export async function PATCH(request: NextRequest) {
  const auth = await verifyAuth(request);
  if (!auth)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = (await request.json().catch(() => ({}))) as any;
    const id = normString(body.id);
    if (!id)
      return NextResponse.json({ error: "ID required" }, { status: 400 });

    const current = await prisma.ticket.findUnique({ where: { id } });
    if (!current)
      return NextResponse.json({ error: "Not found" }, { status: 404 });

    const dataToUpdate: any = {};

    if (body.ticketType !== undefined) {
      const tt = (
        normString(body.ticketType) ?? current.ticketType
      ).toLowerCase();
      if (tt !== "general") {
        return NextResponse.json(
          { error: "ticketType inválido. Solo 'general'." },
          { status: 400 }
        );
      }
      dataToUpdate.ticketType = "general";
    }

    if (body.gender !== undefined) {
      const g = normString(body.gender);
      dataToUpdate.gender = g === "hombre" || g === "mujer" ? g : null;
    }

    if (body.customerName !== undefined)
      dataToUpdate.customerName =
        normString(body.customerName) ?? current.customerName;
    if (body.customerEmail !== undefined)
      dataToUpdate.customerEmail =
        normEmail(body.customerEmail) ?? current.customerEmail;
    if (body.customerPhone !== undefined)
      dataToUpdate.customerPhone =
        normString(body.customerPhone) ?? current.customerPhone;

    const customerDni = extractCustomerDni(body);
    if (
      body.customerDni !== undefined ||
      body.customerDNI !== undefined ||
      body.customer_dni !== undefined ||
      body.dni !== undefined
    ) {
      dataToUpdate.customerDni = customerDni ?? current.customerDni;
    }

    const pm = toPaymentMethod(normString(body.paymentMethod));
    if (pm) dataToUpdate.paymentMethod = pm;

    if (body.totalPrice !== undefined) {
      const tp = normNumber(body.totalPrice);
      if (tp !== undefined) {
        if (tp < 0)
          return NextResponse.json(
            { error: "totalPrice no puede ser negativo" },
            { status: 400 }
          );
        dataToUpdate.totalPrice = new Prisma.Decimal(tp);
      }
    }
    if (body.quantity !== undefined) {
      const qty = normNumber(body.quantity);
      if (qty !== undefined) dataToUpdate.quantity = Math.max(1, qty);
    }

    if (body.eventDate !== undefined) {
      dataToUpdate.eventDate = body.eventDate ? new Date(body.eventDate) : null;
    }

    let nextStatus = current.paymentStatus as PS;
    if (body.paymentStatus !== undefined) {
      const ps = toPaymentStatus(normString(body.paymentStatus));
      if (ps) nextStatus = ps;
    }
    dataToUpdate.paymentStatus = nextStatus;

    await prisma.ticket.update({ where: { id }, data: dataToUpdate });

    const hasValidCode = !!normalizeSixDigitCode(current.validationCode);
    if (nextStatus === PS.approved && !hasValidCode) {
      await ensureSixDigitCode(prisma, { type: "ticket", id });
    }

    const ticket = await prisma.ticket.findUnique({ where: { id } });
    return NextResponse.json({ ok: true, ticket });
  } catch (error) {
    console.error("[tickets][PATCH] Error:", error);
    return NextResponse.json(
      { error: "Failed to update ticket" },
      { status: 500 }
    );
  }
}

/* =========================================================
   DELETE /api/admin/tickets?id=xxx — SOLO Ticket (general)
========================================================= */
export async function DELETE(request: NextRequest) {
  const auth = await verifyAuth(request);
  if (!auth)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { searchParams } = new URL(request.url);
    const id = normString(searchParams.get("id"));
    if (!id)
      return NextResponse.json({ error: "ID required" }, { status: 400 });

    await prisma.ticket.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[tickets][DELETE] Error:", error);
    return NextResponse.json(
      { error: "Failed to delete ticket" },
      { status: 500 }
    );
  }
}

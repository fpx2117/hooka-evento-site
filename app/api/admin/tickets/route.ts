// app/api/admin/tickets/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jwtVerify } from "jose";
import {
  Prisma,
  PaymentMethod as PM,
  PaymentStatus as PS,
  TicketType as TT,
  Gender as G,
  TableLocation as TL,
  PackageType as PKG,
} from "@prisma/client";
import type { PrismaClient } from "@prisma/client"; // <- tipos
import {
  ensureSixDigitCode,
  normalizeSixDigitCode,
} from "@/lib/validation-code";

/* ========================= Alias de DB (PrismaClient | TransactionClient) ========================= */
type DB = Prisma.TransactionClient | PrismaClient;

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

/* ========================= Helpers (autocontenidos) ========================= */
const normString = (v: unknown): string | undefined => {
  if (v == null) return undefined;
  const s = String(v).trim();
  return s.length ? s : undefined;
};
const normEmail = (v: unknown): string | undefined => {
  const s = normString(v);
  if (!s) return undefined;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s.toLowerCase() : undefined;
};
const normNumber = (v: unknown): number | undefined => {
  if (v == null || v === "") return undefined;
  const n = Number(v);
  return Number.isNaN(n) ? undefined : n;
};
const extractCustomerDni = (obj: any): string | undefined =>
  normString(obj?.customerDni) ??
  normString(obj?.customerDNI) ??
  normString(obj?.customer_dni) ??
  (obj?.dni !== undefined ? normString(obj?.dni) : undefined);

const generateQr = (prefix = "TICKET") =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

const parsePaymentMethod = (v?: string): PM | undefined => {
  const s = (v || "").toLowerCase();
  if (s === "mercadopago") return PM.mercadopago;
  if (s === "transferencia") return PM.transferencia;
  if (s === "efectivo") return PM.efectivo;
  return undefined;
};
const parsePaymentStatus = (v?: string): PS | undefined => {
  const s = (v || "").toLowerCase();
  if ((PS as any)[s]) return (PS as any)[s] as PS;
  return undefined;
};
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
const parseGender = (v?: string): G | undefined => {
  const s = (v || "").toLowerCase();
  if (s === "hombre") return G.hombre;
  if (s === "mujer") return G.mujer;
  return undefined;
};
const parseLocation = (v?: string): TL | undefined => {
  const s = (v || "").toLowerCase();
  if (s === "dj") return TL.dj;
  if (s === "piscina") return TL.piscina;
  if (s === "general") return TL.general;
  return undefined;
};

/* ========================= Servicios inline (DRY) ========================= */
async function getActiveEventBasic() {
  return prisma.event.findFirst({
    where: { isActive: true },
    select: { id: true, date: true },
  });
}

async function checkVipAvailability(cfgId: string, wantTables: number, db: DB) {
  const fresh = await db.vipTableConfig.findUnique({
    where: { id: cfgId },
    select: { stockLimit: true, soldCount: true },
  });
  const remaining = Math.max(
    0,
    (fresh?.stockLimit || 0) - (fresh?.soldCount || 0)
  );
  if (wantTables > remaining) throw new Error("stock_insuficiente");
}

async function createTableReservationInline(params: {
  eventId: string;
  cfgId: string;
  location: TL;
  tables: number;
  capacity: number;
  totalPrice: Prisma.Decimal;
  customer: { name: string; email: string; phone: string; dni: string };
  status: PS;
  method: PM;
}) {
  const {
    eventId,
    cfgId,
    location,
    tables,
    capacity,
    totalPrice,
    customer,
    status,
    method,
  } = params;

  return prisma.$transaction(async (tx) => {
    if (status === PS.approved) await checkVipAvailability(cfgId, tables, tx); // <- ahora tipa
    const res = await tx.tableReservation.create({
      data: {
        eventId,
        packageType: PKG.mesa,
        location,
        tables,
        capacity,
        guests: 0,
        totalPrice,
        customerName: customer.name,
        customerEmail: customer.email,
        customerPhone: customer.phone,
        customerDni: customer.dni,
        reservationDate: new Date(),
        paymentMethod: method,
        paymentStatus: status,
        qrCode: generateQr("VIP"),
        vipTableConfigId: cfgId,
      },
      select: { id: true },
    });

    if (status === PS.approved) {
      await tx.vipTableConfig.update({
        where: { id: cfgId },
        data: { soldCount: { increment: tables } },
      });
    }

    return res;
  });
}

async function createGeneralTicketInline(params: {
  eventId: string;
  eventDate: Date | null;
  gender: G | null;
  quantity: number;
  totalPrice: Prisma.Decimal;
  customer: { name: string; email: string; phone: string; dni: string };
  method: PM;
  status: PS;
  ticketConfigId?: string;
}) {
  const {
    eventId,
    eventDate,
    gender,
    quantity,
    totalPrice,
    customer,
    method,
    status,
    ticketConfigId,
  } = params;

  let attempts = 0;
  while (attempts < 5) {
    const qr = generateQr("TICKET");
    try {
      const created = await prisma.ticket.create({
        data: {
          eventId,
          eventDate: eventDate || undefined,
          ticketType: TT.general,
          ...(gender ? { gender } : {}),
          quantity,
          totalPrice,
          customerName: customer.name,
          customerEmail: customer.email,
          customerPhone: customer.phone,
          customerDni: customer.dni,
          paymentMethod: method,
          paymentStatus: status,
          qrCode: qr,
          ...(ticketConfigId ? { ticketConfigId } : {}),
        },
        select: { id: true, paymentStatus: true },
      });

      if (status === PS.approved) {
        await ensureSixDigitCode(prisma, { type: "ticket", id: created.id });
      }
      return prisma.ticket.findUnique({ where: { id: created.id } });
    } catch (e: any) {
      if (e?.code === "P2002") {
        attempts++;
        continue;
      }
      throw e;
    }
  }
  throw new Error("unique_collision");
}

/* =========================================================
   GET /api/admin/tickets — unificado (Tickets + TableReservations)
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

      ticketType?: TT | null;
      gender?: G | null;
      quantity?: number | null;

      location?: TL | null;
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
        gender: t.gender ?? null,
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
        quantity: r.tables ?? 1, // N mesas; cupo global se descuenta al emitir Ticket vip
        location: r.location,
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
   POST /api/admin/tickets — crea GENERAL o VIP (reserva)
========================================================= */
export async function POST(request: NextRequest) {
  const auth = await verifyAuth(request);
  if (!auth)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = (await request.json().catch(() => ({}))) as any;

    const event = await getActiveEventBasic();
    if (!event)
      return NextResponse.json(
        { error: "No hay evento activo" },
        { status: 400 }
      );

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

    const paymentMethod =
      parsePaymentMethod(normString(body.paymentMethod)) ?? PM.mercadopago;
    const paymentStatus =
      parsePaymentStatus(normString(body.paymentStatus)) ?? PS.approved;

    const rawType = (normString(body.type) || "general").toLowerCase();
    const type: "general" | "vip-table" =
      rawType === "vip" || rawType === "vip-table" ? "vip-table" : "general";

    // ---------- GENERAL ----------
    if (type === "general") {
      const genderEnum = parseGender(normString(body.gender));
      const quantity = Math.max(1, normNumber(body.quantity) ?? 1);

      // TicketConfig es String (permitimos "total"); buscamos "general"
      const cfg = await prisma.ticketConfig.findFirst({
        where: { eventId: event.id, ticketType: "general", gender: genderEnum },
        select: { id: true, price: true },
      });

      const overrideTotal = normNumber(body.totalPrice);
      const forceOverride =
        body.forceTotalPrice === true || body.forceTotalPrice === "true";

      let totalPriceDecimal: Prisma.Decimal;
      let ticketConfigId: string | undefined;

      if (forceOverride && overrideTotal !== undefined) {
        if (overrideTotal < 0)
          return NextResponse.json(
            { error: "totalPrice no puede ser negativo" },
            { status: 400 }
          );
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

      const ticket = await createGeneralTicketInline({
        eventId: event.id,
        eventDate: event.date,
        gender: genderEnum ?? null,
        quantity,
        totalPrice: totalPriceDecimal,
        customer: {
          name: customerName,
          email: customerEmail,
          phone: customerPhone,
          dni: customerDni,
        },
        method: paymentMethod,
        status: paymentStatus,
        ticketConfigId,
      });

      return NextResponse.json({ ok: true, type: "ticket", ticket });
    }

    // ---------- VIP (reserva por ubicación) ----------
    const locEnum = parseLocation(normString(body.location) || "");
    if (!locEnum)
      return NextResponse.json({ error: "location inválida" }, { status: 400 });
    const tables = Math.max(1, normNumber(body.tables) ?? 1);

    const cfg = await prisma.vipTableConfig.findFirst({
      where: { eventId: event.id, location: locEnum },
      select: { id: true, price: true, capacityPerTable: true },
    });
    if (!cfg)
      return NextResponse.json(
        { error: "No hay configuración VIP para esa ubicación" },
        { status: 400 }
      );

    const pricePerTable = Number(cfg.price || 0);
    if (!(pricePerTable >= 0))
      return NextResponse.json(
        { error: "Precio por mesa inválido en configuración" },
        { status: 400 }
      );

    const capacityPerTable = Math.max(1, Number(cfg.capacityPerTable || 10));
    const totalPrice = new Prisma.Decimal(pricePerTable).mul(tables);
    const capacity = tables * capacityPerTable;

    const createdRes = await createTableReservationInline({
      eventId: event.id,
      cfgId: cfg.id,
      location: locEnum,
      tables,
      capacity,
      totalPrice,
      customer: {
        name: customerName,
        email: customerEmail,
        phone: customerPhone,
        dni: customerDni,
      },
      status: paymentStatus,
      method: paymentMethod,
    });

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
    if (error?.message === "unique_collision") {
      return NextResponse.json(
        { error: "Colisión de unicidad, reintente." },
        { status: 500 }
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
   PUT /api/admin/tickets — SOLO Ticket (general)
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
      if (tt && tt !== "general")
        return NextResponse.json(
          {
            error:
              "ticketType inválido. Solo 'general' aquí. VIP es vip-table.",
          },
          { status: 400 }
        );
      dataToUpdate.ticketType = TT.general;
    }

    if (body.gender !== undefined) {
      const g = parseGender(normString(body.gender));
      dataToUpdate.gender = g ?? null;
    }

    const customerName = normString(body.customerName);
    if (customerName) dataToUpdate.customerName = customerName;

    const customerEmail = normEmail(body.customerEmail);
    if (customerEmail) dataToUpdate.customerEmail = customerEmail;

    const customerPhone = normString(body.customerPhone);
    if (customerPhone) dataToUpdate.customerPhone = customerPhone;

    const customerDni = extractCustomerDni(body);
    if (customerDni) dataToUpdate.customerDni = customerDni;

    const pm = parsePaymentMethod(normString(body.paymentMethod));
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

    const nextPs = parsePaymentStatus(normString(body.paymentStatus));
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
      const tt = (normString(body.ticketType) ?? current.ticketType)
        ?.toString()
        .toLowerCase();
      if (tt !== "general")
        return NextResponse.json(
          { error: "ticketType inválido. Solo 'general'." },
          { status: 400 }
        );
      dataToUpdate.ticketType = TT.general;
    }

    if (body.gender !== undefined) {
      const g = parseGender(normString(body.gender));
      dataToUpdate.gender = g ?? null;
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

    const pm = parsePaymentMethod(normString(body.paymentMethod));
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
      const ps = parsePaymentStatus(normString(body.paymentStatus));
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

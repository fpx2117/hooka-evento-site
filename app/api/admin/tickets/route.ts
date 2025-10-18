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
} from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import {
  ensureSixDigitCode,
  normalizeSixDigitCode,
} from "@/lib/validation-code";

/* ========================= Alias DB ========================= */
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

/* ========================= Helpers ========================= */
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
  switch (s) {
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
  }
  return undefined;
};
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

/* ========================= Dominio / Stock ========================= */
async function getActiveEventBasic() {
  return prisma.event.findFirst({
    where: { isActive: true },
    select: { id: true, date: true },
  });
}

async function priceForGeneral(
  eventId: string,
  gender: G,
  qty: number
): Promise<{ ticketConfigId: string; total: Prisma.Decimal }> {
  const cfg = await prisma.ticketConfig.findFirst({
    where: { eventId, ticketType: "general", gender },
    select: { id: true, price: true },
  });
  if (!cfg) throw new Error("price_cfg_not_found");
  const unit = new Prisma.Decimal(cfg.price);
  return { ticketConfigId: cfg.id, total: unit.mul(qty) };
}

async function priceForVip(
  eventId: string,
  location: TL,
  tables: number // seguirá existiendo en el modelo (stock), pero lo forzamos a 1
): Promise<{
  vipConfigId: string;
  capacityPerTable: number;
  total: Prisma.Decimal;
  remainingTables: number;
  stockLimit: number;
}> {
  const cfg = await prisma.vipTableConfig.findUnique({
    where: { eventId_location: { eventId, location } },
    select: {
      id: true,
      price: true,
      capacityPerTable: true,
      stockLimit: true,
      soldCount: true,
    },
  });
  if (!cfg) throw new Error("vip_cfg_not_found");
  const remaining = Math.max(0, cfg.stockLimit - cfg.soldCount);
  const unit = new Prisma.Decimal(cfg.price);
  return {
    vipConfigId: cfg.id,
    capacityPerTable: Number(cfg.capacityPerTable || 10),
    total: unit.mul(tables),
    remainingTables: remaining,
    stockLimit: cfg.stockLimit,
  };
}

async function adjustVipSoldCount(
  tx: DB,
  eventId: string,
  location: TL,
  delta: number
) {
  if (!delta) return;
  const cfg = await tx.vipTableConfig.findUnique({
    where: { eventId_location: { eventId, location } },
    select: { id: true, stockLimit: true, soldCount: true },
  });
  if (!cfg) throw new Error("vip_cfg_not_found");
  const next = cfg.soldCount + delta;
  if (next < 0) throw new Error("vip_sold_negative");
  if (next > cfg.stockLimit) throw new Error("vip_sold_exceeds_stock");
  await tx.vipTableConfig.update({
    where: { id: cfg.id },
    data: { soldCount: next },
  });
}

/* ========================= Validaciones mesa ========================= */
async function assertTableNumberFreeAndValid(opts: {
  eventId: string;
  location: TL;
  tableNumber: number | undefined;
  stockLimit: number;
  excludeTicketId?: string; // para PUT (evitar false positives con el propio ticket)
}) {
  const { eventId, location, tableNumber, stockLimit, excludeTicketId } = opts;

  if (
    tableNumber === undefined ||
    tableNumber === null ||
    !Number.isFinite(tableNumber)
  ) {
    throw new Error("table_required");
  }
  if (tableNumber < 1 || tableNumber > stockLimit) {
    throw new Error("table_out_of_range");
  }

  // ¿ya está ocupada por un ticket approved/in_process?
  const taken = await prisma.ticket.findFirst({
    where: {
      eventId,
      ticketType: TT.vip,
      vipLocation: location,
      tableNumber,
      paymentStatus: { in: [PS.approved, PS.in_process] },
      ...(excludeTicketId ? { id: { not: excludeTicketId } } : {}),
    },
    select: { id: true },
  });
  if (taken) throw new Error("table_taken");
}

/* =========================================================
   GET /api/admin/tickets  — SOLO Ticket (general y VIP)
========================================================= */
export async function GET(request: NextRequest) {
  const auth = await verifyAuth(request);
  if (!auth)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { searchParams } = new URL(request.url);

    const status = searchParams.get("status");
    const q = normString(searchParams.get("q"));
    const typeFilter = normString(searchParams.get("type")); // "general" | "vip" | undefined

    const orderByField =
      (searchParams.get("orderBy") as "purchaseDate" | "totalPrice" | null) ||
      "purchaseDate";
    const order: "asc" | "desc" =
      (searchParams.get("order") as any) === "asc" ? "asc" : "desc";

    const page = Math.max(1, Number(searchParams.get("page") || "1"));
    const pageSize = Math.min(
      200,
      Math.max(1, Number(searchParams.get("pageSize") || "50"))
    );
    const skip = (page - 1) * pageSize;

    const where: Prisma.TicketWhereInput = {};
    if (status && ALL_STATUSES.includes(status as PS)) {
      where.paymentStatus = status as PS;
    }
    if (typeFilter === "general") where.ticketType = TT.general;
    if (typeFilter === "vip") where.ticketType = TT.vip;
    if (q) {
      where.OR = [
        { customerName: { contains: q, mode: "insensitive" } },
        { customerEmail: { contains: q, mode: "insensitive" } },
        { customerDni: { contains: q, mode: "insensitive" } },
      ];
    }

    const [total, tickets] = await Promise.all([
      prisma.ticket.count({ where }),
      prisma.ticket.findMany({
        where,
        orderBy: { [orderByField]: order },
        skip,
        take: pageSize,
        select: {
          id: true,
          ticketType: true,
          gender: true,
          quantity: true,
          // VIP fields
          vipLocation: true,
          vipTables: true,
          capacityPerTable: true,
          tableNumber: true, // ✅ incluir mesa

          totalPrice: true,
          customerName: true,
          customerEmail: true,
          customerPhone: true,
          customerDni: true,
          paymentMethod: true,
          paymentStatus: true,
          qrCode: true,
          validationCode: true,
          validated: true,
          purchaseDate: true,
        },
      }),
    ]);

    // Compat para el dashboard (alias de ubicación)
    const normalized = tickets.map((t) => ({
      ...t,
      tableLocation: t.vipLocation ?? null, // alias para UI
    }));

    return NextResponse.json({
      ok: true,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
      tickets: normalized,
    });
  } catch (error) {
    console.error("[tickets][GET] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch tickets" },
      { status: 500 }
    );
  }
}

/* =========================================================
   POST /api/admin/tickets — crea GENERAL o VIP
   body:
     - ticketType: "general" | "vip"
     - GENERAL: gender, quantity
     - VIP: location, tableNumber (obligatorio), tables (opcional, default=1)
========================================================= */
export async function POST(request: NextRequest) {
  const auth = await verifyAuth(request);
  if (!auth)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = (await request.json().catch(() => ({}))) as any;

    // Evento activo
    const event = await getActiveEventBasic();
    if (!event)
      return NextResponse.json(
        { error: "No hay evento activo" },
        { status: 400 }
      );

    // Cliente
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
      parsePaymentMethod(normString(body.paymentMethod)) ?? PM.mercadopago;
    const paymentStatus =
      parsePaymentStatus(normString(body.paymentStatus)) ?? PS.approved;

    // Tipo
    const ttRaw = (normString(body.ticketType) ||
      normString(body.type) ||
      "general")!
      .toLowerCase()
      .trim();
    const isVip = ttRaw === "vip" || ttRaw === "vip-table";

    // ---------- GENERAL ----------
    if (!isVip) {
      const genderEnum = parseGender(normString(body.gender));
      if (!genderEnum)
        return NextResponse.json(
          { error: "gender inválido (hombre|mujer)" },
          { status: 400 }
        );

      const quantity = Math.max(1, normNumber(body.quantity) ?? 1);

      const overrideTotal = normNumber(body.totalPrice);
      const forceOverride =
        body.forceTotalPrice === true || body.forceTotalPrice === "true";

      let totalPrice: Prisma.Decimal;
      let ticketConfigId: string | undefined;

      if (forceOverride && overrideTotal !== undefined) {
        if (overrideTotal < 0)
          return NextResponse.json(
            { error: "totalPrice no puede ser negativo" },
            { status: 400 }
          );
        totalPrice = new Prisma.Decimal(overrideTotal);
        // capturamos config si existe (trazabilidad)
        const cfg = await prisma.ticketConfig.findFirst({
          where: {
            eventId: event.id,
            ticketType: "general",
            gender: genderEnum,
          },
          select: { id: true },
        });
        if (cfg) ticketConfigId = cfg.id;
      } else {
        const priced = await priceForGeneral(event.id, genderEnum, quantity);
        totalPrice = priced.total;
        ticketConfigId = priced.ticketConfigId;
      }

      // Crear ticket general
      let attempts = 0;
      while (attempts < 5) {
        const qr = generateQr("TICKET");
        try {
          const created = await prisma.ticket.create({
            data: {
              eventId: event.id,
              eventDate: event.date,
              ticketType: TT.general,
              gender: genderEnum,
              quantity,
              totalPrice,
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

          if (paymentStatus === PS.approved) {
            await ensureSixDigitCode(prisma, {
              type: "ticket",
              id: created.id,
            });
          }

          const ticket = await prisma.ticket.findUnique({
            where: { id: created.id },
          });
          return NextResponse.json({ ok: true, ticketType: "general", ticket });
        } catch (e: any) {
          if (e?.code === "P2002") {
            attempts++;
            continue;
          }
          throw e;
        }
      }
      return NextResponse.json(
        { error: "Colisión de unicidad." },
        { status: 500 }
      );
    }

    // ---------- VIP ----------
    const locEnum = parseLocation(normString(body.location) || "");
    if (!locEnum)
      return NextResponse.json({ error: "location inválida" }, { status: 400 });

    // Una sola mesa por ticket → forzamos tables=1 (se sigue usando para stock)
    const tables = 1;

    // Precio + límites por ubicación
    const priced = await priceForVip(event.id, locEnum, tables);
    if (tables > priced.remainingTables) {
      return NextResponse.json(
        { error: "No hay mesas suficientes en esa ubicación" },
        { status: 409 }
      );
    }

    // Mesa obligatoria y libre
    const tableNumber =
      typeof body.tableNumber === "number"
        ? body.tableNumber
        : normNumber(body.tableNumber);

    try {
      await assertTableNumberFreeAndValid({
        eventId: event.id,
        location: locEnum,
        tableNumber,
        stockLimit: priced.stockLimit,
      });
    } catch (e: any) {
      if (e?.message === "table_required")
        return NextResponse.json(
          { error: "tableNumber requerido" },
          { status: 400 }
        );
      if (e?.message === "table_out_of_range")
        return NextResponse.json(
          { error: "tableNumber fuera de rango" },
          { status: 400 }
        );
      if (e?.message === "table_taken")
        return NextResponse.json(
          { error: "La mesa indicada ya está ocupada" },
          { status: 409 }
        );
      throw e;
    }

    const vipCapacity = priced.capacityPerTable; // snapshot
    const totalPrice = priced.total;

    // Transacción: ajustar stock (si approved) + crear ticket
    const created = await prisma.$transaction(async (tx) => {
      if (paymentStatus === PS.approved) {
        await adjustVipSoldCount(tx, event.id, locEnum, +tables);
      }

      let attempts = 0;
      while (attempts < 5) {
        const qr = generateQr("VIP");
        try {
          const t = await tx.ticket.create({
            data: {
              eventId: event.id,
              eventDate: event.date,
              ticketType: TT.vip,
              // snapshot VIP
              vipLocation: locEnum,
              vipTables: tables, // siempre 1
              capacityPerTable: vipCapacity,
              tableNumber, // ✅ mesa asignada

              totalPrice,
              customerName,
              customerEmail,
              customerPhone,
              customerDni,
              paymentMethod,
              paymentStatus,
              qrCode: qr,
            },
            select: { id: true },
          });
          return t;
        } catch (e: any) {
          if (e?.code === "P2002") {
            attempts++;
            continue;
          }
          throw e;
        }
      }
      throw new Error("unique_collision");
    });

    if (paymentStatus === PS.approved) {
      await ensureSixDigitCode(prisma, { type: "ticket", id: created.id });
    }

    const ticket = await prisma.ticket.findUnique({
      where: { id: created.id },
    });
    return NextResponse.json({ ok: true, ticketType: "vip", ticket });
  } catch (error: any) {
    if (error?.message === "vip_cfg_not_found") {
      return NextResponse.json(
        { error: "No hay configuración VIP para esa ubicación" },
        { status: 400 }
      );
    }
    if (error?.message === "vip_sold_exceeds_stock") {
      return NextResponse.json(
        { error: "Stock VIP excedido" },
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
      { error: "Failed to create ticket" },
      { status: 500 }
    );
  }
}

/* =========================================================
   PUT /api/admin/tickets — actualizar Ticket (general o vip)
   Reglas VIP:
   - NO se puede cambiar ubicación/mesas/capacidad NI la mesa si está approved.
   - Si NO está approved, se puede cambiar tableNumber (validado y libre).
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

    const current = await prisma.ticket.findUnique({ where: { id } });
    if (!current)
      return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Build changes
    const dataToUpdate: Prisma.TicketUpdateInput = {};

    // GENERAL fields
    if (body.ticketType !== undefined) {
      const tt = (normString(body.ticketType) || "").toLowerCase();
      if (tt === "general") dataToUpdate.ticketType = TT.general;
      else if (tt === "vip") dataToUpdate.ticketType = TT.vip;
      else
        return NextResponse.json(
          { error: "ticketType inválido (general|vip)" },
          { status: 400 }
        );
    }

    if (body.gender !== undefined) {
      const g = parseGender(normString(body.gender));
      dataToUpdate.gender = g ?? null;
    }
    const quantity = normNumber(body.quantity);
    if (quantity !== undefined) dataToUpdate.quantity = Math.max(1, quantity);

    // VIP fields
    const wantsLocation = body.location !== undefined;
    const wantsTables = body.tables !== undefined;
    const wantsCapacity = body.capacityPerTable !== undefined;
    const wantsTableNumber = body.tableNumber !== undefined;

    if (current.paymentStatus !== PS.approved) {
      if (wantsLocation) {
        const loc = parseLocation(normString(body.location));
        dataToUpdate.vipLocation = loc ?? null;
      }
      if (wantsTables) {
        // aunque forzamos a 1 en creación, permitimos que PUT también lo fije;
        // si te interesa bloquear, podrías ignorarlo.
        const t = normNumber(body.tables);
        if (t !== undefined) dataToUpdate.vipTables = Math.max(1, t);
      }
      if (wantsCapacity) {
        const c = normNumber(body.capacityPerTable);
        if (c !== undefined) dataToUpdate.capacityPerTable = Math.max(1, c);
      }
      if (wantsTableNumber) {
        const tnum =
          typeof body.tableNumber === "number"
            ? body.tableNumber
            : normNumber(body.tableNumber);

        // Validar disponibilidad de la mesa en el contexto actual (ubicación actual o la nueva si se envió)
        const effLoc =
          (dataToUpdate.vipLocation as TL | undefined) || current.vipLocation;
        if (effLoc) {
          const cfg = await prisma.vipTableConfig.findUnique({
            where: {
              eventId_location: { eventId: current.eventId, location: effLoc },
            },
            select: { stockLimit: true },
          });
          if (!cfg) {
            return NextResponse.json(
              { error: "No hay configuración VIP para esa ubicación" },
              { status: 400 }
            );
          }
          try {
            await assertTableNumberFreeAndValid({
              eventId: current.eventId,
              location: effLoc,
              tableNumber: tnum,
              stockLimit: cfg.stockLimit,
              excludeTicketId: current.id, // permitir la propia
            });
          } catch (e: any) {
            if (e?.message === "table_required")
              return NextResponse.json(
                { error: "tableNumber requerido" },
                { status: 400 }
              );
            if (e?.message === "table_out_of_range")
              return NextResponse.json(
                { error: "tableNumber fuera de rango" },
                { status: 400 }
              );
            if (e?.message === "table_taken")
              return NextResponse.json(
                { error: "La mesa indicada ya está ocupada" },
                { status: 409 }
              );
            throw e;
          }
          dataToUpdate.tableNumber = tnum ?? null;
        } else {
          // si no hay ubicación definida, no podemos validar mesa
          return NextResponse.json(
            { error: "Definí una ubicación VIP antes de asignar mesa" },
            { status: 400 }
          );
        }
      }
    } else if (
      wantsLocation ||
      wantsTables ||
      wantsCapacity ||
      wantsTableNumber
    ) {
      return NextResponse.json(
        {
          error:
            "No se puede modificar VIP aprobado (ubicación/mesas/capacidad/mesa)",
        },
        { status: 400 }
      );
    }

    // Datos cliente / precio / fechas
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

    if (body.eventDate !== undefined) {
      dataToUpdate.eventDate = body.eventDate ? new Date(body.eventDate) : null;
    }

    // Estado (manejar transición VIP para stock)
    let nextStatus = current.paymentStatus as PS;
    if (body.paymentStatus !== undefined) {
      const ps = parsePaymentStatus(normString(body.paymentStatus));
      if (ps) nextStatus = ps;
    }
    dataToUpdate.paymentStatus = nextStatus;

    const updated = await prisma.$transaction(async (tx) => {
      // Si hay transición de estado que cruce a/from approved y es VIP => ajustar stock
      if (
        current.ticketType === TT.vip &&
        current.vipLocation &&
        current.vipTables
      ) {
        const wasApproved = current.paymentStatus === PS.approved;
        const willBeApproved = nextStatus === PS.approved;

        if (!wasApproved && willBeApproved) {
          // aprobar VIP
          await adjustVipSoldCount(
            tx,
            current.eventId,
            current.vipLocation,
            +current.vipTables
          );
        } else if (wasApproved && !willBeApproved) {
          // des-approbar VIP
          await adjustVipSoldCount(
            tx,
            current.eventId,
            current.vipLocation,
            -current.vipTables
          );
        }
      }

      await tx.ticket.update({ where: { id }, data: dataToUpdate });
      return tx.ticket.findUnique({ where: { id } });
    });

    // asegurar código si quedó approved
    const hadValid = !!normalizeSixDigitCode(current.validationCode);
    if (updated?.paymentStatus === PS.approved && !hadValid) {
      await ensureSixDigitCode(prisma, { type: "ticket", id });
    }

    return NextResponse.json({ ok: true, ticket: updated });
  } catch (error) {
    console.error("[tickets][PUT] Error:", error);
    return NextResponse.json(
      { error: "Failed to update ticket" },
      { status: 500 }
    );
  }
}

/* =========================================================
   PATCH /api/admin/tickets — idem PUT pero parcial
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

    // Reusar PUT (misma lógica). Mantengo PATCH como alias semántico.
    const req2 = new Request(new URL(request.url), {
      method: "PUT",
      headers: request.headers,
      body: JSON.stringify(body),
    });
    // @ts-ignore Next.js route handlers permiten reusar
    return await PUT(req2 as any);
  } catch (error) {
    console.error("[tickets][PATCH] Error:", error);
    return NextResponse.json(
      { error: "Failed to update ticket" },
      { status: 500 }
    );
  }
}

/* =========================================================
   DELETE /api/admin/tickets?id=xxx — borra Ticket
   Si es VIP aprobado, devuelve stock.
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

    const current = await prisma.ticket.findUnique({ where: { id } });
    if (!current)
      return NextResponse.json({ error: "Not found" }, { status: 404 });

    await prisma.$transaction(async (tx) => {
      if (
        current.ticketType === TT.vip &&
        current.paymentStatus === PS.approved &&
        current.vipLocation &&
        current.vipTables
      ) {
        await adjustVipSoldCount(
          tx,
          current.eventId,
          current.vipLocation,
          -current.vipTables
        );
      }
      await tx.ticket.delete({ where: { id } });
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[tickets][DELETE] Error:", error);
    return NextResponse.json(
      { error: "Failed to delete ticket" },
      { status: 500 }
    );
  }
}

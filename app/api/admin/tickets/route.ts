// app/api/admin/tickets/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jwtVerify } from "jose";
import {
  Prisma,
  PaymentMethod as PM,
  PaymentStatus as PS,
} from "@prisma/client";

/* =========================
   Auth
========================= */
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

/* =========================
   Helpers
========================= */
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

/** Acepta customerDni en múltiples variantes */
function extractCustomerDni(obj: any): string | undefined {
  return (
    normString(obj?.customerDni) ??
    normString(obj?.customerDNI) ??
    normString(obj?.customer_dni) ??
    (obj?.dni !== undefined ? normString(obj?.dni) : undefined)
  );
}

function generateQr(): string {
  return `TICKET-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/** 6 dígitos */
function generateValidationCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/* =========================
   Enum mappers
========================= */
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

/* =========================
   GET /api/admin/tickets
========================= */
export async function GET(request: NextRequest) {
  const auth = await verifyAuth(request);
  if (!auth)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { searchParams } = new URL(request.url);

    const status = searchParams.get("status");
    const q = normString(searchParams.get("q"));

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

    const where: any = {};
    if (status && ["pending", "approved", "rejected"].includes(status)) {
      where.paymentStatus = status as PS;
    }
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
      }),
    ]);

    return NextResponse.json({
      ok: true,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
      tickets,
    });
  } catch (error) {
    console.error("[tickets][GET] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch tickets" },
      { status: 500 }
    );
  }
}

/* =========================
   POST /api/admin/tickets
========================= */
export async function POST(request: NextRequest) {
  const auth = await verifyAuth(request);
  if (!auth)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = (await request.json().catch(() => ({}))) as any;

    // 🚫 Sin eventCode: usamos SIEMPRE el evento activo
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

    const ticketType = (normString(body.ticketType) || "general").toLowerCase(); // "general" | "vip"
    const rawGender = normString(body.gender);
    // Solo para general; VIP no tiene género
    const gender: "hombre" | "mujer" | undefined =
      ticketType === "general"
        ? rawGender === "mujer"
          ? "mujer"
          : rawGender === "hombre"
            ? "hombre"
            : undefined
        : undefined;

    const quantity = Math.max(1, normNumber(body.quantity) ?? 1);

    const customerName = normString(body.customerName);
    const customerEmail = normEmail(body.customerEmail);
    const customerPhone = normString(body.customerPhone);
    const customerDni = extractCustomerDni(body);

    const paymentMethodEnum =
      toPaymentMethod(normString(body.paymentMethod)) ?? PM.mercadopago;
    const paymentStatusEnum =
      toPaymentStatus(normString(body.paymentStatus)) ?? PS.approved;

    if (!customerName) {
      return NextResponse.json(
        { error: "customerName requerido" },
        { status: 400 }
      );
    }
    if (!customerEmail) {
      return NextResponse.json(
        { error: "customerEmail inválido" },
        { status: 400 }
      );
    }
    if (!customerPhone) {
      return NextResponse.json(
        { error: "customerPhone requerido" },
        { status: 400 }
      );
    }
    if (!customerDni) {
      return NextResponse.json(
        { error: "customerDni requerido" },
        { status: 400 }
      );
    }

    // Precio desde BD
    const cfg = await prisma.ticketConfig.findFirst({
      where: {
        eventId: event.id,
        ticketType,
        ...(ticketType === "general"
          ? { gender: (gender as any) ?? undefined }
          : { gender: null }),
      },
      select: { id: true, price: true },
    });

    // 🔥 Permitir override de total (para cargas manuales con descuentos)
    const overrideTotal = normNumber(body.totalPrice);
    const forceOverride =
      body.forceTotalPrice === true || body.forceTotalPrice === "true";

    let totalPriceDecimal: Prisma.Decimal;
    let ticketConfigId: string | undefined;

    if (forceOverride && overrideTotal !== undefined) {
      // ✅ Respeta el total calculado en el dashboard (con descuentos)
      totalPriceDecimal = new Prisma.Decimal(overrideTotal);
      if (cfg) ticketConfigId = cfg.id;
    } else if (cfg) {
      const unit = new Prisma.Decimal(cfg.price);
      totalPriceDecimal = unit.mul(quantity);
      ticketConfigId = cfg.id;
    } else {
      // Sin config: requiere totalPrice
      if (overrideTotal === undefined) {
        return NextResponse.json(
          {
            error:
              "No existe configuración de precio en BD para el tipo/género y no se envió totalPrice",
          },
          { status: 400 }
        );
      }
      totalPriceDecimal = new Prisma.Decimal(overrideTotal);
    }

    let attempts = 0;
    while (attempts < 3) {
      const qrCode = generateQr();
      const validationCode = generateValidationCode();

      try {
        const ticket = await prisma.ticket.create({
          data: {
            eventId: event.id,
            eventDate: event.date,
            ticketType,
            ...(ticketType === "general" && gender
              ? { gender: gender as any }
              : {}),
            quantity,
            totalPrice: totalPriceDecimal,
            customerName,
            customerEmail,
            customerPhone,
            customerDni,
            paymentMethod: paymentMethodEnum,
            paymentStatus: paymentStatusEnum,
            qrCode,
            validationCode,
            ...(ticketConfigId ? { ticketConfigId } : {}),
          },
        });
        return NextResponse.json({ ok: true, ticket });
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
  } catch (error) {
    console.error("[tickets][POST] Error:", error);
    return NextResponse.json(
      { error: "Failed to create ticket" },
      { status: 500 }
    );
  }
}

/* =========================
   PUT /api/admin/tickets
========================= */
export async function PUT(request: NextRequest) {
  const auth = await verifyAuth(request);
  if (!auth)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = (await request.json().catch(() => ({}))) as any;
    const id = normString(body.id);
    if (!id)
      return NextResponse.json({ error: "ID required" }, { status: 400 });

    const dataToUpdate: any = {};

    const ticketType = normString(body.ticketType);
    if (ticketType) dataToUpdate.ticketType = ticketType;

    if (body.gender !== undefined) {
      const nextType = (ticketType || "").toLowerCase();
      if (nextType === "general") {
        const g = normString(body.gender);
        if (g === "hombre" || g === "mujer") dataToUpdate.gender = g;
        else dataToUpdate.gender = null;
      } else {
        dataToUpdate.gender = null;
      }
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
      dataToUpdate.totalPrice = new Prisma.Decimal(totalPrice);
    }

    const quantity = normNumber(body.quantity);
    if (quantity !== undefined) dataToUpdate.quantity = quantity;

    if (body.eventDate !== undefined) {
      dataToUpdate.eventDate = body.eventDate ? new Date(body.eventDate) : null;
    }

    const ticket = await prisma.ticket.update({
      where: { id },
      data: dataToUpdate,
    });

    return NextResponse.json({ ok: true, ticket });
  } catch (error) {
    console.error("[tickets][PUT] Error:", error);
    return NextResponse.json(
      { error: "Failed to update ticket" },
      { status: 500 }
    );
  }
}

/* =========================
   PATCH /api/admin/tickets
========================= */
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

    if (body.ticketType !== undefined)
      dataToUpdate.ticketType =
        normString(body.ticketType) ?? current.ticketType;

    if (body.gender !== undefined) {
      const nextType = (
        dataToUpdate.ticketType || current.ticketType
      ).toLowerCase();
      if (nextType === "general") {
        const g = normString(body.gender);
        dataToUpdate.gender = g === "hombre" || g === "mujer" ? g : null;
      } else {
        dataToUpdate.gender = null;
      }
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
      if (tp !== undefined) dataToUpdate.totalPrice = new Prisma.Decimal(tp);
    }
    if (body.quantity !== undefined) {
      const qty = normNumber(body.quantity);
      if (qty !== undefined) dataToUpdate.quantity = qty;
    }

    if (body.eventDate !== undefined) {
      dataToUpdate.eventDate = body.eventDate ? new Date(body.eventDate) : null;
    }

    // paymentStatus (enum)
    let nextStatus = current.paymentStatus as PS;
    if (body.paymentStatus !== undefined) {
      const ps = toPaymentStatus(normString(body.paymentStatus));
      if (ps) nextStatus = ps;
    }
    dataToUpdate.paymentStatus = nextStatus;

    const needsCodes =
      nextStatus === PS.approved &&
      (!current.qrCode || !current.validationCode);

    if (needsCodes) {
      let attempts = 0;
      while (attempts < 3) {
        try {
          if (!current.qrCode) dataToUpdate.qrCode = generateQr();
          if (!current.validationCode)
            dataToUpdate.validationCode = generateValidationCode();
          const ticket = await prisma.ticket.update({
            where: { id },
            data: dataToUpdate,
          });
          return NextResponse.json({ ok: true, ticket });
        } catch (e: any) {
          if (e?.code === "P2002") {
            attempts++;
            continue;
          }
          throw e;
        }
      }
      return NextResponse.json(
        { error: "No se pudo actualizar (colisiones de unicidad)." },
        { status: 500 }
      );
    }

    const ticket = await prisma.ticket.update({
      where: { id },
      data: dataToUpdate,
    });
    return NextResponse.json({ ok: true, ticket });
  } catch (error) {
    console.error("[tickets][PATCH] Error:", error);
    return NextResponse.json(
      { error: "Failed to update ticket" },
      { status: 500 }
    );
  }
}

/* =========================
   DELETE /api/admin/tickets?id=xxx
========================= */
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

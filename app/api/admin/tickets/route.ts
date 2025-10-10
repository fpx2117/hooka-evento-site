// app/api/admin/tickets/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jwtVerify } from "jose";

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
   Helpers de validación
========================= */
function normString(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined;
  const s = String(v).trim();
  return s.length ? s : undefined;
}

function normEmail(v: unknown): string | undefined {
  const s = normString(v);
  if (!s) return undefined;
  // validación simple
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

/** 6 dígitos incluyendo ceros a la izquierda */
function generateValidationCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

type PaymentStatus = "pending" | "approved" | "rejected";

/* =========================
   GET /api/admin/tickets
   - Filtros: ?status=approved|pending|rejected
              ?q=texto (busca en nombre/email/dni)
   - Orden:   ?orderBy=purchaseDate|totalPrice
              ?order=asc|desc
   - Paginación: ?page=1&pageSize=50
========================= */
export async function GET(request: NextRequest) {
  const auth = await verifyAuth(request);
  if (!auth)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { searchParams } = new URL(request.url);

    const status = searchParams.get("status") as PaymentStatus | null;
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
      where.paymentStatus = status;
    }
    if (q) {
      // búsqueda básica por nombre/email/dni
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
   Crea ticket; genera qrCode + validationCode únicos
========================= */
export async function POST(request: NextRequest) {
  const auth = await verifyAuth(request);
  if (!auth)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json().catch(() => ({}) as any);

    const ticketType = normString(body.ticketType) || "general";
    const customerName = normString(body.customerName);
    const customerEmail = normEmail(body.customerEmail);
    const customerPhone = normString(body.customerPhone);
    const customerDni = extractCustomerDni(body);
    const gender = normString(body.gender) ?? null; // "hombre" | "mujer" | null
    const paymentMethod = normString(body.paymentMethod) || "mercadopago";
    const totalPrice = normNumber(body.totalPrice);
    const quantity = normNumber(body.quantity) ?? 1;
    const eventDate = body.eventDate ? new Date(body.eventDate) : null;

    // Por defecto, creamos en approved si no especifican (tu flujo trabaja así)
    const paymentStatus: PaymentStatus =
      (body.paymentStatus as PaymentStatus) || "approved";

    // Validaciones mínimas
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
    if (totalPrice === undefined) {
      return NextResponse.json(
        { error: "totalPrice debe ser numérico" },
        { status: 400 }
      );
    }

    // Reintentos por colisión unique (qrCode / validationCode)
    let attempts = 0;
    while (attempts < 3) {
      const qrCode = generateQr();
      const validationCode = generateValidationCode();

      try {
        const ticket = await prisma.ticket.create({
          data: {
            ticketType,
            quantity,
            totalPrice,
            customerName,
            customerEmail,
            customerPhone,
            customerDni,
            gender,
            paymentMethod,
            paymentStatus,
            qrCode,
            validationCode,
            eventDate,
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
   Actualiza por id (reemplazo controlado)
========================= */
export async function PUT(request: NextRequest) {
  const auth = await verifyAuth(request);
  if (!auth)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json().catch(() => ({}) as any);
    const id = normString(body.id);
    if (!id)
      return NextResponse.json({ error: "ID required" }, { status: 400 });

    const dataToUpdate: any = {};

    const ticketType = normString(body.ticketType);
    if (ticketType) dataToUpdate.ticketType = ticketType;

    const customerName = normString(body.customerName);
    if (customerName) dataToUpdate.customerName = customerName;

    const customerEmail = normEmail(body.customerEmail);
    if (customerEmail) dataToUpdate.customerEmail = customerEmail;

    const customerPhone = normString(body.customerPhone);
    if (customerPhone) dataToUpdate.customerPhone = customerPhone;

    const customerDni = extractCustomerDni(body);
    if (customerDni) dataToUpdate.customerDni = customerDni;

    if (body.gender !== undefined) {
      dataToUpdate.gender = normString(body.gender) ?? null;
    }

    const paymentMethod = normString(body.paymentMethod);
    if (paymentMethod) dataToUpdate.paymentMethod = paymentMethod;

    const totalPrice = normNumber(body.totalPrice);
    if (totalPrice !== undefined) dataToUpdate.totalPrice = totalPrice;

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
   - Update parcial por id.
   - Si paymentStatus pasa a "approved" y faltan códigos, los genera.
========================= */
export async function PATCH(request: NextRequest) {
  const auth = await verifyAuth(request);
  if (!auth)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json().catch(() => ({}) as any);
    const id = normString(body.id);
    if (!id)
      return NextResponse.json({ error: "ID required" }, { status: 400 });

    const current = await prisma.ticket.findUnique({ where: { id } });
    if (!current)
      return NextResponse.json({ error: "Not found" }, { status: 404 });

    const dataToUpdate: any = {};

    // campos editables
    if (body.ticketType !== undefined)
      dataToUpdate.ticketType =
        normString(body.ticketType) ?? current.ticketType;
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

    if (body.gender !== undefined) {
      dataToUpdate.gender = normString(body.gender) ?? null;
    }
    if (body.paymentMethod !== undefined) {
      dataToUpdate.paymentMethod =
        normString(body.paymentMethod) ?? current.paymentMethod;
    }
    if (body.totalPrice !== undefined) {
      const tp = normNumber(body.totalPrice);
      if (tp !== undefined) dataToUpdate.totalPrice = tp;
    }
    if (body.quantity !== undefined) {
      const qty = normNumber(body.quantity);
      if (qty !== undefined) dataToUpdate.quantity = qty;
    }
    if (body.eventDate !== undefined) {
      dataToUpdate.eventDate = body.eventDate ? new Date(body.eventDate) : null;
    }

    // cambio de estado de pago
    let nextStatus: PaymentStatus = current.paymentStatus as PaymentStatus;
    if (body.paymentStatus !== undefined) {
      const ps = String(body.paymentStatus) as PaymentStatus;
      if (["pending", "approved", "rejected"].includes(ps)) {
        nextStatus = ps;
      }
    }
    dataToUpdate.paymentStatus = nextStatus;

    // Si queda en approved y faltan códigos, generamos
    const needsCodes =
      nextStatus === "approved" && (!current.qrCode || !current.validationCode);

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

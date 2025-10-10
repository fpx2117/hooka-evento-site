// app/api/create-payment/route.ts
import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";
import { Prisma, PaymentStatus as PS } from "@prisma/client";

// 1 mesa VIP = N personas (configurable)
const VIP_UNIT_SIZE = Number(process.env.VIP_UNIT_SIZE || 10);

type Item = {
  title: string;
  description?: string;
  quantity: number;
  unit_price: number; // display only; el cálculo real sale de la DB
};

function isHttpsPublicUrl(url?: string | null) {
  if (!url) return false;
  const trimmed = url.trim();
  return /^https:\/\/[^ ]+$/i.test(trimmed);
}

function clean<T extends Record<string, any>>(o: T): T {
  return Object.fromEntries(
    Object.entries(o).filter(([_, v]) => v !== undefined && v !== null)
  ) as T;
}

function getPublicBaseUrl(req: NextRequest) {
  const envBase = process.env.NEXT_PUBLIC_BASE_URL?.trim();
  if (isHttpsPublicUrl(envBase)) return envBase!;
  const proto = req.headers.get("x-forwarded-proto") || "http";
  const host =
    req.headers.get("x-forwarded-host") || req.headers.get("host") || "";
  const guessed = `${proto}://${host}`;
  return isHttpsPublicUrl(guessed) ? guessed : "";
}

// Normalizadores
const s = (v: any) =>
  v === undefined || v === null ? undefined : String(v).trim();
const n = (v: any, def = 0) => {
  const num = Number(v);
  return Number.isFinite(num) ? num : def;
};

export async function POST(request: NextRequest) {
  let recordId: string | null = null;
  let recordType: "vip-table" | "ticket" | null = null;

  try {
    const body = await request.json();
    const { items, payer, type } = body as {
      items: Item[];
      payer: any;
      type: "vip-table" | "ticket";
    };
    recordType = type;

    const MP_TOKEN = process.env.MERCADO_PAGO_ACCESS_TOKEN;
    if (!MP_TOKEN) {
      console.error(
        "[create-payment] MERCADO_PAGO_ACCESS_TOKEN no está configurado"
      );
      return NextResponse.json(
        {
          error:
            "Configuración de pago no disponible. Contactá al administrador.",
        },
        { status: 500 }
      );
    }

    const BASE = getPublicBaseUrl(request);
    const isHttps = isHttpsPublicUrl(BASE);

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "items requeridos" }, { status: 400 });
    }

    // === Evento: por code/id o el activo más reciente ===
    const eventCodeOrId =
      s(payer?.additionalInfo?.eventCode) || s(payer?.additionalInfo?.eventId);

    const event =
      (await prisma.event.findFirst({
        where: {
          OR: [{ code: eventCodeOrId || "" }, { id: eventCodeOrId || "" }],
          isActive: true,
        },
        select: { id: true, code: true, date: true, isActive: true },
      })) ||
      (await prisma.event.findFirst({
        where: { isActive: true },
        orderBy: { date: "desc" },
        select: { id: true, code: true, date: true, isActive: true },
      }));

    if (!event) {
      return NextResponse.json(
        { error: "Evento no encontrado o inactivo" },
        { status: 400 }
      );
    }

    // Valores para display en MP (el cálculo real queda persistido en DB)
    let unitPriceForDisplay = n(items?.[0]?.unit_price, 0);
    let quantityForDisplay = Math.max(1, n(items?.[0]?.quantity, 1));

    // =================================================================
    // VIP TABLE (1 mesa por compra) -> Ticket tipo 'vip' (gender: null)
    // =================================================================
    if (type === "vip-table") {
      const tables = 1; // 1 mesa por transacción

      // Config VIP (precio por mesa; stock en PERSONAS)
      const cfgVip = await prisma.ticketConfig.findFirst({
        where: { eventId: event.id, ticketType: "vip", gender: null },
        select: { id: true, price: true, stockLimit: true },
      });
      if (!cfgVip) {
        return NextResponse.json(
          { error: "Configuración VIP no disponible" },
          { status: 400 }
        );
      }

      // Personas vendidas en VIP (aprobadas)
      const vipApproved = await prisma.ticket.findMany({
        where: {
          eventId: event.id,
          ticketType: "vip",
          paymentStatus: "approved",
        },
        select: { quantity: true },
      });
      const vipPersonsSold = vipApproved.reduce(
        (acc, t) => acc + (t.quantity || 0) * VIP_UNIT_SIZE,
        0
      );

      const remainingPersons = Math.max(0, cfgVip.stockLimit - vipPersonsSold);
      const remainingTables = Math.floor(remainingPersons / VIP_UNIT_SIZE);

      if (remainingTables < tables) {
        return NextResponse.json(
          { error: "Sin mesas VIP disponibles" },
          { status: 409 }
        );
      }

      const unit = new Prisma.Decimal(cfgVip.price); // precio por mesa
      const total = unit.mul(tables);

      const ticket = await prisma.ticket.create({
        data: {
          eventId: event.id,
          eventDate: event.date,
          ticketType: "vip",
          gender: null,
          quantity: tables, // # mesas
          totalPrice: total, // Decimal
          customerName: s(payer?.name) ?? "",
          customerEmail: s(payer?.email) ?? "",
          customerPhone: s(payer?.phone) ?? "",
          customerDni: s(payer?.dni) ?? "",
          paymentStatus: PS.pending,
          ticketConfigId: cfgVip.id,
        },
      });
      recordId = ticket.id;

      unitPriceForDisplay = Number(unit);
      quantityForDisplay = tables;
    }

    // =================================================================
    // ENTRADA GENERAL ('ticket')
    // Precio por género desde DB, PERO stock se valida SOLO contra TOTAL
    // =================================================================
    else if (type === "ticket") {
      const gender = s(payer?.additionalInfo?.gender) as
        | "hombre"
        | "mujer"
        | undefined;
      const quantity = Math.max(1, n(payer?.additionalInfo?.quantity, 1));
      if (!gender) {
        return NextResponse.json(
          { error: "Género requerido para entrada general" },
          { status: 400 }
        );
      }

      // 1) Precio unitario: TicketConfig('general', gender)
      const cfgPrice = await prisma.ticketConfig.findFirst({
        where: {
          eventId: event.id,
          ticketType: "general",
          gender: gender as any,
        },
        select: { id: true, price: true },
      });
      if (!cfgPrice) {
        return NextResponse.json(
          { error: "Configuración de precio no disponible" },
          { status: 400 }
        );
      }

      // 2) STOCK TOTAL (ignorar límites por género):
      //    TicketConfig('total', null) y vendidos aprobados (general H+M) + VIP (personas)
      const cfgTotal = await prisma.ticketConfig.findFirst({
        where: { eventId: event.id, ticketType: "total", gender: null },
        select: { stockLimit: true },
      });
      const totalLimitPersons = cfgTotal?.stockLimit ?? 0;

      const [soldGenH, soldGenM, vipApproved] = await Promise.all([
        prisma.ticket.count({
          where: {
            eventId: event.id,
            ticketType: "general",
            gender: "hombre",
            paymentStatus: "approved",
          },
        }),
        prisma.ticket.count({
          where: {
            eventId: event.id,
            ticketType: "general",
            gender: "mujer",
            paymentStatus: "approved",
          },
        }),
        prisma.ticket.findMany({
          where: {
            eventId: event.id,
            ticketType: "vip",
            paymentStatus: "approved",
          },
          select: { quantity: true },
        }),
      ]);
      const vipPersonsSold = vipApproved.reduce(
        (acc, t) => acc + (t.quantity || 0) * VIP_UNIT_SIZE,
        0
      );

      const soldTotalPersons = soldGenH + soldGenM + vipPersonsSold;
      const remainingTotalPersons = Math.max(
        0,
        totalLimitPersons - soldTotalPersons
      );

      if (remainingTotalPersons < quantity) {
        return NextResponse.json(
          { error: "No hay cupo disponible en el TOTAL del evento" },
          { status: 409 }
        );
      }

      // 3) Precio real desde DB
      const unit = new Prisma.Decimal(cfgPrice.price);
      const total = unit.mul(quantity);

      const ticket = await prisma.ticket.create({
        data: {
          eventId: event.id,
          eventDate: event.date,
          ticketType: "general",
          gender: gender as any,
          quantity,
          totalPrice: total,
          customerName: s(payer?.name) ?? "",
          customerEmail: s(payer?.email) ?? "",
          customerPhone: s(payer?.phone) ?? "",
          customerDni: s(payer?.dni) ?? "",
          paymentStatus: PS.pending,
          ticketConfigId: cfgPrice.id,
        },
      });
      recordId = ticket.id;

      unitPriceForDisplay = Number(unit);
      quantityForDisplay = quantity;
    } else {
      return NextResponse.json(
        { error: "Tipo de operación inválido" },
        { status: 400 }
      );
    }

    // ================== Preferencia MP ==================
    const mpItems = [
      {
        title: String(items?.[0]?.title ?? "").slice(0, 255),
        description: items?.[0]?.description
          ? String(items[0].description).slice(0, 256)
          : undefined,
        quantity: quantityForDisplay,
        unit_price: unitPriceForDisplay, // solo display (el real ya quedó guardado)
        currency_id: "ARS" as const,
      },
    ];

    const back_urls = clean({
      success: isHttps ? `${BASE}/payment/success` : undefined,
      failure: isHttps ? `${BASE}/payment/failure` : undefined,
      pending: isHttps ? `${BASE}/payment/pending` : undefined,
    });

    const binaryMode = process.env.MP_BINARY_MODE
      ? process.env.MP_BINARY_MODE === "true"
      : process.env.NODE_ENV !== "production";

    const preference = clean({
      items: mpItems,
      payer: clean({
        name: s(payer?.name),
        email: s(payer?.email),
        phone: s(payer?.phone) ? { number: String(payer.phone) } : undefined,
        identification: s(payer?.dni)
          ? { type: "DNI", number: String(payer.dni) }
          : undefined,
      }),
      back_urls,
      ...(back_urls.success ? { auto_return: "approved" as const } : {}),
      notification_url: back_urls.success
        ? `${BASE}/api/webhooks/mercadopago`
        : undefined,
      metadata: {
        type,
        recordId,
        eventId: event.id,
        eventCode: event.code,
        payer_info: payer,
      },
      external_reference: `${type}:${recordId}`,
      ...(binaryMode ? { binary_mode: true } : {}),
      payment_methods: {
        excluded_payment_types: [{ id: "ticket" }, { id: "atm" }],
      },
    });

    console.log(
      "[create-payment] Preference payload ->",
      JSON.stringify(preference, null, 2)
    );

    const idempotencyKey = crypto.randomUUID();
    const mpRes = await fetch(
      "https://api.mercadopago.com/checkout/preferences",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${MP_TOKEN}`,
          "X-Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify(preference),
        cache: "no-store",
      }
    );

    if (!mpRes.ok) {
      const errorData = await mpRes.json().catch(() => ({}));
      console.error("[create-payment] Error de Mercado Pago:", errorData);

      if (recordId) {
        await prisma.ticket.update({
          where: { id: recordId },
          data: { paymentStatus: PS.failed_preference },
        });
      }

      return NextResponse.json(
        { error: "Error al crear la preferencia de pago", details: errorData },
        { status: 502 }
      );
    }

    const data = await mpRes.json();
    const redirect_url = data.sandbox_init_point || data.init_point;

    return NextResponse.json({
      id: data.id,
      init_point: data.init_point,
      sandbox_init_point: data.sandbox_init_point,
      redirect_url,
    });
  } catch (error) {
    console.error("[create-payment] Error:", error);

    try {
      if (recordId) {
        await prisma.ticket.update({
          where: { id: recordId },
          data: { paymentStatus: PS.failed_preference },
        });
      }
    } catch {}

    return NextResponse.json(
      { error: "Error al procesar la solicitud de pago" },
      { status: 500 }
    );
  }
}

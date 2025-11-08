// app/api/create-payment/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { MercadoPagoConfig, Preference } from "mercadopago";
import {
  getActiveEventId,
  normalizeVipNumber,
  ensureVipTableAvailability,
} from "@/lib/vip-tables";

/* ========================= Utils ========================= */
const s = (v: unknown) =>
  v === undefined || v === null ? undefined : String(v).trim();

const n = (v: unknown, d = 0) => {
  const num = Number(v);
  return Number.isFinite(num) ? num : d;
};

const onlyDigits = (v?: string) => (v || "").replace(/\D+/g, "");

function isHttps(url?: string | null) {
  return !!url && /^https:\/\/[^ ]+$/i.test((url || "").trim());
}
function isLocalHttp(url?: string | null) {
  return (
    !!url &&
    /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test((url || "").trim())
  );
}
function getBaseUrl(req: NextRequest) {
  const envBase = process.env.NEXT_PUBLIC_BASE_URL?.trim();
  if (isHttps(envBase) || isLocalHttp(envBase)) return envBase!;
  const proto = (req.headers.get("x-forwarded-proto") || "http").toLowerCase();
  const host =
    req.headers.get("x-forwarded-host") || req.headers.get("host") || "";
  const guessed = `${proto}://${host}`;
  return isHttps(guessed) || isLocalHttp(guessed) ? guessed : "";
}

/* ========================= Tipos ========================= */
type CreateBody = {
  type: "ticket";
  items?: Array<{
    title?: string;
    description?: string;
    quantity?: number;
    unit_price?: number;
  }>;
  payer?: {
    name?: string;
    email?: string;
    phone?: string;
    dni?: string;
    additionalInfo?: {
      eventId?: string;
      eventCode?: string;
      ticketType?: "vip" | "general";
      // VIP
      vipLocationId?: string;
      tableNumber?: number;
      tableNumberGlobal?: number;
      // GENERAL
      gender?: "hombre" | "mujer";
      quantity?: number;
    };
  };
};

/* ========================= Handler ========================= */
export async function POST(req: NextRequest) {
  try {
    const MP_TOKEN =
      process.env.MERCADO_PAGO_ACCESS_TOKEN || process.env.MP_ACCESS_TOKEN;
    if (!MP_TOKEN) {
      return NextResponse.json(
        { error: "Mercado Pago no configurado" },
        { status: 500 }
      );
    }

    const base = getBaseUrl(req);
    if (!base) {
      return NextResponse.json(
        { error: "Base URL inválida (configurá NEXT_PUBLIC_BASE_URL)" },
        { status: 500 }
      );
    }

    const successUrl = new URL("/payment/success", base).toString();
    const failureUrl = new URL("/payment/failure", base).toString();
    const pendingUrl = new URL("/payment/pending", base).toString();
    const canAutoReturn = true; // las back_urls son absolutas, habilitamos auto_return

    const body: CreateBody = await req.json();

    // Resolver evento (id o code o activo)
    const eventId = await getActiveEventId({
      prisma,
      eventId: s(body.payer?.additionalInfo?.eventId),
      eventCode: s(body.payer?.additionalInfo?.eventCode),
    });

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, code: true, date: true },
    });
    if (!event) {
      return NextResponse.json({ error: "Evento inválido" }, { status: 400 });
    }

    const payerName = s(body.payer?.name) ?? "";
    const payerEmail = s(body.payer?.email) ?? "";
    const payerPhone = onlyDigits(s(body.payer?.phone));
    const payerDni = onlyDigits(s(body.payer?.dni));

    const requestedType =
      (s(body.payer?.additionalInfo?.ticketType) as "vip" | "general") ||
      "general";

    /* =========================================================
       ⛱️  FLUJO VIP
    ========================================================= */
    if (requestedType === "vip") {
      const vipLocationId = s(body.payer?.additionalInfo?.vipLocationId);
      if (!vipLocationId) {
        return NextResponse.json(
          { error: "vipLocationId es requerido" },
          { status: 400 }
        );
      }

      const tableNumber = n(body.payer?.additionalInfo?.tableNumber, undefined);
      const tableNumberGlobal = n(
        body.payer?.additionalInfo?.tableNumberGlobal,
        undefined
      );

      // Normalizar mesa (local/global) y validar disponibilidad
      const normalized = await normalizeVipNumber({
        prisma,
        eventId: event.id,
        vipLocationId,
        tableNumber:
          typeof tableNumber === "number" && Number.isFinite(tableNumber)
            ? tableNumber
            : undefined,
        tableNumberGlobal:
          typeof tableNumberGlobal === "number" &&
          Number.isFinite(tableNumberGlobal)
            ? tableNumberGlobal
            : undefined,
      });

      // Puede validar por id de mesa (si tu helper lo soporta) o por número global
      await ensureVipTableAvailability({
        prisma,
        eventId: event.id,
        vipLocationId,
        // priorizamos validar por id si normalizeVipNumber lo retorna
        tableId: (normalized as any).tableId,
      });

      // Precio/capacidad desde la config del sector
      const vipConfig = await prisma.vipTableConfig.findUnique({
        where: { eventId_vipLocationId: { eventId: event.id, vipLocationId } },
        select: { id: true, price: true, capacityPerTable: true },
      });
      if (!vipConfig) {
        return NextResponse.json(
          { error: "No se encontró configuración de Mesas VIP" },
          { status: 400 }
        );
      }

      const unitPrice = Number(vipConfig.price) || 0;
      const capacity = vipConfig.capacityPerTable ?? 10;

      // Crear ticket PENDING con referencias VIP
      const createdVip = await prisma.ticket.create({
        data: {
          eventId: event.id,
          eventDate: event.date,
          ticketType: "vip",
          gender: null,
          quantity: 1,
          vipLocationId,
          vipTableId: (normalized as any).tableId, // si tu normalize retorna tableId, lo usamos
          vipTableConfigId: vipConfig.id,
          totalPrice: unitPrice,
          customerName: payerName,
          customerEmail: payerEmail,
          customerPhone: payerPhone,
          customerDni: payerDni,
          paymentStatus: "pending",
          paymentMethod: "mercadopago",
        },
        select: { id: true, totalPrice: true },
      });

      // SDK MP v2
      const mp = new MercadoPagoConfig({
        accessToken: MP_TOKEN,
        options: { timeout: 10000 },
      });
      const pref = new Preference(mp);

      const items = [
        {
          id: createdVip.id,
          title: `Mesa VIP #${normalized.global}`,
          description: `1 mesa = ${capacity} personas`,
          quantity: 1,
          unit_price: Number(createdVip.totalPrice) || 0,
          currency_id: "ARS",
        },
      ];

      const prefBody = {
        items,
        payer: {
          name: payerName,
          email: payerEmail,
          phone: payerPhone ? { number: payerPhone } : undefined,
          identification: payerDni
            ? { type: "DNI", number: payerDni }
            : undefined,
        },
        back_urls: { success: successUrl, failure: failureUrl, pending: pendingUrl },
        ...(canAutoReturn ? { auto_return: "approved" as const } : {}),
        notification_url: `${base}/api/webhooks/mercadopago`,
        external_reference: `ticket:${createdVip.id}`,
        binary_mode:
          (process.env.MP_BINARY_MODE ?? "true").toLowerCase() === "true",
        payment_methods: {
          excluded_payment_types: [{ id: "ticket" }, { id: "atm" }],
        },
        metadata: {
          type: "ticket",
          ticketType: "vip",
          recordId: createdVip.id,
          eventId: event.id,
          eventCode: event.code,
          vipLocationId,
          vipTableId: (normalized as any).tableId,
          tableNumberLocal: normalized.local,
          tableNumberGlobal: normalized.global,
          capacityPerTable: capacity,
          pricePerTable: unitPrice,
        },
      };

      const createdPref = await pref.create({
        body: prefBody,
        requestOptions: { idempotencyKey: `pref:ticket:${createdVip.id}` },
      });

      return NextResponse.json({
        id: createdPref.id,
        redirect_url:
          createdPref.sandbox_init_point ||
          createdPref.init_point ||
          null,
        init_point: createdPref.init_point,
        sandbox_init_point: createdPref.sandbox_init_point,
      });
    }

    /* =========================================================
       🎟️  FLUJO ENTRADA GENERAL
    ========================================================= */
    const gender = s(body.payer?.additionalInfo?.gender) as
      | "hombre"
      | "mujer"
      | undefined;

    // si tenés configs separadas por género, exigimos gender
    const cfgGeneral = await prisma.ticketConfig.findFirst({
      where: {
        eventId: event.id,
        ticketType: "general",
        ...(gender ? { gender } : {}),
      },
      select: { id: true, price: true, gender: true },
    });
    if (!cfgGeneral) {
      return NextResponse.json(
        { error: "Precio de entrada general no configurado" },
        { status: 400 }
      );
    }

    const qty = Math.max(
      1,
      Math.floor(n(body.payer?.additionalInfo?.quantity, 1))
    );
    const unitPrice = Number(cfgGeneral.price) || 0;
    const total = unitPrice * qty;

    const created = await prisma.ticket.create({
      data: {
        eventId: event.id,
        eventDate: event.date,
        ticketType: "general",
        gender: gender ?? null,
        quantity: qty,
        totalPrice: total,
        customerName: payerName,
        customerEmail: payerEmail,
        customerPhone: payerPhone,
        customerDni: payerDni,
        paymentStatus: "pending",
        paymentMethod: "mercadopago",
        ticketConfigId: cfgGeneral.id,
      },
      select: { id: true, totalPrice: true },
    });

    const mp = new MercadoPagoConfig({
      accessToken: MP_TOKEN,
      options: { timeout: 10000 },
    });
    const pref = new Preference(mp);

    const items = [
      {
        id: created.id,
        title: `Entrada General${gender ? ` - ${gender}` : ""} x${qty}`,
        quantity: 1,
        unit_price: Number(created.totalPrice) || 0,
        currency_id: "ARS",
      },
    ];

    const prefBody = {
      items,
      payer: {
        name: payerName,
        email: payerEmail,
        identification: payerDni
          ? { type: "DNI", number: payerDni }
          : undefined,
      },
      back_urls: { success: successUrl, failure: failureUrl, pending: pendingUrl },
      ...(canAutoReturn ? { auto_return: "approved" as const } : {}),
      notification_url: `${base}/api/webhooks/mercadopago`,
      external_reference: `ticket:${created.id}`,
      binary_mode:
        (process.env.MP_BINARY_MODE ?? "true").toLowerCase() === "true",
      metadata: {
        type: "ticket",
        ticketType: "general",
        recordId: created.id,
        eventId: event.id,
        eventCode: event.code,
        gender: gender ?? null,
        quantity: qty,
        unitPrice,
      },
    };

    const createdPref = await pref.create({
      body: prefBody,
      requestOptions: { idempotencyKey: `pref:ticket:${created.id}` },
    });

    return NextResponse.json({
      id: createdPref.id,
      redirect_url:
        createdPref.sandbox_init_point ||
        createdPref.init_point ||
        null,
      init_point: createdPref.init_point,
      sandbox_init_point: createdPref.sandbox_init_point,
    });
  } catch (err: any) {
    console.error("[create-payment] error:", err);
    return NextResponse.json(
      { error: err?.message || "Error interno" },
      { status: 500 }
    );
  }
}

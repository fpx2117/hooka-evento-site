// app/api/create-payment/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { MercadoPagoConfig, Preference } from "mercadopago";
import {
  ensureVipTableAvailability,
  getActiveEventId,
  coerceLocation,
  normalizeVipNumber,
} from "@/lib/vip-tables";

/* ========================= Helpers ========================= */
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

const s = (v: unknown) =>
  v === undefined || v === null ? undefined : String(v).trim();
const n = (v: unknown, d = 0) => {
  const num = Number(v);
  return Number.isFinite(num) ? num : d;
};
const onlyDigits = (v?: string) => (v || "").replace(/\D+/g, "");

// 1 mesa VIP = N personas (fallback si falta en BD)
const VIP_UNIT_SIZE = Math.max(1, Number(process.env.VIP_UNIT_SIZE || 10));
const DEFAULT_CURRENCY = "ARS";

/* ========================= Tipos de request ========================= */
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
      gender?: "hombre" | "mujer";
      quantity?: number;
      ticketType?: "vip" | "general";
      tables?: number;
      location?: "dj" | "piscina" | "general";
      tableNumber?: number; // puede venir global o local
    };
  };
};

/* ========================= Descuentos ========================= */
type RuleRow = {
  id: string;
  minQty: number;
  type: "percent" | "amount";
  value: number;
  priority: number;
};

async function getActiveRulesFor(
  eventId: string,
  ticketType: "general" | "vip"
): Promise<RuleRow[]> {
  const rows = await prisma.discountRule.findMany({
    where: { eventId, ticketType, isActive: true },
    select: { id: true, minQty: true, type: true, value: true, priority: true },
    orderBy: [{ minQty: "asc" }, { priority: "desc" }, { createdAt: "asc" }],
  });
  return rows.map((r) => ({
    id: r.id,
    minQty: r.minQty,
    type: r.type as "percent" | "amount",
    value: Number(r.value) || 0,
    priority: r.priority ?? 0,
  }));
}

function pickBestDiscount(qty: number, unit: number, rules: RuleRow[]) {
  const subtotal = Math.max(0, unit) * Math.max(1, qty);
  let best = 0,
    bestId: string | undefined,
    bestPrio = -Infinity;
  for (const r of rules) {
    if (qty < r.minQty) continue;
    let d =
      r.type === "percent" ? Math.floor((subtotal * r.value) / 100) : r.value;
    if (d > subtotal) d = subtotal;
    if (d > best || (d === best && r.priority > bestPrio)) {
      best = d;
      bestId = r.id;
      bestPrio = r.priority;
    }
  }
  return { discount: best, subtotal, total: subtotal - best, ruleId: bestId };
}

function prettyLocation(loc?: string) {
  switch ((loc || "").toLowerCase()) {
    case "dj":
      return "Cerca del DJ";
    case "piscina":
      return "Cerca de la Piscina";
    default:
      return "VIP (General)";
  }
}

/* ========================= Handler ========================= */
export async function POST(req: NextRequest) {
  try {
    const MP_TOKEN =
      process.env.MERCADO_PAGO_ACCESS_TOKEN || process.env.MP_ACCESS_TOKEN;
    if (!MP_TOKEN)
      return NextResponse.json(
        { error: "Mercado Pago no configurado" },
        { status: 500 }
      );

    const base = getBaseUrl(req);
    if (!base)
      return NextResponse.json(
        { error: "Base URL inválida (NEXT_PUBLIC_BASE_URL)" },
        { status: 500 }
      );

    const body: CreateBody = await req.json();
    const eventId = await getActiveEventId({
      prisma,
      eventId: s(body.payer?.additionalInfo?.eventId),
      eventCode: s(body.payer?.additionalInfo?.eventCode),
    });
    if (!eventId)
      return NextResponse.json(
        { error: "Evento no encontrado o inactivo" },
        { status: 400 }
      );

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, code: true, date: true },
    });
    if (!event)
      return NextResponse.json({ error: "Evento inválido" }, { status: 400 });

    const successUrl = new URL("/payment/success", base).toString();
    const failureUrl = new URL("/payment/failure", base).toString();
    const pendingUrl = new URL("/payment/pending", base).toString();
    const canAutoReturn = isHttps(successUrl);

    const payerName = s(body.payer?.name) ?? "";
    const payerEmail = s(body.payer?.email) ?? "";
    const payerPhone = onlyDigits(s(body.payer?.phone));
    const payerDni = onlyDigits(s(body.payer?.dni));

    const requestedType =
      (s(body.payer?.additionalInfo?.ticketType)?.toLowerCase() as
        | "general"
        | "vip"
        | undefined) ?? "general";

    /* ======================================================================
       VIP — numeración global/local coherente y validación de disponibilidad
    ====================================================================== */
    if (requestedType === "vip") {
      const tables = Math.max(
        1,
        n(body.payer?.additionalInfo?.tables, n(body.items?.[0]?.quantity, 1))
      );
      const location =
        coerceLocation(s(body.payer?.additionalInfo?.location)) || "general";
      const tableNumberInput = n(body.payer?.additionalInfo?.tableNumber);

      // Normalizar número de mesa (acepta global o local) y validar disponibilidad
      let normalized: { local: number; global: number };
      try {
        normalized = await normalizeVipNumber({
          prisma,
          eventId: event.id,
          location,
          tableNumber: tableNumberInput, // puede venir global o local; la función resuelve
        });

        await ensureVipTableAvailability({
          prisma,
          eventId: event.id,
          location,
          tableNumber: normalized.local, // validar en base local
        });
      } catch (err: any) {
        return NextResponse.json(
          { error: err?.message || "Mesa no disponible o fuera de rango" },
          { status: 409 }
        );
      }

      const cfg = await prisma.vipTableConfig.findUnique({
        where: { eventId_location: { eventId: event.id, location } },
        select: {
          price: true,
          stockLimit: true,
          soldCount: true,
          capacityPerTable: true,
        },
      });
      if (!cfg)
        return NextResponse.json(
          { error: "Ubicación VIP no configurada" },
          { status: 400 }
        );

      const cap = Math.max(1, Number(cfg.capacityPerTable ?? VIP_UNIT_SIZE));
      const unitPriceFromDB = Number(cfg.price) || 0;
      const rules = await getActiveRulesFor(event.id, "vip");
      const { total } = pickBestDiscount(tables, unitPriceFromDB, rules);

      // Crear Ticket VIP (PENDING) con número LOCAL ya normalizado
      const createdVip = await prisma.ticket.create({
        data: {
          eventId: event.id,
          eventDate: event.date,
          ticketType: "vip",
          gender: null,
          quantity: 1,
          vipLocation: location,
          vipTables: tables,
          capacityPerTable: cap,
          tableNumber: normalized.local, // siempre LOCAL en DB
          totalPrice: total,
          customerName: payerName,
          customerEmail: payerEmail,
          customerPhone: payerPhone,
          customerDni: payerDni,
          paymentStatus: "pending" as any,
          paymentMethod: "mercadopago" as any,
        },
        select: { id: true, totalPrice: true },
      });

      const mpItems = [
        {
          id: createdVip.id,
          title: `Mesa VIP ${normalized.global} - ${prettyLocation(location)} x${tables}`,
          description: `1 mesa = ${cap} personas · Ubicación: ${prettyLocation(location)}`,
          quantity: 1,
          unit_price: Number(createdVip.totalPrice) || 0,
          currency_id: DEFAULT_CURRENCY,
        },
      ];

      const preferenceBody = {
        items: mpItems,
        payer: {
          name: payerName,
          email: payerEmail,
          phone: payerPhone ? { number: payerPhone } : undefined,
          identification: payerDni
            ? { type: "DNI", number: payerDni }
            : undefined,
        },
        back_urls: {
          success: successUrl,
          failure: failureUrl,
          pending: pendingUrl,
        },
        ...(canAutoReturn ? { auto_return: "approved" as const } : {}),
        notification_url: new URL("/api/webhooks/mercadopago", base).toString(),
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
          vipLocation: location,
          tableNumber: normalized.local, // guardamos local en metadata también
          vipTables: tables,
          capacityPerTable: cap,
          pricePerTable: unitPriceFromDB,
        },
      };

      const mp = new MercadoPagoConfig({
        accessToken: MP_TOKEN,
        options: { timeout: 5000 },
      });
      const pref = new Preference(mp);

      let createdPref;
      try {
        createdPref = await pref.create({
          body: preferenceBody,
          requestOptions: { idempotencyKey: `pref:ticket:${createdVip.id}` },
        });
      } catch (err: any) {
        await prisma.ticket.update({
          where: { id: createdVip.id },
          data: { paymentStatus: "failed_preference" as any },
        });
        console.error("[MP preference error][VIP]", err);
        return NextResponse.json(
          { error: "Error creando preferencia (VIP)" },
          { status: 502 }
        );
      }

      const redirect_url =
        createdPref.sandbox_init_point ||
        createdPref.init_point ||
        (createdPref.id
          ? `https://www.mercadopago.com/checkout/v1/redirect?pref_id=${encodeURIComponent(
              String(createdPref.id)
            )}`
          : undefined);

      if (!redirect_url) {
        await prisma.ticket.update({
          where: { id: createdVip.id },
          data: { paymentStatus: "failed_preference" as any },
        });
        return NextResponse.json(
          { error: "Preferencia sin URL utilizable" },
          { status: 502 }
        );
      }

      return NextResponse.json({
        id: createdPref.id,
        redirect_url,
        init_point: createdPref.init_point,
        sandbox_init_point: createdPref.sandbox_init_point,
      });
    }

    /* ======================================================================
       ENTRADA GENERAL (sin cambios)
    ====================================================================== */
    const gender = s(body.payer?.additionalInfo?.gender) as
      | "hombre"
      | "mujer"
      | undefined;
    const qty = Math.max(
      1,
      Math.floor(
        n(body.payer?.additionalInfo?.quantity, n(body.items?.[0]?.quantity, 1))
      )
    );
    if (!gender)
      return NextResponse.json({ error: "Género requerido" }, { status: 400 });

    const cfgGen = await prisma.ticketConfig.findFirst({
      where: { eventId: event.id, ticketType: "general", gender },
      select: { id: true, price: true },
    });
    if (!cfgGen)
      return NextResponse.json(
        { error: "Precio de entrada no configurado" },
        { status: 400 }
      );

    const unitPriceFromDB = Number(cfgGen.price) || 0;
    const rules = await getActiveRulesFor(event.id, "general");
    const { total } = pickBestDiscount(qty, unitPriceFromDB, rules);

    const created = await prisma.ticket.create({
      data: {
        eventId: event.id,
        eventDate: event.date,
        ticketType: "general",
        gender,
        quantity: qty,
        totalPrice: total,
        customerName: payerName,
        customerEmail: payerEmail,
        customerPhone: payerPhone,
        customerDni: payerDni,
        paymentStatus: "pending" as any,
        paymentMethod: "mercadopago" as any,
        ticketConfigId: cfgGen.id,
      },
      select: { id: true, totalPrice: true },
    });

    const mpItems = [
      {
        id: created.id,
        title: `Entrada General - ${gender === "hombre" ? "Hombre" : "Mujer"} x${qty}`,
        quantity: 1,
        unit_price: Number(created.totalPrice) || 0,
        currency_id: DEFAULT_CURRENCY,
      },
    ];

    const preferenceBody = {
      items: mpItems,
      payer: { name: payerName, email: payerEmail },
      back_urls: {
        success: successUrl,
        failure: failureUrl,
        pending: pendingUrl,
      },
      ...(canAutoReturn ? { auto_return: "approved" as const } : {}),
      notification_url: new URL("/api/webhooks/mercadopago", base).toString(),
      external_reference: `ticket:${created.id}`,
      binary_mode:
        (process.env.MP_BINARY_MODE ?? "true").toLowerCase() === "true",
      metadata: {
        type: "ticket",
        ticketType: "general",
        recordId: created.id,
        eventId: event.id,
        eventCode: event.code,
      },
    };

    const mp = new MercadoPagoConfig({
      accessToken: MP_TOKEN,
      options: { timeout: 5000 },
    });
    const pref = new Preference(mp);
    const createdPref = await pref.create({
      body: preferenceBody,
      requestOptions: { idempotencyKey: `pref:ticket:${created.id}` },
    });

    const redirect_url =
      createdPref.sandbox_init_point ||
      createdPref.init_point ||
      (createdPref.id
        ? `https://www.mercadopago.com/checkout/v1/redirect?pref_id=${encodeURIComponent(
            String(createdPref.id)
          )}`
        : undefined);

    return NextResponse.json({
      id: createdPref.id,
      redirect_url,
      init_point: createdPref.init_point,
      sandbox_init_point: createdPref.sandbox_init_point,
    });
  } catch (e) {
    console.error("[create-payment] error:", e);
    return NextResponse.json(
      { error: "Error al procesar el pago" },
      { status: 500 }
    );
  }
}

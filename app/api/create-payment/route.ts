// app/api/create-payment/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";
import { Prisma, PaymentStatus as PS } from "@prisma/client";

// 1 mesa VIP = N personas (configurable)
const VIP_UNIT_SIZE = Number(process.env.VIP_UNIT_SIZE || 10);

// ========== Utils ==========
type Item = {
  title: string;
  description?: string;
  quantity: number;
  unit_price: number; // solo display para MP (enviamos TOTAL con descuento)
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

// ======= Descuentos (orden TOTAL) =======

type RuleRow = {
  id: string;
  minQty: number;
  type: "percent" | "amount";
  value: Prisma.Decimal;
  priority: number;
};

async function getActiveRulesFor(
  eventId: string,
  ticketType: "general" | "vip"
): Promise<RuleRow[]> {
  const rows = await prisma.discountRule.findMany({
    where: { eventId, ticketType, isActive: true },
    select: { id: true, minQty: true, type: true, value: true, priority: true },
  });

  return rows.map((r) => ({
    id: r.id,
    minQty: r.minQty,
    type: r.type as "percent" | "amount",
    value: new Prisma.Decimal(r.value),
    priority: r.priority ?? 0,
  }));
}

/** Descuento TOTAL (no por entrada); empate => mayor prioridad */
function pickBestOrderLevelDiscount(
  qty: number,
  unit: Prisma.Decimal,
  rules: RuleRow[]
): { discount: Prisma.Decimal; ruleId?: string } {
  const zero = new Prisma.Decimal(0);
  const subtotal = unit.mul(qty);

  let bestDisc = zero;
  let bestRuleId: string | undefined;
  let bestPriority = -Infinity;

  for (const r of rules) {
    if (qty < r.minQty) continue;

    let disc = zero;
    if (r.type === "percent") {
      disc = subtotal.mul(r.value).div(100);
    } else {
      disc = new Prisma.Decimal(r.value); // monto total sobre la orden
    }

    if (disc.gt(subtotal)) disc = subtotal;

    if (disc.gt(bestDisc) || (disc.eq(bestDisc) && r.priority > bestPriority)) {
      bestDisc = disc;
      bestRuleId = r.id;
      bestPriority = r.priority;
    }
  }

  return { discount: bestDisc, ruleId: bestRuleId };
}

// =======================================

export async function POST(request: NextRequest) {
  let recordId: string | null = null;

  try {
    const body = await request.json();
    const { items, payer, type } = body as {
      items: Item[];
      payer: any;
      type: "vip-table" | "ticket";
    };

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

    // Valores DISPLAY (se reemplazan al final por TOTAL con descuento)
    let unitPriceForDisplay = n(items?.[0]?.unit_price, 0);
    let quantityForDisplay = Math.max(1, n(items?.[0]?.quantity, 1));

    // =================================================================
    // VIP TABLE
    // =================================================================
    if (type === "vip-table") {
      const tables = Math.max(1, n(payer?.additionalInfo?.tables, 1));

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

      const unit = new Prisma.Decimal(cfgVip.price);
      const subtotal = unit.mul(tables);

      const rules = await getActiveRulesFor(event.id, "vip");
      const { discount } = pickBestOrderLevelDiscount(tables, unit, rules);
      const total = subtotal.sub(discount);

      const ticket = await prisma.ticket.create({
        data: {
          eventId: event.id,
          eventDate: event.date,
          ticketType: "vip",
          gender: null,
          quantity: tables,
          totalPrice: total,
          customerName: s(payer?.name) ?? "",
          customerEmail: s(payer?.email) ?? "",
          customerPhone: s(payer?.phone) ?? "",
          customerDni: s(payer?.dni) ?? "",
          paymentStatus: PS.pending,
          ticketConfigId: cfgVip.id,
        },
      });
      recordId = ticket.id;

      // 👉 MP recibe 1 ítem con el TOTAL ya con descuento
      unitPriceForDisplay = Number(total);
      quantityForDisplay = 1;
    }

    // =================================================================
    // ENTRADA GENERAL
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

      const unit = new Prisma.Decimal(cfgPrice.price);
      const subtotal = unit.mul(quantity);

      const rules = await getActiveRulesFor(event.id, "general");
      const { discount } = pickBestOrderLevelDiscount(quantity, unit, rules);
      const total = subtotal.sub(discount);

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

      // 👉 MP recibe 1 ítem con el TOTAL ya con descuento
      unitPriceForDisplay = Number(total);
      quantityForDisplay = 1;
    } else {
      return NextResponse.json(
        { error: "Tipo de operación inválido" },
        { status: 400 }
      );
    }

    // ================== Preferencia MP ==================
    const mpItems = [
      {
        title:
          quantityForDisplay === 1
            ? String(items?.[0]?.title ?? "Compra de entradas")
            : `Entradas x${quantityForDisplay}`,
        description: items?.[0]?.description
          ? String(items[0].description).slice(0, 256)
          : undefined,
        quantity: 1, // SIEMPRE 1
        unit_price: unitPriceForDisplay, // TOTAL CON DESCUENTO
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

    const rawText = await mpRes.text().catch(() => "");
    let data: any = {};
    try {
      data = rawText ? JSON.parse(rawText) : {};
    } catch {
      data = {};
    }

    // Logs de diagnóstico (no exponen secrets)
    console.log("[create-payment] MP status:", mpRes.status);
    console.log("[create-payment] MP body keys:", Object.keys(data || {}));

    if (!mpRes.ok) {
      console.error("[create-payment] Error MP:", data);
      if (recordId) {
        await prisma.ticket.update({
          where: { id: recordId },
          data: { paymentStatus: PS.failed_preference },
        });
      }
      return NextResponse.json(
        { error: "Error al crear la preferencia de pago", details: data },
        { status: 502 }
      );
    }

    // Fallback si faltan URLs (algunas cuentas devuelven sólo id)
    let redirect_url: string | undefined =
      data.sandbox_init_point || data.init_point;

    if (!redirect_url && data.id) {
      redirect_url = `https://www.mercadopago.com/checkout/v1/redirect?pref_id=${encodeURIComponent(
        String(data.id)
      )}`;
      console.warn(
        "[create-payment] MP sin init_point; uso fallback con pref_id."
      );
    }

    if (!redirect_url) {
      console.error("[create-payment] Preferencia sin URL utilizable:", data);
      // Marcamos el intento como fallido para trazabilidad
      if (recordId) {
        await prisma.ticket.update({
          where: { id: recordId },
          data: { paymentStatus: PS.failed_preference },
        });
      }
      return NextResponse.json(
        { error: "Preferencia creada sin URL de pago", details: data },
        { status: 502 }
      );
    }

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

// app/api/create-payment/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { MercadoPagoConfig, Preference } from "mercadopago";

/** ========= Helpers ========= */
function isHttps(url?: string | null) {
  return !!url && /^https:\/\/[^ ]+$/i.test(url.trim());
}
function isLocalHttp(url?: string | null) {
  return (
    !!url && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(url.trim())
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

// 1 mesa VIP = N personas (config)
const VIP_UNIT_SIZE = Math.max(1, Number(process.env.VIP_UNIT_SIZE || 10));
const DEFAULT_CURRENCY = "ARS";

type CreateBody = {
  type: "ticket" | "vip-table";
  items: Array<{
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
      quantity?: number; // entradas (general)
      tables?: number; // mesas (vip)
    };
  };
};

// ====== Reglas de descuento (nivel orden) ======
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

/** ========= Handler ========= */
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
    if (body.type !== "ticket" && body.type !== "vip-table")
      return NextResponse.json({ error: "type inválido" }, { status: 400 });

    // === Evento activo por code/id o último activo ===
    const codeOrId =
      s(body.payer?.additionalInfo?.eventCode) ||
      s(body.payer?.additionalInfo?.eventId);
    const event =
      (await prisma.event.findFirst({
        where: {
          OR: [{ code: codeOrId || "" }, { id: codeOrId || "" }],
          isActive: true,
        },
        select: { id: true, code: true, date: true },
      })) ||
      (await prisma.event.findFirst({
        where: { isActive: true },
        orderBy: { date: "desc" },
        select: { id: true, code: true, date: true },
      }));
    if (!event)
      return NextResponse.json(
        { error: "Evento no encontrado" },
        { status: 400 }
      );

    /** ------- VARIABLES COMUNES ------- */
    let unitPriceFromDB = 0; // SIEMPRE desde DB
    let recordId: string;

    if (body.type === "vip-table") {
      // ===== VIP =====
      const tables = Math.max(
        1,
        n(body.payer?.additionalInfo?.tables, n(body.items?.[0]?.quantity, 1))
      );

      const cfgVip = await prisma.ticketConfig.findFirst({
        where: { eventId: event.id, ticketType: "vip", gender: null },
        select: { id: true, price: true, stockLimit: true },
      });
      if (!cfgVip)
        return NextResponse.json(
          { error: "Precio VIP no configurado" },
          { status: 400 }
        );

      // Stock VIP por personas (mesas * VIP_UNIT_SIZE)
      const vipApproved = await prisma.ticket.findMany({
        where: {
          eventId: event.id,
          ticketType: "vip",
          paymentStatus: "approved" as any,
        },
        select: { quantity: true },
      });
      const vipPersonsSold = vipApproved.reduce(
        (a, t) => a + (t.quantity || 0) * VIP_UNIT_SIZE,
        0
      );
      const remainingPersons = Math.max(
        0,
        Number(cfgVip.stockLimit) - vipPersonsSold
      );
      const remainingTables = Math.floor(remainingPersons / VIP_UNIT_SIZE);
      if (remainingTables < tables)
        return NextResponse.json(
          { error: "Sin mesas VIP disponibles" },
          { status: 409 }
        );

      unitPriceFromDB = Number(cfgVip.price) || 0;

      // Descuentos (por mesa)
      const rules = await getActiveRulesFor(event.id, "vip");
      const { total } = pickBestDiscount(tables, unitPriceFromDB, rules);

      const created = await prisma.ticket.create({
        data: {
          eventId: event.id,
          eventDate: event.date,
          ticketType: "vip",
          gender: null,
          quantity: tables,
          totalPrice: total,
          customerName: s(body.payer?.name) ?? "",
          customerEmail: s(body.payer?.email) ?? "",
          customerPhone: s(body.payer?.phone) ?? "",
          customerDni: s(body.payer?.dni) ?? "",
          paymentStatus: "pending" as any,
          ticketConfigId: cfgVip.id,
        },
        select: { id: true, totalPrice: true },
      });
      recordId = created.id;

      // MP: 1 ítem con total
      const mpItems = [
        {
          id: recordId, // recomendado por MP
          title: `Mesa VIP x${tables}`,
          description: body.items?.[0]?.description,
          quantity: 1,
          unit_price: Number(created.totalPrice) || 0,
          currency_id: DEFAULT_CURRENCY,
        },
      ];

      const preferenceBody = {
        items: mpItems,
        payer: {
          name: s(body.payer?.name),
          email: s(body.payer?.email),
          phone: s(body.payer?.phone)
            ? { number: String(body.payer?.phone) }
            : undefined,
          identification: s(body.payer?.dni)
            ? { type: "DNI", number: String(body.payer?.dni) }
            : undefined,
        },
        back_urls: {
          success: `${base}/payment/success`,
          failure: `${base}/payment/failure`,
          pending: `${base}/payment/pending`,
        },
        auto_return: "approved" as const,
        notification_url: `${base}/api/webhooks/mercadopago`,
        external_reference: `vip-table:${recordId}`,
        binary_mode:
          (process.env.MP_BINARY_MODE ?? "true").toLowerCase() === "true",
        payment_methods: {
          excluded_payment_types: [{ id: "ticket" }, { id: "atm" }],
        },
        metadata: {
          type: "vip-table",
          recordId,
          eventId: event.id,
          eventCode: event.code,
        },
      };

      // === SDK + Idempotency
      const mp = new MercadoPagoConfig({
        accessToken: MP_TOKEN,
        options: { timeout: 5000 },
      });
      const pref = new Preference(mp);
      const createdPref = await pref.create({
        body: preferenceBody,
        requestOptions: { idempotencyKey: `pref:vip-table:${recordId}` },
      });

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
          where: { id: recordId },
          data: { paymentStatus: "failed_preference" as any },
        });
        return NextResponse.json(
          { error: "Preferencia sin URL utilizable", details: createdPref },
          { status: 502 }
        );
      }

      return NextResponse.json({
        id: createdPref.id,
        init_point: createdPref.init_point,
        sandbox_init_point: createdPref.sandbox_init_point,
        redirect_url,
      });
    }

    // ===== ENTRADA GENERAL =====
    const gender = s(body.payer?.additionalInfo?.gender) as
      | "hombre"
      | "mujer"
      | undefined;
    const qty = Math.max(
      1,
      n(body.payer?.additionalInfo?.quantity, n(body.items?.[0]?.quantity, 1))
    );
    if (!gender)
      return NextResponse.json({ error: "Género requerido" }, { status: 400 });

    // Precio por género desde DB
    const cfgGen = await prisma.ticketConfig.findFirst({
      where: { eventId: event.id, ticketType: "general", gender },
      select: { id: true, price: true },
    });
    if (!cfgGen)
      return NextResponse.json(
        { error: "Precio de entrada no configurado" },
        { status: 400 }
      );

    // Tope global (total persons)
    const cfgTotal = await prisma.ticketConfig.findFirst({
      where: { eventId: event.id, ticketType: "total", gender: null },
      select: { stockLimit: true },
    });
    const totalLimit = Number(cfgTotal?.stockLimit ?? 0);

    // ✅ Personas vendidas aprobadas (GENERAL) — usar SUM(quantity), no count()
    const [soldGenHAggr, soldGenMAggr, vipApproved] = await Promise.all([
      prisma.ticket.aggregate({
        where: {
          eventId: event.id,
          ticketType: "general",
          gender: "hombre",
          paymentStatus: "approved" as any,
        },
        _sum: { quantity: true },
      }),
      prisma.ticket.aggregate({
        where: {
          eventId: event.id,
          ticketType: "general",
          gender: "mujer",
          paymentStatus: "approved" as any,
        },
        _sum: { quantity: true },
      }),
      prisma.ticket.findMany({
        where: {
          eventId: event.id,
          ticketType: "vip",
          paymentStatus: "approved" as any,
        },
        select: { quantity: true },
      }),
    ]);
    const soldGenH = Number(soldGenHAggr._sum.quantity || 0);
    const soldGenM = Number(soldGenMAggr._sum.quantity || 0);

    const vipPersonsSold = vipApproved.reduce(
      (a, t) => a + (t.quantity || 0) * VIP_UNIT_SIZE,
      0
    );
    const soldTotalPersons = soldGenH + soldGenM + vipPersonsSold;
    const remainingTotal = Math.max(0, totalLimit - soldTotalPersons);

    if (remainingTotal < qty)
      return NextResponse.json(
        { error: "No hay cupo disponible en el evento" },
        { status: 409 }
      );

    unitPriceFromDB = Number(cfgGen.price) || 0;

    // Descuentos (por entrada)
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
        customerName: s(body.payer?.name) ?? "",
        customerEmail: s(body.payer?.email) ?? "",
        customerPhone: s(body.payer?.phone) ?? "",
        customerDni: s(body.payer?.dni) ?? "",
        paymentStatus: "pending" as any,
        ticketConfigId: cfgGen.id,
      },
      select: { id: true, totalPrice: true },
    });
    recordId = created.id;

    const mpItems = [
      {
        id: recordId,
        title: `Entrada General - ${gender === "hombre" ? "Hombre" : "Mujer"} x${qty}`,
        description: body.items?.[0]?.description,
        quantity: 1,
        unit_price: Number(created.totalPrice) || 0,
        currency_id: DEFAULT_CURRENCY,
      },
    ];

    const preferenceBody = {
      items: mpItems,
      payer: {
        name: s(body.payer?.name),
        email: s(body.payer?.email),
        phone: s(body.payer?.phone)
          ? { number: String(body.payer?.phone) }
          : undefined,
        identification: s(body.payer?.dni)
          ? { type: "DNI", number: String(body.payer?.dni) }
          : undefined,
      },
      back_urls: {
        success: `${base}/payment/success`,
        failure: `${base}/payment/failure`,
        pending: `${base}/payment/pending`,
      },
      auto_return: "approved" as const,
      notification_url: `${base}/api/webhooks/mercadopago`,
      external_reference: `ticket:${recordId}`,
      binary_mode:
        (process.env.MP_BINARY_MODE ?? "true").toLowerCase() === "true",
      payment_methods: {
        excluded_payment_types: [{ id: "ticket" }, { id: "atm" }],
      },
      metadata: {
        type: "ticket",
        recordId,
        eventId: event.id,
        eventCode: event.code,
      },
    };

    // === SDK + Idempotency
    const mp = new MercadoPagoConfig({
      accessToken: MP_TOKEN,
      options: { timeout: 5000 },
    });
    const pref = new Preference(mp);
    const createdPref = await pref.create({
      body: preferenceBody,
      requestOptions: { idempotencyKey: `pref:ticket:${recordId}` },
    });

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
        where: { id: recordId },
        data: { paymentStatus: "failed_preference" as any },
      });
      return NextResponse.json(
        { error: "Preferencia sin URL utilizable", details: createdPref },
        { status: 502 }
      );
    }

    return NextResponse.json({
      id: createdPref.id,
      init_point: createdPref.init_point,
      sandbox_init_point: createdPref.sandbox_init_point,
      redirect_url,
    });
  } catch (e) {
    console.error("[create-payment] error:", e);
    return NextResponse.json(
      { error: "Error al procesar la solicitud de pago" },
      { status: 500 }
    );
  }
}

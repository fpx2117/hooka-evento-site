// app/api/create-payment/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { MercadoPagoConfig, Preference } from "mercadopago";

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
  type: "ticket"; // ahora siempre es Ticket; distinguir por ticketType internamente
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
      // General
      gender?: "hombre" | "mujer";
      quantity?: number; // entradas (general)
      // VIP
      ticketType?: "vip" | "general"; // preferido
      tables?: number; // mesas (vip)
      location?: "dj" | "piscina" | "general"; // ubicación VIP
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
    if (!MP_TOKEN) {
      return NextResponse.json(
        { error: "Mercado Pago no configurado" },
        { status: 500 }
      );
    }

    const base = getBaseUrl(req);
    if (!base) {
      return NextResponse.json(
        { error: "Base URL inválida (NEXT_PUBLIC_BASE_URL)" },
        { status: 500 }
      );
    }

    const body: CreateBody = await req.json();

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

    // URLs
    const successUrl = new URL("/payment/success", base).toString();
    const failureUrl = new URL("/payment/failure", base).toString();
    const pendingUrl = new URL("/payment/pending", base).toString();
    const canAutoReturn = isHttps(successUrl);

    // Cliente
    const payerName = s(body.payer?.name) ?? "";
    const payerEmail = s(body.payer?.email) ?? "";
    const payerPhone = onlyDigits(s(body.payer?.phone));
    const payerDni = onlyDigits(s(body.payer?.dni));

    // ¿Qué tipo de ticket se quiere? Por compatibilidad:
    const requestedType =
      (s(body.payer?.additionalInfo?.ticketType)?.toLowerCase() as
        | "general"
        | "vip"
        | undefined) ?? "general";

    /* ======================================================================
       VIP (ticketType = "vip") -> crea TICKET PENDING y Preference
       Chequea: mesas disponibles por ubicación + cupo total en personas
    ====================================================================== */
    if (requestedType === "vip") {
      const tables = Math.max(
        1,
        n(body.payer?.additionalInfo?.tables, n(body.items?.[0]?.quantity, 1))
      );
      const rawLoc = (
        s(body.payer?.additionalInfo?.location) || ""
      ).toLowerCase();
      const location = (
        ["dj", "piscina", "general"].includes(rawLoc) ? rawLoc : "general"
      ) as "dj" | "piscina" | "general";

      // Config por ubicación
      const cfg = await prisma.vipTableConfig.findFirst({
        where: { eventId: event.id, location },
        select: {
          id: true,
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
      const remainingTables = Math.max(
        0,
        Number(cfg.stockLimit || 0) - Number(cfg.soldCount || 0)
      );
      if (remainingTables < tables) {
        return NextResponse.json(
          { error: "Sin mesas disponibles en esa ubicación" },
          { status: 409 }
        );
      }

      // Chequeo de cupo TOTAL (personas)
      const cfgTotal = await prisma.ticketConfig.findFirst({
        where: { eventId: event.id, ticketType: "total", gender: null },
        select: { stockLimit: true },
      });
      const totalLimit = Number(cfgTotal?.stockLimit ?? 0);

      const [soldGenHAggr, soldGenMAggr, vipCfgs] = await Promise.all([
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
        prisma.vipTableConfig.findMany({
          where: { eventId: event.id },
          select: { soldCount: true, capacityPerTable: true },
        }),
      ]);
      const soldGenH = Number(soldGenHAggr._sum.quantity || 0);
      const soldGenM = Number(soldGenMAggr._sum.quantity || 0);
      const vipPersonsSold = (vipCfgs || []).reduce((acc, c) => {
        const soldTables = Math.max(0, Number(c.soldCount || 0));
        const eachCap = Math.max(
          1,
          Number(c.capacityPerTable || VIP_UNIT_SIZE)
        );
        return acc + soldTables * eachCap;
      }, 0);
      const soldTotalPersons = soldGenH + soldGenM + vipPersonsSold;
      const remainingTotalPersons = Math.max(0, totalLimit - soldTotalPersons);

      const newVipPersons = tables * cap;
      if (newVipPersons > remainingTotalPersons) {
        return NextResponse.json(
          { error: "No hay cupo total disponible para esa cantidad de mesas" },
          { status: 409 }
        );
      }

      const unitPriceFromDB = Number(cfg.price) || 0;

      // Descuento por mesa (usa reglas 'vip')
      const rules = await getActiveRulesFor(event.id, "vip");
      const { total } = pickBestDiscount(tables, unitPriceFromDB, rules);

      // Crear Ticket VIP (PENDING)
      const createdVip = await prisma.ticket.create({
        data: {
          eventId: event.id,
          eventDate: event.date,
          ticketType: "vip",
          gender: null,
          quantity: 1, // no se usa para stock VIP, queda en 1 por consistencia
          vipLocation: location as any,
          vipTables: tables,
          capacityPerTable: cap,
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

      // Preferencia (1 ítem = total mesas)
      const mpItems = [
        {
          id: createdVip.id,
          title:
            body.items?.[0]?.title ||
            `Mesa VIP - ${prettyLocation(location)} x${tables}`,
          description:
            body.items?.[0]?.description ||
            `1 mesa = ${cap} personas · Ubicación: ${prettyLocation(location)}`,
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
        external_reference: `ticket:${createdVip.id}`, // 👈 ahora todo es Ticket
        binary_mode:
          (process.env.MP_BINARY_MODE ?? "true").toLowerCase() === "true",
        payment_methods: {
          excluded_payment_types: [{ id: "ticket" }, { id: "atm" }],
        },
        metadata: {
          type: "ticket",
          ticketType: "vip",
          recordId: createdVip.id, // 👈 el webhook usa esto
          eventId: event.id,
          eventCode: event.code,
          vipLocation: location,
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
        console.error("[MP preference error][VIP]", {
          message: err?.message,
          error: err?.error,
          status: err?.status,
          cause: err?.cause,
          base,
          preferenceBody,
        });
        await prisma.ticket.update({
          where: { id: createdVip.id },
          data: { paymentStatus: "failed_preference" as any },
        });
        return NextResponse.json(
          { error: "Error creando preferencia de pago (VIP)" },
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
        init_point: createdPref.init_point,
        sandbox_init_point: createdPref.sandbox_init_point,
        redirect_url,
      });
    }

    /* ======================================================================
       ENTRADA GENERAL -> crea Ticket (paymentStatus=pending) y Preference
       Se respeta stock global: TOTAL(personas) - aprobadas(general+vip)
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

    // Vendidas aprobadas (GENERAL por género + VIP convertidas a personas)
    const [soldGenHAggr, soldGenMAggr, vipCfgs] = await Promise.all([
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
      prisma.vipTableConfig.findMany({
        where: { eventId: event.id },
        select: { soldCount: true, capacityPerTable: true },
      }),
    ]);
    const soldGenH = Number(soldGenHAggr._sum.quantity || 0);
    const soldGenM = Number(soldGenMAggr._sum.quantity || 0);
    const vipPersonsSold = (vipCfgs || []).reduce((acc, c) => {
      const soldTables = Math.max(0, Number(c.soldCount || 0));
      const cap = Math.max(1, Number(c.capacityPerTable || VIP_UNIT_SIZE));
      return acc + soldTables * cap;
    }, 0);

    const soldTotalPersons = soldGenH + soldGenM + vipPersonsSold;
    const remainingTotal = Math.max(0, totalLimit - soldTotalPersons);
    if (remainingTotal < qty) {
      return NextResponse.json(
        { error: "No hay cupo disponible en el evento" },
        { status: 409 }
      );
    }

    const unitPriceFromDB = Number(cfgGen.price) || 0;

    // Descuento por entrada (usa reglas 'general')
    const rules = await getActiveRulesFor(event.id, "general");
    const { total } = pickBestDiscount(qty, unitPriceFromDB, rules);

    // Crear Ticket GENERAL (PENDING)
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
        title:
          body.items?.[0]?.title ||
          `Entrada General - ${gender === "hombre" ? "Hombre" : "Mujer"} x${qty}`,
        description: body.items?.[0]?.description,
        quantity: 1,
        unit_price: Number(created.totalPrice) || 0,
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
      external_reference: `ticket:${created.id}`,
      binary_mode:
        (process.env.MP_BINARY_MODE ?? "true").toLowerCase() === "true",
      payment_methods: {
        excluded_payment_types: [{ id: "ticket" }, { id: "atm" }],
      },
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

    let createdPref;
    try {
      createdPref = await pref.create({
        body: preferenceBody,
        requestOptions: { idempotencyKey: `pref:ticket:${created.id}` },
      });
    } catch (err: any) {
      console.error("[MP preference error][GENERAL]", {
        message: err?.message,
        error: err?.error,
        status: err?.status,
        cause: err?.cause,
        base,
        preferenceBody,
      });
      await prisma.ticket.update({
        where: { id: created.id },
        data: { paymentStatus: "failed_preference" as any },
      });
      return NextResponse.json(
        { error: "Error creando preferencia de pago (General)" },
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
        where: { id: created.id },
        data: { paymentStatus: "failed_preference" as any },
      });
      return NextResponse.json(
        { error: "Preferencia sin URL utilizable" },
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

// app/api/mercadopago/create-preference/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { MercadoPagoConfig, Preference } from "mercadopago";

const DEFAULT_CURRENCY = "ARS";

/* ========== helpers url ========== */
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

/* ========== helpers varios ========== */
const s = (v: unknown) =>
  v === undefined || v === null ? undefined : String(v).trim();

function toMoney2(n: unknown) {
  const x = Number(n || 0);
  return Math.round(x * 100) / 100;
}

function prettyVipLocation(loc?: string | null) {
  switch ((loc || "").toLowerCase()) {
    case "dj":
      return "DJ";
    case "piscina":
      return "Piscina";
    default:
      return "General";
  }
}

/** Tipado del payload del frontend (precio SIEMPRE sale de BD) */
type CreatePreferencePayload = {
  /** Preferí "ticket". Se acepta "vip-table" por compat pero igual se usa Ticket. */
  type: "ticket" | "vip-table";
  recordId: string;

  // Opcionales (sólo visuales)
  itemId?: string | number;
  title?: string;
  pictureUrl?: string;
  categoryId?: string; // si querés mapear categorías propias
  currency?: string;

  backUrls?: {
    success?: string;
    pending?: string;
    failure?: string;
  };
};

/** (Opcional) mapear categoría interna a category_id de MP */
function mapInternalCategoryToMpCategory(
  internal?: string
): string | undefined {
  if (!internal) return undefined;
  const normalized = String(internal).trim().toLowerCase();
  const table: Record<string, string> = {
    vip: "entertainment",
    entrada: "tickets",
    ticket: "tickets",
    mesa: "entertainment",
    consumicion: "bar_services",
  };
  return table[normalized] ?? internal;
}

/* ========================= Handler ========================= */
export async function POST(req: NextRequest) {
  try {
    const MP_TOKEN =
      process.env.MERCADO_PAGO_ACCESS_TOKEN || process.env.MP_ACCESS_TOKEN;
    if (!MP_TOKEN) {
      console.error("[create-preference] Falta MERCADO_PAGO_ACCESS_TOKEN");
      return NextResponse.json(
        { error: "Mercado Pago no configurado" },
        { status: 500 }
      );
    }

    const BASE_URL = getBaseUrl(req);
    if (!BASE_URL) {
      return NextResponse.json(
        { error: "Base URL inválida (NEXT_PUBLIC_BASE_URL)" },
        { status: 500 }
      );
    }
    const canAutoReturn = isHttps(BASE_URL);

    const raw = (await req.json()) as Partial<CreatePreferencePayload>;
    const errors: string[] = [];
    const rawType = s(raw.type)?.toLowerCase();
    const recordId = s(raw.recordId);

    if (!rawType) errors.push("type");
    if (rawType && !["vip-table", "ticket"].includes(rawType)) {
      errors.push("type inválido");
    }
    if (!recordId) errors.push("recordId");
    if (errors.length) {
      return NextResponse.json(
        { error: "Campos faltantes/invalidos", details: errors },
        { status: 400 }
      );
    }

    // A efectos del nuevo modelo, siempre trabajamos con Ticket.
    // Aceptamos "vip-table" por compatibilidad pero leemos el Ticket (que puede ser 'vip' o 'general').
    const { title, pictureUrl, categoryId, currency, itemId, backUrls } =
      raw as CreatePreferencePayload;

    // ===== Leer ticket desde BD
    const t = await prisma.ticket.findUnique({
      where: { id: recordId },
      select: {
        id: true,
        paymentStatus: true,
        totalPrice: true,
        ticketType: true, // "general" | "vip"
        gender: true, // para general
        quantity: true, // para general
        vipLocation: true, // para vip
        vipTables: true, // para vip
      },
    });

    if (!t) {
      return NextResponse.json(
        { error: "ticket no encontrado" },
        { status: 404 }
      );
    }
    if (t.paymentStatus !== "pending") {
      return NextResponse.json(
        { error: "estado inválido para crear preferencia" },
        { status: 409 }
      );
    }

    const dbTotal = toMoney2(t.totalPrice);
    if (!(dbTotal > 0)) {
      return NextResponse.json(
        { error: "total en BD inválido" },
        { status: 400 }
      );
    }

    // ===== Título visual por defecto coherente con el tipo real
    let visualTitle = (title || "").trim();
    if (!visualTitle) {
      if (t.ticketType === "vip") {
        const loc = prettyVipLocation(t.vipLocation);
        const qty = Math.max(1, Number(t.vipTables || 1));
        visualTitle = `Mesa VIP (Ubicación: ${loc}) x${qty}`;
      } else {
        // general
        const gen =
          t.gender === "mujer"
            ? "Mujer"
            : t.gender === "hombre"
              ? "Hombre"
              : "General";
        const qty = Math.max(1, Number(t.quantity || 1));
        visualTitle = `Entrada General - ${gen} x${qty}`;
      }
    }

    // ===== MP preference
    const mpItemId = String(itemId ?? recordId);
    const resolvedCurrency = (currency || DEFAULT_CURRENCY).toUpperCase();
    const resolvedCategory =
      mapInternalCategoryToMpCategory(categoryId) || categoryId;

    // External ref + metadata estandarizados al nuevo modelo
    const externalRef = `ticket:${recordId}`;
    const preferenceBody = {
      items: [
        {
          id: mpItemId,
          title: visualTitle,
          quantity: 1,
          unit_price: dbTotal,
          currency_id: resolvedCurrency,
          picture_url: pictureUrl || undefined,
          category_id: resolvedCategory || undefined,
        },
      ],
      external_reference: externalRef,
      metadata: { type: "ticket", recordId },

      notification_url: `${BASE_URL}/api/webhooks/mercadopago`,
      ...(canAutoReturn ? { auto_return: "approved" as const } : {}),
      binary_mode:
        (process.env.MP_BINARY_MODE ?? "true").toLowerCase() === "true",

      back_urls: {
        success: backUrls?.success || `${BASE_URL}/payment/success`,
        pending: backUrls?.pending || `${BASE_URL}/payment/pending`,
        failure: backUrls?.failure || `${BASE_URL}/payment/failure`,
      },
      // statement_descriptor: "ALLDATA*EVENTOS",
    };

    const mp = new MercadoPagoConfig({
      accessToken: MP_TOKEN,
      options: { timeout: 5000 },
    });
    const pref = new Preference(mp);

    const created = await pref.create({
      body: preferenceBody as any,
      requestOptions: {
        // Idempotencia por ticket
        idempotencyKey: `pref:ticket:${recordId}`,
      },
    });

    return NextResponse.json(
      {
        ok: true,
        id: created.id,
        init_point: created.init_point,
        sandbox_init_point: created.sandbox_init_point,
      },
      { status: 201 }
    );
  } catch (e: any) {
    console.error("[create-preference] error:", e?.message || e);
    return NextResponse.json(
      { error: "No se pudo crear la preferencia" },
      { status: 500 }
    );
  }
}

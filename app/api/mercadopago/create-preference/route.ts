export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { MercadoPagoConfig, Preference } from "mercadopago";

const DEFAULT_CURRENCY = "ARS";

/* ==================== Helpers ==================== */
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

function toMoney2(n: unknown) {
  const x = Number(n || 0);
  return Math.round(x * 100) / 100;
}

function mapInternalCategoryToMpCategory(internal?: string): string | undefined {
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

/* ==================== Types ==================== */
type CreatePreferencePayload = {
  type: "ticket" | "vip-table";
  recordId: string;
  itemId?: string | number;
  title?: string;
  pictureUrl?: string;
  categoryId?: string;
  currency?: string;
  backUrls?: {
    success?: string;
    pending?: string;
    failure?: string;
  };
};

/* ==================== Handler ==================== */
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
    if (rawType && !["vip-table", "ticket"].includes(rawType))
      errors.push("type inválido");
    if (!recordId) errors.push("recordId");

    if (errors.length) {
      return NextResponse.json(
        { error: "Campos faltantes/invalidos", details: errors },
        { status: 400 }
      );
    }

    const { title, pictureUrl, categoryId, currency, itemId, backUrls } =
      raw as CreatePreferencePayload;

    // ==================== Ticket desde BD ====================
    const t = await prisma.ticket.findUnique({
      where: { id: recordId },
      select: {
        id: true,
        paymentStatus: true,
        totalPrice: true,
        ticketType: true, // general | vip
        gender: true,
        quantity: true,
        vipLocationRef: { select: { name: true } },
        vipTable: { select: { tableNumber: true } },
        vipTableConfig: { select: { price: true, capacityPerTable: true } },
      },
    });

    if (!t) {
      return NextResponse.json({ error: "Ticket no encontrado" }, { status: 404 });
    }

    if (t.paymentStatus !== "pending") {
      return NextResponse.json(
        { error: "Estado inválido para crear preferencia" },
        { status: 409 }
      );
    }

    const dbTotal = toMoney2(t.totalPrice || t.vipTableConfig?.price);
    if (!(dbTotal > 0)) {
      return NextResponse.json(
        { error: "Total inválido en base de datos" },
        { status: 400 }
      );
    }

    // ==================== Título del producto ====================
    let visualTitle = (title || "").trim();

    if (!visualTitle) {
      if (t.ticketType === "vip") {
        const loc = t.vipLocationRef?.name ?? "VIP";
        const mesa = t.vipTable?.tableNumber
          ? `Mesa ${t.vipTable.tableNumber}`
          : "";
        visualTitle = `Mesa VIP ${mesa} (${loc})`;
      } else {
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

    // ==================== Preferencia Mercado Pago ====================
    const mpItemId = String(itemId ?? recordId);
    const resolvedCurrency = (currency || DEFAULT_CURRENCY).toUpperCase();
    const resolvedCategory =
      mapInternalCategoryToMpCategory(categoryId) || categoryId;

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
    };

    const mp = new MercadoPagoConfig({
      accessToken: MP_TOKEN,
      options: { timeout: 5000 },
    });

    const pref = new Preference(mp);
    const created = await pref.create({
      body: preferenceBody as any,
      requestOptions: {
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

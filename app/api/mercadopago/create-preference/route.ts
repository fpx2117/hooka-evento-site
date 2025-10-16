///api/mercadopago/create-preference/route.ts
1;
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { MercadoPagoConfig, Preference } from "mercadopago";

/* =========================
   Config / helpers
========================= */
const DEFAULT_CURRENCY = "ARS";

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

/** Tipado de payload que envía tu frontend */
type CreatePreferencePayload = {
  type: "vip-table" | "ticket";
  recordId: string;

  // Metadatos/visual (el precio SIEMPRE sale de la BD)
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

/* =========================
   Handler
========================= */
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

    const payload = (await req.json()) as Partial<CreatePreferencePayload>;

    // Validaciones mínimas del payload
    const errors: string[] = [];
    if (!payload?.type) errors.push("type");
    if (payload?.type && !["vip-table", "ticket"].includes(payload.type))
      errors.push("type inválido");
    if (!payload?.recordId) errors.push("recordId");
    if (errors.length) {
      return NextResponse.json(
        { error: "Campos faltantes/invalidos", details: errors },
        { status: 400 }
      );
    }

    const { type, recordId } = payload;

    // ===== Leer TOTAL desde BD (NUNCA del cliente)
    let dbTotal = 0;
    let visualTitle = payload.title || "";
    const mpItemId = String(payload.itemId ?? recordId);

    if (type === "ticket") {
      const t = await prisma.ticket.findUnique({
        where: { id: recordId! },
        select: {
          id: true,
          totalPrice: true,
          ticketType: true, // "general" | "vip"
          gender: true, // "hombre" | "mujer" | null
          quantity: true,
          paymentStatus: true,
        },
      });
      if (!t)
        return NextResponse.json(
          { error: "ticket no encontrado" },
          { status: 404 }
        );
      if (t.paymentStatus !== "pending") {
        return NextResponse.json(
          { error: "estado inválido para crear preferencia" },
          { status: 409 }
        );
      }
      dbTotal = Number(t.totalPrice || 0);
      if (!visualTitle) {
        if (t.ticketType === "vip") {
          visualTitle = `Mesa VIP x${t.quantity || 1}`;
        } else {
          const gen = t.gender === "mujer" ? "Mujer" : "Hombre";
          visualTitle = `Entrada General - ${gen} x${t.quantity || 1}`;
        }
      }
    } else {
      // vip-table en tabla de reservas
      const r = await prisma.tableReservation.findUnique({
        where: { id: recordId! },
        select: {
          id: true,
          totalPrice: true,
          tables: true,
          paymentStatus: true,
        },
      });
      if (!r) {
        return NextResponse.json(
          { error: "reserva no encontrada" },
          { status: 404 }
        );
      }
      if (r.paymentStatus !== "pending") {
        return NextResponse.json(
          { error: "estado inválido para crear preferencia" },
          { status: 409 }
        );
      }
      dbTotal = Number(r.totalPrice || 0);
      if (!visualTitle) visualTitle = `Mesa VIP x${r.tables || 1}`;
    }

    if (!(dbTotal > 0)) {
      return NextResponse.json(
        { error: "total en BD inválido" },
        { status: 400 }
      );
    }

    // ===== Armado de preferencia MP =====
    const currency = payload.currency || DEFAULT_CURRENCY;
    const resolvedCategory =
      mapInternalCategoryToMpCategory(payload.categoryId) || payload.categoryId;
    const externalRef = `${type}:${recordId}`;

    // Un solo ítem por el total de la orden
    const preferenceBody = {
      items: [
        {
          id: mpItemId, // 👍 items.id recomendado
          title: visualTitle || "Compra",
          quantity: 1,
          unit_price: dbTotal, // 👍 total desde BD
          currency_id: currency,
          picture_url: payload.pictureUrl || undefined,
          category_id: resolvedCategory || undefined, // 👍 items.category_id
        },
      ],
      external_reference: externalRef,
      metadata: { type, recordId },

      notification_url: `${BASE_URL}/api/webhooks/mercadopago`,
      auto_return: "approved" as const,
      binary_mode:
        (process.env.MP_BINARY_MODE ?? "true").toLowerCase() === "true",

      back_urls: {
        success: payload.backUrls?.success || `${BASE_URL}/payment/success`,
        pending: payload.backUrls?.pending || `${BASE_URL}/payment/pending`,
        failure: payload.backUrls?.failure || `${BASE_URL}/payment/failure`,
      },
    };

    // ===== Llamado al SDK con idempotencia =====
    const mp = new MercadoPagoConfig({
      accessToken: MP_TOKEN,
      options: { timeout: 5000 },
    });
    const pref = new Preference(mp);
    const created = await pref.create({
      body: preferenceBody,
      requestOptions: {
        idempotencyKey: `pref-${externalRef}`, // evita duplicados
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

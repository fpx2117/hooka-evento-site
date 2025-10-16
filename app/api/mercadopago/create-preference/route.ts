import { NextRequest, NextResponse } from "next/server";
import { MercadoPagoConfig, Preference } from "mercadopago";

/** Ajustá si necesitás otras monedas, por defecto ARS */
const DEFAULT_CURRENCY = "ARS";

/** Tipado del body esperado desde tu frontend */
type CreatePreferencePayload = {
  /** Para enlazar con tu negocio (lo usás en external_reference y metadata) */
  type: "vip-table" | "ticket";
  recordId: string;

  /** Datos del ítem */
  itemId: string | number; // ✔ Recomendación MP: items.id
  title: string;
  quantity: number;
  unitPrice: number;
  currency?: string;
  pictureUrl?: string;

  /** ✔ Recomendación MP: items.category_id */
  categoryId?: string;

  /** Opcional: si querés que el frontend pase sus propias back_urls */
  backUrls?: {
    success?: string;
    pending?: string;
    failure?: string;
  };
};

/** Si querés mapear tus categorías internas a category_id de MP, hacelo acá */
function mapInternalCategoryToMpCategory(
  internal?: string
): string | undefined {
  if (!internal) return undefined;

  const normalized = String(internal).trim().toLowerCase();
  const table: Record<string, string> = {
    // ejemplos: ajustá estos keys a tus categorías internas
    vip: "entertainment",
    entrada: "tickets",
    ticket: "tickets",
    mesa: "entertainment",
    consumicion: "bar_services",
    // fallback: devolvé tal cual si ya viene en el formato esperado
  };

  return table[normalized] ?? internal;
}

export async function POST(req: NextRequest) {
  try {
    const MP_TOKEN =
      process.env.MERCADO_PAGO_ACCESS_TOKEN || process.env.MP_ACCESS_TOKEN;
    if (!MP_TOKEN) {
      console.error("[mp] Falta MERCADO_PAGO_ACCESS_TOKEN / MP_ACCESS_TOKEN");
      return NextResponse.json(
        { error: "Falta MERCADO_PAGO_ACCESS_TOKEN" },
        { status: 500 }
      );
    }

    const BASE_URL =
      process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
    const payload = (await req.json()) as Partial<CreatePreferencePayload>;

    // ===== Validaciones mínimas del payload =====
    const errors: string[] = [];
    if (!payload?.type) errors.push("type");
    if (!payload?.recordId) errors.push("recordId");
    if (payload?.type && !["vip-table", "ticket"].includes(payload.type)) {
      errors.push("type inválido");
    }
    if (payload?.quantity != null && Number(payload.quantity) <= 0) {
      errors.push("quantity debe ser > 0");
    }
    if (payload?.unitPrice != null && Number.isNaN(Number(payload.unitPrice))) {
      errors.push("unitPrice inválido");
    }
    if (!payload?.title) errors.push("title");
    if (!payload?.itemId && payload?.itemId !== 0) errors.push("itemId");

    if (errors.length) {
      return NextResponse.json(
        { error: "Campos faltantes/invalidos", details: errors },
        { status: 400 }
      );
    }

    // ===== Preparación de body de preferencia =====
    const currency = payload.currency || DEFAULT_CURRENCY;
    const resolvedCategory =
      mapInternalCategoryToMpCategory(payload.categoryId) || payload.categoryId;

    const externalRef = `${payload.type}:${payload.recordId}`;

    const preferenceBody = {
      items: [
        {
          id: String(payload.itemId), // ✔ items.id
          title: String(payload.title),
          quantity: Number(payload.quantity || 1),
          unit_price: Number(payload.unitPrice),
          currency_id: currency,
          picture_url: payload.pictureUrl || undefined,
          category_id: resolvedCategory || undefined, // ✔ items.category_id
        },
      ],
      external_reference: externalRef, // lo usás en tu webhook
      metadata: { type: payload.type, recordId: payload.recordId },

      notification_url: `${BASE_URL}/api/webhooks/mercadopago`,
      auto_return: "approved" as const,

      back_urls: {
        success: payload.backUrls?.success || `${BASE_URL}/mp/success`,
        pending: payload.backUrls?.pending || `${BASE_URL}/mp/pending`,
        failure: payload.backUrls?.failure || `${BASE_URL}/mp/failure`,
      },
    };

    // ===== Llamado al SDK =====
    const mp = new MercadoPagoConfig({
      accessToken: MP_TOKEN,
      options: { timeout: 5000 },
    });
    const pref = new Preference(mp);
    const created = await pref.create({ body: preferenceBody });

    // Podés retornar init_point (producción) y sandbox_init_point
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
    console.error("[mp] create-preference error:", e?.message || e);
    return NextResponse.json(
      { error: "No se pudo crear la preferencia" },
      { status: 500 }
    );
  }
}

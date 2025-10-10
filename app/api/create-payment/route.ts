// app/api/create-payment/route.ts
import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

type Item = {
  title: string;
  description?: string;
  quantity: number;
  unit_price: number;
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

/** Infiero BASE pública (útil con ngrok si olvidaste NEXT_PUBLIC_BASE_URL). */
function getPublicBaseUrl(req: NextRequest) {
  const envBase = process.env.NEXT_PUBLIC_BASE_URL?.trim();
  if (isHttpsPublicUrl(envBase)) return envBase!;
  const proto = req.headers.get("x-forwarded-proto") || "http";
  const host =
    req.headers.get("x-forwarded-host") || req.headers.get("host") || "";
  const guessed = `${proto}://${host}`;
  return isHttpsPublicUrl(guessed) ? guessed : "";
}

/** Normalizaciones mínimas */
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
            "Configuración de pago no disponible. Por favor contactá al administrador.",
        },
        { status: 500 }
      );
    }

    // BASE pública: env o inferida de headers (ideal con ngrok)
    const BASE = getPublicBaseUrl(request);
    const isHttps = isHttpsPublicUrl(BASE);

    // ---- 0) Validaciones mínimas de entrada ----
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "items requeridos" }, { status: 400 });
    }
    // normalizo items (cantidad mínima 1)
    const mpItems = items.map((it) => ({
      title: String(it?.title ?? "").slice(0, 255),
      description: it?.description
        ? String(it.description).slice(0, 256)
        : undefined,
      quantity: Math.max(1, n(it?.quantity, 1)),
      unit_price: n(it?.unit_price, 0),
      currency_id: "ARS" as const,
    }));

    // ---- 1) Persistencia local previa (estado "pending") ----
    if (type === "vip-table") {
      const capacity =
        Number.parseInt(
          (items?.[0]?.title || "").match(/\d+/)?.[0] || "6",
          10
        ) || 6;

      const reservation = await prisma.tableReservation.create({
        data: {
          packageType: s(payer?.additionalInfo?.packageType) ?? "standard",
          location: s(payer?.additionalInfo?.location) ?? "general",
          capacity,
          guests:
            Number.parseInt(String(payer?.additionalInfo?.guests ?? "0"), 10) ||
            0,
          totalPrice: n(items?.[0]?.unit_price, 0),
          customerName: s(payer?.name) ?? "",
          customerEmail: s(payer?.email) ?? "",
          customerPhone: s(payer?.phone) ?? "",
          customerDni: s(payer?.dni) ?? "",
          reservationDate: payer?.additionalInfo?.date
            ? new Date(payer.additionalInfo.date)
            : new Date(),
          paymentStatus: "pending",
        },
      });
      recordId = reservation.id;
    } else if (type === "ticket") {
      const quantity = Math.max(1, n(payer?.additionalInfo?.quantity, 1));
      const unit = n(items?.[0]?.unit_price, 0);

      const ticket = await prisma.ticket.create({
        data: {
          ticketType: s(payer?.additionalInfo?.ticketType) ?? "general",
          quantity,
          totalPrice: unit * quantity,
          customerName: s(payer?.name) ?? "",
          customerEmail: s(payer?.email) ?? "",
          customerPhone: s(payer?.phone) ?? "",
          customerDni: s(payer?.dni) ?? "",
          gender: s(payer?.additionalInfo?.gender) ?? null,
          paymentStatus: "pending",
          eventDate: payer?.additionalInfo?.eventDate
            ? new Date(payer.additionalInfo.eventDate)
            : null,
        },
      });
      recordId = ticket.id;
    } else {
      return NextResponse.json(
        { error: "Tipo de operación inválido" },
        { status: 400 }
      );
    }

    // ---- 2) Construcción de preferencia (MP Checkout Pro) ----
    const back_urls = clean({
      // back_urls solo si BASE https (MP exige https público)
      success: isHttps ? `${BASE}/payment/success` : undefined,
      failure: isHttps ? `${BASE}/payment/failure` : undefined,
      pending: isHttps ? `${BASE}/payment/pending` : undefined,
    });

    // binary_mode: ON por defecto en dev; configurable por env
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

      // Webhook solo si hay BASE https
      notification_url: back_urls.success
        ? `${BASE}/api/webhooks/mercadopago`
        : undefined,

      // Referencia/metadata para reconciliar
      metadata: {
        type,
        recordId, // camelCase consistente con tu webhook
        payer_info: payer,
      },
      external_reference: `${type}:${recordId}`,

      ...(binaryMode ? { binary_mode: true } : {}),

      // Evita medios offline que dejan pending (boleta/atm)
      payment_methods: {
        excluded_payment_types: [{ id: "ticket" }, { id: "atm" }],
        // Opcionales:
        // default_installments: 1,
        // default_payment_method_id: "account_money", // ⟵ ÚTIL EN SANDBOX
        // excluded_payment_methods: [{ id: "amex" }],
      },

      // Opcionales recomendados:
      // statement_descriptor: "TU-MARCA",
      // purpose: "wallet_purchase",
      // expires: true,
      // expiration_date_from: new Date().toISOString(),
      // expiration_date_to: new Date(Date.now() + 1000 * 60 * 60 * 2).toISOString(),
    });

    // Log crítico para depurar payloads a MP
    console.log(
      "[create-payment] Preference payload ->",
      JSON.stringify(preference, null, 2)
    );

    // ---- 3) Request a MP ----
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

      // Cleanup mínimo: si falló crear preferencia, marco el registro como failed_preference
      if (recordId && recordType === "vip-table") {
        await prisma.tableReservation.update({
          where: { id: recordId },
          data: { paymentStatus: "failed_preference" as any },
        });
      } else if (recordId && recordType === "ticket") {
        await prisma.ticket.update({
          where: { id: recordId },
          data: { paymentStatus: "failed_preference" as any },
        });
      }

      return NextResponse.json(
        { error: "Error al crear la preferencia de pago", details: errorData },
        { status: 502 }
      );
    }

    const data = await mpRes.json();

    // ---- 4) Persisto preferenceId / URL en mi registro para soporte/conciliación ----
    try {
      if (recordId && recordType === "vip-table") {
        await prisma.tableReservation.update({
          where: { id: recordId },
          data: {
            // Agregá estos campos en tu schema si aún no existen
            // preferenceId: data.id,
            // preferenceInitPoint: data.init_point ?? data.sandbox_init_point ?? null,
          } as any,
        });
      } else if (recordId && recordType === "ticket") {
        await prisma.ticket.update({
          where: { id: recordId },
          data: {
            // preferenceId: data.id,
            // preferenceInitPoint: data.init_point ?? data.sandbox_init_point ?? null,
          } as any,
        });
      }
    } catch (e) {
      console.warn(
        "[create-payment] No pude guardar preferenceId en DB (campo no existe):",
        e
      );
    }

    // URL final a la cual redirige tu frontend (soporta sandbox y prod)
    const redirect_url = data.sandbox_init_point || data.init_point;

    return NextResponse.json({
      id: data.id,
      init_point: data.init_point, // producción
      sandbox_init_point: data.sandbox_init_point, // sandbox
      redirect_url,
    });
  } catch (error) {
    console.error("[create-payment] Error:", error);

    // Ante error inesperado, si ya teníamos un registro creado, dejalo marcado como failed_preference
    try {
      if (recordId && recordType === "vip-table") {
        await prisma.tableReservation.update({
          where: { id: recordId },
          data: { paymentStatus: "failed_preference" as any },
        });
      } else if (recordId && recordType === "ticket") {
        await prisma.ticket.update({
          where: { id: recordId },
          data: { paymentStatus: "failed_preference" as any },
        });
      }
    } catch {}

    return NextResponse.json(
      { error: "Error al procesar la solicitud de pago" },
      { status: 500 }
    );
  }
}

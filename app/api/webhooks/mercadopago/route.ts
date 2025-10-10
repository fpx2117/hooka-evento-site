// app/api/webhooks/mercadopago/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";
import { MercadoPagoConfig, Payment, MerchantOrder } from "mercadopago";

const EXPECTED_CURRENCY = "ARS";

// ========================= MP SDK client =========================
const MP_TOKEN =
  process.env.MERCADO_PAGO_ACCESS_TOKEN || process.env.MP_ACCESS_TOKEN;
if (!MP_TOKEN) {
  // No tiramos error en import-time para no romper el build; validamos en runtime
  console.warn("[webhook] Falta MERCADO_PAGO_ACCESS_TOKEN");
}
const mpClient = MP_TOKEN
  ? new MercadoPagoConfig({ accessToken: MP_TOKEN, options: { timeout: 5000 } })
  : null;

// ========================= Firma (opcional) =========================
function parseXSignature(sig: string | null) {
  if (!sig) return null;
  const parts = sig.split(",").reduce<Record<string, string>>((acc, kv) => {
    const [k, v] = kv.split("=");
    if (k && v) acc[k.trim()] = v.trim();
    return acc;
  }, {});
  if (!parts.ts || !parts.v1) return null;
  return { ts: parts.ts, v1: parts.v1.toLowerCase() };
}
function hmac(secret: string, data: string) {
  return crypto.createHmac("sha256", secret).update(data).digest("hex");
}
function buildSignatureCandidates(opts: {
  requestId: string;
  ts: string;
  paymentId: string;
  urlPath: string;
  urlFull: string;
  secret: string;
}) {
  const { requestId, ts, paymentId, urlPath, urlFull, secret } = opts;
  const bases = [
    `id:${paymentId};request-id:${requestId};ts:${ts};`,
    `payment_id:${paymentId};request-id:${requestId};ts:${ts};`,
    `id:${paymentId};request-id:${requestId};ts:${ts};path:${urlPath};`,
    `id:${paymentId};request-id:${requestId};ts:${ts};url:${urlFull};`,
    `${paymentId}:${requestId}:${ts}`,
    `${requestId}:${ts}:${paymentId}`,
  ];
  return bases.map((b) => hmac(secret, b));
}
async function isValidFromMercadoPago(req: NextRequest, body: any) {
  const sig = parseXSignature(req.headers.get("x-signature"));
  const requestId = req.headers.get("x-request-id") || "";
  const secret = process.env.MP_WEBHOOK_SECRET || "";

  if (!secret) return true; // validación blanda (sandbox)
  if (!sig || !requestId || !body?.data?.id) return false;

  const ts = sig.ts;
  const v1 = sig.v1;
  const paymentId = String(body.data.id);
  const urlPath = req.nextUrl?.pathname || "";
  const urlFull = req.url || "";
  const candidates = buildSignatureCandidates({
    requestId,
    ts,
    paymentId,
    urlPath,
    urlFull,
    secret,
  });
  return candidates.some((c) => c === v1);
}

// ========================= Utilidades =========================
function extractRecordRef(payment: any): { type?: string; recordId?: string } {
  const md = payment?.metadata || {};
  let type: string | undefined = md.type;
  let recordId: string | undefined = md.recordId || md.record_id;
  if ((!type || !recordId) && typeof payment?.external_reference === "string") {
    const [t, id] = String(payment.external_reference).split(":");
    if (!type && t) type = t;
    if (!recordId && id) recordId = id;
  }
  return { type, recordId };
}

/** Aprobación fuerte, con relajación en sandbox si aún no está "accredited". */
function isApprovedStrong(opts: {
  payment: any;
  expectedAmount: number;
  expectedCurrency: string;
  expectedRef: string;
}) {
  const { payment, expectedAmount, expectedCurrency, expectedRef } = opts;
  const status: string = payment?.status;
  const statusDetail: string = payment?.status_detail || "";
  const currencyId: string = payment?.currency_id;
  const liveMode: boolean = Boolean(payment?.live_mode);
  const amountPaid = Number(
    payment?.transaction_amount ?? payment?.total_paid_amount ?? 0
  );
  const refOk = payment?.external_reference === expectedRef;

  const strong =
    status === "approved" &&
    statusDetail === "accredited" &&
    currencyId === expectedCurrency &&
    amountPaid === expectedAmount &&
    refOk;

  if (strong) return true;

  if (!liveMode) {
    const relaxed =
      status === "approved" &&
      currencyId === expectedCurrency &&
      amountPaid === expectedAmount &&
      refOk;
    return relaxed;
  }

  return false;
}

function sleep(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}

// ========================= MP fetchers con retry (SDK) =========================
async function sdkGetPayment(paymentId: string) {
  if (!mpClient) throw new Error("missing_token");
  const sdk = new Payment(mpClient);
  return sdk.get({ id: paymentId });
}

async function fetchPaymentWithRetry(paymentId: string) {
  // Hasta 10 intentos ~10s total (exponencial + jitter) para sandbox
  const attempts = 10;
  for (let i = 0; i < attempts; i++) {
    try {
      const p = await sdkGetPayment(paymentId);

      console.log("[webhook] payment fetched:", {
        id: p?.id,
        status: p?.status,
        status_detail: p?.status_detail,
        live_mode: p?.live_mode,
        collector_id: p?.collector_id,
        external_reference: p?.external_reference,
        transaction_amount: p?.transaction_amount,
        currency_id: p?.currency_id,
      });
      return p as any;
    } catch (e: any) {
      const msg = String(e?.message || e);
      const wait =
        Math.min(1000 * Math.pow(1.25, i), 2000) + Math.random() * 150;

      // El SDK mapea 404 como error; reintentamos
      if (
        msg.includes("404") ||
        msg.includes("Not Found") ||
        msg.includes("network")
      ) {
        console.warn(
          `[webhook] Payment.get retry ${i + 1}/${attempts} (${msg})`
        );
        await sleep(wait);
        continue;
      }

      console.error("[webhook] Payment.get fallo no-retriable:", msg);
      throw e;
    }
  }
  throw new Error("payment_not_found_after_retries");
}

async function fetchMerchantOrder(orderId: string) {
  if (!mpClient) throw new Error("missing_token");
  const mo = new MerchantOrder(mpClient);
  // El SDK recibe { merchantOrderId: number }
  const order = await mo.get({ merchantOrderId: Number(orderId) });
  console.log("[webhook] merchant_order fetched:", {
    id: order?.id,
    total_amount: order?.total_amount,
    paid_amount: order?.paid_amount,
    external_reference: order?.external_reference,
    payments: (order?.payments || []).map((p: any) => ({
      id: p?.id,
      status: p?.status,
    })),
  });
  return order as any;
}

/* ====== Diagnóstico opcional: dueño del token (útil si el 404 es por token equivocado) ====== */
let cachedTokenOwner: any | null = null;
async function getTokenOwner() {
  if (cachedTokenOwner || !MP_TOKEN) return cachedTokenOwner;
  try {
    const r = await fetch("https://api.mercadolibre.com/users/me", {
      headers: { Authorization: `Bearer ${MP_TOKEN}` },
      cache: "no-store",
    });
    if (r.ok) {
      cachedTokenOwner = await r.json();
      console.log("[webhook] token owner:", {
        id: cachedTokenOwner?.id,
        nickname: cachedTokenOwner?.nickname,
        site_id: cachedTokenOwner?.site_id,
      });
    }
  } catch {}
  return cachedTokenOwner;
}

// ========================= Persistencia =========================
async function getExpectedAmount(
  type: "vip-table" | "ticket",
  recordId: string
) {
  if (type === "vip-table") {
    const rec = await prisma.tableReservation.findUnique({
      where: { id: recordId },
      select: { totalPrice: true },
    });
    return Number(rec?.totalPrice ?? 0);
  } else {
    const rec = await prisma.ticket.findUnique({
      where: { id: recordId },
      select: { totalPrice: true },
    });
    return Number(rec?.totalPrice ?? 0);
  }
}
async function getPrevStatus(type: "vip-table" | "ticket", recordId: string) {
  if (type === "vip-table") {
    const prev = await prisma.tableReservation.findUnique({
      where: { id: recordId },
      select: { paymentStatus: true },
    });
    return (prev?.paymentStatus as string) ?? null;
  } else {
    const prev = await prisma.ticket.findUnique({
      where: { id: recordId },
      select: { paymentStatus: true },
    });
    return (prev?.paymentStatus as string) ?? null;
  }
}
async function persistStatus(
  type: "vip-table" | "ticket",
  recordId: string,
  data: any,
  approvedStrong: boolean
) {
  await prisma.$transaction(async (tx) => {
    const baseUpdate = {
      paymentId: String(data?.id ?? ""),
      paymentStatus: String(data?.status ?? "pending") as any,
    };
    if (approvedStrong) {
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      if (type === "vip-table") {
        await tx.tableReservation.update({
          where: { id: recordId },
          data: { ...baseUpdate, validationCode: code },
        });
      } else {
        await tx.ticket.update({
          where: { id: recordId },
          data: { ...baseUpdate, validationCode: code },
        });
      }
    } else {
      if (type === "vip-table") {
        await tx.tableReservation.update({
          where: { id: recordId },
          data: baseUpdate,
        });
      } else {
        await tx.ticket.update({ where: { id: recordId }, data: baseUpdate });
      }
    }
  });
}
async function sendConfirmation(
  type: "vip-table" | "ticket",
  recordId: string
) {
  try {
    await fetch(
      `${process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"}/api/send-confirmation`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, recordId }),
      }
    );
  } catch (e) {
    console.error("[webhook] Error enviando email/QR:", e);
  }
}

// ========================= Núcleo: procesar pago =========================
async function processPaymentById(paymentId: string) {
  if (!MP_TOKEN || !mpClient) throw new Error("missing_token");

  // Info opcional del dueño del token (ayuda con 404 por token/cuenta equivocada)
  getTokenOwner().catch(() => {});

  const payment = await fetchPaymentWithRetry(paymentId);

  const { type, recordId } = extractRecordRef(payment);
  if (!type || !recordId) {
    console.warn("[webhook] pago sin type/recordId válido. Ignoro.", {
      external_reference: payment?.external_reference,
      metadata: payment?.metadata,
    });
    return { ok: true, ignored: true };
  }
  if (type !== "vip-table" && type !== "ticket") {
    console.warn("[webhook] tipo no soportado:", type);
    return { ok: true, ignored: true };
  }

  const expectedAmount = await getExpectedAmount(type, recordId);
  const approvedStrong = isApprovedStrong({
    payment,
    expectedAmount,
    expectedCurrency: EXPECTED_CURRENCY,
    expectedRef: `${type}:${recordId}`,
  });

  const prevStatus = await getPrevStatus(type, recordId);
  await persistStatus(type, recordId, payment, approvedStrong);

  if (approvedStrong && prevStatus !== "approved") {
    await sendConfirmation(type, recordId);
  }

  return { ok: true, approvedStrong, status: payment?.status, id: payment?.id };
}

// ========================= Handlers =========================

// GET: soporte IPN legacy (topic=id en query) y healthcheck
export async function GET(req: NextRequest) {
  try {
    const topic = req.nextUrl.searchParams.get("topic");
    const id = req.nextUrl.searchParams.get("id");

    if (topic === "payment" && id) {
      console.log("[webhook][GET] topic=payment id=", id);
      const out = await processPaymentById(String(id));
      return NextResponse.json(out);
    }

    if (topic === "merchant_order" && id) {
      console.log("[webhook][GET] topic=merchant_order id=", id);
      const order = await fetchMerchantOrder(String(id));
      const payments: Array<{ id: number }> = order?.payments || [];
      if (!payments.length) {
        console.warn(
          "[webhook] merchant_order sin pagos aún; MP volverá a notificar."
        );
        return NextResponse.json({ ok: true, payments: 0 });
      }
      for (const p of payments) {
        await processPaymentById(String(p.id));
      }
      return NextResponse.json({ ok: true, payments: payments.length });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[webhook][GET] error:", e);
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}

// POST: webhook “nuevo” (payment.created, payment.updated, etc.)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    console.log("[webhook] MP recibido:", body);

    // Firma opcional (desactivada si no seteás MP_WEBHOOK_SECRET)
    const trusted = await isValidFromMercadoPago(req, body);
    if (!trusted) {
      console.warn(
        "[webhook] Firma inválida o no coincide con MP_WEBHOOK_SECRET"
      );
      return NextResponse.json({ ok: false }, { status: 401 });
    }

    // Formato nuevo
    if (body?.type === "payment" && body?.data?.id) {
      try {
        const out = await processPaymentById(String(body.data.id));
        return NextResponse.json(out);
      } catch (e: any) {
        if (String(e?.message) === "payment_not_found_after_retries") {
          console.warn(
            "[webhook] payment 404 persistente; devuelvo 202, esperar próximo retry."
          );
          return NextResponse.json(
            { ok: false, retry_later: true },
            { status: 202 }
          );
        }
        throw e;
      }
    }

    // Formato merchant_order (a veces llega primero)
    if (
      (body?.topic === "merchant_order" || body?.type === "merchant_order") &&
      body?.resource
    ) {
      const match = String(body.resource).match(/merchant_orders\/(\d+)/);
      const orderId = match?.[1];
      if (orderId) {
        const order = await fetchMerchantOrder(orderId);
        const payments: Array<{ id: number }> = order?.payments || [];
        if (!payments.length) {
          console.warn(
            "[webhook] merchant_order sin pagos aún; MP volverá a notificar."
          );
          return NextResponse.json({ ok: true, payments: 0 });
        }
        for (const p of payments) {
          await processPaymentById(String(p.id));
        }
        return NextResponse.json({ ok: true, payments: payments.length });
      }
    }

    // IPN legacy (algunos envían query en POST)
    const urlParams = req.nextUrl.searchParams;
    const topic = urlParams.get("topic");
    const id = urlParams.get("data.id") || urlParams.get("id");
    if (topic === "payment" && id) {
      try {
        const out = await processPaymentById(String(id));
        return NextResponse.json(out);
      } catch (e: any) {
        if (String(e?.message) === "payment_not_found_after_retries") {
          return NextResponse.json(
            { ok: false, retry_later: true },
            { status: 202 }
          );
        }
        throw e;
      }
    }
    if (topic === "merchant_order" && id) {
      const order = await fetchMerchantOrder(String(id));
      const payments: Array<{ id: number }> = order?.payments || [];
      for (const p of payments) {
        await processPaymentById(String(p.id));
      }
      return NextResponse.json({ ok: true, payments: payments.length });
    }

    return NextResponse.json({ ignored: true });
  } catch (error) {
    console.error("Error procesando webhook:", error);
    return NextResponse.json(
      { error: "Error procesando webhook" },
      { status: 500 }
    );
  }
}

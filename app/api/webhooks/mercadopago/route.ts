// app/api/webhooks/mercadopago/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";
import { MercadoPagoConfig, Payment, MerchantOrder } from "mercadopago";
import { Prisma, PaymentStatus } from "@prisma/client";
import {
  ensureSixDigitCode,
  normalizeSixDigitCode,
} from "@/lib/validation-code";

type Tx = Prisma.TransactionClient;

const EXPECTED_CURRENCY = "ARS";

/* ========================= MP SDK client ========================= */
const MP_TOKEN =
  process.env.MERCADO_PAGO_ACCESS_TOKEN || process.env.MP_ACCESS_TOKEN;

const mpClient = MP_TOKEN
  ? new MercadoPagoConfig({ accessToken: MP_TOKEN, options: { timeout: 5000 } })
  : null;

/* ========================= Firma (opcional) ========================= */
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
    `${requestId}:{ts}:${paymentId}`,
  ];
  return bases.map((b) => hmac(secret, b));
}
async function isValidFromMercadoPago(req: NextRequest, body: any) {
  const sig = parseXSignature(req.headers.get("x-signature"));
  const requestId = req.headers.get("x-request-id") || "";
  const secret = process.env.MP_WEBHOOK_SECRET || "";
  if (!secret) return true; // en dev no bloqueamos
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

/* ========================= Utilidades ========================= */

function extractRecordRef(payment: any): {
  type?: "ticket";
  recordId?: string;
} {
  const md = payment?.metadata || {};
  let metaType: any = md.type; // esperamos "ticket"
  let recordId: string | undefined = md.recordId || md.record_id;

  // compat: antes usábamos tableReservationId o external_reference vip-table-res:<id>
  if (!recordId) recordId = md.tableReservationId;
  if (
    (!metaType || !recordId) &&
    typeof payment?.external_reference === "string"
  ) {
    const [t, id] = String(payment.external_reference).split(":");
    if (!metaType && t) metaType = t;
    if (!recordId && id) recordId = id;
  }

  // normalización legacy -> siempre devolvemos "ticket"
  if (metaType === "vip-table" || metaType === "vip-table-res")
    metaType = "ticket";

  if (metaType !== "ticket" || !recordId) return {};
  return { type: "ticket", recordId };
}

function nearlyEqual(a: number, b: number, eps = 0.01) {
  return Math.abs(a - b) <= eps;
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
  const refOk = String(payment?.external_reference || "") === expectedRef;

  const strong =
    status === "approved" &&
    statusDetail === "accredited" &&
    currencyId === expectedCurrency &&
    nearlyEqual(amountPaid, expectedAmount) &&
    refOk;

  if (strong) return true;

  // Relajar en SANDBOX
  if (!liveMode) {
    const relaxed =
      status === "approved" &&
      currencyId === expectedCurrency &&
      nearlyEqual(amountPaid, expectedAmount) &&
      refOk;
    return relaxed;
  }

  return false;
}

function sleep(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}

/* ========================= MP fetchers con retry (SDK) ========================= */
async function sdkGetPayment(paymentId: string) {
  if (!mpClient) throw new Error("missing_token");
  const sdk = new Payment(mpClient);
  return sdk.get({ id: paymentId });
}

async function fetchPaymentWithRetry(paymentId: string) {
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

/* ========================= Persistencia (BD) ========================= */
async function getExpectedAmount(recordId: string) {
  const rec = await prisma.ticket.findUnique({
    where: { id: recordId },
    select: { totalPrice: true },
  });
  return Number(rec?.totalPrice ?? 0);
}

async function getPrevPaymentInfo(recordId: string) {
  return prisma.ticket.findUnique({
    where: { id: recordId },
    select: { paymentId: true, paymentStatus: true },
  });
}

/**
 * Ajusta soldCount en VipTableConfig por transición de estado de un Ticket VIP:
 * +vipTables al pasar a approved por primera vez
 * -vipTables al pasar de approved -> refunded/cancelled/charged_back
 * (con clamp 0..stockLimit)
 */
async function adjustVipSoldCountByTransition(
  tx: Tx,
  ticketId: string,
  opts: { fromApproved: boolean; toApproved: boolean }
) {
  const { fromApproved, toApproved } = opts;
  if (fromApproved === toApproved) return;

  // Datos del ticket VIP
  const t = await tx.ticket.findUnique({
    where: { id: ticketId },
    select: {
      ticketType: true,
      eventId: true,
      vipLocation: true,
      vipTables: true,
    },
  });
  if (!t || t.ticketType !== "vip" || !t.vipLocation) return;

  const tables = Math.max(1, Number(t.vipTables || 1));
  // Buscar config por (eventId, location)
  const cfg = await tx.vipTableConfig.findUnique({
    where: {
      eventId_location: { eventId: t.eventId, location: t.vipLocation },
    },
    select: { id: true, soldCount: true, stockLimit: true },
  });
  if (!cfg) return;

  const delta = toApproved && !fromApproved ? +tables : -tables;
  const next = Math.max(0, Math.min(cfg.stockLimit, cfg.soldCount + delta));

  if (next !== cfg.soldCount) {
    await tx.vipTableConfig.update({
      where: { id: cfg.id },
      data: { soldCount: next },
    });
  }
}

/**
 * Persistir estado de pago para Ticket.
 * - Actualiza paymentId, paymentStatus, paymentMethod="mercadopago".
 * - Si queda aprobado fuerte, asegura validationCode (idempotente).
 * - Si el ticket es VIP, ajusta soldCount en VipTableConfig según transición.
 * - Devuelve el validationCode (si quedó aprobado) para log/debug.
 */
async function persistStatus(
  recordId: string,
  payment: any,
  approvedStrong: boolean,
  prevStatus: PaymentStatus | string | null
) {
  return prisma.$transaction(async (tx: Tx) => {
    const newStatus = String(payment?.status ?? "pending") as PaymentStatus;

    await tx.ticket.update({
      where: { id: recordId },
      data: {
        paymentId: String(payment?.id ?? ""),
        paymentStatus: newStatus as any,
        paymentMethod: "mercadopago",
      },
    });

    // Transición de stock si es VIP
    const wasApproved = String(prevStatus) === "approved";
    const isApprovedNow = approvedStrong && newStatus === "approved";
    await adjustVipSoldCountByTransition(tx, recordId, {
      fromApproved: wasApproved,
      toApproved: isApprovedNow,
    });

    // Código de validación si quedó aprobado
    if (isApprovedNow) {
      await ensureSixDigitCode(tx, { type: "ticket", id: recordId });
    }

    const t = await tx.ticket.findUnique({
      where: { id: recordId },
      select: { validationCode: true },
    });
    return normalizeSixDigitCode(t?.validationCode);
  });
}

async function sendConfirmation(recordId: string) {
  try {
    const base = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
    await fetch(`${base.replace(/\/+$/, "")}/api/send-confirmation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "ticket", recordId }),
      cache: "no-store",
    });
  } catch (e) {
    console.error("[webhook] Error enviando email/QR:", e);
  }
}

/* ========================= Core ========================= */
async function processPaymentById(paymentId: string) {
  if (!MP_TOKEN || !mpClient) throw new Error("missing_token");

  const payment = await fetchPaymentWithRetry(paymentId);

  const { type, recordId } = extractRecordRef(payment);
  if (type !== "ticket" || !recordId) {
    console.warn("[webhook] pago sin type/recordId válido. Ignoro.", {
      external_reference: payment?.external_reference,
      metadata: payment?.metadata,
    });
    return { ok: true, ignored: true };
  }

  const expectedAmount = await getExpectedAmount(recordId);
  const approvedStrong = isApprovedStrong({
    payment,
    expectedAmount,
    expectedCurrency: EXPECTED_CURRENCY,
    expectedRef: `ticket:${recordId}`,
  });

  // Idempotencia: si no cambia, salir
  const prevInfo = await getPrevPaymentInfo(recordId);
  const prevStatus = (prevInfo?.paymentStatus as string) ?? null;
  const prevPaymentId = prevInfo?.paymentId || null;

  const newStatus = String(payment?.status ?? "pending") as PaymentStatus;
  if (prevPaymentId === String(payment?.id || "") && prevStatus === newStatus) {
    return { ok: true, idempotent: true, status: newStatus, id: payment?.id };
  }

  const validationCode = await persistStatus(
    recordId,
    payment,
    approvedStrong,
    prevStatus
  );

  const wasApprovedBefore = String(prevStatus) === "approved";
  const isApprovedNow = approvedStrong && newStatus === "approved";
  if (!wasApprovedBefore && isApprovedNow) {
    await sendConfirmation(recordId);
  }

  return {
    ok: true,
    approvedStrong,
    status: newStatus,
    id: payment?.id,
    type,
    recordId,
    validationCode,
  };
}

/* ========================= Handlers ========================= */

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

    // Firma opcional
    const trusted = await isValidFromMercadoPago(req, body);
    if (!trusted) {
      console.warn(
        "[webhook] Firma inválida o no coincide con MP_WEBHOOK_SECRET"
      );
      return NextResponse.json({ ok: false }, { status: 401 });
    }

    // Formato nuevo (data.id de payment)
    if (body?.type === "payment" && body?.data?.id) {
      try {
        const out = await processPaymentById(String(body.data.id));
        return NextResponse.json(out);
      } catch (e: any) {
        if (String(e?.message) === "payment_not_found_after_retries") {
          console.warn(
            "[webhook] payment 404 persistente; devuelvo 202, retry luego."
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

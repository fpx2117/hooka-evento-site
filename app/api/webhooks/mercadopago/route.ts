// app/api/webhooks/mercadopago/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { MercadoPagoConfig, Payment, MerchantOrder } from "mercadopago";
import { prisma } from "@/lib/prisma";
import { Prisma, PaymentStatus } from "@prisma/client";
import {
  ensureSixDigitCode,
  normalizeSixDigitCode,
} from "@/lib/validation-code";

/* -------------------------- Tipos y constantes -------------------------- */
type Tx = Prisma.TransactionClient;
const EXPECTED_CURRENCY = "ARS";

/* ------------------------- Mercado Pago SDK setup ------------------------ */
const MP_TOKEN =
  process.env.MERCADO_PAGO_ACCESS_TOKEN || process.env.MP_ACCESS_TOKEN;

const mpClient = MP_TOKEN
  ? new MercadoPagoConfig({ accessToken: MP_TOKEN, options: { timeout: 5000 } })
  : null;

/* -------------------------- Validación de firma -------------------------- */
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
  ];
  return bases.map((b) => hmac(secret, b));
}

async function isValidFromMercadoPago(req: NextRequest, body: any) {
  const sig = parseXSignature(req.headers.get("x-signature"));
  const requestId = req.headers.get("x-request-id") || "";
  const secret = process.env.MP_WEBHOOK_SECRET || "";
  if (!secret) return true; // si no hay secret, aceptar (opcional)
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

/* ----------------------------- Utilidades ----------------------------- */
function nearlyEqual(a: number, b: number, eps = 0.01) {
  return Math.abs(a - b) <= eps;
}

/** Extrae referencia del pago (metadata/external_reference) */
function extractRecordRef(payment: any): {
  type?: "ticket";
  recordId?: string;
} {
  const md = payment?.metadata || {};
  let metaType: any = md.type;
  let recordId: string | undefined = md.recordId || md.record_id;

  // legacy compat
  if (!recordId) recordId = md.tableReservationId;

  if (
    (!metaType || !recordId) &&
    typeof payment?.external_reference === "string"
  ) {
    const [t, id] = String(payment.external_reference).split(":");
    if (!metaType && t) metaType = t;
    if (!recordId && id) recordId = id;
  }

  // normalizamos cualquier "vip-table" a "ticket"
  if (metaType === "vip-table" || metaType === "vip-table-res") metaType = "ticket";
  if (metaType !== "ticket" || !recordId) return {};
  return { type: "ticket", recordId };
}

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

  // en sandbox aflojamos un poco
  if (!liveMode) {
    return (
      status === "approved" &&
      currencyId === expectedCurrency &&
      nearlyEqual(amountPaid, expectedAmount) &&
      refOk
    );
  }
  return false;
}

function sleep(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}

/* ----------------------------- SDK helpers ----------------------------- */
async function sdkGetPayment(paymentId: string) {
  if (!mpClient) throw new Error("missing_token");
  const sdk = new Payment(mpClient);
  return sdk.get({ id: paymentId });
}

async function fetchPaymentWithRetry(paymentId: string) {
  const attempts = 8;
  for (let i = 0; i < attempts; i++) {
    try {
      const p = await sdkGetPayment(paymentId);
      console.log("[webhook] payment:", {
        id: p?.id,
        status: p?.status,
        status_detail: p?.status_detail,
        external_reference: p?.external_reference,
        amount: p?.transaction_amount,
        currency: p?.currency_id,
        live_mode: p?.live_mode,
      });
      return p as any;
    } catch (e: any) {
      const msg = String(e?.message || e);
      if (msg.includes("404") || msg.includes("Not Found")) {
        await sleep(400 + i * 200);
        continue;
      }
      console.error("[webhook] Payment.get error:", msg);
      throw e;
    }
  }
  throw new Error("payment_not_found_after_retries");
}

async function fetchMerchantOrder(orderId: string) {
  if (!mpClient) throw new Error("missing_token");
  const mo = new MerchantOrder(mpClient);
  const order = await mo.get({ merchantOrderId: Number(orderId) });
  console.log("[webhook] merchant_order:", {
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

/* -------------------------- Persistencia / DB -------------------------- */
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
 * Ajusta soldCount de VipTableConfig si el Ticket VIP pasa
 * de NO aprobado → aprobado (sumar 1) o de aprobado → revertido (restar 1).
 * Usa las relaciones correctas del schema:
 * Ticket.vipTable -> VipTable.vipTableConfig (+ vipLocation)
 */
async function adjustVipSoldCountByTransition(
  tx: Tx,
  ticketId: string,
  opts: { fromApproved: boolean; toApproved: boolean }
) {
  const { fromApproved, toApproved } = opts;
  if (fromApproved === toApproved) return;

  const t = await tx.ticket.findUnique({
    where: { id: ticketId },
    select: {
      id: true,
      ticketType: true,
      eventId: true,
      vipTableId: true,
      vipTable: {
        select: {
          id: true,
          tableNumber: true,
          vipLocation: { select: { id: true, name: true } },
          vipTableConfig: {
            select: { id: true, soldCount: true, stockLimit: true },
          },
        },
      },
    },
  });

  if (!t || t.ticketType !== "vip" || !t.vipTable) return;

  const cfg = t.vipTable.vipTableConfig;
  if (!cfg) return; // si no hay config vinculada a la mesa, no hay nada que ajustar

  const delta = toApproved && !fromApproved ? 1 : -1;
  const next = Math.max(0, Math.min(cfg.stockLimit, cfg.soldCount + delta));

  if (next !== cfg.soldCount) {
    await tx.vipTableConfig.update({
      where: { id: cfg.id },
      data: { soldCount: next },
    });
  }

  // Aviso de posible doble asignación de mesa (no bloquea, solo log)
  if (t.vipTable.tableNumber && toApproved) {
    const already = await tx.ticket.findFirst({
      where: {
        eventId: t.eventId,
        ticketType: "vip",
        paymentStatus: "approved",
        vipTableId: { not: t.vipTableId },
      },
      select: { id: true },
    });
    if (already) {
      console.warn(
        `[VIP] Mesa #${t.vipTable.tableNumber} (${t.vipTable.vipLocation.name}) ya aparece ocupada por ticket ${already.id}.`
      );
    }
  }
}

/**
 * Guarda el nuevo estado del pago, ajusta soldCount si corresponde
 * y asegura el validationCode cuando queda aprobado.
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
        paymentStatus: newStatus,
        paymentMethod: "mercadopago",
      },
    });

    const wasApproved = String(prevStatus) === "approved";
    const isApprovedNow = approvedStrong && newStatus === "approved";

    await adjustVipSoldCountByTransition(tx, recordId, {
      fromApproved: wasApproved,
      toApproved: isApprovedNow,
    });

    if (isApprovedNow) {
      await ensureSixDigitCode(tx, { id: recordId });

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
    const base = (
      process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"
    ).replace(/\/+$/, "");
    await fetch(`${base}/api/send-confirmation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "ticket", recordId }),
      cache: "no-store",
    });
  } catch (e) {
    console.error("[webhook] Error enviando email/QR:", e);
  }
}

/* --------------------------------- Core --------------------------------- */
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

/* -------------------------------- Handlers ------------------------------- */
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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    console.log("[webhook] MP recibido:", body);

    const trusted = await isValidFromMercadoPago(req, body);
    if (!trusted) {
      console.warn(
        "[webhook] Firma inválida o no coincide con MP_WEBHOOK_SECRET"
      );
      return NextResponse.json({ ok: false }, { status: 401 });
    }

    // payload moderno de MP
    if (body?.type === "payment" && body?.data?.id) {
      try {
        const out = await processPaymentById(String(body.data.id));
        return NextResponse.json(out);
      } catch (e: any) {
        if (String(e?.message) === "payment_not_found_after_retries") {
          console.warn("[webhook] payment 404 persistente; retry luego.");
          return NextResponse.json(
            { ok: false, retry_later: true },
            { status: 202 }
          );
        }
        throw e;
      }
    }

    // merchant_order con resource
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
          console.warn("[webhook] merchant_order sin pagos; retry.");
          return NextResponse.json({ ok: true, payments: 0 });
        }
        for (const p of payments) {
          await processPaymentById(String(p.id));
        }
        return NextResponse.json({ ok: true, payments: payments.length });
      }
    }

    // compat por querystring (?topic=payment&id=...)
    const urlParams = req.nextUrl.searchParams;
    const topic = urlParams.get("topic");
    const id = urlParams.get("data.id") || urlParams.get("id");
    if (topic === "payment" && id) {
      const out = await processPaymentById(String(id));
      return NextResponse.json(out);
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
    console.error("[webhook][POST] error:", error);
    return NextResponse.json(
      { error: "Error procesando webhook" },
      { status: 500 }
    );
  }
}

// app/api/payments/confirm/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  normalizeSixDigitCode,
  ensureSixDigitCode,
} from "@/lib/validation-code";
import { PaymentStatus } from "@prisma/client";
import type { Prisma, PrismaClient } from "@prisma/client";

/* ========================= Tipos DB compatibles ========================= */
type DB = Prisma.TransactionClient | PrismaClient;

const EXPECTED_CURRENCY = "ARS";

/* ========================= Helpers ========================= */

function nearlyEqual(a: number, b: number, eps = 0.01) {
  return Math.abs(a - b) <= eps;
}

function isApprovedStrongOrSandbox(opts: {
  payment: any;
  expectedAmount: number;
  expectedCurrency: string;
  expectedRefs: string[];
}) {
  const { payment, expectedAmount, expectedCurrency, expectedRefs } = opts;

  const status: string = payment?.status;
  const statusDetail: string = payment?.status_detail || "";
  const currencyId: string = payment?.currency_id;
  const liveMode: boolean = Boolean(payment?.live_mode);
  const amountPaid = Number(
    payment?.transaction_amount ?? payment?.total_paid_amount ?? 0
  );
  const extRef = String(payment?.external_reference || "");
  const refOk = expectedRefs.some((r) => r === extRef);

  const strong =
    status === "approved" &&
    statusDetail === "accredited" &&
    currencyId === expectedCurrency &&
    nearlyEqual(amountPaid, expectedAmount) &&
    refOk;

  if (strong) return true;

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

/* ========================= Fetchers Mercado Pago ========================= */

async function fetchPaymentWithRetry(paymentId: string, token: string) {
  const url = `https://api.mercadopago.com/v1/payments/${paymentId}`;
  const attempts = 10;

  for (let i = 0; i < attempts; i++) {
    const r = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (r.ok) {
      const p = await r.json();
      console.log("[payments/confirm] payment fetched:", {
        id: p?.id,
        status: p?.status,
        status_detail: p?.status_detail,
        live_mode: p?.live_mode,
        external_reference: p?.external_reference,
        transaction_amount: p?.transaction_amount,
      });
      return p;
    }
    if (r.status === 404 || r.status >= 500) {
      const wait =
        Math.min(1000 * Math.pow(1.25, i), 2000) + Math.random() * 150;
      console.warn(`[payments/confirm] retry ${i + 1}/${attempts}`);
      await sleep(wait);
      continue;
    }
    throw new Error(`payment_fetch_${r.status}`);
  }
  throw new Error("payment_not_found_after_retries");
}

async function fetchMerchantOrder(orderId: string, token: string) {
  const url = `https://api.mercadopago.com/merchant_orders/${orderId}`;
  const r = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`merchant_order_${r.status}`);
  return r.json();
}

async function fetchMerchantOrderByPreferenceId(
  preferenceId: string,
  token: string
) {
  const url = `https://api.mercadopago.com/merchant_orders?preference_id=${encodeURIComponent(
    preferenceId
  )}`;
  const r = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`merchant_orders_by_pref_${r.status}`);
  const data = await r.json();
  return Array.isArray(data?.elements) ? data.elements[0] : null;
}

/* ========================= Utilidades ========================= */

function extractRecordRef(payment: any) {
  const md = payment?.metadata || {};
  let rawType: any = md.type;
  let recordId: string | undefined = md.recordId || md.record_id;

  if (!rawType && md.tableReservationId) rawType = "vip-table";

  if ((!rawType || !recordId) && typeof payment?.external_reference === "string") {
    const [t, id] = String(payment.external_reference).split(":");
    if (!rawType && t) rawType = t;
    if (!recordId && id) recordId = id;
  }

  return { rawType, recordId };
}

async function getExpectedAmount(recordId: string) {
  const rec = await prisma.ticket.findUnique({
    where: { id: recordId },
    select: { totalPrice: true },
  });
  return Number(rec?.totalPrice ?? 0);
}

async function getPrevStatus(recordId: string) {
  const rec = await prisma.ticket.findUnique({
    where: { id: recordId },
    select: { paymentStatus: true },
  });
  return rec?.paymentStatus ?? null;
}

/**
 * Ajusta soldCount en VipTableConfig a partir de un Ticket VIP.
 * Usa vipTableId → vipTable → vipTableConfig.
 */
async function adjustVipSoldCountFromTicket(
  db: DB,
  ticketId: string,
  opts: { delta: number }
) {
  const { delta } = opts;
  const t = await db.ticket.findUnique({
    where: { id: ticketId },
    select: {
      ticketType: true,
      vipTableId: true,
      vipTable: {
        select: {
          vipTableConfigId: true,
          vipTableConfig: {
            select: { id: true, soldCount: true, stockLimit: true },
          },
        },
      },
    },
  });

  if (!t || t.ticketType !== "vip" || !t.vipTable?.vipTableConfig) return;

  const cfg = t.vipTable.vipTableConfig;
  const next = Math.max(0, Math.min(cfg.stockLimit, cfg.soldCount + delta));
  if (next !== cfg.soldCount) {
    await db.vipTableConfig.update({
      where: { id: cfg.id },
      data: { soldCount: next },
    });
  }
}

/* ========================= Core ========================= */

async function processPaymentById(paymentId: string) {
  const MP_TOKEN = process.env.MERCADO_PAGO_ACCESS_TOKEN;
  if (!MP_TOKEN) throw new Error("missing_token");

  const payment = await fetchPaymentWithRetry(paymentId, MP_TOKEN);

  const { recordId } = extractRecordRef(payment);
  if (!recordId) {
    return { ok: false, error: "Sin recordId en metadata/external_reference" };
  }

  const expectedRefs = [
    `ticket:${recordId}`,
    `vip-table:${recordId}`,
    `vip-table-res:${recordId}`,
  ];

  const expectedAmount = await getExpectedAmount(recordId);
  const approvedStrong = isApprovedStrongOrSandbox({
    payment,
    expectedAmount,
    expectedCurrency: EXPECTED_CURRENCY,
    expectedRefs,
  });

  const prevStatus = await getPrevStatus(recordId);
  const newStatus = String(payment?.status ?? "pending") as PaymentStatus;

  const validation = await prisma.$transaction(async (tx) => {
    await tx.ticket.update({
      where: { id: recordId },
      data: {
        paymentId: String(payment?.id ?? ""),
        paymentStatus: newStatus,
        paymentMethod: "mercadopago",
      },
    });

    const wasApproved = prevStatus === "approved";
    const nowApproved = approvedStrong && newStatus === "approved";

    if (!wasApproved && nowApproved) {
      await adjustVipSoldCountFromTicket(tx, recordId, { delta: +1 });
    } else if (
      wasApproved &&
      ["refunded", "cancelled", "charged_back"].includes(newStatus)
    ) {
      await adjustVipSoldCountFromTicket(tx, recordId, { delta: -1 });
    }

    if (nowApproved) {
      await ensureSixDigitCode(tx as any, { id: recordId });
    }

    const t = await tx.ticket.findUnique({
      where: { id: recordId },
      select: { validationCode: true, ticketType: true },
    });
    return t?.validationCode ?? null;
  });

  return {
    ok: true,
    approvedStrong,
    status: payment?.status,
    status_detail: payment?.status_detail,
    id: payment?.id,
    recordId,
    prevStatus,
    validationCode: normalizeSixDigitCode(validation),
  };
}

/* ========================= Handler ========================= */

export async function GET(req: NextRequest) {
  try {
    const mpToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
    if (!mpToken) {
      return NextResponse.json(
        { ok: false, error: "Falta MERCADO_PAGO_ACCESS_TOKEN" },
        { status: 500 }
      );
    }

    const sp = req.nextUrl.searchParams;
    const paymentId =
      sp.get("payment_id") || sp.get("id") || sp.get("collection_id");

    if (paymentId) {
      try {
        const out = await processPaymentById(String(paymentId));
        return NextResponse.json(out, { status: 200 });
      } catch (e: any) {
        if (String(e?.message) === "payment_not_found_after_retries") {
          return NextResponse.json(
            {
              ok: false,
              retry_later: true,
              hint: "payment not visible yet, try again shortly",
            },
            { status: 202 }
          );
        }
        throw e;
      }
    }

    const merchantOrderId =
      sp.get("merchant_order_id") || sp.get("order_id");
    if (merchantOrderId) {
      const order = await fetchMerchantOrder(String(merchantOrderId), mpToken);
      const payments: Array<{ id: number }> = order?.payments || [];
      if (!payments.length)
        return NextResponse.json({ ok: true, payments: 0 });

      const results = [];
      for (const p of payments) results.push(await processPaymentById(String(p.id)));
      return NextResponse.json({ ok: true, from: "merchant_order", payments: results });
    }

    const preferenceId = sp.get("preference_id");
    if (preferenceId) {
      const order = await fetchMerchantOrderByPreferenceId(
        String(preferenceId),
        mpToken
      );
      if (!order)
        return NextResponse.json(
          { ok: false, error: "Orden no encontrada" },
          { status: 404 }
        );

      const payments: Array<{ id: number }> = order?.payments || [];
      if (!payments.length)
        return NextResponse.json({ ok: true, payments: 0 });

      const results = [];
      for (const p of payments) results.push(await processPaymentById(String(p.id)));
      return NextResponse.json({ ok: true, from: "preference_id", payments: results });
    }

    return NextResponse.json(
      { ok: false, error: "Falta payment_id, merchant_order_id o preference_id" },
      { status: 400 }
    );
  } catch (e: any) {
    console.error("[payments/confirm] error:", e);
    return NextResponse.json(
      { ok: false, error: String(e?.message || e) },
      { status: 500 }
    );
  }
}

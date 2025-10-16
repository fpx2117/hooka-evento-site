// app/api/payments/confirm/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  normalizeSixDigitCode,
  ensureSixDigitCode,
} from "@/lib/validation-code";
import { PaymentStatus, TicketType } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";

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
  expectedRefs: string[]; // <- múltiples refs posibles (compat)
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

/* ========================= Fetchers MP ========================= */

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
        collector_id: p?.collector_id,
        external_reference: p?.external_reference,
        transaction_amount: p?.transaction_amount,
        currency_id: p?.currency_id,
      });
      return p;
    }
    const text = await r.text().catch(() => "");
    if (r.status === 404 || r.status >= 500) {
      const wait =
        Math.min(1000 * Math.pow(1.25, i), 2000) + Math.random() * 150;
      console.warn(
        `[payments/confirm] GET payment retry ${i + 1}/${attempts} (${r.status})`,
        text
      );
      await sleep(wait);
      continue;
    }
    throw new Error(`payment_fetch_${r.status}:${text}`);
  }
  throw new Error("payment_not_found_after_retries");
}

async function fetchMerchantOrder(orderId: string, token: string) {
  const url = `https://api.mercadopago.com/merchant_orders/${orderId}`;
  const r = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`merchant_order_${r.status}:${t}`);
  }
  const order = await r.json();
  console.log("[payments/confirm] merchant_order fetched:", {
    id: order?.id,
    total_amount: order?.total_amount,
    paid_amount: order?.paid_amount,
    external_reference: order?.external_reference,
    payments: (order?.payments || []).map((p: any) => ({
      id: p?.id,
      status: p?.status,
    })),
  });
  return order;
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
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`merchant_orders_by_pref_${r.status}:${t}`);
  }
  const data = await r.json();
  const results = Array.isArray(data?.elements) ? data.elements : [];
  return results[0] || null;
}

/* ========================= Utilidades de dominio ========================= */

function extractRecordRef(payment: any): {
  // referencias legacy y nuevas
  rawType?: "vip-table" | "vip-table-res" | "ticket";
  recordId?: string;
} {
  const md = payment?.metadata || {};
  let rawType: any = md.type;
  let recordId: string | undefined = md.recordId || md.record_id;

  if (!rawType && md.tableReservationId) rawType = "vip-table";
  if (
    (!rawType || !recordId) &&
    typeof payment?.external_reference === "string"
  ) {
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
  return (rec?.paymentStatus as string) ?? null;
}

/**
 * Ajusta soldCount en VipTableConfig a partir de un Ticket VIP.
 * Usa (eventId, vipLocation) para resolver la config y suma/resta vipTables.
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
      eventId: true,
      vipLocation: true,
      vipTables: true,
    },
  });
  if (!t || t.ticketType !== "vip") return; // no aplica

  const tables = Math.max(1, Number(t.vipTables ?? 1));
  const tablesDelta = tables * delta;
  if (tablesDelta === 0) return;

  const cfg = await db.vipTableConfig.findUnique({
    where: {
      eventId_location: {
        eventId: t.eventId,
        location: t.vipLocation as any,
      },
    },
    select: { id: true, soldCount: true, stockLimit: true },
  });
  if (!cfg) throw new Error("vip_table_config_not_found_for_ticket");

  const next = Math.max(
    0,
    Math.min(cfg.stockLimit, cfg.soldCount + tablesDelta)
  );
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

  const { rawType, recordId } = extractRecordRef(payment);
  if (!recordId) {
    return { ok: false, error: "Sin recordId en metadata/external_reference" };
  }

  // Aceptamos refs legacy y nuevas para robustez
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

  // Transacción:
  // 1) update paymentId/status/method
  // 2) si es Ticket VIP, ajustar soldCount por transición de approved
  // 3) si approved => ensureSixDigitCode
  const validation = await prisma.$transaction(async (tx) => {
    // 1) actualizar ticket
    await tx.ticket.update({
      where: { id: recordId },
      data: {
        paymentId: String(payment?.id ?? ""),
        paymentStatus: newStatus as any,
        paymentMethod: "mercadopago",
      },
    });

    // 2) transición de stock VIP si corresponde
    const wasApproved = String(prevStatus) === "approved";
    const nowApproved = approvedStrong && newStatus === "approved";

    if (!wasApproved && nowApproved) {
      // de NO aprobado -> aprobado : +tables
      await adjustVipSoldCountFromTicket(tx, recordId, { delta: +1 });
    } else if (
      wasApproved &&
      (newStatus === "refunded" ||
        newStatus === "cancelled" ||
        newStatus === "charged_back")
    ) {
      // de aprobado -> revertido : -tables
      await adjustVipSoldCountFromTicket(tx, recordId, { delta: -1 });
    }

    // 3) generar código si quedó aprobado
    if (nowApproved) {
      await ensureSixDigitCode(tx as any, { type: "ticket", id: recordId });
    }

    const t = await tx.ticket.findUnique({
      where: { id: recordId },
      select: { validationCode: true, ticketType: true },
    });
    return t?.validationCode ?? null;
  });

  const validationCode = normalizeSixDigitCode(validation);
  const hasValidCode = !!validationCode;

  return {
    ok: true,
    approvedStrong,
    status: payment?.status,
    status_detail: payment?.status_detail,
    id: payment?.id,
    // devolvemos el tipo real del ticket para la UI
    ticketType:
      (
        await prisma.ticket.findUnique({
          where: { id: recordId },
          select: { ticketType: true },
        })
      )?.ticketType || null,
    recordId,
    prevStatus,
    hasValidCode,
    validationCode,
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

    // 1) payment_id (o aliases)
    const paymentId =
      sp.get("payment_id") || sp.get("id") || sp.get("collection_id");
    if (paymentId) {
      try {
        const out = await processPaymentById(String(paymentId));
        const status = (out as any)?.ok ? 200 : 400;
        return NextResponse.json(out, { status });
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

    // 2) merchant_order_id
    const merchantOrderId = sp.get("merchant_order_id") || sp.get("order_id");
    if (merchantOrderId) {
      const order = await fetchMerchantOrder(String(merchantOrderId), mpToken);
      const payments: Array<{ id: number }> = order?.payments || [];
      if (!payments.length) {
        return NextResponse.json({
          ok: true,
          payments: 0,
          note: "Orden sin pagos aún",
        });
      }
      const results = [];
      for (const p of payments) {
        results.push(await processPaymentById(String(p.id)));
      }
      return NextResponse.json({
        ok: true,
        from: "merchant_order",
        payments: results,
      });
    }

    // 3) preference_id -> merchant_orders?preference_id=...
    const preferenceId = sp.get("preference_id");
    if (preferenceId) {
      const order = await fetchMerchantOrderByPreferenceId(
        String(preferenceId),
        mpToken
      );
      if (!order) {
        return NextResponse.json(
          { ok: false, error: "Orden no encontrada para preference_id" },
          { status: 404 }
        );
      }
      const payments: Array<{ id: number }> = order?.payments || [];
      if (!payments.length) {
        return NextResponse.json({
          ok: true,
          payments: 0,
          note: "Orden sin pagos aún (por preference_id)",
        });
      }
      const results = [];
      for (const p of payments) {
        results.push(await processPaymentById(String(p.id)));
      }
      return NextResponse.json({
        ok: true,
        from: "preference_id",
        payments: results,
      });
    }

    return NextResponse.json(
      {
        ok: false,
        error: "Proveé payment_id, merchant_order_id o preference_id",
      },
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

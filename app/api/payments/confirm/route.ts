// app/api/payments/confirm/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
// Normalización y generador idempotente de códigos de validación
import {
  normalizeSixDigitCode,
  ensureSixDigitCode,
} from "@/lib/validation-code";
import { PaymentStatus } from "@prisma/client";
import type { Prisma } from "@prisma/client";

type Tx = Prisma.TransactionClient;

const EXPECTED_CURRENCY = "ARS";

/* ========================= Helpers ========================= */

function nearlyEqual(a: number, b: number, eps = 0.01) {
  return Math.abs(a - b) <= eps;
}

function isApprovedStrongOrSandbox(opts: {
  payment: any;
  expectedAmount: number;
  expectedCurrency: string;
  expectedRef: string;
}) {
  const { payment, expectedAmount, expectedCurrency, expectedRef } = opts;

  const status: string = payment?.status; // "approved" | "rejected" | ...
  const statusDetail: string = payment?.status_detail || ""; // "accredited" esperado
  const currencyId: string = payment?.currency_id;
  const liveMode: boolean = Boolean(payment?.live_mode);
  const amountPaid = Number(
    payment?.transaction_amount ?? payment?.total_paid_amount ?? 0
  );
  const refOk = String(payment?.external_reference || "") === expectedRef;

  // Aprobación fuerte (con tolerancia al redondeo)
  const strong =
    status === "approved" &&
    statusDetail === "accredited" &&
    currencyId === expectedCurrency &&
    nearlyEqual(amountPaid, expectedAmount) &&
    refOk;
  if (strong) return true;

  // Relaja criterios en sandbox
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

// preference_id -> merchant_orders
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
  type?: "vip-table" | "ticket";
  recordId?: string;
} {
  const md = payment?.metadata || {};
  let type: any = md.type;
  let recordId: string | undefined = md.recordId || md.record_id;

  if ((!type || !recordId) && typeof payment?.external_reference === "string") {
    const [t, id] = String(payment.external_reference).split(":");
    if (!type && t) type = t;
    if (!recordId && id) recordId = id;
  }
  return { type, recordId };
}

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
    const rec = await prisma.tableReservation.findUnique({
      where: { id: recordId },
      select: { paymentStatus: true },
    });
    return (rec?.paymentStatus as string) ?? null;
  } else {
    const rec = await prisma.ticket.findUnique({
      where: { id: recordId },
      select: { paymentStatus: true },
    });
    return (rec?.paymentStatus as string) ?? null;
  }
}

/**
 * Ajusta soldCount en VipTableConfig usando TableLocation.
 * - Si la reserva tiene vipTableConfigId, se usa directamente.
 * - Si no, se resuelve por (eventId, location).
 * - Aplica delta positivo (al aprobar) o negativo (al revertir).
 * - Garantiza que no supere stockLimit ni baje de 0.
 */
async function adjustVipTableSoldCount(
  tx: Tx,
  recordId: string,
  opts: { delta: number }
) {
  const { delta } = opts;

  // Traer datos mínimos para resolver el config y el delta (tables)
  const res = await tx.tableReservation.findUnique({
    where: { id: recordId },
    select: {
      eventId: true,
      location: true,
      tables: true,
      vipTableConfigId: true,
    },
  });

  if (!res) throw new Error("vip_table_reservation_not_found");

  const tablesDelta = (res.tables ?? 1) * delta;
  if (tablesDelta === 0) return;

  // Resolver VipTableConfig
  let config: null | { id: string; soldCount: number; stockLimit: number } =
    null;

  if (res.vipTableConfigId) {
    config = await tx.vipTableConfig.findUnique({
      where: { id: res.vipTableConfigId },
      select: { id: true, soldCount: true, stockLimit: true },
    });
  } else {
    // Resolver por eventId + location (usa TableLocation)
    config = await tx.vipTableConfig.findUnique({
      where: {
        eventId_location: { eventId: res.eventId, location: res.location },
      },
      select: { id: true, soldCount: true, stockLimit: true },
    });
  }

  if (!config) throw new Error("vip_table_config_not_found_for_location");

  // Nuevo soldCount con límites (0..stockLimit)
  const next = Math.max(
    0,
    Math.min(config.stockLimit, config.soldCount + tablesDelta)
  );

  // Si no cambia, evitamos escribir
  if (next === config.soldCount) return;

  await tx.vipTableConfig.update({
    where: { id: config.id },
    data: { soldCount: next },
  });
}

/* ========================= Core ========================= */

async function processPaymentById(paymentId: string) {
  const MP_TOKEN = process.env.MERCADO_PAGO_ACCESS_TOKEN;
  if (!MP_TOKEN) throw new Error("missing_token");

  const payment = await fetchPaymentWithRetry(paymentId, MP_TOKEN);

  const { type, recordId } = extractRecordRef(payment);
  if (!type || !recordId) {
    return {
      ok: false,
      error: "Sin type/recordId en metadata/external_reference",
    };
  }
  if (type !== "vip-table" && type !== "ticket") {
    return { ok: false, error: `Tipo no soportado: ${type}` };
  }

  const expectedAmount = await getExpectedAmount(type, recordId);
  const approvedStrong = isApprovedStrongOrSandbox({
    payment,
    expectedAmount,
    expectedCurrency: EXPECTED_CURRENCY,
    expectedRef: `${type}:${recordId}`,
  });

  const prevStatus = await getPrevStatus(type, recordId);
  const newStatus = String(payment?.status ?? "pending") as PaymentStatus;

  // === Transacción única:
  // 1) Actualiza paymentId/status
  // 2) Ajusta soldCount de VipTableConfig por TableLocation si corresponde
  // 3) Si approved -> garantiza validationCode (6 dígitos) idempotente
  // 4) Lee el validationCode resultante
  const result = await prisma.$transaction(async (tx: Tx) => {
    const baseUpdate = {
      paymentId: String(payment?.id ?? ""),
      paymentStatus: newStatus as any,
    };

    if (type === "vip-table") {
      await tx.tableReservation.update({
        where: { id: recordId },
        data: baseUpdate,
      });

      // Ajuste idempotente de stock por transición de estado
      const wasApproved = String(prevStatus) === "approved";
      const nowApproved = approvedStrong && newStatus === "approved";

      if (!wasApproved && nowApproved) {
        // de NO aprobado -> aprobado : +tables
        await adjustVipTableSoldCount(tx, recordId, { delta: +1 });
      } else if (
        wasApproved &&
        (newStatus === "refunded" ||
          newStatus === "cancelled" ||
          newStatus === "charged_back")
      ) {
        // de aprobado -> revertido : -tables
        await adjustVipTableSoldCount(tx, recordId, { delta: -1 });
      }

      // Generar código de validación solo si quedó aprobado
      if (nowApproved) {
        await ensureSixDigitCode(tx, { type: "vip-table", id: recordId });
      }

      const r = await tx.tableReservation.findUnique({
        where: { id: recordId },
        select: { validationCode: true },
      });
      return r?.validationCode ?? null;
    } else {
      // === ticket (entradas individuales)
      await tx.ticket.update({
        where: { id: recordId },
        data: baseUpdate,
      });

      if (approvedStrong && newStatus === "approved") {
        await ensureSixDigitCode(tx, { type: "ticket", id: recordId });
      }

      const t = await tx.ticket.findUnique({
        where: { id: recordId },
        select: { validationCode: true },
      });
      return t?.validationCode ?? null;
    }
  });

  const validationCode = normalizeSixDigitCode(result);
  const hasValidCode = !!validationCode;

  return {
    ok: true,
    approvedStrong,
    status: payment?.status,
    status_detail: payment?.status_detail,
    id: payment?.id,
    type,
    recordId,
    prevStatus,
    hasValidCode,
    validationCode, // normalizado a 6 dígitos o null
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

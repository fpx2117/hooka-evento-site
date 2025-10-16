// app/api/payments/confirm/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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
  const refOk = payment?.external_reference === expectedRef;

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

/* ========================= Persistencia ========================= */

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
 * IMPORTANTE: No regenerar validationCode si ya existe.
 * - Si approved = true y no hay validationCode, se crea uno.
 * - Si approved = true y YA hay validationCode, se conserva.
 * - Si approved = false, NO tocar validationCode.
 */
async function persistStatus(
  type: "vip-table" | "ticket",
  recordId: string,
  payment: any,
  approved: boolean
) {
  await prisma.$transaction(async (tx) => {
    const baseUpdate = {
      paymentId: String(payment?.id ?? ""),
      paymentStatus: String(payment?.status ?? "pending") as any,
    };

    if (type === "vip-table") {
      const current = await tx.tableReservation.findUnique({
        where: { id: recordId },
        select: { validationCode: true },
      });

      if (approved) {
        const finalCode =
          current?.validationCode ??
          Math.floor(100000 + Math.random() * 900000).toString();

        await tx.tableReservation.update({
          where: { id: recordId },
          data: { ...baseUpdate, validationCode: finalCode },
        });
      } else {
        // mantener validationCode
        await tx.tableReservation.update({
          where: { id: recordId },
          data: baseUpdate,
        });
      }
    } else {
      const current = await tx.ticket.findUnique({
        where: { id: recordId },
        select: { validationCode: true },
      });

      if (approved) {
        const finalCode =
          current?.validationCode ??
          Math.floor(100000 + Math.random() * 900000).toString();

        await tx.ticket.update({
          where: { id: recordId },
          data: { ...baseUpdate, validationCode: finalCode },
        });
      } else {
        // mantener validationCode
        await tx.ticket.update({
          where: { id: recordId },
          data: baseUpdate,
        });
      }
    }
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
  const approved = isApprovedStrongOrSandbox({
    payment,
    expectedAmount,
    expectedCurrency: EXPECTED_CURRENCY,
    expectedRef: `${type}:${recordId}`,
  });

  const prevStatus = await getPrevStatus(type, recordId);
  await persistStatus(type, recordId, payment, approved);

  // ⚠️ No enviar correo acá. El mail lo maneja /api/send-confirmation.
  // Si lo quisieras disparar automáticamente, hacelo desde el cliente
  // luego de leer el estado aprobado, o con un job, pero no aquí.

  return {
    ok: true,
    approvedStrong: approved,
    status: payment?.status,
    status_detail: payment?.status_detail,
    id: payment?.id,
    type,
    recordId,
    prevStatus,
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
        const status = out.ok ? 200 : 400;
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

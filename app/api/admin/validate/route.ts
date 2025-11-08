// app/api/admin/validate/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizeSixDigitCode } from "@/lib/validation-code";
import { PaymentStatus } from "@prisma/client";

const isDev = process.env.NODE_ENV !== "production";

/** Helper: respuesta JSON sin cache */
function json(body: unknown, status = 200) {
  return new NextResponse(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    },
  });
}

/* ======================
   Helpers
====================== */

function toIso(d: any): string | null {
  if (!d) return null;
  const dt = typeof d === "string" ? new Date(d) : d instanceof Date ? d : null;
  return dt && !isNaN(dt.getTime()) ? dt.toISOString() : null;
}

function toInt(v: any): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Campos seleccionados del Ticket (incluye VIP y relaciones necesarias) */
const SELECT_FIELDS = {
  id: true,
  validationCode: true,
  customerName: true,
  customerEmail: true,
  customerPhone: true,
  customerDni: true,
  ticketType: true,
  quantity: true,
  paymentStatus: true,
  validated: true,
  validatedAt: true,
  purchaseDate: true,
  eventDate: true,

  event: { select: { id: true, name: true, date: true } },
  vipLocation: { select: { name: true } },
  vipTable: { select: { tableNumber: true, capacityPerTable: true } },
  vipTableConfig: { select: { capacityPerTable: true } },
} as const;

/** Serializador uniforme para Ticket */
function serialize(t: any) {
  return {
    id: t.id,
    customerName: t.customerName ?? "",
    customerEmail: t.customerEmail ?? "",
    customerPhone: t.customerPhone ?? "",
    customerDni: t.customerDni ?? "",
    ticketType: t.ticketType ?? "general",
    quantity: toInt(t.quantity),
    paymentStatus: t.paymentStatus as PaymentStatus,

    validated: !!t.validated,
    validatedAt: toIso(t.validatedAt),

    purchaseDate: toIso(t.purchaseDate),
    eventDate: toIso(t.eventDate) ?? toIso(t.event?.date),

    eventName: t.event?.name ?? null,

    vipLocation: t.vipLocation?.name ?? null,
    tableNumber: toInt(t.vipTable?.tableNumber),
    capacityPerTable:
      toInt(t.vipTable?.capacityPerTable) ??
      toInt(t.vipTableConfig?.capacityPerTable),
  };
}

/* ======================
   GET /api/admin/validate?code=XXXXXX
====================== */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const raw =
      searchParams.get("code") || searchParams.get("validationCode") || "";
    const code = normalizeSixDigitCode(raw.toString().trim());

    if (!code) return json({ ok: false, error: "code_required" }, 400);
    if (isDev) console.log("[admin/validate][GET] code:", code);

    const t = await prisma.ticket.findUnique({
      where: { validationCode: code },
      select: SELECT_FIELDS,
    });

    if (!t) return json({ ok: false, error: "not_found" }, 404);

    return json({ ok: true, ticket: serialize(t) });
  } catch (e) {
    console.error("[admin/validate][GET] error", e);
    return json({ ok: false, error: "unknown" }, 500);
  }
}

/* ======================
   POST /api/admin/validate
   Body: { code } o { validationCode }
====================== */
export async function POST(req: NextRequest) {
  try {
    // Acepta JSON o x-www-form-urlencoded
    let body: any = {};
    const txt = await req.text();
    try {
      body = JSON.parse(txt);
    } catch {
      body = Object.fromEntries(new URLSearchParams(txt).entries());
    }

    const raw = (body?.code || body?.validationCode || "").toString().trim();
    const code = normalizeSixDigitCode(raw);

    if (!code) return json({ ok: false, error: "code_required" }, 400);
    if (isDev) console.log("[admin/validate][POST] code:", code);

    // 1) Buscamos el ticket
    const current = await prisma.ticket.findUnique({
      where: { validationCode: code },
      select: {
        id: true,
        paymentStatus: true,
        validated: true,
        validatedAt: true,
      },
    });

    if (!current) return json({ ok: false, error: "not_found" }, 404);

    // 2) Verificamos estado de pago
    if (current.paymentStatus !== PaymentStatus.approved) {
      const t = await prisma.ticket.findUnique({
        where: { id: current.id },
        select: SELECT_FIELDS,
      });

      const errorMessages: Record<PaymentStatus, string> = {
        pending: "Pago pendiente de confirmación.",
        in_process: "Pago en proceso.",
        failed_preference: "Error en la preferencia de pago.",
        cancelled: "Pago cancelado.",
        refunded: "Pago reembolsado.",
        charged_back: "Pago con contracargo.",
        rejected: "Pago rechazado.",
        approved: "Pago aprobado.",
      };

      return json(
        {
          ok: false,
          error: "not_approved",
          message: errorMessages[current.paymentStatus],
          status: current.paymentStatus,
          ticket: t ? serialize(t) : undefined,
        },
        409
      );
    }

    // 3) Validación atómica
    const now = new Date();
    const result = await prisma.ticket.updateMany({
      where: { id: current.id, validated: false },
      data: { validated: true, validatedAt: now },
    });

    if (result.count === 0) {
      // Ya estaba validado
      const latest = await prisma.ticket.findUnique({
        where: { id: current.id },
        select: SELECT_FIELDS,
      });
      return json(
        {
          ok: false,
          error: "already_validated",
          validatedAt: toIso(latest?.validatedAt) ?? toIso(current.validatedAt),
          ticket: latest ? serialize(latest) : undefined,
        },
        409
      );
    }

    // 4) Éxito → Devolvemos ticket actualizado
    const updated = await prisma.ticket.findUnique({
      where: { id: current.id },
      select: SELECT_FIELDS,
    });

    return json({
      ok: true,
      validated: true,
      validatedAt: toIso(updated?.validatedAt) ?? toIso(now),
      ticket: updated ? serialize(updated) : undefined,
    });
  } catch (e) {
    console.error("[admin/validate][POST] error", e);
    return json({ ok: false, error: "unknown" }, 500);
  }
}

// app/api/admin/validate/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizeSixDigitCode } from "@/lib/validation-code";
import { PaymentStatus } from "@prisma/client";

const isDev = process.env.NODE_ENV !== "production";

/** Respuesta JSON con no-cache */
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
function normLoc(x: any): "dj" | "piscina" | "general" | undefined {
  if (!x) return undefined;
  const s = String(x).trim().toLowerCase();
  if (s === "dj" || s === "piscina" || s === "general") return s;
  return undefined;
}
function toIso(d: any): string | undefined {
  if (!d) return undefined;
  const dt = typeof d === "string" ? new Date(d) : d instanceof Date ? d : null;
  return dt && !isNaN(dt.getTime()) ? dt.toISOString() : undefined;
}
function toInt(v: any): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/** Campos seleccionados del Ticket (incluye VIP) */
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
  createdAt: true,
  event: { select: { date: true } },

  // VIP
  vipLocation: true,
  tableNumber: true,
  vipTables: true,
  capacityPerTable: true,
} as const;

function serialize(t: any) {
  return {
    id: t.id,
    customerName: t.customerName ?? "",
    customerEmail: t.customerEmail ?? "",
    customerPhone: t.customerPhone ?? "",
    customerDni: t.customerDni ?? "",
    ticketType: t.ticketType === "vip" ? "vip" : "general",
    paymentStatus: t.paymentStatus as "pending" | "approved" | "rejected",
    quantity: toInt(t.quantity),

    validated: !!t.validated,
    validatedAt: toIso(t.validatedAt),

    // fechas
    purchaseDate: toIso(t.createdAt)!, // existe
    eventDate: toIso(t.event?.date),

    // VIP
    vipLocation: normLoc(t.vipLocation),
    tableNumber: toInt(t.tableNumber),
    vipTables: toInt(t.vipTables),
    capacityPerTable: toInt(t.capacityPerTable),
  };
}

/**
 * GET /api/admin/validate?code=XXXXXX
 * Acepta ?code= o ?validationCode= (normaliza a 6 dígitos)
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const raw = (
      searchParams.get("code") ||
      searchParams.get("validationCode") ||
      ""
    )
      .toString()
      .trim();
    const code = normalizeSixDigitCode(raw);

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

/**
 * POST /api/admin/validate
 * Body: { code } o { validationCode }
 * Marca validado atómicamente si el pago está approved.
 */
export async function POST(req: NextRequest) {
  try {
    // Soporta JSON y x-www-form-urlencoded
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

    // 1) Buscamos lo mínimo para decidir
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

    if (current.paymentStatus !== PaymentStatus.approved) {
      // devolvemos también el ticket completo serializado para UI
      const t = await prisma.ticket.findUnique({
        where: { id: current.id },
        select: SELECT_FIELDS,
      });
      return json(
        {
          ok: false,
          error: "not_approved",
          status: current.paymentStatus,
          ticket: t ? serialize(t) : undefined,
        },
        409
      );
    }

    // 2) Intento atómico de marcar como validado (si aún no lo estaba)
    const now = new Date();
    const result = await prisma.ticket.updateMany({
      where: { id: current.id, validated: false },
      data: { validated: true, validatedAt: now },
    });

    if (result.count === 0) {
      // Alguien lo validó entre medio -> ya utilizado
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

    // 3) Éxito — devolvemos el ticket actualizado (incluye VIP)
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

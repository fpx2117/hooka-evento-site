// app/api/admin/tickets/public/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/admin/tickets/public?type=ticket|vip-table&id=XXXX[&requireApproved=1]
 * Lee info mínima para la pantalla de "success".
 * - NUNCA escribe/crea nada en la BD (read-only).
 * - Por defecto exige approved, configurable por query o env.
 */

const REQUIRE_APPROVED_DEFAULT =
  (process.env.PUBLIC_TICKETS_REQUIRE_APPROVED || "true").toLowerCase() ===
  "true";

function json(payload: any, init?: number | ResponseInit) {
  const initObj: ResponseInit =
    typeof init === "number" ? { status: init } : init || {};
  const headers = new Headers(initObj.headers || {});
  headers.set(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, proxy-revalidate"
  );
  headers.set("Pragma", "no-cache");
  headers.set("Expires", "0");
  headers.set("Content-Type", "application/json; charset=utf-8");
  return NextResponse.json(payload, { ...initObj, headers });
}

// Normalización mínima y filtro estricto (solo 6 dígitos)
const SIX = /^\d{6}$/;
function normalizeCode(v?: string | null) {
  if (v == null) return null;
  const s = String(v)
    .trim()
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, "");
  return s;
}
function isSixDigits(v?: string | null) {
  return !!v && SIX.test(v);
}
function safeValidationCode(v?: string | null) {
  const n = normalizeCode(v);
  return isSixDigits(n) ? n! : null;
}

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const type = sp.get("type");
    const id = sp.get("id");
    const requireApproved = sp.get("requireApproved")
      ? sp.get("requireApproved") === "1"
      : REQUIRE_APPROVED_DEFAULT;

    if (!type || !id) {
      return json({ ok: false, error: "Faltan parámetros (type, id)" }, 400);
    }
    if (type !== "ticket" && type !== "vip-table") {
      return json({ ok: false, error: "Tipo inválido" }, 400);
    }

    if (type === "ticket") {
      const rec = await prisma.ticket.findUnique({
        where: { id },
        select: {
          id: true,
          customerName: true,
          paymentStatus: true,
          qrCode: true,
          validationCode: true,
          totalPrice: true,
        },
      });
      if (!rec) return json({ ok: false, error: "Not found" }, 404);
      if (requireApproved && rec.paymentStatus !== "approved") {
        return json({ ok: false, error: "Pago no aprobado aún" }, 409);
      }

      return json({
        ok: true,
        type: "ticket" as const,
        recordId: rec.id,
        customerName: rec.customerName,
        paymentStatus: rec.paymentStatus,
        qrCode: rec.qrCode || null,
        validationCode: safeValidationCode(rec.validationCode), // <— solo 6 dígitos
        totalPrice: Number(rec.totalPrice || 0),
      });
    }

    // vip-table
    const rec = await prisma.tableReservation.findUnique({
      where: { id },
      select: {
        id: true,
        customerName: true,
        paymentStatus: true,
        qrCode: true,
        validationCode: true,
        totalPrice: true,
      },
    });
    if (!rec) return json({ ok: false, error: "Not found" }, 404);
    if (requireApproved && rec.paymentStatus !== "approved") {
      return json({ ok: false, error: "Pago no aprobado aún" }, 409);
    }

    return json({
      ok: true,
      type: "vip-table" as const,
      recordId: rec.id,
      customerName: rec.customerName,
      paymentStatus: rec.paymentStatus,
      qrCode: rec.qrCode || null,
      validationCode: safeValidationCode(rec.validationCode), // <— solo 6 dígitos
      totalPrice: Number(rec.totalPrice || 0),
    });
  } catch (e) {
    console.error("[admin/tickets/public][GET] error:", e);
    return json({ ok: false, error: "internal" }, 500);
  }
}

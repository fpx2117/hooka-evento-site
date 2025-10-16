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

// -------- Normalización de códigos --------
// Solo permitimos 6 dígitos; limpiamos todo lo que no sea [0-9] primero.
const SIX = /^\d{6}$/;
function normalizeCode(v?: string | null) {
  if (v == null) return null;
  const s = String(v)
    .replace(/[\u200B-\u200D\uFEFF]/g, "") // zero-width
    .replace(/\s+/g, "") // espacios
    .replace(/\D+/g, ""); // NO dígitos
  return s;
}
function isSixDigits(v?: string | null) {
  return !!v && SIX.test(v);
}
function safeValidationCode(v?: string | null) {
  const n = normalizeCode(v);
  return isSixDigits(n) ? n! : null;
}

// -------- Helpers de query --------
function parseRequireApproved(sp: URLSearchParams) {
  const raw = sp.get("requireApproved");
  if (raw == null) return REQUIRE_APPROVED_DEFAULT;
  const val = raw.toLowerCase();
  return val === "1" || val === "true" || val === "yes";
}

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const type = sp.get("type");
    const id = sp.get("id");
    const requireApproved = parseRequireApproved(sp);

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
          // extras útiles para la pantalla
          ticketType: true, // "general" | "vip"
          gender: true, // "hombre" | "mujer" | null
          quantity: true,
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
        validationCode: safeValidationCode(rec.validationCode), // solo 6 dígitos
        totalPrice: Number(rec.totalPrice || 0),
        // metadata opcional para mejor UX
        ticketType: rec.ticketType,
        gender: rec.gender,
        quantity: rec.quantity ?? 1,
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
        // extras para UI
        location: true, // "piscina" | "dj" | "general"
        tables: true,
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
      validationCode: safeValidationCode(rec.validationCode), // solo 6 dígitos
      totalPrice: Number(rec.totalPrice || 0),
      // metadata para mostrar ubicación y cantidad de mesas
      location: rec.location,
      tables: rec.tables ?? 1,
    });
  } catch (e) {
    console.error("[admin/tickets/public][GET] error:", e);
    return json({ ok: false, error: "internal" }, 500);
  }
}

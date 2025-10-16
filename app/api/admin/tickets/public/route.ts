// app/api/admin/tickets/public/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { PaymentStatus, TicketType } from "@prisma/client";

/**
 * GET /api/admin/tickets/public?type=ticket|vip-table&id=XXXX[&requireApproved=1]
 * - Read-only (no escribe en BD)
 * - Por defecto exige approved (configurable por query o env)
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

/* ========================= Código de validación (6 dígitos) ========================= */
const SIX = /^\d{6}$/;
function normalizeCode(v?: string | null) {
  if (v == null) return null;
  const s = String(v)
    .replace(/[\u200B-\u200D\uFEFF]/g, "") // zero-width
    .replace(/\s+/g, "") // espacios
    .replace(/\D+/g, ""); // no dígitos
  return s;
}
function isSixDigits(v?: string | null) {
  return !!v && SIX.test(v);
}
function safeValidationCode(v?: string | null) {
  const n = normalizeCode(v);
  return isSixDigits(n) ? n! : null;
}

/* ========================= Helpers ========================= */
function parseRequireApproved(sp: URLSearchParams) {
  const raw = sp.get("requireApproved");
  if (raw == null) return REQUIRE_APPROVED_DEFAULT;
  const val = raw.toLowerCase();
  return val === "1" || val === "true" || val === "yes";
}

/* ========================= Handler ========================= */
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    // Compat: aceptamos "ticket" o "vip-table" (esta última es alias visual)
    const type = sp.get("type"); // "ticket" | "vip-table"
    const id = sp.get("id");
    const requireApproved = parseRequireApproved(sp);

    if (!type || !id) {
      return json({ ok: false, error: "Faltan parámetros (type, id)" }, 400);
    }
    if (type !== "ticket" && type !== "vip-table") {
      return json({ ok: false, error: "Tipo inválido" }, 400);
    }

    // Siempre leemos desde Ticket. Si pidieron vip-table, verificamos que el ticket sea VIP.
    const rec = await prisma.ticket.findUnique({
      where: { id },
      select: {
        id: true,
        customerName: true,
        paymentStatus: true,
        qrCode: true,
        validationCode: true,
        totalPrice: true,

        // metadata para pantalla
        ticketType: true, // "general" | "vip"
        gender: true, // null si VIP
        quantity: true, // personas en general
        vipLocation: true, // ubicación VIP
        vipTables: true, // mesas VIP
      },
    });

    if (!rec) return json({ ok: false, error: "Not found" }, 404);

    // Si el cliente pidió vip-table, validamos que efectivamente sea un Ticket VIP.
    if (type === "vip-table" && rec.ticketType !== TicketType.vip) {
      return json({ ok: false, error: "El ID no corresponde a un VIP" }, 400);
    }

    // Si se requiere aprobado, validamos estado
    if (requireApproved && rec.paymentStatus !== PaymentStatus.approved) {
      return json({ ok: false, error: "Pago no aprobado aún" }, 409);
    }

    // Respuesta común
    const base = {
      ok: true as const,
      recordId: rec.id,
      customerName: rec.customerName,
      paymentStatus: rec.paymentStatus,
      qrCode: rec.qrCode || null,
      validationCode: safeValidationCode(rec.validationCode),
      totalPrice: Number(rec.totalPrice || 0),
    };

    // Forma para ticket general
    if (type === "ticket" && rec.ticketType !== TicketType.vip) {
      return json({
        ...base,
        type: "ticket" as const,
        ticketType: rec.ticketType, // "general"
        gender: rec.gender, // "hombre" | "mujer"
        quantity: rec.quantity ?? 1,
      });
    }

    // Forma para vip-table (alias visual) — leemos del mismo Ticket VIP
    if (type === "vip-table" || rec.ticketType === TicketType.vip) {
      return json({
        ...base,
        type: "vip-table" as const, // mantenemos el alias para la pantalla de success
        ticketType: rec.ticketType, // "vip"
        location: rec.vipLocation, // "piscina" | "dj" | "general"
        tables: rec.vipTables ?? 1,
      });
    }

    // fallback (general cuando pidieron "ticket")
    return json({
      ...base,
      type: "ticket" as const,
      ticketType: rec.ticketType,
      gender: rec.gender,
      quantity: rec.quantity ?? 1,
    });
  } catch (e) {
    console.error("[admin/tickets/public][GET] error:", e);
    return json({ ok: false, error: "internal" }, 500);
  }
}

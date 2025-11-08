// app/api/admin/tickets/public/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { PaymentStatus, TicketType } from "@prisma/client";

/**
 * GET /api/admin/tickets/public?type=ticket|vip-table&id=XXXX[&requireApproved=1]
 * - Devuelve un ticket (general o VIP)
 * - Solo lectura (no modifica la BD)
 */

const REQUIRE_APPROVED_DEFAULT =
  (process.env.PUBLIC_TICKETS_REQUIRE_APPROVED || "true").toLowerCase() ===
  "true";

/* ========================= Helpers ========================= */

/** Respuesta JSON sin caché */
function json(payload: any, init?: number | ResponseInit) {
  const initObj: ResponseInit =
    typeof init === "number" ? { status: init } : init || {};
  const headers = new Headers(initObj.headers || {});
  headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  headers.set("Pragma", "no-cache");
  headers.set("Expires", "0");
  headers.set("Content-Type", "application/json; charset=utf-8");
  return NextResponse.json(payload, { ...initObj, headers });
}

/** Valida que el código sea solo 6 dígitos numéricos */
const SIX = /^\d{6}$/;

function normalizeCode(v?: string | null): string | null {
  if (!v) return null;
  const s = String(v)
    .replace(/\s+/g, "")
    .replace(/\D+/g, "");
  return s.length === 6 ? s : null;
}

function safeValidationCode(v?: string | null): string | null {
  const n = normalizeCode(v);
  return n && SIX.test(n) ? n : null;
}

function parseRequireApproved(sp: URLSearchParams): boolean {
  const raw = sp.get("requireApproved");
  if (raw == null) return REQUIRE_APPROVED_DEFAULT;
  const val = raw.toLowerCase();
  return val === "1" || val === "true" || val === "yes";
}

/* ========================= Handler principal ========================= */
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const type = sp.get("type"); // "ticket" | "vip-table"
    const id = sp.get("id");
    const requireApproved = parseRequireApproved(sp);

    if (!type || !id) {
      return json(
        { ok: false, error: "missing_params", details: "Faltan parámetros (type, id)" },
        400
      );
    }

    if (type !== "ticket" && type !== "vip-table") {
      return json({ ok: false, error: "invalid_type" }, 400);
    }

    // 🔍 Buscar ticket con los campos realmente existentes
    const rec = await prisma.ticket.findUnique({
      where: { id },
      select: {
        id: true,
        customerName: true,
        paymentStatus: true,
        qrCode: true,
        validationCode: true,
        totalPrice: true,
        ticketType: true,
        gender: true,
        quantity: true,
        vipLocationId: true,
        vipTableId: true,
      },
    });

    if (!rec) {
      return json({ ok: false, error: "not_found" }, 404);
    }

    // 🔒 Validar tipo VIP vs General
    if (type === "vip-table" && rec.ticketType !== TicketType.vip) {
      return json({ ok: false, error: "not_vip_ticket" }, 400);
    }

    // 🔒 Validar estado de pago si es necesario
    if (requireApproved && rec.paymentStatus !== PaymentStatus.approved) {
      return json({ ok: false, error: "payment_not_approved" }, 409);
    }

    // ✅ Base común
    const base = {
      ok: true as const,
      recordId: rec.id,
      customerName: rec.customerName,
      paymentStatus: rec.paymentStatus,
      qrCode: safeValidationCode(rec.qrCode),
      validationCode: safeValidationCode(rec.validationCode),
      totalPrice: Number(rec.totalPrice || 0),
    };

    // 🎟️ Ticket general
    if (type === "ticket" && rec.ticketType !== TicketType.vip) {
      return json({
        ...base,
        type: "ticket" as const,
        ticketType: rec.ticketType,
        gender: rec.gender ?? null,
        quantity: rec.quantity ?? 1,
      });
    }

    // 🪩 Ticket VIP — si no existen relaciones, devolvemos IDs
    if (type === "vip-table" || rec.ticketType === TicketType.vip) {
      return json({
        ...base,
        type: "vip-table" as const,
        ticketType: rec.ticketType,
        vipLocationId: rec.vipLocationId ?? null,
        vipTableId: rec.vipTableId ?? null,
      });
    }

    // 🔁 fallback (general)
    return json({
      ...base,
      type: "ticket" as const,
      ticketType: rec.ticketType,
      gender: rec.gender,
      quantity: rec.quantity ?? 1,
    });
  } catch (e) {
    console.error("[admin/tickets/public][GET] error:", e);
    return json({ ok: false, error: "internal_server_error" }, 500);
  }
}

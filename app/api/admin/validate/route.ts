// app/api/validate/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const isDev = process.env.NODE_ENV !== "production";

function json(body: unknown, status = 200) {
  return new NextResponse(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function normalizeCode(raw: unknown): string | null {
  if (raw == null) return null;
  let s = String(raw)
    .trim()
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[\s-]/g, "");
  return /^\d{6}$/.test(s) ? s : null;
}

function serialize(t: any) {
  return {
    id: t.id,
    customerName: t.customerName,
    customerEmail: t.customerEmail,
    customerPhone: t.customerPhone,
    customerDni: t.customerDni,
    ticketType: t.ticketType,
    paymentStatus: t.paymentStatus as "pending" | "approved" | "rejected",
    validated: !!t.validated,
    validatedAt: t.validatedAt,
    purchaseDate: t.purchaseDate,
    eventDate: t.eventDate,
  };
}

/** GET /api/validate?code=XXXXXX */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const raw = searchParams.get("code") ?? searchParams.get("validationCode");
  const code = normalizeCode(raw);

  if (!code) return json({ ok: false, error: "code_required" }, 400);
  if (isDev) console.log("[validate][GET] code:", code);

  const ticket = await prisma.ticket.findUnique({
    where: { validationCode: code },
  });
  if (!ticket) return json({ ok: false, error: "not_found" }, 404);

  return json({ ok: true, ticket: serialize(ticket) });
}

/** POST /api/validate  body: { code } o { validationCode } */
export async function POST(req: NextRequest) {
  // Soporta JSON y x-www-form-urlencoded
  let body: any = {};
  try {
    const txt = await req.text();
    try {
      body = JSON.parse(txt);
    } catch {
      body = Object.fromEntries(new URLSearchParams(txt).entries());
    }
  } catch {}

  const raw = body?.code ?? body?.validationCode;
  const code = normalizeCode(raw);

  if (!code) return json({ ok: false, error: "code_required" }, 400);
  if (isDev) console.log("[validate][POST] code:", code);

  const ticket = await prisma.ticket.findUnique({
    where: { validationCode: code },
  });
  if (!ticket) return json({ ok: false, error: "not_found" }, 404);

  if (ticket.paymentStatus !== "approved") {
    return json(
      {
        ok: false,
        error: "not_approved",
        status: ticket.paymentStatus,
        ticket: serialize(ticket),
      },
      409
    );
  }

  if (ticket.validated) {
    return json(
      {
        ok: false,
        error: "already_validated",
        validatedAt: ticket.validatedAt,
        ticket: serialize(ticket),
      },
      409
    );
  }

  const updated = await prisma.ticket.update({
    where: { id: ticket.id },
    data: { validated: true, validatedAt: new Date() },
  });

  return json({
    ok: true,
    validated: true,
    validatedAt: updated.validatedAt,
    ticket: serialize(updated),
  });
}

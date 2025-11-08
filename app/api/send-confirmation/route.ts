export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Resend } from "resend";
import QRCode from "qrcode";
import { PaymentStatus as PS } from "@prisma/client";
import { normalizeSixDigitCode } from "@/lib/validation-code";
import { emailTemplateHooka } from "./emailTemplateHooka";
import { Decimal } from "@prisma/client/runtime/library";

/* -------------------------------------------------------------------------- */
/*                                   HELPERS                                  */
/* -------------------------------------------------------------------------- */

function formatARS(value?: unknown) {
  const n = Number(value || 0);
  return n.toLocaleString("es-AR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function getPublicBaseUrl(req: NextRequest) {
  const proto = (req.headers.get("x-forwarded-proto") || "http").toLowerCase();
  const host =
    req.headers.get("x-forwarded-host") || req.headers.get("host") || "";
  return `${proto}://${host}`.replace(/\/+$/, "");
}

function buildValidateUrl(base: string, code: string) {
  return `${base.replace(/\/+$/, "")}/validate?code=${encodeURIComponent(code)}`;
}

async function makeQrDataUrl(url: string) {
  return await QRCode.toDataURL(url, {
    width: 280,
    margin: 2,
    color: { dark: "#120202", light: "#FFFFFF" },
  });
}

function parseDecimal(value: any): number {
  if (value instanceof Decimal) return Number(value.toString());
  if (typeof value === "string" || typeof value === "number") return Number(value);
  return 0;
}

/* -------------------------------------------------------------------------- */
/*                                   HANDLER                                  */
/* -------------------------------------------------------------------------- */

export async function POST(req: NextRequest) {
  try {
    const { recordId } = await req.json();
    if (!recordId)
      return NextResponse.json({ error: "recordId requerido" }, { status: 400 });

    const ticket = await prisma.ticket.findUnique({
      where: { id: recordId },
      include: {
        event: true,
        vipLocation: true,
        vipTable: true,
        vipTableConfig: true,
      },
    });

    if (!ticket)
      return NextResponse.json({ error: "Ticket no encontrado" }, { status: 404 });

    if (ticket.paymentStatus !== PS.approved)
      return NextResponse.json(
        { error: "El pago no está aprobado" },
        { status: 409 }
      );

    // -------------------------------------------------------------
    // Generar QR y datos base
    // -------------------------------------------------------------
    const base = getPublicBaseUrl(req);
    const code = normalizeSixDigitCode(ticket.validationCode ?? "") ?? "";
    const validateUrl = buildValidateUrl(base, code);
    const qr = await makeQrDataUrl(validateUrl);

    // -------------------------------------------------------------
    // Cálculo seguro del total (soporte para Decimal)
    // -------------------------------------------------------------
    const totalPrice = parseDecimal(ticket.totalPrice);
    const vipPrice = parseDecimal(ticket.vipTableConfig?.price);
    const quantity = Number(ticket.quantity) || 1;

    let total = 0;

    if (totalPrice > 0) {
      total = totalPrice;
    } else if (vipPrice > 0) {
      total = vipPrice;
    } else if (totalPrice === 0 && vipPrice === 0) {
      total = 1 * quantity;
    }

    const totalFormatted = `$ ${formatARS(total)}`;
    const dateStr = ticket.event?.date
      ? new Date(ticket.event.date).toLocaleDateString("es-AR")
      : "-";

    const isVip = ticket.ticketType === "vip";

    // -------------------------------------------------------------
    // Generar HTML del correo
    // -------------------------------------------------------------
    const html = emailTemplateHooka({
      name: ticket.customerName,
      validationCode: code,
      qrCodeImage: qr,
      ticketType: isVip ? "Entrada VIP" : "Entrada General",
      total: totalFormatted,
      gender: ticket.gender
        ? ticket.gender[0].toUpperCase() + ticket.gender.slice(1)
        : "-",
      quantity,
      date: dateStr,
      vipLocation: ticket.vipLocation?.name ?? null,
      vipTableNumber: ticket.vipTable?.tableNumber ?? null,
      vipCapacity: ticket.vipTableConfig?.capacityPerTable ?? null,
    });

    // -------------------------------------------------------------
    // Envío del correo
    // -------------------------------------------------------------
    const resend = new Resend(process.env.RESEND_API_KEY);
    const subject = isVip
      ? `🎟️ Tu entrada VIP está confirmada - Hooka (${ticket.vipLocation?.name || "VIP"})`
      : `🎟️ Tu entrada está confirmada - Hooka`;

    await resend.emails.send({
      from: "Hooka <info@hooka.com.ar>",
      to: ticket.customerEmail,
      subject,
      html,
    });

    // -------------------------------------------------------------
    // Actualizar estado de envío
    // -------------------------------------------------------------
    await prisma.ticket.update({
      where: { id: ticket.id },
      data: { emailSentAt: new Date() },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[send-confirmation] Error:", err);
    return NextResponse.json(
      { error: "Error enviando email" },
      { status: 500 }
    );
  }
}

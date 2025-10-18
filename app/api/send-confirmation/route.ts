// app/api/send-confirmation/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import QRCode from "qrcode";
import { Resend } from "resend";
import { PaymentStatus as PS, TicketType } from "@prisma/client";
import { normalizeSixDigitCode } from "@/lib/validation-code";

/* -------------------------------------------------------------------------- */
/*                                   UTILS                                    */
/* -------------------------------------------------------------------------- */

const s = (v: unknown) =>
  v === undefined || v === null ? undefined : String(v).trim();

const cap = (str?: string | null) =>
  !str ? "" : str.charAt(0).toUpperCase() + str.slice(1);

const isHttpsPublicUrl = (url?: string | null) =>
  !!url && /^https:\/\/[^ ]+$/i.test((url || "").trim());

function getPublicBaseUrl(req: NextRequest) {
  const envBase = (process.env.NEXT_PUBLIC_BASE_URL || "").trim();
  if (isHttpsPublicUrl(envBase)) return envBase.replace(/\/+$/, "");
  const proto = (req.headers.get("x-forwarded-proto") || "http").toLowerCase();
  const host =
    req.headers.get("x-forwarded-host") || req.headers.get("host") || "";
  return `${proto}://${host}`.replace(/\/+$/, "");
}

function absUrl(base: string, path?: string | null) {
  if (!path) return undefined;
  const p = path.trim();
  if (!p) return undefined;
  if (/^https?:\/\//i.test(p)) return p;
  const origin = base.replace(/\/+$/, "");
  const rel = p.startsWith("/") ? p : `/${p}`;
  return `${origin}${rel}`;
}

function buildValidateUrl(base: string, code: string) {
  const origin = base.replace(/\/+$/, "");
  return `${origin}/validate?code=${encodeURIComponent(code)}`;
}

function formatARS(n?: unknown) {
  const x = Number(n || 0);
  return x.toLocaleString("es-AR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

const prettyLocation = (loc?: string | null) => {
  switch ((loc || "").toLowerCase()) {
    case "dj":
      return "Sector DJ";
    case "piscina":
      return "Sector Piscina";
    default:
      return "Sector VIP";
  }
};

/* -------------------------------------------------------------------------- */
/*                              BRAND / PALETA                                */
/* -------------------------------------------------------------------------- */

type Brand = {
  name: string;
  logoUrl?: string | null;
  colors: {
    gradientFrom: string;
    gradientTo: string;
    accent: string;
    textOnDark: string;
    textOnLight: string;
    bg: string;
    card: string;
    qrDark?: string;
    qrLight?: string;
  };
};

const DEFAULT_BRAND: Brand = {
  name: "Hooka Pool Party",
  logoUrl: "https://hooka.com.ar/logov2.png",
  colors: {
    gradientFrom: "#5b0d0d",
    gradientTo: "#3f0a0a",
    accent: "#E3CFBF",
    textOnDark: "#FFFFFF",
    textOnLight: "#1A1A2E",
    bg: "#5b0d0d",
    card: "#120202",
    qrDark: "#1A1A2E",
    qrLight: "#FFFFFF",
  },
};

function resolveBrand(input?: Partial<Brand> | null): Brand {
  return {
    ...DEFAULT_BRAND,
    ...input,
    colors: { ...DEFAULT_BRAND.colors, ...(input?.colors || {}) },
  };
}

async function makeQrDataUrl(url: string | null, brand: Brand) {
  try {
    if (!url) return null;
    return await QRCode.toDataURL(url, {
      width: 280,
      margin: 2,
      color: {
        dark: brand.colors.qrDark || "#000000",
        light: brand.colors.qrLight || "#FFFFFF",
      },
    });
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/*                                 TEMPLATE                                   */
/* -------------------------------------------------------------------------- */

function emailTemplate({
  brand,
  title,
  subtitle,
  name,
  detailsHtml,
  validationCode,
  qrCodeImage,
}: {
  brand: Brand;
  title: string;
  subtitle?: string;
  name: string;
  detailsHtml?: string;
  validationCode?: string | null;
  qrCodeImage?: string | null;
}) {
  const { colors, logoUrl } = brand;

  const watermark = logoUrl
    ? `<div style="position:absolute; inset:0; display:flex; align-items:center; justify-content:center; pointer-events:none; opacity:.06;">
         <img src="${logoUrl}" alt="${brand.name} logo" style="max-width:85%; max-height:85%; transform:rotate(-5deg);"/>
       </div>`
    : "";

  return `<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="utf-8">
    <meta name="color-scheme" content="light">
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; }
    </style>
  </head>
  <body bgcolor="${colors.bg}" style="margin:0; padding:0; background:${colors.bg}; color:${colors.textOnDark};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${colors.bg}">
      <tr>
        <td align="center">
          <div style="max-width:680px; margin:0 auto; padding:20px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="border-radius:24px; overflow:hidden;">
              <tr>
                <td style="background:linear-gradient(135deg, ${colors.gradientFrom}, ${colors.gradientTo}); text-align:center; padding:34px 22px;">
                  ${logoUrl ? `<img src="${logoUrl}" width="88" height="88" alt="${brand.name} logo" style="border-radius:12px; margin-bottom:12px;" />` : ""}
                  <h1 style="font-size:28px; color:#fff; margin:0;">${title}</h1>
                  ${subtitle ? `<p style="color:${colors.accent}; font-weight:700; margin-top:8px;">${subtitle}</p>` : ""}
                </td>
              </tr>
            </table>

            <div style="background:${colors.card}; border-radius:20px; padding:28px; margin-top:16px; position:relative; color:${colors.textOnDark}; box-shadow:0 0 40px rgba(0,0,0,.5);">
              ${watermark}
              <h2 style="font-size:22px; margin:0 0 10px;">Hola ${name} 🎉</h2>
              <p style="margin:0 0 18px;">Tu compra fue procesada exitosamente. ¡Prepárate para la fiesta!</p>
              ${detailsHtml || ""}
              ${validationCode ? `<h3 style="font-size:18px; margin:18px 0 8px;">Código de validación</h3><p style="font-size:26px; font-weight:900; letter-spacing:8px;">${validationCode}</p>` : ""}
              ${qrCodeImage ? `<img src="${qrCodeImage}" alt="QR de validación" width="200" style="margin:24px auto; border-radius:8px; display:block;" />` : ""}
              <p style="font-size:13px; margin-top:20px; color:#ccc;">Mostrá este QR o el código al ingresar al evento.<br/>Hooka Pool Party © ${new Date().getFullYear()}</p>
            </div>

            <div style="text-align:center; margin-top:20px;">
              <p style="color:#E3CFBF; font-weight:700;">📍 La ubicación se confirmará 24hs antes del evento.</p>
            </div>

          </div>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

/* -------------------------------------------------------------------------- */
/*                                  HANDLER                                   */
/* -------------------------------------------------------------------------- */

type Payload = {
  type?: "ticket" | "vip-table";
  recordId?: string;
  force?: boolean;
};

export async function POST(request: NextRequest) {
  try {
    let { type, recordId, force } = (await request.json()) as Payload;
    if (!type || !recordId)
      return NextResponse.json(
        { error: "type y recordId son requeridos" },
        { status: 400 }
      );
    if (type === "vip-table") type = "ticket";
    if (type !== "ticket")
      return NextResponse.json({ error: "Tipo inválido" }, { status: 400 });

    const BASE = getPublicBaseUrl(request);
    const apiKey = s(process.env.RESEND_API_KEY);
    const from =
      s(process.env.RESEND_FROM) || "Hooka Party <info@hooka.com.ar>";
    if (!apiKey)
      return NextResponse.json(
        { error: "RESEND_API_KEY no configurado" },
        { status: 500 }
      );

    const resend = new Resend(apiKey);
    const t = await prisma.ticket.findUnique({
      where: { id: recordId },
      select: {
        id: true,
        ticketType: true,
        gender: true,
        quantity: true,
        vipLocation: true,
        tableNumber: true,
        vipTables: true,
        capacityPerTable: true,
        validationCode: true,
        totalPrice: true,
        paymentStatus: true,
        emailSentAt: true,
        customerName: true,
        customerEmail: true,
        event: { select: { name: true, date: true } },
      },
    });

    if (!t)
      return NextResponse.json(
        { error: "Ticket no encontrado" },
        { status: 404 }
      );
    if (t.paymentStatus !== PS.approved)
      return NextResponse.json(
        { error: "El pago no está aprobado" },
        { status: 409 }
      );

    const normalizedCode = normalizeSixDigitCode(t.validationCode);
    if (!normalizedCode)
      return NextResponse.json(
        { error: "Ticket sin código válido" },
        { status: 409 }
      );

    if (!t.customerEmail)
      return NextResponse.json(
        { error: "customerEmail vacío" },
        { status: 400 }
      );

    if (t.emailSentAt && !force)
      return NextResponse.json({
        ok: true,
        alreadySent: true,
        emailSentAt: t.emailSentAt,
      });

    const brandAbs = resolveBrand();
    const title = `🫦 ${t.event?.name || brandAbs.name} 🫦`;
    const dateStr = t.event?.date
      ? new Date(t.event.date).toLocaleDateString("es-AR")
      : "";

    let subject = "";
    let detailsHtml = "";

    if (t.ticketType === TicketType.general) {
      subject = `Entrada General — Código ${normalizedCode}`;
      detailsHtml = `
        <div style="background:#fff; color:#111; border-radius:8px; padding:12px 16px; margin-bottom:12px;">
          <strong>Tipo:</strong> Entrada General<br/>
          <strong>Cantidad:</strong> ${t.quantity ?? 1}<br/>
          ${dateStr ? `<strong>Fecha:</strong> ${dateStr}<br/>` : ""}
          <strong>Total:</strong> $${formatARS(t.totalPrice)}<br/>
        </div>`;
    } else {
      const loc = prettyLocation(t.vipLocation);
      subject = `Mesa VIP — ${loc} — Código ${normalizedCode}`;
      detailsHtml = `
        <div style="background:#fff; color:#111; border-radius:8px; padding:12px 16px; margin-bottom:12px;">
          <strong>Tipo:</strong> Mesa VIP<br/>
          <strong>Sector:</strong> ${loc}<br/>
          <strong>Mesa N°:</strong> ${t.tableNumber ?? "—"}<br/>
          ${dateStr ? `<strong>Fecha:</strong> ${dateStr}<br/>` : ""}
          <strong>Total:</strong> $${formatARS(t.totalPrice)}<br/>
        </div>`;
    }

    const validateUrl = buildValidateUrl(BASE, normalizedCode);
    const qrImage = await makeQrDataUrl(validateUrl, brandAbs);

    const html = emailTemplate({
      brand: brandAbs,
      title,
      subtitle:
        t.ticketType === TicketType.vip
          ? "Tu mesa VIP está confirmada"
          : "Tu entrada está confirmada",
      name: t.customerName || "invitad@",
      detailsHtml,
      validationCode: normalizedCode,
      qrCodeImage: qrImage || undefined,
    });

    await resend.emails.send({ from, to: t.customerEmail, subject, html });
    await prisma.ticket.update({
      where: { id: t.id },
      data: { emailSentAt: new Date() },
    });

    return NextResponse.json({ success: true, validateUrl });
  } catch (error) {
    console.error("[send-confirmation] Error:", error);
    return NextResponse.json(
      { error: "Error enviando confirmación" },
      { status: 500 }
    );
  }
}

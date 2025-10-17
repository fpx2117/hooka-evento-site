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
    gradientFrom: string; // #5b0d0d
    gradientTo: string; // #3f0a0a
    accent: string; // Beige
    textOnDark: string;
    textOnLight: string;
    bg: string; // Body
    card: string; // Card
    qrDark?: string;
    qrLight?: string;
    pattern?: string; // Color del pattern HOOKA
    patternOpacity?: number; // Opacidad del pattern
    patternTileW?: number; // Ancho del tile SVG
    patternTileH?: number; // Alto del tile SVG
    patternFontSize?: number; // Tamaño de HOOKA
  };
};

const DEFAULT_BRAND: Brand = {
  name: "Hooka Pool Party",
  logoUrl: "/logov2.png",
  colors: {
    gradientFrom: process.env.HOOKA_GRADIENT_FROM || "#5b0d0d",
    gradientTo: process.env.HOOKA_GRADIENT_TO || "#3f0a0a",
    accent: process.env.HOOKA_ACCENT || "#E3CFBF",
    textOnDark: "#FFFFFF",
    textOnLight: "#1A1A2E",
    bg: process.env.HOOKA_BG || "#5b0d0d",
    card: process.env.HOOKA_CARD || "#1f0606",
    qrDark: process.env.HOOKA_QR_DARK || "#1A1A2E",
    qrLight: "#FFFFFF",
    pattern: "#E3CFBF",
    patternOpacity: 0.35,
    patternTileW: 560, // tile grande para desktop (se repite)
    patternTileH: 260,
    patternFontSize: 200, // “HOOKA” bien grande como la captura
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
/*                PATTERN GLOBAL COMO BACKGROUND (SVG data URI)               */
/* -------------------------------------------------------------------------- */

function buildHookaPatternDataURI({
  color,
  opacity,
  tileW,
  tileH,
  fontSize,
}: {
  color: string;
  opacity: number;
  tileW: number;
  tileH: number;
  fontSize: number;
}) {
  // SVG con <pattern> que repite "HOOKA" dos veces en X para continuidad
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${tileW}" height="${tileH}">
  <defs>
    <pattern id="p" patternUnits="userSpaceOnUse" width="${tileW}" height="${tileH}">
      <rect width="100%" height="100%" fill="none"/>
      <text x="0" y="${Math.floor(fontSize * 0.85)}"
            font-family="Poppins, Arial, sans-serif"
            font-size="${fontSize}" font-weight="900"
            fill="${color}" fill-opacity="${opacity}">
        HOOKA HOOKA
      </text>
    </pattern>
  </defs>
  <rect width="100%" height="100%" fill="url(#p)"/>
</svg>`.trim();

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
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
  baseOrigin,
}: {
  brand: Brand;
  title: string;
  subtitle?: string;
  name: string;
  detailsHtml?: string;
  validationCode?: string | null;
  qrCodeImage?: string | null;
  baseOrigin: string; // para VML width-ish
}) {
  const { colors, logoUrl } = brand;

  const bgPattern = buildHookaPatternDataURI({
    color: colors.pattern || "#E3CFBF",
    opacity: colors.patternOpacity ?? 0.35,
    tileW: colors.patternTileW ?? 560,
    tileH: colors.patternTileH ?? 260,
    fontSize: colors.patternFontSize ?? 200,
  });

  const watermark = logoUrl
    ? `<div style="position:absolute; inset:0; display:flex; align-items:center; justify-content:center; pointer-events:none; opacity:.06;">
         <img src="${logoUrl}" alt="${brand.name} logo" style="max-width:85%; max-height:85%; transform:rotate(-5deg); filter:none !important; mix-blend-mode:normal !important;"/>
       </div>`
    : "";

  return `<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="utf-8">
    <meta content="width=device-width, initial-scale=1" name="viewport"/>
    <meta name="color-scheme" content="light">
    <meta name="supported-color-schemes" content="light">
    <title>${brand.name}</title>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700;800;900&display=swap');
      img { border:0; outline:none; text-decoration:none; display:block; }
      table { border-collapse:collapse !important; }
      body, table, td, div, p { -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
      :root { color-scheme: light; supported-color-schemes: light; }
      .no-invert { filter:none !important; mix-blend-mode:normal !important; }
    </style>
  </head>
  <body bgcolor="${colors.bg}" style="margin:0; padding:0; background:${colors.bg}; font-family:'Poppins', Arial, sans-serif; color:${colors.textOnDark};">

    <!-- WRAPPER con BACKGROUND GLOBAL (pattern debajo de TODO) -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${colors.bg}">
      <tr>
        <td align="center"
            background="${bgPattern}"
            style="background-image:url('${bgPattern}'); background-repeat:repeat; background-position:top center; background-size:${colors.patternTileW}px ${colors.patternTileH}px;">

          <!--[if gte mso 9]>
          <v:rect xmlns:v="urn:schemas-microsoft-com:vml" fill="true" stroke="false" style="width:1000px; height:auto;">
            <v:fill type="tile" src="${bgPattern}" color="${colors.bg}" />
            <v:textbox inset="0,0,0,0">
          <![endif]-->

          <div role="article" aria-roledescription="email" style="max-width:680px; margin:0 auto; padding:20px;">

            <!-- HERO LIMPIO (sin pattern) -->
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-radius:24px; overflow:hidden;">
              <tr>
                <td style="
                      background:${colors.bg};
                      background-image: linear-gradient(135deg, ${colors.gradientFrom} 0%, ${colors.gradientTo} 100%);
                      border-radius:24px; text-align:center; padding:34px 22px; position:relative;">
                  <div style="position:relative; z-index:2;">
                    ${
                      logoUrl
                        ? `
                    <div class="no-invert" style="background:rgba(227,207,191,0.14); backdrop-filter:blur(8px); border-radius:18px; padding:10px; display:inline-block; margin-bottom:10px; border:2px solid rgba(227,207,191,0.35);">
                      <img class="no-invert" src="${logoUrl}" width="88" height="88" alt="${brand.name} logo" style="border-radius:12px;"/>
                    </div>`
                        : ""
                    }

                    <h1 style="margin:10px 0 6px 0; font-size:32px; font-weight:900; line-height:1.15; color:#fff;">
                      ${title}
                    </h1>

                    ${
                      subtitle
                        ? `
                    <div class="no-invert" style="display:inline-block; background:rgba(227,207,191,0.18); border:2px solid ${colors.accent}; border-radius:999px; padding:6px 18px; margin-top:6px;">
                      <p style="margin:0; font-size:14px; font-weight:700; color:${colors.accent}; letter-spacing:0.4px;">${subtitle}</p>
                    </div>`
                        : ""
                    }
                  </div>

                  <!-- Vignette sutil -->
                  <div aria-hidden="true" style="
                      position:absolute; inset:0; z-index:0;
                      background: radial-gradient(800px 420px at 40% 50%, rgba(0,0,0,0.25), rgba(0,0,0,0) 55%);
                      opacity:.45;">
                  </div>
                </td>
              </tr>
            </table>

            <!-- TARJETA PRINCIPAL -->
            <div class="card" bgcolor="${colors.card}" style="position:relative; background:${colors.card}; border-radius:24px; overflow:hidden; margin-top:16px;
                                   box-shadow:0 12px 40px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.05);
                                   border:2px solid rgba(255,255,255,0.08);">
              ${watermark}
              <div style="height:6px; background:linear-gradient(90deg, ${colors.gradientFrom} 0%, ${colors.accent} 50%, ${colors.gradientTo} 100%);"></div>

              <div style="position:relative; padding:32px 24px;">
                <div style="background:linear-gradient(135deg, rgba(91,13,13,0.28) 0%, rgba(63,10,10,0.24) 100%);
                            border-left:5px solid ${colors.accent};
                            border-radius:12px;
                            padding:18px 20px;
                            margin-bottom:20px;">
                  <h2 style="margin:0 0 8px 0; font-size:24px; font-weight:800;">
                    ¡Hola ${name}! 🎉
                  </h2>
                  <p style="margin:0; font-size:15px; color:rgba(255,255,255,0.92); line-height:1.55;">
                    Tu compra fue procesada exitosamente. ¡Prepárate para la fiesta! 🔥
                  </p>
                </div>

                ${detailsHtml || ""}

                ${
                  validationCode
                    ? `
                  <div style="background:linear-gradient(135deg, ${colors.gradientFrom} 0%, ${colors.gradientTo} 100%);
                              padding:24px 22px; text-align:center; border-radius:18px; margin:22px 0;
                              box-shadow:0 12px 40px rgba(91,13,13,0.45), 0 0 60px rgba(63,10,10,0.28);
                              border:3px solid rgba(255,255,255,0.18);">
                    <div style="display:inline-block; background:rgba(227,207,191,0.22); border-radius:12px; padding:6px 16px; margin-bottom:10px; border:2px solid ${colors.accent};">
                      <p style="margin:0; font-size:12px; font-weight:800; letter-spacing:2px; text-transform:uppercase; color:${colors.accent};">
                        🫦 Código de Validación 🫦
                      </p>
                    </div>
                    <div style="background:rgba(0,0,0,0.3); border-radius:12px; padding:16px; margin:10px auto; max-width:320px; border:2px solid rgba(255,255,255,0.15);">
                      <div style="font-size:34px; font-weight:900; letter-spacing:10px; line-height:1; color:#FFFFFF;">
                        ${validationCode}
                      </div>
                    </div>
                    <p style="margin:10px 0 0 0; font-size:13px; font-weight:700; color:rgba(255,255,255,0.96);">
                      ✨ Mostrá este código o tu QR al personal ✨
                    </p>
                  </div>`
                    : ""
                }

                ${
                  qrCodeImage
                    ? `
                  <div style="display:flex; flex-direction:column; align-items:center; justify-content:center;
                              background:#FFFFFF; border:4px solid transparent; position:relative;
                              padding:22px; border-radius:18px; margin:22px auto;
                              box-shadow:0 12px 40px rgba(0,0,0,0.3); max-width:520px; text-align:center;">
                    <div style="position:absolute; inset:-4px; background:linear-gradient(135deg, ${colors.gradientFrom} 0%, ${colors.accent} 50%, ${colors.gradientTo} 100%); border-radius:18px; z-index:-1;"></div>
                    <div style="background:#FFFFFF; border-radius:10px; padding:10px 18px; margin-bottom:14px; display:inline-block;">
                      <h3 style="margin:0; font-size:18px; font-weight:800; color:${colors.gradientFrom};">
                        🫦 Tu Código QR 🫦
                      </h3>
                    </div>
                    <div style="background:#FFFFFF; border-radius:12px; padding:14px; display:inline-block; box-shadow:0 8px 24px rgba(0,0,0,0.15);">
                      <img src="${qrCodeImage}" alt="QR de validación" width="240" style="max-width:240px; height:auto; border-radius:8px;"/>
                    </div>
                    <p style="font-size:12px; color:#555; margin:14px 0 0 0; font-weight:700; line-height:1.5;">
                      📱 Mostrá este código o tu QR al personal 📱
                    </p>
                  </div>`
                    : ""
                }

                <div style="background:linear-gradient(135deg, rgba(227,207,191,0.10) 0%, rgba(131,56,236,0.10) 100%);
                            border:2px solid ${colors.accent};
                            border-radius:14px; padding:18px 20px;">
                  <h3 style="margin:0 0 10px 0; font-size:16px; font-weight:900; color:${colors.accent};">📋 Instrucciones</h3>
                  <ol style="margin:0; padding-left:20px; color:${colors.textOnDark}; line-height:1.75; font-size:14px;">
                    <li style="margin-bottom:6px;"><strong>Mostrá este email</strong> al personal de seguridad</li>
                    <li style="margin-bottom:6px;">Pueden <strong>escanear tu QR</strong> o ingresar el código de 6 dígitos</li>
                    <li>Una vez validado, <strong>¡entrás directo a la fiesta!</strong> 🎊</li>
                  </ol>
                </div>

                <div style="text-align:center; margin:26px 0 0 0; padding:20px; background:linear-gradient(135deg, ${colors.gradientFrom} 0%, ${colors.gradientTo} 100%); border-radius:14px;">
                  <p style="margin:0; font-size:20px; font-weight:900; color:#FFFFFF;">
                    ¡Nos vemos en la fiesta! 🎉🔥
                  </p>
                  <p style="margin:8px 0 0 0; font-size:13px; color:rgba(255,255,255,0.92); font-weight:700;">
                    Prepárate para una noche inolvidable 🫦
                  </p>
                </div>
              </div>
            </div>

            <div style="text-align:center; padding:20px 14px; margin-top:14px;">
              <div style="display:inline-block; background:rgba(255,255,255,0.06); border-radius:14px; padding:14px 24px; border:1px solid rgba(255,255,255,0.10);">
                <p style="margin:0 0 6px 0; font-size:16px; font-weight:900; color:#FFFFFF;">
                  ${brand.name}
                </p>
                <p style="margin:0; font-size:12px; color:#A7AABB; font-weight:700;">
                  📍 La ubicación se confirmará 24hs antes del evento
                </p>
              </div>
            </div>

          </div>

          <!--[if gte mso 9]>
            </v:textbox>
          </v:rect>
          <![endif]-->

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
    if (!type || !recordId) {
      return NextResponse.json(
        { error: "type y recordId son requeridos" },
        { status: 400 }
      );
    }

    if (type === "vip-table") type = "ticket";
    if (type !== "ticket") {
      return NextResponse.json({ error: "Tipo inválido" }, { status: 400 });
    }

    const BASE = getPublicBaseUrl(request);

    // Resend
    const apiKey = s(process.env.RESEND_API_KEY);
    const from =
      s(process.env.RESEND_FROM) || "Hooka Party <info@hooka.com.ar>";
    if (!apiKey) {
      return NextResponse.json(
        { error: "RESEND_API_KEY no configurado" },
        { status: 500 }
      );
    }
    const resend = new Resend(apiKey);

    async function enviar({
      to,
      subject,
      html,
    }: {
      to: string;
      subject: string;
      html: string;
    }) {
      const res = await resend.emails.send({ from, to, subject, html });
      if ((res as any)?.error) {
        console.error("[send-confirmation] Resend error:", (res as any).error);
        throw new Error("ResendError");
      }
      return res;
    }

    // ---- Cargamos el ticket ----
    const t = await prisma.ticket.findUnique({
      where: { id: recordId },
      select: {
        id: true,
        ticketType: true,
        gender: true,
        quantity: true,
        vipLocation: true,
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
    if (t.paymentStatus !== PS.approved) {
      return NextResponse.json(
        { error: "El pago no está aprobado para este ticket" },
        { status: 409 }
      );
    }

    const normalizedCode = normalizeSixDigitCode(t.validationCode);
    if (!normalizedCode) {
      return NextResponse.json(
        { error: "El ticket aprobado no posee un validationCode de 6 dígitos" },
        { status: 409 }
      );
    }

    if (!t.customerEmail) {
      return NextResponse.json(
        { error: "customerEmail vacío" },
        { status: 400 }
      );
    }

    if (t.emailSentAt && !force) {
      return NextResponse.json(
        { ok: true, alreadySent: true, emailSentAt: t.emailSentAt },
        { status: 200 }
      );
    }

    // Brand + logo absoluto
    const brandRel = resolveBrand();
    const brandAbs: Brand = {
      ...brandRel,
      logoUrl: absUrl(BASE, brandRel.logoUrl),
    };

    const title = `🫦 ${t.event?.name || brandRel.name} 🫦`;
    const dateStr = t.event?.date
      ? new Date(t.event.date).toLocaleDateString("es-AR")
      : "";

    let subject = "";
    let detailsHtml = "";

    if (t.ticketType === TicketType.general) {
      subject = `🫦 Entrada General — Código: ${normalizedCode}`;
      const genderLine = t.gender
        ? `<strong>Género:</strong> ${cap(t.gender)}<br/>`
        : "";
      const qtyLine =
        typeof t.quantity === "number"
          ? `<strong>Cantidad:</strong> ${t.quantity}<br/>`
          : "";
      detailsHtml =
        `<div style="background:#fff; border:1px solid #e8e8e8; padding:14px 16px; border-radius:8px; margin-bottom:12px; color:#111;">` +
        `<strong>Tipo:</strong> Entrada General<br/>` +
        `${genderLine}${qtyLine}` +
        `${dateStr ? `<strong>Fecha:</strong> ${dateStr}<br/>` : ""}` +
        `<strong>Total:</strong> $ ${formatARS(t.totalPrice)}<br/>` +
        `</div>`;
    } else {
      const locLabel = prettyLocation(t.vipLocation);
      subject = `🫦 Mesa VIP — ${locLabel} — Código: ${normalizedCode}`;

      const tables = Math.max(1, Number(t.vipTables ?? 1));
      const capPerTable = Math.max(0, Number(t.capacityPerTable ?? 0));

      let mesaCapLine = `<strong>Mesas:</strong> ${tables}`;
      if (capPerTable > 0) {
        if (tables > 1) {
          const totalCap = capPerTable * tables;
          mesaCapLine += ` — <strong>Capacidad:</strong> ${totalCap} <span style="opacity:.9">(${capPerTable}/mesa)</span>`;
        } else {
          mesaCapLine += ` — <strong>Capacidad:</strong> ${capPerTable}`;
        }
      }
      mesaCapLine += "<br/>";

      detailsHtml =
        `<div style="background:#fff; border:1px solid #e8e8e8; padding:14px 16px; border-radius:8px; margin-bottom:12px; color:#111;">` +
        `${dateStr ? `<strong>Fecha:</strong> ${dateStr}<br/>` : ""}` +
        `<strong>Ubicación:</strong> ${locLabel}<br/>` +
        mesaCapLine +
        `<strong>Total:</strong> $ ${formatARS(t.totalPrice)}<br/>` +
        `</div>`;
    }

    const validateUrl = buildValidateUrl(BASE, normalizedCode);
    const qrImage = await makeQrDataUrl(validateUrl, brandRel);

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
      baseOrigin: BASE,
    });

    let reservedAt: Date | null = null;
    if (!force) {
      reservedAt = new Date();
      const lock = await prisma.ticket.updateMany({
        where: { id: t.id, emailSentAt: null, paymentStatus: PS.approved },
        data: { emailSentAt: reservedAt },
      });
      if (lock.count === 0) {
        return NextResponse.json(
          { ok: true, alreadySent: true },
          { status: 200 }
        );
      }
    }

    try {
      const result = await enviar({ to: t.customerEmail, subject, html });
      if (force) {
        await prisma.ticket.update({
          where: { id: t.id },
          data: { emailSentAt: new Date() },
        });
      }
      return NextResponse.json({
        success: true,
        validateUrl,
        emailMarkedAt: (reservedAt ?? new Date()).toISOString(),
        ...result,
      });
    } catch (err) {
      if (!force && reservedAt) {
        await prisma.ticket.update({
          where: { id: t.id },
          data: { emailSentAt: null },
        });
      }
      throw err;
    }
  } catch (error) {
    console.error("[send-confirmation] Error:", error);
    return NextResponse.json(
      { error: "Error enviando confirmación" },
      { status: 500 }
    );
  }
}

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
  if (/^https?:\/\//i.test(p)) return p; // ya absoluto
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
  /** Imagen de fondo del hero (patrón HOOKA + gradiente) */
  heroBgUrl?: string | null;
  /** Palma superior derecha */
  palmsTopUrl?: string | null;
  /** Palma inferior izquierda */
  palmsBottomUrl?: string | null;
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
  name: "Hooka",
  logoUrl: process.env.HOOKA_LOGO_URL || undefined,
  // Archivos en /public
  heroBgUrl: process.env.HOOKA_HERO_BG_URL || "/hooka-hero-bg.png",
  palmsTopUrl: process.env.HOOKA_PALMS_TOP_URL || "/palmeras1.png",
  palmsBottomUrl: process.env.HOOKA_PALMS_BOTTOM_URL || "/palmeras2.png",
  colors: {
    gradientFrom: process.env.HOOKA_GRADIENT_FROM || "#FF006E",
    gradientTo: process.env.HOOKA_GRADIENT_TO || "#FFBE0B",
    accent: process.env.HOOKA_ACCENT || "#00F5FF",
    textOnDark: "#FFFFFF",
    textOnLight: "#1A1A2E",
    bg: process.env.HOOKA_BG || "#0A0E27",
    card: process.env.HOOKA_CARD || "#1A1F3A",
    qrDark: process.env.HOOKA_QR_DARK || "#1A1A2E",
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
  const { colors, logoUrl, heroBgUrl, palmsTopUrl, palmsBottomUrl } = brand;

  const watermark = logoUrl
    ? `<div style="position:absolute; inset:0; display:flex; align-items:center; justify-content:center; pointer-events:none; opacity:.08;">
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
    <div role="article" aria-roledescription="email" style="max-width:680px; margin:0 auto; padding:20px;">

      <!-- HERO con imagen de fondo (bulletproof) -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-radius:24px; overflow:hidden;">
        <tr>
          <td
            background="${heroBgUrl || ""}"
            style="
              background:${colors.bg};
              ${
                heroBgUrl
                  ? `background-image:url('${heroBgUrl}'); background-size:cover; background-position:center;`
                  : `
              background: linear-gradient(135deg, ${colors.gradientFrom} 0%, #FB5607 35%, ${colors.gradientTo} 70%, #8338EC 100%);`
              }
              border-radius:24px; text-align:center; padding:40px 24px; position:relative;
            "
          >
            <!--[if gte mso 9]>
            <v:rect xmlns:v='urn:schemas-microsoft-com:vml' fill='true' stroke='f' style='width:640px;height:280px;'>
              <v:fill type='frame' src='${heroBgUrl || ""}' color='${colors.bg}' />
              <v:textbox inset='0,0,0,0'>
            <![endif]-->
            <div style="position:relative; z-index:2;">
              ${
                logoUrl
                  ? `
              <div class="no-invert" style="background:rgba(255,255,255,0.15); backdrop-filter:blur(10px); border-radius:24px; padding:16px; display:inline-block; margin-bottom:16px; border:3px solid rgba(255,255,255,0.3);">
                <img class="no-invert" src="${logoUrl}" width="100" height="100" alt="${brand.name} logo" style="border-radius:16px;"/>
              </div>`
                  : ""
              }

              <h1 style="margin:12px 0 8px 0; font-size:36px; font-weight:900; line-height:1.1; color:#fff;">
                ${title}
              </h1>

              ${
                subtitle
                  ? `
              <div class="no-invert" style="display:inline-block; background:rgba(0,245,255,0.2); border:2px solid ${colors.accent}; border-radius:50px; padding:8px 24px; margin-top:8px;">
                <p style="margin:0; font-size:15px; font-weight:600; color:${colors.accent}; letter-spacing:0.5px;">${subtitle}</p>
              </div>`
                  : ""
              }

              <!-- Palmas superpuestas -->
              ${
                palmsTopUrl
                  ? `
              <div style="position:absolute; right:-10px; top:-6px; opacity:0.95;">
                <img src="${palmsTopUrl}" alt="" width="220" style="max-width:40vw;height:auto;" />
              </div>`
                  : ""
              }

              ${
                palmsBottomUrl
                  ? `
              <div style="position:absolute; left:-20px; bottom:-60px; opacity:0.95;">
                <img src="${palmsBottomUrl}" alt="" width="260" style="max-width:42vw;height:auto;" />
              </div>`
                  : ""
              }
            </div>
            <!--[if gte mso 9]>
              </v:textbox>
            </v:rect>
            <![endif]-->
          </td>
        </tr>
      </table>

      <!-- Tarjeta principal -->
      <div class="card" bgcolor="${colors.card}" style="position:relative; background:${colors.card}; border-radius:24px; overflow:hidden; margin-top:16px;
                                 box-shadow:0 12px 40px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.05);
                                 border:2px solid rgba(255,0,110,0.2);">
        ${watermark}
        <div style="height:6px; background:linear-gradient(90deg, ${colors.gradientFrom} 0%, ${colors.accent} 50%, ${colors.gradientTo} 100%);"></div>

        <div style="position:relative; padding:32px 24px;">
          <div style="background:linear-gradient(135deg, rgba(255,0,110,0.15) 0%, rgba(255,190,11,0.15) 100%);
                      border-left:5px solid ${colors.accent};
                      border-radius:12px;
                      padding:20px 24px;
                      margin-bottom:24px;">
            <h2 style="margin:0 0 8px 0; font-size:26px; font-weight:800;">
              ¡Hola ${name}! 🎉
            </h2>
            <p style="margin:0; font-size:16px; color:rgba(255,255,255,0.9); line-height:1.5;">
              Tu compra fue procesada exitosamente. ¡Prepárate para la fiesta! 🔥
            </p>
          </div>

          ${detailsHtml || ""}

          ${
            validationCode
              ? `
            <div style="background:linear-gradient(135deg, ${colors.gradientFrom} 0%, ${colors.gradientTo} 100%);
                        padding:28px 24px; text-align:center; border-radius:20px; margin:24px 0;
                        box-shadow:0 12px 40px rgba(255,0,110,0.5), 0 0 60px rgba(255,190,11,0.3);
                        border:3px solid rgba(255,255,255,0.2);">
              <div style="display:inline-block; background:rgba(0,245,255,0.25); border-radius:12px; padding:6px 20px; margin-bottom:12px; border:2px solid ${colors.accent};">
                <p style="margin:0; font-size:12px; font-weight:700; letter-spacing:2px; text-transform:uppercase; color:${colors.accent};">
                  🫦 Código de Validación 🫦
                </p>
              </div>
              <div style="background:rgba(0,0,0,0.3); border-radius:16px; padding:20px; margin:12px auto; max-width:320px; border:2px solid rgba(255,255,255,0.15);">
                <div style="font-size:36px; font-weight:900; letter-spacing:12px; line-height:1; color:#FFFFFF;">
                  ${validationCode}
                </div>
              </div>
              <p style="margin:12px 0 0 0; font-size:14px; font-weight:600; color:rgba(255,255,255,0.95);">
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
                        padding:24px; border-radius:20px; margin:24px auto;
                        box-shadow:0 12px 40px rgba(0,0,0,0.3); max-width:520px; text-align:center;">
              <div style="position:absolute; inset:-4px; background:linear-gradient(135deg, ${colors.gradientFrom} 0%, ${colors.accent} 50%, ${colors.gradientTo} 100%); border-radius:20px; z-index:-1;"></div>
              <div style="background:#FFFFFF; border-radius:12px; padding:12px 20px; margin-bottom:16px; display:inline-block;">
                <h3 style="margin:0; font-size:20px; font-weight:800; color:${colors.gradientFrom};">
                  🫦 Tu Código QR 🫦
                </h3>
              </div>
              <div style="background:#FFFFFF; border-radius:16px; padding:16px; display:inline-block; box-shadow:0 8px 24px rgba(0,0,0,0.15);">
                <img src="${qrCodeImage}" alt="QR de validación" width="240" style="max-width:240px; height:auto; border-radius:8px;"/>
              </div>
              <p style="font-size:13px; color:#555; margin:16px 0 0 0; font-weight:600; line-height:1.5;">
                📱 Mostrá este código o tu QR al personal 📱
              </p>
            </div>`
              : ""
          }

          <div style="background:linear-gradient(135deg, rgba(0,245,255,0.1) 0%, rgba(131,56,236,0.1) 100%);
                      border:2px solid ${colors.accent};
                      border-radius:16px; padding:20px 24px;">
            <h3 style="margin:0 0 12px 0; font-size:18px; font-weight:800; color:${colors.accent};">📋 Instrucciones</h3>
            <ol style="margin:0; padding-left:20px; color:${colors.textOnDark}; line-height:1.8; font-size:15px;">
              <li style="margin-bottom:8px;"><strong>Mostrá este email</strong> al personal de seguridad</li>
              <li style="margin-bottom:8px;">Pueden <strong>escanear tu QR</strong> o ingresar el código de 6 dígitos</li>
              <li>Una vez validado, <strong>¡entrás directo a la fiesta!</strong> 🎊</li>
            </ol>
          </div>

          <div style="text-align:center; margin:32px 0 0 0; padding:24px; background:linear-gradient(135deg, ${colors.gradientFrom} 0%, ${colors.gradientTo} 100%); border-radius:16px;">
            <p style="margin:0; font-size:22px; font-weight:900; color:#FFFFFF;">
              ¡Nos vemos en la fiesta! 🎉🔥
            </p>
            <p style="margin:8px 0 0 0; font-size:14px; color:rgba(255,255,255,0.9); font-weight:600;">
              Prepárate para una noche inolvidable 🫦
            </p>
          </div>
        </div>
      </div>

      <div style="text-align:center; padding:24px 16px; margin-top:16px;">
        <div style="display:inline-block; background:rgba(255,255,255,0.05); border-radius:16px; padding:16px 32px; border:1px solid rgba(255,255,255,0.1);">
          <p style="margin:0 0 8px 0; font-size:18px; font-weight:800; color:#FFFFFF;">
            ${brand.name}
          </p>
          <p style="margin:0; font-size:13px; color:#A7AABB; font-weight:500;">
            📍 La ubicación se confirmará 24hs antes del evento
          </p>
        </div>
      </div>
    </div>
  </body>
</html>`;
}

/* -------------------------------------------------------------------------- */
/*                                  HANDLER                                   */
/* -------------------------------------------------------------------------- */

type Payload = {
  type?: "ticket" | "vip-table"; // compat: "vip-table" se trata como ticket VIP
  recordId?: string;
  force?: boolean; // reenviar aunque exista emailSentAt (omite lock)
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

    // Compat: si vino "vip-table", lo normalizamos a "ticket"
    if (type === "vip-table") type = "ticket";
    if (type !== "ticket") {
      return NextResponse.json({ error: "Tipo inválido" }, { status: 400 });
    }

    const BASE = getPublicBaseUrl(request);

    // Resend
    const apiKey = s(process.env.RESEND_API_KEY);
    const from = s(process.env.RESEND_FROM) || "Hooka <info@hooka.com.ar>";
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

    // ---- Cargamos el ticket (GENERAL o VIP) ----
    const t = await prisma.ticket.findUnique({
      where: { id: recordId },
      select: {
        id: true,
        ticketType: true, // "general" | "vip"
        gender: true, // sólo general
        quantity: true, // sólo general
        vipLocation: true, // sólo vip
        vipTables: true, // sólo vip
        capacityPerTable: true, // sólo vip
        validationCode: true,
        totalPrice: true,
        paymentStatus: true,
        emailSentAt: true,
        customerName: true,
        customerEmail: true,
        event: { select: { name: true, date: true } },
      },
    });

    if (!t) {
      return NextResponse.json(
        { error: "Ticket no encontrado" },
        { status: 404 }
      );
    }
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

    // Resolvemos brand y absolutizamos URLs para email
    const brandRel = resolveBrand();
    const brand = {
      ...brandRel,
      logoUrl: absUrl(BASE, brandRel.logoUrl),
      heroBgUrl: absUrl(BASE, brandRel.heroBgUrl) || undefined,
      palmsTopUrl: absUrl(BASE, brandRel.palmsTopUrl) || undefined,
      palmsBottomUrl: absUrl(BASE, brandRel.palmsBottomUrl) || undefined,
    };

    const title = `🫦 ${t.event?.name || brand.name} 🫦`;
    const dateStr = t.event?.date
      ? new Date(t.event.date).toLocaleDateString("es-AR")
      : "";

    let subject = "";
    let detailsHtml = "";

    if (t.ticketType === TicketType.general) {
      // ------ General ------
      const typeLabel = "Entrada General";
      subject = `🫦 ${typeLabel} — Código: ${normalizedCode}`;
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
        `${genderLine}` +
        `${qtyLine}` +
        `${dateStr ? `<strong>Fecha:</strong> ${dateStr}<br/>` : ""}` +
        `<strong>Total:</strong> $ ${formatARS(t.totalPrice)}<br/>` +
        `</div>`;
    } else {
      // ------ VIP (línea compacta Mesas + Capacidad) ------
      const locLabel = prettyLocation(t.vipLocation);
      subject = `🫦 Mesa VIP — ${locLabel} — Código: ${normalizedCode}`;

      const tables = Math.max(1, Number(t.vipTables ?? 1));
      const capPerTable = Math.max(0, Number(t.capacityPerTable ?? 0));

      // Línea compacta
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
    const qrImage = await makeQrDataUrl(validateUrl, brand);

    const html = emailTemplate({
      brand,
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
      const result = await enviar({
        to: t.customerEmail,
        subject,
        html,
      });

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

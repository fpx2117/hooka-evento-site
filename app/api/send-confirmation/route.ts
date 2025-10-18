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
  // Sin depender de .env para el tema. Para la base pública,
  // respetamos headers del proxy (Vercel/NGINX/etc.)
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
  /** Título principal (ej. Hooka) */
  name: string;
  /** Etiqueta del footer (ej. Hooka Pool Party) */
  footerLabel?: string | null;
  /** Logo relativo a /public o absoluto */
  logoUrl?: string | null;
  /** Tema fijo: “bordeaux” */
  theme: "bordeaux";
  /** Colores del tema bordeaux (hardcode sin .env) */
  colors: {
    bg: string; // fondo general
    heroFrom: string;
    heroTo: string;
    card: string;
    accent: string;
    text: string;
    qrDark?: string;
    qrLight?: string;
  };
};

// Valores por defecto SIN .env (tema Bordeaux)
const DEFAULT_BRAND: Brand = {
  name: "Hooka",
  footerLabel: "Hooka",
  logoUrl: "/logov2.png", // poné tu logo en /public/logov2.png
  theme: "bordeaux",
  colors: {
    bg: "#5b0d0d",
    heroFrom: "#5b0d0d",
    heroTo: "#3f0a0a",
    card: "#120202",
    accent: "#E3CFBF",
    text: "#FFFFFF",
    qrDark: "#120202",
    qrLight: "#FFFFFF",
  },
};

function resolveBrand(input?: Partial<Brand> | null): Brand {
  // Permitimos override por código si alguna vez lo necesitás
  return {
    ...DEFAULT_BRAND,
    ...input,
    colors: { ...DEFAULT_BRAND.colors, ...(input?.colors || {}) },
    theme: "bordeaux",
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
/*                                 TEMPLATES                                  */
/* -------------------------------------------------------------------------- */

/**
 * Template BORDEAUX (el diseño bordó exacto que pediste),
 * con los mismos datos dinámicos: name, detailsHtml, validationCode, qrCodeImage.
 */
function emailTemplateBordeaux({
  brand,
  name,
  detailsHtml,
  validationCode,
  qrCodeImage,
}: {
  brand: Brand;
  name: string;
  detailsHtml?: string;
  validationCode?: string | null;
  qrCodeImage?: string | null;
}) {
  const logo = brand.logoUrl || "https://hooka.com.ar/logov2.png";
  const C = brand.colors;

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta content="width=device-width, initial-scale=1" name="viewport"/>
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>${brand.footerLabel || brand.name}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700;800;900&display=swap');
    img { border:0; outline:none; text-decoration:none; display:block; }
    table { border-collapse:collapse !important; }
    body, table, td, div, p { -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
    :root { color-scheme: light; supported-color-schemes: light; }
    .no-invert { filter:none !important; mix-blend-mode:normal !important; }
  </style>
</head>

<body bgcolor="${C.bg}" style="margin:0; padding:0; background:${C.bg}; font-family:'Poppins', Arial, sans-serif; color:${C.text};">

  <!-- WRAPPER -->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${C.bg}">
    <tr>
      <td align="center">
        <div role="article" aria-roledescription="email" style="max-width:680px; margin:0 auto; padding:20px;">

          <!-- HERO (gradiente + vignette) -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-radius:24px; overflow:hidden;">
            <tr>
              <td style="
                background:${C.heroFrom};
                background-image: linear-gradient(135deg, ${C.heroFrom} 0%, ${C.heroTo} 100%);
                border-radius:24px; text-align:center; padding:34px 22px; position:relative;">
                <div style="position:relative; z-index:2;">

                  <div class="no-invert" style="background:rgba(227,207,191,0.14); backdrop-filter:blur(8px); border-radius:18px; padding:10px; display:inline-block; margin-bottom:10px; border:2px solid rgba(227,207,191,0.35);">
                    <img class="no-invert" src="${logo}" width="88" height="88" alt="${brand.name} logo" style="border-radius:12px;" />
                  </div>

                  <h1 style="margin:10px 0 6px 0; font-size:32px; font-weight:900; line-height:1.15; color:#fff;">
                    🫦 ${brand.name} 🫦
                  </h1>

                  <div class="no-invert" style="display:inline-block; background:rgba(227,207,191,0.18); border:2px solid ${C.accent}; border-radius:999px; padding:6px 18px; margin-top:6px;">
                    <p style="margin:0; font-size:14px; font-weight:700; color:${C.accent}; letter-spacing:0.4px;">Tu entrada está confirmada</p>
                  </div>
                </div>

                <!-- Vignette -->
                <div aria-hidden="true" style="
                  position:absolute; inset:0; z-index:0;
                  background: radial-gradient(800px 420px at 40% 50%, rgba(0,0,0,0.25), rgba(0,0,0,0) 55%);
                  opacity:.45;">
                </div>
              </td>
            </tr>
          </table>

          <!-- CARD PRINCIPAL -->
          <div class="card" bgcolor="${C.card}" style="position:relative; background:${C.card}; border-radius:24px; overflow:hidden; margin-top:16px;
            box-shadow:0 18px 50px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.06);
            border:2px solid rgba(255,255,255,0.12);">
            <div style="position:absolute; inset:0; display:flex; align-items:center; justify-content:center; pointer-events:none; opacity:.06;">
              <img src="${logo}" alt="${brand.name} logo" style="max-width:85%; max-height:85%; transform:rotate(-5deg);" />
            </div>
            <div style="height:6px; background:linear-gradient(90deg, ${C.heroFrom} 0%, ${C.accent} 50%, ${C.heroTo} 100%);"></div>

            <div style="position:relative; padding:32px 24px;">
              <div style="background:linear-gradient(135deg, rgba(91,13,13,0.30) 0%, rgba(63,10,10,0.26) 100%);
                border-left:5px solid ${C.accent};
                border-radius:12px;
                padding:18px 20px;
                margin-bottom:20px;">
                <h2 style="margin:0 0 8px 0; font-size:24px; font-weight:800;">
                  ¡Hola ${name || "invitad@"}! 🎉
                </h2>
                <p style="margin:0; font-size:15px; color:rgba(255,255,255,0.94); line-height:1.55;">
                  Tu compra fue procesada exitosamente. ¡Prepárate para la fiesta! 🔥
                </p>
              </div>

              ${detailsHtml || ""}

              ${
                validationCode
                  ? `
              <div style="background:linear-gradient(135deg, ${C.heroFrom} 0%, ${C.heroTo} 100%);
                padding:24px 22px; text-align:center; border-radius:18px; margin:22px 0;
                box-shadow:0 12px 40px rgba(91,13,13,0.45), 0 0 60px rgba(63,10,10,0.28);
                border:3px solid rgba(255,255,255,0.18);">
                <div style="display:inline-block; background:rgba(227,207,191,0.22); border-radius:12px; padding:6px 16px; margin-bottom:10px; border:2px solid ${C.accent};">
                  <p style="margin:0; font-size:12px; font-weight:800; letter-spacing:2px; text-transform:uppercase; color:${C.accent};">
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
                <div style="position:absolute; inset:-4px; background:linear-gradient(135deg, ${C.heroFrom} 0%, ${C.accent} 50%, ${C.heroTo} 100%); border-radius:18px; z-index:-1;"></div>
                <div style="background:#FFFFFF; border-radius:10px; padding:10px 18px; margin-bottom:14px; display:inline-block;">
                  <h3 style="margin:0; font-size:18px; font-weight:800; color:${C.heroFrom};">
                    🫦 Tu Código QR 🫦
                  </h3>
                </div>
                <div style="background:#FFFFFF; border-radius:12px; padding:14px; display:inline-block; box-shadow:0 8px 24px rgba(0,0,0,0.15);">
                  <img src="${qrCodeImage}" alt="QR de validación" width="240" style="max-width:240px; height:auto; border-radius:8px;" />
                </div>
                <p style="font-size:12px; color:#555; margin:14px 0 0 0; font-weight:700; line-height:1.5;">
                  📱 Mostrá este código o tu QR al personal 📱
                </p>
              </div>`
                  : ""
              }

              <div style="background:linear-gradient(135deg, rgba(227,207,191,0.10) 0%, rgba(131,56,236,0.10) 100%);
                border:2px solid ${C.accent};
                border-radius:14px; padding:18px 20px;">
                <h3 style="margin:0 0 10px 0; font-size:16px; font-weight:900; color:${C.accent};">📋 Instrucciones</h3>
                <ol style="margin:0; padding-left:20px; color:#FFFFFF; line-height:1.75; font-size:14px;">
                  <li style="margin-bottom:6px;"><strong>Mostrá este email</strong> al personal de seguridad</li>
                  <li style="margin-bottom:6px;">Pueden <strong>escanear tu QR</strong> o ingresar el código de 6 dígitos</li>
                  <li>Una vez validado, <strong>¡entrás directo a la fiesta!</strong> 🎊</li>
                </ol>
              </div>

              <div style="text-align:center; margin:26px 0 0 0; padding:20px; background:linear-gradient(135deg, ${C.heroFrom} 0%, ${C.heroTo} 100%); border-radius:14px;">
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
                ${brand.footerLabel || brand.name}
              </p>
              <p style="margin:0; font-size:12px; color:#A7AABB; font-weight:700;">
                📍 La ubicación se confirmará 24hs antes del evento
              </p>
            </div>
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
    const from = "Hooka <info@hooka.com.ar>"; // sin .env para el FROM
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
        gender: true, // solo general
        quantity: true, // solo general
        vipLocation: true, // solo vip
        vipTables: true, // solo vip
        capacityPerTable: true, // solo vip
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

    // Resolvemos brand y absolutizamos logo
    const brandRel = resolveBrand();
    const brand: Brand = {
      ...brandRel,
      logoUrl:
        absUrl(BASE, brandRel.logoUrl) || "https://hooka.com.ar/logov2.png",
    };

    // Armamos el detalle (misma lógica que ya tenías)
    const title = `🫦 ${t.event?.name || brand.name} 🫦`;
    const dateStr = t.event?.date
      ? new Date(t.event.date).toLocaleDateString("es-AR")
      : "";

    let subject = "";
    let detailsHtml = "";

    if (t.ticketType === TicketType.general) {
      // ------ General ------
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

    // Template BORDEAUX SIEMPRE (sin .env ni switches)
    const html = emailTemplateBordeaux({
      brand,
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

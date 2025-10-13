// app/api/send-confirmation/route.ts
import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import QRCode from "qrcode";
import { Resend } from "resend";
import { PaymentStatus as PS } from "@prisma/client";

/* -------------------------------------------------------------------------- */
/*                                 UTILIDADES                                  */
/* -------------------------------------------------------------------------- */

const s = (v: any) =>
  v === undefined || v === null ? undefined : String(v).trim();

const cap = (str?: string | null) =>
  !str ? "" : str.charAt(0).toUpperCase() + str.slice(1);

const isHttpsPublicUrl = (url?: string | null) =>
  !!url && /^https:\/\/[^ ]+$/i.test(url.trim());

/** Infiero BASE pública (útil con Railway/ngrok si olvidaste NEXT_PUBLIC_BASE_URL). */
function getPublicBaseUrl(req: NextRequest) {
  const envBase = process.env.NEXT_PUBLIC_BASE_URL?.trim();
  if (isHttpsPublicUrl(envBase)) return envBase!;
  const proto = req.headers.get("x-forwarded-proto") || "http";
  const host =
    req.headers.get("x-forwarded-host") || req.headers.get("host") || "";
  return `${proto}://${host}`.replace(/\/+$/, "");
}

function buildValidateUrl(base: string, code: string) {
  const origin = base.replace(/\/+$/, "");
  return `${origin}/validate?code=${encodeURIComponent(code)}`;
}

function formatARS(n?: any) {
  const x = Number(n || 0);
  return x.toLocaleString("es-AR", { minimumFractionDigits: 0 });
}

/* -------------------------------------------------------------------------- */
/*                              BRAND / PALETA                                 */
/* -------------------------------------------------------------------------- */

type Brand = {
  name: string;
  logoUrl?: string | null; // labio mordido (PNG/SVG público en https)
  colors: {
    gradientFrom: string;
    gradientTo: string;
    accent: string; // botones/etiquetas
    textOnDark: string;
    textOnLight: string;
    bg: string;
    card: string;
    qrDark?: string;
    qrLight?: string;
  };
};

// Paleta por defecto (estilo flyer Hooka: violeta → naranja con acentos neón)
const DEFAULT_BRAND: Brand = {
  name: "Hooka Pool Party",
  logoUrl: process.env.HOOKA_LOGO_URL || undefined,
  colors: {
    gradientFrom: process.env.HOOKA_GRADIENT_FROM || "#FF006E", // Rosa fucsia tropical
    gradientTo: process.env.HOOKA_GRADIENT_TO || "#FFBE0B", // Amarillo sol
    accent: process.env.HOOKA_ACCENT || "#00F5FF", // Cyan neón
    textOnDark: "#FFFFFF",
    textOnLight: "#1A1A2E",
    bg: process.env.HOOKA_BG || "#0A0E27", // Azul noche profundo
    card: process.env.HOOKA_CARD || "#1A1F3A", // Card con tono azul oscuro
    qrDark: process.env.HOOKA_QR_DARK || "#1A1A2E",
    qrLight: process.env.HOOKA_QR_LIGHT || "#FFFFFF",
  },
};

/** Si guardás branding por evento en BD (ej. event.brandJson), mezclalo acá. */
function resolveBrand(input?: Partial<Brand> | null): Brand {
  const merged: Brand = {
    ...DEFAULT_BRAND,
    ...input,
    colors: { ...DEFAULT_BRAND.colors, ...(input?.colors || {}) },
  };
  return merged;
}

/* --------------------------- QR más chico y legible ------------------------ */
async function makeQrDataUrl(url: string, brand: Brand) {
  try {
    return await QRCode.toDataURL(url, {
      width: 280, // antes 400 → más chico
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
/*                                 TEMPLATE                                    */
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

  // Marca de agua mejorada con efecto de brillo
  const watermark = logoUrl
    ? `<div style="position:absolute; inset:0; display:flex; align-items:center; justify-content:center; pointer-events:none; opacity:.08; filter:saturate(1.3) blur(1px);">
         <img src="${logoUrl}" alt="${brand.name} logo" style="max-width:85%; max-height:85%; transform:rotate(-5deg);"/>
       </div>`
    : "";

  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <meta content="width=device-width, initial-scale=1" name="viewport"/>
    <title>${brand.name}</title>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700;800;900&display=swap');
      
      img { border:0; outline:none; text-decoration:none; }
      table { border-collapse:collapse !important; }
      
      @media (prefers-color-scheme: dark) {
        .card { background: #1A1F3A !important; }
      }
      
      /* Animación de pulso para elementos destacados */
      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.85; }
      }
      
      .pulse {
        animation: pulse 2s ease-in-out infinite;
      }
    </style>
  </head>
  <body style="margin:0; padding:0; background:${colors.bg}; font-family: 'Poppins', Arial, sans-serif; color:${colors.textOnDark};">
    <div style="max-width:680px; margin:0 auto; padding:20px;">
      
     
      <div style="position:relative; border-radius:24px; padding:40px 24px; text-align:center; color:${colors.textOnDark};
                  background: linear-gradient(135deg, ${colors.gradientFrom} 0%, #FB5607 35%, ${colors.gradientTo} 70%, #8338EC 100%);
                  box-shadow: 0 20px 60px rgba(255, 0, 110, 0.4), 0 0 80px rgba(255, 190, 11, 0.3);
                  overflow:hidden;">
        
         
        <div style="position:absolute; top:-50px; right:-50px; width:200px; height:200px; background:radial-gradient(circle, rgba(0,245,255,0.3) 0%, transparent 70%); border-radius:50%;"></div>
        <div style="position:absolute; bottom:-30px; left:-30px; width:150px; height:150px; background:radial-gradient(circle, rgba(255,190,11,0.25) 0%, transparent 70%); border-radius:50%;"></div>
        
        <div style="position:relative; z-index:2;">
          ${
            logoUrl
              ? `<div style="background:rgba(255,255,255,0.15); backdrop-filter:blur(10px); border-radius:24px; padding:16px; display:inline-block; margin-bottom:16px; border:3px solid rgba(255,255,255,0.3); box-shadow:0 8px 32px rgba(0,0,0,0.2);">
            <img src="${logoUrl}" width="100" height="100" alt="${brand.name} logo" style="display:block; border-radius:16px; filter:drop-shadow(0 4px 12px rgba(0,0,0,0.3));"/>
          </div>`
              : ""
          }
          
          <h1 style="margin:12px 0 8px 0; font-size:36px; font-weight:900; line-height:1.1; text-shadow:0 4px 20px rgba(0,0,0,0.4), 0 0 40px rgba(255,190,11,0.5); letter-spacing:-0.5px;">
            ${title}
          </h1>
          
          ${
            subtitle
              ? `<div style="display:inline-block; background:rgba(0,245,255,0.2); backdrop-filter:blur(8px); border:2px solid ${colors.accent}; border-radius:50px; padding:8px 24px; margin-top:8px;">
            <p style="margin:0; font-size:15px; font-weight:600; color:${colors.accent}; text-shadow:0 2px 8px rgba(0,0,0,0.3); letter-spacing:0.5px;">${subtitle}</p>
          </div>`
              : ""
          }
        </div>
      </div>

     
      <div class="card" style="position:relative; background:${colors.card}; border-radius:24px; overflow:hidden; margin-top:16px; 
                                 box-shadow:0 12px 40px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.05);
                                 border:2px solid rgba(255,0,110,0.2);">
        ${watermark}
        
        <div style="height:6px; background:linear-gradient(90deg, ${colors.gradientFrom} 0%, ${colors.accent} 50%, ${colors.gradientTo} 100%);"></div>
        
        <div style="position:relative; padding:32px 24px;">
          
          <div style="background:linear-gradient(135deg, rgba(255,0,110,0.15) 0%, rgba(255,190,11,0.15) 100%); 
                      border-left:5px solid ${colors.accent}; 
                      border-radius:12px; 
                      padding:20px 24px; 
                      margin-bottom:24px;
                      box-shadow:0 4px 16px rgba(0,0,0,0.2);">
            <h2 style="margin:0 0 8px 0; font-size:26px; font-weight:800; color:${colors.textOnDark}; text-shadow:0 2px 8px rgba(0,0,0,0.3);">
              ¡Hola ${name}! 🎉
            </h2>
            <p style="margin:0; font-size:16px; color:rgba(255,255,255,0.9); line-height:1.5;">
              Tu compra fue procesada exitosamente. ¡Prepárate para la fiesta más épica! 🔥
            </p>
          </div>

          ${detailsHtml || ""}

          ${
            validationCode
              ? ` 
              <div style="background:linear-gradient(135deg, ${colors.gradientFrom} 0%, ${colors.gradientTo} 100%); 
                          padding:28px 24px; 
                          text-align:center; 
                          border-radius:20px; 
                          margin:24px 0;
                          box-shadow:0 12px 40px rgba(255,0,110,0.5), 0 0 60px rgba(255,190,11,0.3), inset 0 1px 0 rgba(255,255,255,0.2);
                          border:3px solid rgba(255,255,255,0.2);
                          position:relative;
                          overflow:hidden;">
                
                 
                <div style="position:absolute; top:-50%; left:-50%; width:200%; height:200%; background:radial-gradient(circle, rgba(255,255,255,0.1) 0%, transparent 70%); animation:pulse 3s ease-in-out infinite;"></div>
                
                <div style="position:relative; z-index:2;">
                  <div style="display:inline-block; background:rgba(0,245,255,0.25); backdrop-filter:blur(8px); border-radius:12px; padding:6px 20px; margin-bottom:12px; border:2px solid ${colors.accent};">
                    <p style="margin:0; font-size:12px; font-weight:700; letter-spacing:2px; text-transform:uppercase; color:${colors.accent}; text-shadow:0 2px 8px rgba(0,0,0,0.4);">
                      🫦 Código de Validación 🫦
                    </p>
                  </div>
                  
                  <div style="background:rgba(0,0,0,0.3); backdrop-filter:blur(10px); border-radius:16px; padding:20px; margin:12px auto; max-width:320px; border:2px solid rgba(255,255,255,0.15);">
                    <div style="font-size:48px; font-weight:900; letter-spacing:12px; line-height:1; color:#FFFFFF; text-shadow:0 4px 20px rgba(0,0,0,0.6), 0 0 40px rgba(0,245,255,0.6);">
                      ${validationCode}
                    </div>
                  </div>
                  
                  <p style="margin:12px 0 0 0; font-size:14px; font-weight:600; color:rgba(255,255,255,0.95); text-shadow:0 2px 8px rgba(0,0,0,0.4);">
                    ✨ Mostrá este código o tu QR al personal ✨
                  </p>
                </div>
              </div>`
              : ""
          }

         ${
           qrCodeImage
             ? `
    <div style="
        display:flex; flex-direction:column; align-items:center; justify-content:center;
        background:linear-gradient(135deg, #FFFFFF 0%, #F0F0F0 100%);
        border:4px solid transparent; background-clip:padding-box; position:relative;
        padding:24px; border-radius:20px; margin:24px auto; /* auto => centra el bloque */
        box-shadow:0 12px 40px rgba(0,0,0,0.3); max-width:520px; text-align:center;">
      
      <!-- borde gradiente simulado -->
      <div style="position:absolute; inset:-4px; background:linear-gradient(135deg, ${brand.colors.gradientFrom} 0%, ${brand.colors.accent} 50%, ${brand.colors.gradientTo} 100%); border-radius:20px; z-index:-1;"></div>

      <div style="background:rgba(255,0,110,0.08); border-radius:12px; padding:12px 20px; margin-bottom:16px; display:inline-block;">
        <h3 style="margin:0; font-size:20px; font-weight:800;
                   background:linear-gradient(135deg, ${brand.colors.gradientFrom} 0%, ${brand.colors.gradientTo} 100%);
                   -webkit-background-clip:text; -webkit-text-fill-color:transparent; background-clip:text;">
          🫦 Tu Código QR 🫦
        </h3>
      </div>
                
                <div style="background:#FFFFFF; border-radius:16px; padding:16px; display:inline-block; box-shadow:0 8px 24px rgba(0,0,0,0.15);">
                  <img src="${qrCodeImage}" alt="QR de validación" style="max-width:240px; width:240px; height:auto; display:block; border-radius:8px;"/>
                </div>
                
                <p style="font-size:13px; color:#555; margin:16px 0 0 0; font-weight:600; line-height:1.5;">
                  📱 Escaneá el QR para verificación instantánea
                </p>
              </div>`
             : ""
         }

          
          <div style="background:linear-gradient(135deg, rgba(0,245,255,0.1) 0%, rgba(131,56,236,0.1) 100%); 
                      border:2px solid ${colors.accent}; 
                      border-radius:16px; 
                      padding:20px 24px;
                      box-shadow:0 4px 16px rgba(0,245,255,0.2);">
            <h3 style="margin:0 0 12px 0; font-size:18px; font-weight:800; color:${colors.accent}; text-shadow:0 2px 8px rgba(0,0,0,0.3);">
              📋 Instrucciones
            </h3>
            <ol style="margin:0; padding-left:20px; color:${colors.textOnDark}; line-height:1.8; font-size:15px;">
              <li style="margin-bottom:8px;"><strong>Mostrá este email</strong> al personal de seguridad</li>
              <li style="margin-bottom:8px;">Pueden <strong>escanear tu QR</strong> o ingresar el código de 6 dígitos</li>
              <li>Una vez validado, <strong>¡entrás directo a la fiesta!</strong> 🎊</li>
            </ol>
          </div>

           
          <div style="margin-top:20px; 
                      background:linear-gradient(135deg, rgba(255,0,110,0.15) 0%, rgba(255,190,11,0.15) 100%); 
                      border:2px solid ${colors.gradientFrom}; 
                      border-radius:16px; 
                      padding:20px 24px;
                      box-shadow:0 4px 16px rgba(255,0,110,0.3);">
            <div style="display:flex; align-items:center; margin-bottom:8px;">
              <span style="font-size:24px; margin-right:12px;">⚠️</span>
              <strong style="font-size:17px; color:${colors.textOnDark}; font-weight:800;">Aclaración Importante</strong>
            </div>
            <p style="margin:8px 0 0 0; color:rgba(255,255,255,0.9); line-height:1.6; font-size:14px;">
              En <strong>el evento</strong> no se aceptan bebidas de afuera. Si traés bebidas, se
              guardarán en un lugar seguro y se devolverán al final del evento. 🍹
            </p>
          </div>

       
          <div style="text-align:center; margin:32px 0 0 0; padding:24px; background:linear-gradient(135deg, ${colors.gradientFrom} 0%, ${colors.gradientTo} 100%); border-radius:16px; box-shadow:0 8px 24px rgba(255,0,110,0.4);">
            <p style="margin:0; font-size:22px; font-weight:900; color:#FFFFFF; text-shadow:0 2px 12px rgba(0,0,0,0.4); letter-spacing:0.5px;">
              ¡Nos vemos en la fiesta! 🎉🔥
            </p>
            <p style="margin:8px 0 0 0; font-size:14px; color:rgba(255,255,255,0.9); font-weight:600;">
              Prepárate para una noche inolvidable 🫦
            </p>
          </div>
        </div>
      </div>

     
      <div style="text-align:center; padding:24px 16px; margin-top:16px;">
        <div style="display:inline-block; background:rgba(255,255,255,0.05); backdrop-filter:blur(10px); border-radius:16px; padding:16px 32px; border:1px solid rgba(255,255,255,0.1);">
          <p style="margin:0 0 8px 0; font-size:18px; font-weight:800; background:linear-gradient(135deg, ${colors.gradientFrom} 0%, ${colors.gradientTo} 100%); -webkit-background-clip:text; -webkit-text-fill-color:transparent; background-clip:text;">
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
/*                                  HANDLER                                    */
/* -------------------------------------------------------------------------- */

type Payload = { type?: "ticket" | "vip-table"; recordId?: string };

export async function POST(request: NextRequest) {
  try {
    const { type, recordId } = (await request.json()) as Payload;
    if (!type || !recordId) {
      return NextResponse.json(
        { error: "type y recordId son requeridos" },
        { status: 400 }
      );
    }

    const BASE = getPublicBaseUrl(request);

    // Resend (modo simulación si falta API key)
    const apiKey = s(process.env.RESEND_API_KEY);
    const from =
      s(process.env.RESEND_FROM) || "Hooka Party <info@hooka.com.ar>";
    const resend = apiKey ? new Resend(apiKey) : null;

    // Helper común para enviar
    async function enviar({
      to,
      subject,
      html,
    }: {
      to: string;
      subject: string;
      html: string;
    }) {
      if (!resend) {
        console.warn("[send-confirmation] RESEND_API_KEY ausente — simulación");
        return { simulated: true };
      }
      const res = await resend.emails.send({ from, to, subject, html });
      if ((res as any)?.error) {
        console.error("[send-confirmation] Resend error:", (res as any).error);
        throw new Error("ResendError");
      }
      return res;
    }

    /* ----------------------------- ENTRADA (ticket) ---------------------------- */
    if (type === "ticket") {
      const t = await prisma.ticket.findUnique({
        where: { id: recordId },
        select: {
          customerName: true,
          customerEmail: true,
          ticketType: true, // "general" | "vip"
          gender: true, // "hombre" | "mujer" | null
          validationCode: true,
          totalPrice: true,
          paymentStatus: true,
          event: {
            select: {
              name: true,
              date: true,
              // Si guardás branding por evento, exponer aquí (JSON o campos sueltos)
              // brandJson: true as any,
            },
          },
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

      const brand = resolveBrand(/* t.event?.brandJson */ undefined);
      const typeLabel =
        t.ticketType === "vip" ? "Entrada VIP" : "Entrada General";
      const title = `🫦 ${t.event?.name || brand.name} 🫦`;
      const dateStr = t.event?.date
        ? new Date(t.event.date).toLocaleDateString("es-AR")
        : "";
      const genreLabel =
        t.ticketType === "general" && t.gender
          ? `<strong>Género:</strong> ${cap(t.gender)}<br/>`
          : "";

      const detailsHtml =
        `` +
        `<div style="background:#fff; border:1px solid #e8e8e8; padding:14px 16px; border-radius:8px; margin-bottom:12px; color:#111;">` +
        `<strong>Tipo:</strong> ${typeLabel}<br/>` +
        `${genreLabel}` +
        `${dateStr ? `<strong>Fecha:</strong> ${dateStr}<br/>` : ""}` +
        `<strong>Total:</strong> $ ${formatARS(t.totalPrice)}<br/>` +
        `</div>`;

      const validateUrl = t.validationCode
        ? buildValidateUrl(BASE, t.validationCode)
        : null;
      const qrImage = validateUrl
        ? await makeQrDataUrl(validateUrl, brand)
        : null;

      const html = emailTemplate({
        brand,
        title,
        subtitle: "Tu entrada está confirmada",
        name: t.customerName || "invitad@",
        detailsHtml,
        validationCode: t.validationCode || undefined,
        qrCodeImage: qrImage || undefined,
      });

      const result = await enviar({
        to: t.customerEmail || "",
        subject: `🫦 ${typeLabel} — Código: ${t.validationCode || "—"}`,
        html,
      });

      return NextResponse.json({ success: true, validateUrl, ...result });
    }

    /* ----------------------------- MESA VIP (vip-table) ----------------------- */
    if (type === "vip-table") {
      const r = await prisma.tableReservation.findUnique({
        where: { id: recordId },
        select: {
          customerName: true,
          customerEmail: true,
          packageType: true,
          tables: true,
          capacity: true,
          validationCode: true,
          totalPrice: true,
          paymentStatus: true,
          event: {
            select: {
              name: true,
              date: true,
              // brandJson: true as any,
            },
          },
        },
      });

      if (!r)
        return NextResponse.json(
          { error: "Reserva no encontrada" },
          { status: 404 }
        );

      if (r.paymentStatus !== PS.approved) {
        return NextResponse.json(
          { error: "El pago no está aprobado para esta reserva" },
          { status: 409 }
        );
      }

      const brand = resolveBrand(/* r.event?.brandJson */ undefined);
      const typeLabel = "Mesa VIP";
      const title = `🫦 ${r.event?.name || brand.name} 🫦`;
      const dateStr = r.event?.date
        ? new Date(r.event.date).toLocaleDateString("es-AR")
        : "";

      const detailsHtml =
        `` +
        `<div style="background:#fff; border:1px solid #e8e8e8; padding:14px 16px; border-radius:8px; margin-bottom:12px; color:#111;">` +
        `${dateStr ? `<strong>Fecha:</strong> ${dateStr}<br/>` : ""}` +
        `<strong>Mesas:</strong> ${r.tables || 1}<br/>` +
        `<strong>Capacidad (ref):</strong> ${r.capacity || 0} personas<br/>` +
        `<strong>Total:</strong> $ ${formatARS(r.totalPrice)}<br/>` +
        `</div>`;

      const validateUrl = r.validationCode
        ? buildValidateUrl(BASE, r.validationCode)
        : null;
      const qrImage = validateUrl
        ? await makeQrDataUrl(validateUrl, brand)
        : null;

      const html = emailTemplate({
        brand,
        title,
        subtitle: "Tu mesa VIP está confirmada",
        name: r.customerName || "invitad@",
        detailsHtml,
        validationCode: r.validationCode || undefined,
        qrCodeImage: qrImage || undefined,
      });

      const result = await enviar({
        to: r.customerEmail || "",
        subject: `🫦 ${typeLabel} — Código: ${r.validationCode || "—"}`,
        html,
      });

      return NextResponse.json({ success: true, validateUrl, ...result });
    }

    return NextResponse.json({ error: "Tipo inválido" }, { status: 400 });
  } catch (error) {
    console.error("[send-confirmation] Error:", error);
    return NextResponse.json(
      { error: "Error enviando confirmación" },
      { status: 500 }
    );
  }
}

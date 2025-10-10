// app/api/send-confirmation/route.ts
import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import QRCode from "qrcode";
import { Resend } from "resend";
import { PaymentStatus as PS } from "@prisma/client";

// ===== Utils =====
const s = (v: any) =>
  v === undefined || v === null ? undefined : String(v).trim();

function cap(str?: string | null) {
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function isHttpsPublicUrl(url?: string | null) {
  if (!url) return false;
  const trimmed = url.trim();
  return /^https:\/\/[^ ]+$/i.test(trimmed);
}

/** Infiero BASE pública (útil con Railway/ngrok si olvidaste NEXT_PUBLIC_BASE_URL). */
function getPublicBaseUrl(req: NextRequest) {
  const envBase = process.env.NEXT_PUBLIC_BASE_URL?.trim();
  if (isHttpsPublicUrl(envBase)) return envBase!;
  const proto = req.headers.get("x-forwarded-proto") || "http";
  const host =
    req.headers.get("x-forwarded-host") || req.headers.get("host") || "";
  // Si viene https en el proxy, armamos https. Si no, queda http (igual QR funciona).
  const guessed = `${proto}://${host}`;
  return guessed.replace(/\/+$/, "");
}

/** URL que queremos codificar en el QR.
 *  Elegímos endpoint público de validación directa (API):
 *    https://BASE/validate?code=XXXXXX
 *  Si preferís abrir una página de UI (por ejemplo /admin/validate), cambiá la ruta acá.
 */
function buildValidateUrl(base: string, code: string) {
  const origin = base.replace(/\/+$/, "");
  const c = encodeURIComponent(code);
  return `${origin}/validate?code=${c}`;
}

async function makeQrDataUrlFromValidateUrl(url: string) {
  try {
    return await QRCode.toDataURL(url, {
      width: 400,
      margin: 2,
      color: { dark: "#000000", light: "#FFFFFF" },
    });
  } catch {
    return null;
  }
}

function formatARS(n?: any) {
  const x = Number(n || 0);
  return x.toLocaleString("es-AR", { minimumFractionDigits: 0 });
}

function emailTemplate({
  title,
  name,
  typeLabel,
  detailsHtml,
  validationCode,
  qrCodeImage,
}: {
  title: string;
  name: string;
  typeLabel: string;
  detailsHtml?: string;
  validationCode?: string | null;
  qrCodeImage?: string | null;
}) {
  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <style>
      body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
      .container { max-width: 600px; margin: 0 auto; padding: 20px; }
      .header { background: linear-gradient(135deg, #06b6d4 0%, #f97316 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
      .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
      .qr-section { background: white; padding: 20px; text-align: center; margin: 20px 0; border-radius: 10px; }
      .code-section { background: #06b6d4; color: white; padding: 20px; text-align: center; margin: 20px 0; border-radius: 10px; }
      .code { font-size: 36px; font-weight: bold; letter-spacing: 5px; }
      .info { background: white; padding: 15px; margin: 10px 0; border-radius: 5px; }
      .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
      a { color: #06b6d4; }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <h1>${title}</h1>
        <p>¡Tu ${typeLabel.toLowerCase()} está confirmada!</p>
      </div>
      <div class="content">
        <h2>¡Hola ${name}!</h2>
        <p>Tu compra ha sido procesada. Aquí están los detalles:</p>

        ${detailsHtml || ""}

        ${
          validationCode
            ? `<div class="code-section">
                <p style="margin: 0 0 10px 0; font-size: 14px;">CÓDIGO DE VALIDACIÓN</p>
                <div class="code">${validationCode}</div>
                <p style="margin: 10px 0 0 0; font-size: 12px;">Mostrá este código al personal de seguridad</p>
              </div>`
            : ""
        }

        ${
          qrCodeImage
            ? `<div class="qr-section">
                <h3>Tu Código QR</h3>
                <img src="${qrCodeImage}" alt="QR Code" style="max-width: 300px; width: 100%;">
                <p style="font-size: 12px; color: #666; margin-top: 10px;">
                  Este QR contiene el enlace de verificación con tu código.
                </p>
              </div>`
            : ""
        }

        <div class="info">
          <h3>Instrucciones:</h3>
          <ol>
            <li>Mostrá este email al personal de seguridad</li>
            <li>Pueden escanear tu QR o ingresar el código de 6 dígitos</li>
            <li>Una vez validado, podrás ingresar al evento</li>
          </ol>
        </div>

        <p style="text-align: center; margin-top: 30px;">
          <strong>¡Nos vemos en la fiesta! 🎉</strong>
        </p>
      </div>
      <div class="footer">
        <p>Hooka Pool Party</p>
        <p>La ubicación se confirmará 24hs antes del evento</p>
      </div>
    </div>
  </body>
</html>`;
}

// ===== Handler =====
export async function POST(request: NextRequest) {
  try {
    const { type, recordId } = (await request.json()) as {
      type?: "ticket" | "vip-table";
      recordId?: string;
    };

    if (!type || !recordId) {
      return NextResponse.json(
        { error: "type y recordId son requeridos" },
        { status: 400 }
      );
    }

    // BASE pública para armar la URL del QR
    const BASE = getPublicBaseUrl(request);

    // Creamos Resend en runtime; si no hay API key, simulamos
    const apiKey = process.env.RESEND_API_KEY?.trim();
    const from =
      process.env.RESEND_FROM?.trim() || "Hooka Party <info@hooka.com.ar>";
    const resend = apiKey ? new Resend(apiKey) : null;

    // ========= ENTRADA (ticket) =========
    if (type === "ticket") {
      const t = await prisma.ticket.findUnique({
        where: { id: recordId },
        select: {
          customerName: true,
          customerEmail: true,
          ticketType: true, // "general" | "vip"
          gender: true, // "hombre" | "mujer" | null
          validationCode: true,
          qrCode: true, // legacy/ignorado para QR de email
          totalPrice: true,
          paymentStatus: true,
          event: { select: { name: true, date: true } },
        },
      });

      if (!t) {
        return NextResponse.json(
          { error: "Ticket no encontrado" },
          { status: 404 }
        );
      }

      // Si el pago no está aprobado, no enviamos (opcional)
      if (t.paymentStatus !== PS.approved) {
        return NextResponse.json(
          { error: "El pago no está aprobado para este ticket" },
          { status: 409 }
        );
      }

      const title = `🌴 ${t.event?.name || "Hooka Party"} 🌴`;
      const typeLabel =
        t.ticketType === "vip" ? "Mesa VIP / Entrada VIP" : "Entrada General";

      const genreLabel = t.gender ? cap(t.gender) : "";
      const dateStr = t.event?.date
        ? new Date(t.event.date).toLocaleDateString("es-AR")
        : "";

      const detailsHtml = `
        <div class="info">
          <strong>Tipo:</strong> ${typeLabel}<br>
          ${
            t.ticketType === "general" && genreLabel
              ? `<strong>Género:</strong> ${genreLabel}<br>`
              : ""
          }
       
          <strong>Total:</strong> $ ${formatARS(t.totalPrice)}<br>
          
        </div>`;

      // ✅ Armamos URL de validación con el validationCode y generamos el QR con esa URL
      const validateUrl = t.validationCode
        ? buildValidateUrl(BASE, t.validationCode)
        : null;
      const qrImage = validateUrl
        ? await makeQrDataUrlFromValidateUrl(validateUrl)
        : null;

      const html = emailTemplate({
        title,
        name: t.customerName || "invitad@",
        typeLabel,
        detailsHtml,
        validationCode: t.validationCode || undefined,
        qrCodeImage: qrImage || undefined,
      });

      // Modo simulación
      if (!resend) {
        console.warn(
          "[send-confirmation] RESEND_API_KEY no configurada — simulación OK"
        );
        return NextResponse.json({
          success: true,
          simulated: true,
          validateUrl,
        });
      }

      const res = await resend.emails.send({
        from,
        to: t.customerEmail || "",
        subject: `🌴 Tu ${typeLabel} — Código: ${t.validationCode || "—"}`,
        html,
      });

      if ((res as any)?.error) {
        console.error("[send-confirmation] Resend error:", (res as any).error);
        return NextResponse.json(
          { error: "Error enviando email" },
          { status: 502 }
        );
      }

      return NextResponse.json({ success: true, validateUrl });
    }

    // ========= MESA VIP (vip-table) =========
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
          qrCode: true, // legacy/ignorado para QR de email
          totalPrice: true,
          paymentStatus: true,
          event: { select: { name: true, date: true } },
        },
      });

      if (!r) {
        return NextResponse.json(
          { error: "Reserva no encontrada" },
          { status: 404 }
        );
      }

      if (r.paymentStatus !== PS.approved) {
        return NextResponse.json(
          { error: "El pago no está aprobado para esta reserva" },
          { status: 409 }
        );
      }

      const title = `🌴 ${r.event?.name || "Hooka Party"} 🌴`;
      const typeLabel = "Mesa VIP";

      const dateStr = r.event?.date
        ? new Date(r.event.date).toLocaleDateString("es-AR")
        : "";

      const detailsHtml = `
        <div class="info">
          
          <strong>Mesas:</strong> ${r.tables || 1}<br>
          <strong>Capacidad (ref):</strong> ${r.capacity || 0} personas<br>
          <strong>Total:</strong> $ ${formatARS(r.totalPrice)}<br>
          
        </div>`;

      // ✅ URL de validación con validationCode
      const validateUrl = r.validationCode
        ? buildValidateUrl(BASE, r.validationCode)
        : null;
      const qrImage = validateUrl
        ? await makeQrDataUrlFromValidateUrl(validateUrl)
        : null;

      const html = emailTemplate({
        title,
        name: r.customerName || "invitad@",
        typeLabel,
        detailsHtml,
        validationCode: r.validationCode || undefined,
        qrCodeImage: qrImage || undefined,
      });

      if (!resend) {
        console.warn(
          "[send-confirmation] RESEND_API_KEY no configurada — simulación OK"
        );
        return NextResponse.json({
          success: true,
          simulated: true,
          validateUrl,
        });
      }

      const res = await resend.emails.send({
        from,
        to: r.customerEmail || "",
        subject: `🌴 Tu ${typeLabel} — Código: ${r.validationCode || "—"}`,
        html,
      });

      if ((res as any)?.error) {
        console.error("[send-confirmation] Resend error:", (res as any).error);
        return NextResponse.json(
          { error: "Error enviando email" },
          { status: 502 }
        );
      }

      return NextResponse.json({ success: true, validateUrl });
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

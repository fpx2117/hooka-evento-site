import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import QRCode from "qrcode";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request: NextRequest) {
  try {
    const { type, recordId } = await request.json();

    let record: any;
    let qrData: string;
    let emailData: any;

    if (type === "ticket") {
      record = await prisma.ticket.findUnique({
        where: { id: recordId },
      });

      if (!record) {
        return NextResponse.json(
          { error: "Ticket no encontrado" },
          { status: 404 }
        );
      }

      qrData = record.qrCode;
      emailData = {
        name: record.customerName,
        email: record.customerEmail,
        type: "Entrada General",
        ticketType: record.ticketType,
        gender: record.gender === "male" ? "Hombre" : "Mujer",
        validationCode: record.validationCode,
        qrCode: record.qrCode,
      };
    } else if (type === "vip-table") {
      record = await prisma.tableReservation.findUnique({
        where: { id: recordId },
      });

      if (!record) {
        return NextResponse.json(
          { error: "Reserva no encontrada" },
          { status: 404 }
        );
      }

      qrData = record.qrCode;
      emailData = {
        name: record.customerName,
        email: record.customerEmail,
        type: "Mesa VIP",
        package: record.package,
        location:
          record.location === "pool" ? "Cerca de la Piscina" : "Cerca del DJ",
        validationCode: record.validationCode,
        qrCode: record.qrCode,
      };
    } else {
      return NextResponse.json({ error: "Tipo inválido" }, { status: 400 });
    }

    const qrCodeImage = await QRCode.toDataURL(qrData, {
      width: 400,
      margin: 2,
      color: {
        dark: "#000000",
        light: "#FFFFFF",
      },
    });

    const emailHtml = `
      <!DOCTYPE html>
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
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🌴 Tropical Pool Party 🌴</h1>
              <p>¡Tu entrada está confirmada!</p>
            </div>
            <div class="content">
              <h2>¡Hola ${emailData.name}!</h2>
              <p>Tu compra ha sido procesada exitosamente. Aquí están los detalles de tu entrada:</p>
              
              <div class="info">
                <strong>Tipo:</strong> ${emailData.type}<br>
                ${emailData.ticketType ? `<strong>Entrada:</strong> ${emailData.ticketType}<br>` : ""}
                ${emailData.gender ? `<strong>Género:</strong> ${emailData.gender}<br>` : ""}
                ${emailData.package ? `<strong>Paquete:</strong> ${emailData.package}<br>` : ""}
                ${emailData.location ? `<strong>Ubicación:</strong> ${emailData.location}<br>` : ""}
              </div>

              <div class="code-section">
                <p style="margin: 0 0 10px 0; font-size: 14px;">CÓDIGO DE VALIDACIÓN</p>
                <div class="code">${emailData.validationCode}</div>
                <p style="margin: 10px 0 0 0; font-size: 12px;">Mostrá este código al personal de seguridad</p>
              </div>

              <div class="qr-section">
                <h3>Tu Código QR</h3>
                <img src="${qrCodeImage}" alt="QR Code" style="max-width: 300px; width: 100%;">
                <p style="font-size: 12px; color: #666; margin-top: 10px;">
                  Escaneá este QR al ingresar al evento
                </p>
              </div>

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
              <p>Tropical Pool Party - Domingos a principios de mes</p>
              <p>La ubicación se confirmará 24hs antes del evento</p>
            </div>
          </div>
        </body>
      </html>
    `;

    await resend.emails.send({
      from: "Tropical Pool Party <onboarding@resend.dev>",
      to: emailData.email,
      subject: `🌴 Tu entrada para Tropical Pool Party - Código: ${emailData.validationCode}`,
      html: emailHtml,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error enviando confirmación:", error);
    return NextResponse.json(
      { error: "Error enviando confirmación" },
      { status: 500 }
    );
  }
}

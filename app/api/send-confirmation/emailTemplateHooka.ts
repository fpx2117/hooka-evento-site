export function emailTemplateHooka({
  name,
  validationCode,
  qrCodeImage,
  ticketType,
  gender,
  quantity,
  date,
  total,
  vipLocation,
  vipTableNumber,
  vipCapacity,
}: {
  name: string;
  validationCode: string;
  qrCodeImage: string;
  ticketType: string;
  gender: string;
  quantity: number;
  date: string;
  total: string;
  vipLocation?: string | null;
  vipTableNumber?: number | null;
  vipCapacity?: number | null;
}) {
  const isVip = Boolean(vipLocation);

  const ticketDetails = isVip
    ? `
      <div style="background:#fff; border:1px solid #e8e8e8; padding:14px 16px; border-radius:8px;
        margin-bottom:12px; color:#111;">
        <strong>Tipo:</strong> ${ticketType}<br />
        <strong>Ubicación:</strong> ${vipLocation}<br />
        ${
          vipTableNumber
            ? `<strong>Mesa:</strong> #${vipTableNumber}<br />`
            : ""
        }
        ${
          vipCapacity
            ? `<strong>Capacidad:</strong> ${vipCapacity} personas<br />`
            : ""
        }
        <strong>Fecha:</strong> ${date}<br />
        <strong>Total:</strong> ${total}<br />
      </div>
    `
    : `
      <div style="background:#fff; border:1px solid #e8e8e8; padding:14px 16px; border-radius:8px;
        margin-bottom:12px; color:#111;">
        <strong>Tipo:</strong> ${ticketType}<br />
        <strong>Género:</strong> ${gender}<br />
        <strong>Cantidad:</strong> ${quantity}<br />
        <strong>Fecha:</strong> ${date}<br />
        <strong>Total:</strong> ${total}<br />
      </div>
    `;

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta content="width=device-width, initial-scale=1" name="viewport" />
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>Hooka</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700;800;900&display=swap');
    img { border:0; outline:none; text-decoration:none; display:block; }
    table { border-collapse:collapse !important; }
    body, table, td, div, p { -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
    :root { color-scheme: light; supported-color-schemes: light; }
    .no-invert { filter:none !important; mix-blend-mode:normal !important; }
  </style>
</head>

<body bgcolor="#5b0d0d" style="margin:0; padding:0; background:#5b0d0d; font-family:'Poppins', Arial, sans-serif; color:#FFFFFF;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#5b0d0d">
    <tr>
      <td align="center">
        <div role="article" aria-roledescription="email" style="max-width:680px; margin:0 auto; padding:20px;">
          
          <!-- HERO -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-radius:24px; overflow:hidden;">
            <tr>
              <td style="background:#5b0d0d; background-image: linear-gradient(135deg, #5b0d0d 0%, #3f0a0a 100%);
                border-radius:24px; text-align:center; padding:34px 22px; position:relative;">
                <div style="position:relative; z-index:2;">
                  <div class="no-invert" style="background:rgba(227,207,191,0.14); backdrop-filter:blur(8px);
                    border-radius:18px; padding:10px; display:inline-block; margin-bottom:10px;
                    border:2px solid rgba(227,207,191,0.35);">
                    <img class="no-invert" src="https://hooka.com.ar/logov2.png" width="88" height="88" alt="Hooka logo" style="border-radius:12px;" />
                  </div>
                  <h1 style="margin:10px 0 6px 0; font-size:32px; font-weight:900; color:#fff;">🫦 Hooka 🫦</h1>
                  <div class="no-invert" style="display:inline-block; background:rgba(227,207,191,0.18);
                    border:2px solid #E3CFBF; border-radius:999px; padding:6px 18px; margin-top:6px;">
                    <p style="margin:0; font-size:14px; font-weight:700; color:#E3CFBF;">Tu entrada está confirmada</p>
                  </div>
                </div>
                <div aria-hidden="true" style="position:absolute; inset:0; background:
                  radial-gradient(800px 420px at 40% 50%, rgba(0,0,0,0.25), rgba(0,0,0,0) 55%); opacity:.45;"></div>
              </td>
            </tr>
          </table>

          <!-- CARD PRINCIPAL -->
          <div style="position:relative; background:#120202; border-radius:24px; overflow:hidden; margin-top:16px;
            box-shadow:0 18px 50px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.06);
            border:2px solid rgba(255,255,255,0.12);">
            <div style="position:relative; padding:32px 24px;">
              
              <div style="background:linear-gradient(135deg, rgba(91,13,13,0.30) 0%, rgba(63,10,10,0.26) 100%);
                border-left:5px solid #E3CFBF; border-radius:12px; padding:18px 20px; margin-bottom:20px;">
                <h2 style="margin:0 0 8px 0; font-size:24px; font-weight:800;">¡Hola ${name}! 🎉</h2>
                <p style="margin:0; font-size:15px; color:rgba(255,255,255,0.94);">
                  Tu compra fue procesada exitosamente. ¡Prepárate para la fiesta! 🔥
                </p>
              </div>

              ${ticketDetails}

              <div style="background:linear-gradient(135deg, #5b0d0d 0%, #3f0a0a 100%);
                padding:24px 22px; text-align:center; border-radius:18px; margin:22px 0;
                box-shadow:0 12px 40px rgba(91,13,13,0.45), 0 0 60px rgba(63,10,10,0.28);
                border:3px solid rgba(255,255,255,0.18);">
                <div style="display:inline-block; background:rgba(227,207,191,0.22); border-radius:12px;
                  padding:6px 16px; margin-bottom:10px; border:2px solid #E3CFBF;">
                  <p style="margin:0; font-size:12px; font-weight:800; letter-spacing:2px; text-transform:uppercase; color:#E3CFBF;">🫦 Código de Validación 🫦</p>
                </div>
                <div style="background:rgba(0,0,0,0.3); border-radius:12px; padding:16px; margin:10px auto;
                  max-width:320px; border:2px solid rgba(255,255,255,0.15);">
                  <div style="font-size:34px; font-weight:900; letter-spacing:10px; color:#FFFFFF;">${validationCode}</div>
                </div>
                <p style="margin:10px 0 0 0; font-size:13px; font-weight:700; color:rgba(255,255,255,0.96);">✨ Mostrá este código o tu QR al personal ✨</p>
              </div>

              <!-- QR -->
              <div style="display:flex; flex-direction:column; align-items:center; justify-content:center;
                background:#FFFFFF; border:4px solid transparent; position:relative;
                padding:22px; border-radius:18px; margin:22px auto;
                box-shadow:0 12px 40px rgba(0,0,0,0.3); max-width:520px; text-align:center;">
                <div style="position:absolute; inset:-4px; background:linear-gradient(135deg, #5b0d0d 0%, #E3CFBF 50%, #3f0a0a 100%);
                  border-radius:18px; z-index:-1;"></div>
                <h3 style="margin:0 0 12px; font-size:18px; font-weight:800; color:#5b0d0d;">🫦 Tu Código QR 🫦</h3>
                <img src="${qrCodeImage}" alt="QR" width="240" style="max-width:240px; height:auto; border-radius:8px;" />
                <p style="font-size:12px; color:#555; margin:14px 0 0 0; font-weight:700;">📱 Mostrá este código o tu QR al personal 📱</p>
              </div>

              <!-- Instrucciones -->
              <div style="background:linear-gradient(135deg, rgba(227,207,191,0.10) 0%, rgba(131,56,236,0.10) 100%);
                border:2px solid #E3CFBF; border-radius:14px; padding:18px 20px;">
                <h3 style="margin:0 0 10px 0; font-size:16px; font-weight:900; color:#E3CFBF;">📋 Instrucciones</h3>
                <ol style="margin:0; padding-left:20px; color:#FFFFFF; line-height:1.75; font-size:14px;">
                  <li><strong>Mostrá este email</strong> al personal de seguridad</li>
                  <li>Pueden <strong>escanear tu QR</strong> o ingresar el código de 6 dígitos</li>
                  <li>Una vez validado, <strong>¡entrás directo a la fiesta!</strong> 🎊</li>
                </ol>
              </div>

              <!-- Footer -->
              <div style="text-align:center; margin:26px 0 0 0; padding:20px;
                background:linear-gradient(135deg, #5b0d0d 0%, #3f0a0a 100%); border-radius:14px;">
                <p style="margin:0; font-size:20px; font-weight:900; color:#FFFFFF;">¡Nos vemos en la fiesta! 🎉🔥</p>
                <p style="margin:8px 0 0 0; font-size:13px; color:rgba(255,255,255,0.92); font-weight:700;">Prepárate para una noche inolvidable 🫦</p>
              </div>
            </div>
          </div>

         <div style="text-align:center; padding:20px 14px; margin-top:14px;">
  <div style="display:inline-block; background:rgba(255,255,255,0.06); border-radius:14px; padding:20px 24px; border:1px solid rgba(255,255,255,0.10); max-width: 400px; text-align: left;">
    
    <p style="margin:0 0 12px 0; font-size:20px; font-weight:900; color:#FFFFFF; text-align: center;">Hooka</p>

    <p style="margin:0 0 4px 0; font-size:13px; color:#FFFFFF; font-weight:700;">📍 Ubicación del evento:</p>
    <p style="margin:0 0 12px 0; font-size:12px; color:#A7AABB; font-weight:500;">Martín García 2860, B1617 Gral. Pacheco, Provincia de Buenos Aires</p>

    <p style="margin:0 0 4px 0; font-size:13px; color:#FFFFFF; font-weight:700;">🗺 Google Maps:</p>
    <p style="margin:0 0 16px 0; font-size:12px; color:#4A90E2; font-weight:500; word-break: break-all;">
      <a href="https://maps.app.goo.gl/gJ7siosTsN5nauJy5" style="color:#4A90E2; text-decoration: none;">https://maps.app.goo.gl/gJ7siosTsN5nauJy5</a>
    </p>

    <hr style="border: 0; border-top: 1px solid rgba(255,255,255,0.1); margin-bottom: 16px;">

    <p style="margin:0 0 8px 0; font-size:13px; color:#FF4D4D; font-weight:900;">⚠ Importante:</p>
    <ul style="margin:0 0 16px 0; padding-left: 0; list-style: none; font-size: 12px; color:#A7AABB; line-height: 1.6;">
      <li>🚫 No se puede ingresar con alcohol 🍾</li>
      <li>🍹 Dentro del evento vas a poder comprar lo que quieras</li>
      <li>🧊 Se puede ingresar con conservadoras y hielo si lo necesitás.</li>
    </ul>

    <p style="margin:0; font-size:11px; color:#A7AABB; font-weight:400; text-align: center; font-style: italic;">
      Cualquier duda o consulta comunicarse por WhatsApp de la pagina o al Instagram <b>@hooka.official</b>
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

import QRCode from "qrcode";

/**
 * Construye la URL de validación según el entorno
 * Si se ejecuta en el navegador → usa window.location.origin
 * Si se ejecuta en el servidor (Next.js) → usa el dominio de NEXT_PUBLIC_SITE_URL o fallback a localhost
 */
export function buildValidateUrl(code: string): string {
  const encoded = encodeURIComponent(code);

  // 🧠 Si estamos en el navegador, usamos el origen real
  if (typeof window !== "undefined") {
    return `${window.location.origin}/validate?code=${encoded}`;
  }

  // 🌐 En SSR, usamos variable de entorno o localhost
  const base =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.VERCEL_URL?.startsWith("http")
      ? process.env.VERCEL_URL
      : `https://${process.env.VERCEL_URL || "localhost:3000"}`;

  return `${base}/validate?code=${encoded}`;
}

/**
 * Genera un QR DataURL para la URL del código
 * @param code Código de validación (string)
 * @param scale Tamaño del QR (opcional)
 * @returns string (DataURL base64 listo para <img src="..." />)
 */
export async function makeQrDataUrl(code: string, scale = 4): Promise<string> {
  const url = buildValidateUrl(code);
  try {
    // ✅ QR optimizado sin borde grueso
    return await QRCode.toDataURL(url, {
      margin: 1,
      scale,
      color: {
        dark: "#000000",
        light: "#ffffff",
      },
    });
  } catch (err) {
    console.error("Error generando QR:", err);
    throw new Error("No se pudo generar el QR para el código.");
  }
}

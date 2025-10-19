import QRCode from "qrcode";

export function buildValidateUrl(code: string) {
  if (typeof window !== "undefined") {
    return `${window.location.origin}/validate?code=${encodeURIComponent(code)}`;
  }
  return `/validate?code=${encodeURIComponent(code)}`;
}

export async function makeQrDataUrl(code: string, scale = 4) {
  const url = buildValidateUrl(code);
  return await QRCode.toDataURL(url, { margin: 1, scale });
}

// lib/http.ts
import axios, { AxiosInstance } from "axios";

/**
 * Normaliza y valida la base pública.
 * Acepta:
 *  - https://mi-dominio.com
 *  - http://localhost:3000
 *  - (si viene sin esquema, se asume https en prod y http en dev)
 */
function normalizeBaseUrl(raw?: string): string {
  let v = (raw || "").trim();

  if (!v) {
    const vercel = process.env.VERCEL_URL?.trim(); // sin esquema
    if (vercel) v = `https://${vercel}`;
  }

  if (!v) {
    // Fallback local
    v = "http://localhost:3000";
  }

  // Si viene sin esquema
  if (!/^https?:\/\//i.test(v)) {
    const isProd = process.env.NODE_ENV === "production";
    v = `${isProd ? "https" : "http"}://${v}`;
  }

  // quitar barras finales repetidas
  return v.replace(/\/+$/, "");
}

/**
 * Devuelve instancia Axios lista para usar.
 * Si la primera llamada falla por ECONNREFUSED y la base contiene http/https,
 * getHttpRetry() se encarga de reintentar con el esquema alternativo.
 */
export function getHttp(baseOverride?: string): AxiosInstance {
  const baseURL = normalizeBaseUrl(
    baseOverride ?? process.env.NEXT_PUBLIC_BASE_URL
  );

  const instance = axios.create({
    baseURL,
    withCredentials: false,
    timeout: 15000,
  });

  if (process.env.NODE_ENV !== "production") {
    // eslint-disable-next-line no-console
    console.log("[http] baseURL =", baseURL);
  }

  return instance;
}

/**
 * Ejecuta una función que hace request con axios y, si hay ECONNREFUSED,
 * intenta de nuevo con el protocolo alternativo (http<->https).
 */
export async function withProtocolFallback<T>(
  run: (client: AxiosInstance) => Promise<T>,
  base?: string
): Promise<T> {
  const first = getHttp(base);
  try {
    return await run(first);
  } catch (err: any) {
    const msg = err?.code || err?.message || "";
    const currentBase = (first.defaults.baseURL || "") as string;

    // Solo tiene sentido si hay esquema http/https y el error es conexión rechazada
    if (/ECONNREFUSED/i.test(msg) && /^https?:\/\//i.test(currentBase)) {
      const altBase = currentBase.startsWith("https://")
        ? currentBase.replace(/^https:\/\//i, "http://")
        : currentBase.replace(/^http:\/\//i, "https://");

      if (process.env.NODE_ENV !== "production") {
        // eslint-disable-next-line no-console
        console.warn("[http] ECONNREFUSED, reintentando con:", altBase);
      }

      const second = getHttp(altBase);
      return await run(second);
    }

    throw err;
  }
}

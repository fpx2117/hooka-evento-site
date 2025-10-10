// lib/http.ts
import axios, { AxiosError } from "axios";
import axiosRetry from "axios-retry";

export type ApiError = {
  status: number;
  code?: string;
  message: string;
  details?: unknown;
};

function getBaseURL() {
  // Navegador
  if (typeof window !== "undefined") {
    return window.location.origin; // funciona en dev y prod
  }
  // Server (SSR / RSC): intenta tomar del env, cae a localhost
  return process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
}

export const http = axios.create({
  baseURL: getBaseURL(),
  timeout: 10_000,
  headers: { "Content-Type": "application/json" },
  // con credenciales si lo necesitás (cookies admin)
  withCredentials: true,
});

// Reintentos exponenciales ante 5xx / network
axiosRetry(http, {
  retries: 2,
  retryDelay: axiosRetry.exponentialDelay,
  retryCondition: (error) =>
    axiosRetry.isNetworkOrIdempotentRequestError(error) ||
    (error.response?.status ?? 0) >= 500,
});

// Normalizamos errores a ApiError
http.interceptors.response.use(
  (res) => res,
  (error: AxiosError) => {
    const status = error.response?.status ?? 0;
    const data: any = error.response?.data ?? {};
    const apiErr: ApiError = {
      status,
      code: data?.error ?? (error.code || "unknown_error"),
      message:
        data?.message ?? data?.error ?? error.message ?? "Request failed",
      details: data,
    };
    return Promise.reject(apiErr);
  }
);

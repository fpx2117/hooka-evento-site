// lib/api.ts
import { http } from "./http";
import { z } from "zod";
import {
  ValidateGetResSchema, // { ok: true, ticket: ... }
  ValidatePostOkSchema, // { ok: true, validated: boolean, validatedAt?, ticket: ... }
  ValidateErrorSchema, // { ok: false, error: "...", ... }
  Ticket,
} from "./schemas";

// Uniones tipadas para GET/POST
const GetUnionSchema = z.union([ValidateGetResSchema, ValidateErrorSchema]);
const PostUnionSchema = z.union([ValidatePostOkSchema, ValidateErrorSchema]);

/* =========================================================
   Resolución de endpoint (compatibilidad /api/validate y /api/validate-qr)
   ========================================================= */
const API_ENDPOINTS = ["/api/admin/validate"] as const;

async function tryGet(path: (typeof API_ENDPOINTS)[number], code: string) {
  return http.get(path, { params: { code } });
}
async function tryPost(path: (typeof API_ENDPOINTS)[number], code: string) {
  return http.post(path, { code });
}

async function getWithFallback(
  code: string
): Promise<{ data: unknown; status: number }> {
  let lastErr: any;
  for (const ep of API_ENDPOINTS) {
    try {
      const res = await tryGet(ep, code);
      return { data: res.data, status: res.status };
    } catch (e: any) {
      // Si es 404 de ruta (no existe), probamos el siguiente endpoint
      if (
        e?.response?.status === 404 &&
        typeof e?.response?.data === "string"
      ) {
        lastErr = e;
        continue;
      }
      // Otros errores: devolvemos tal cual
      throw e;
    }
  }
  throw lastErr ?? new Error("GET validate endpoint not found");
}

async function postWithFallback(
  code: string
): Promise<{ data: unknown; status: number }> {
  let lastErr: any;
  for (const ep of API_ENDPOINTS) {
    try {
      const res = await tryPost(ep, code);
      return { data: res.data, status: res.status };
    } catch (e: any) {
      if (
        e?.response?.status === 404 &&
        typeof e?.response?.data === "string"
      ) {
        lastErr = e;
        continue;
      }
      throw e;
    }
  }
  throw lastErr ?? new Error("POST validate endpoint not found");
}

/* =========================================================
   API: GET ticket por código
   ========================================================= */
export async function getTicketByCode(code: string): Promise<Ticket> {
  const { data, status } = await getWithFallback(code);

  const parsed = GetUnionSchema.safeParse(data);
  if (!parsed.success) {
    throw {
      status: 500,
      message: "Respuesta de servidor inválida",
      details: data,
    };
  }

  const payload = parsed.data;
  if (payload.ok === false) {
    throw {
      status:
        payload.error === "not_found"
          ? 404
          : payload.error === "code_required"
            ? 400
            : status || 400,
      code: payload.error,
      message: "No encontrado",
      details: payload,
    };
  }

  return payload.ticket;
}

/* =========================================================
   API: POST validar ticket por código
   ========================================================= */
export async function validateTicket(code: string): Promise<{
  validated: boolean;
  validatedAt?: string;
  ticket: Ticket;
}> {
  const { data, status } = await postWithFallback(code);

  const parsed = PostUnionSchema.safeParse(data);
  if (!parsed.success) {
    throw {
      status: 500,
      message: "Respuesta de servidor inválida",
      details: data,
    };
  }

  const payload = parsed.data;

  if (payload.ok === false) {
    const mappedStatus =
      payload.error === "not_found"
        ? 404
        : payload.error === "not_approved" ||
            payload.error === "already_validated"
          ? 409
          : payload.error === "code_required"
            ? 400
            : status || 400;

    throw {
      status: mappedStatus,
      code: payload.error,
      message: "Validación fallida",
      details: payload,
    };
  }

  return {
    validated: payload.validated,
    validatedAt: payload.validatedAt,
    ticket: payload.ticket,
  };
}

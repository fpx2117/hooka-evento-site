// lib/api.ts
import { http } from "./http";
import { z } from "zod";
import {
  ValidateGetResSchema, // { ok: true, ticket: ... }
  ValidatePostOkSchema, // { ok: true, validated: boolean, validatedAt?, ticket: ... }
  ValidateErrorSchema, // { ok: false, error: "...", ... }
  Ticket,
} from "./schemas";

const GetUnionSchema = z.union([ValidateGetResSchema, ValidateErrorSchema]);
const PostUnionSchema = z.union([ValidatePostOkSchema, ValidateErrorSchema]);

/* ============================================================================
   Endpoints conocidos (soportamos instalaciones con rutas antiguas)
   ============================================================================ */
const API_ENDPOINTS = [
  "/api/admin/validate",
  "/api/validate",
  "/api/validate-qr",
] as const;

/* ============================================================================
   Helpers de bajo nivel con fallback de parámetro (code / validationCode)
   ============================================================================ */
async function getWithParam(
  path: (typeof API_ENDPOINTS)[number],
  code: string,
  paramKey: "code" | "validationCode"
) {
  return http.get(path, { params: { [paramKey]: code } });
}

async function postWithParam(
  path: (typeof API_ENDPOINTS)[number],
  code: string,
  paramKey: "code" | "validationCode"
) {
  return http.post(path, { [paramKey]: code });
}

/** GET: recorre endpoints y prueba {code} y {validationCode} */
async function getWithFallback(
  code: string
): Promise<{ data: unknown; status: number }> {
  let lastErr: any;

  for (const ep of API_ENDPOINTS) {
    // 1) intento con ?code=
    try {
      const res = await getWithParam(ep, code, "code");
      return { data: res.data, status: res.status };
    } catch (e: any) {
      // si la ruta no existe en este deploy, seguimos probando
      if (
        e?.response?.status === 404 &&
        typeof e?.response?.data === "string"
      ) {
        lastErr = e;
        continue;
      }
      // 2) si respondió pero con error de payload, probamos con validationCode
      try {
        const res2 = await getWithParam(ep, code, "validationCode");
        return { data: res2.data, status: res2.status };
      } catch (e2: any) {
        // si tampoco, nos guardamos el último error y probamos el próximo endpoint
        lastErr = e2;
        continue;
      }
    }
  }

  throw lastErr ?? new Error("GET validate endpoint not found");
}

/** POST: recorre endpoints y prueba {code} y {validationCode} */
async function postWithFallback(
  code: string
): Promise<{ data: unknown; status: number }> {
  let lastErr: any;

  for (const ep of API_ENDPOINTS) {
    // 1) intento con { code }
    try {
      const res = await postWithParam(ep, code, "code");
      return { data: res.data, status: res.status };
    } catch (e: any) {
      if (
        e?.response?.status === 404 &&
        typeof e?.response?.data === "string"
      ) {
        lastErr = e;
        continue;
      }
      // 2) reintento con { validationCode }
      try {
        const res2 = await postWithParam(ep, code, "validationCode");
        return { data: res2.data, status: res2.status };
      } catch (e2: any) {
        lastErr = e2;
        continue;
      }
    }
  }

  throw lastErr ?? new Error("POST validate endpoint not found");
}

/* ============================================================================
   API: GET ticket por código
   ============================================================================ */
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

/* ============================================================================
   API: POST validar ticket por código
   ============================================================================ */
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

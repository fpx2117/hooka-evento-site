// lib/api.ts
import { z } from "zod";
import { getHttp, withProtocolFallback } from "./http";
import {
  ValidateGetResSchema,
  ValidatePostOkSchema,
  ValidateErrorSchema,
  Ticket,
} from "./schemas";

const GetUnionSchema = z.union([ValidateGetResSchema, ValidateErrorSchema]);
const PostUnionSchema = z.union([ValidatePostOkSchema, ValidateErrorSchema]);

// Probamos primero endpoints públicos, luego el admin
const API_ENDPOINTS = [
  "/api/validate",
  "/api/validate-qr",
  "/api/admin/validate",
] as const;

async function getWithParam(
  path: (typeof API_ENDPOINTS)[number],
  code: string,
  key: "code" | "validationCode",
  baseOverride?: string
) {
  return withProtocolFallback(
    (client) => client.get(path, { params: { [key]: code } }),
    baseOverride
  );
}
async function postWithParam(
  path: (typeof API_ENDPOINTS)[number],
  code: string,
  key: "code" | "validationCode",
  baseOverride?: string
) {
  return withProtocolFallback(
    (client) => client.post(path, { [key]: code }),
    baseOverride
  );
}

async function getWithFallback(code: string, baseOverride?: string) {
  let lastErr: any;
  for (const ep of API_ENDPOINTS) {
    try {
      const r = await getWithParam(ep, code, "code", baseOverride);
      return { data: r.data, status: r.status };
    } catch (e1: any) {
      try {
        const r2 = await getWithParam(ep, code, "validationCode", baseOverride);
        return { data: r2.data, status: r2.status };
      } catch (e2: any) {
        lastErr = e2;
        continue;
      }
    }
  }
  throw lastErr ?? new Error("GET validate endpoint not found");
}

async function postWithFallback(code: string, baseOverride?: string) {
  let lastErr: any;
  for (const ep of API_ENDPOINTS) {
    try {
      const r = await postWithParam(ep, code, "code", baseOverride);
      return { data: r.data, status: r.status };
    } catch (e1: any) {
      try {
        const r2 = await postWithParam(
          ep,
          code,
          "validationCode",
          baseOverride
        );
        return { data: r2.data, status: r2.status };
      } catch (e2: any) {
        lastErr = e2;
        continue;
      }
    }
  }
  throw lastErr ?? new Error("POST validate endpoint not found");
}

export async function getTicketByCode(
  code: string,
  baseOverride?: string
): Promise<Ticket> {
  const { data, status } = await getWithFallback(code, baseOverride);

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

export async function validateTicket(
  code: string,
  baseOverride?: string
): Promise<{ validated: boolean; validatedAt?: string; ticket: Ticket }> {
  const { data, status } = await postWithFallback(code, baseOverride);

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
    const mapped =
      payload.error === "not_found"
        ? 404
        : payload.error === "not_approved" ||
            payload.error === "already_validated"
          ? 409
          : payload.error === "code_required"
            ? 400
            : status || 400;
    throw {
      status: mapped,
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

// lib/api.ts
import { z } from "zod";
import { withProtocolFallback } from "./http";
import {
  ValidateGetResSchema,
  ValidatePostOkSchema,
  ValidateErrorSchema,
  Ticket,
} from "./schemas";

/* ============================================================
   Schemas de respuesta (seguridad de tipos)
============================================================ */
const GetUnionSchema = z.union([ValidateGetResSchema, ValidateErrorSchema]);
const PostUnionSchema = z.union([ValidatePostOkSchema, ValidateErrorSchema]);

/* ============================================================
   ENDPOINTS disponibles (orden de fallback)
============================================================ */
const API_ENDPOINTS = ["/api/admin/validate"] as const;

/* ============================================================
   Helpers para GET / POST
============================================================ */
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
        const r2 = await postWithParam(ep, code, "validationCode", baseOverride);
        return { data: r2.data, status: r2.status };
      } catch (e2: any) {
        lastErr = e2;
        continue;
      }
    }
  }
  throw lastErr ?? new Error("POST validate endpoint not found");
}

/* ============================================================
   Normalización de Ticket
============================================================ */
const toNum = (v: any): number | null => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const toIso = (d: any): string | undefined => {
  if (!d) return;
  const dt =
    typeof d === "string" ? new Date(d) : d instanceof Date ? d : null;
  return dt && !isNaN(dt.getTime()) ? dt.toISOString() : undefined;
};
const normLoc = (loc: any): "dj" | "piscina" | "general" | undefined => {
  if (!loc) return undefined;
  const s = String(loc).trim().toLowerCase();
  if (["dj", "piscina", "general"].includes(s)) return s as any;
  return undefined;
};

function normalizeTicket(input: Ticket): Ticket {
  const t: any = { ...input };

  // ticketType minúsculas
  if (t.ticketType) t.ticketType = String(t.ticketType).toLowerCase();

  // Fechas coherentes
  t.eventDate = toIso(t.eventDate) ?? toIso(t.event?.date);
  t.validatedAt = toIso(t.validatedAt);

  // Campos VIP
  const vipTables = toNum(t.vipTables);
  const capacityPerTable = toNum(t.capacityPerTable);
  const tableNumber = toNum(t.tableNumber);
  const vipLocation = normLoc(t.vipLocation);

  if (vipTables !== null) t.vipTables = vipTables;
  if (capacityPerTable !== null) t.capacityPerTable = capacityPerTable;
  if (tableNumber !== null) t.tableNumber = tableNumber;
  if (vipLocation) t.vipLocation = vipLocation;

  // quantity robusto
  const rawQty = toNum(t.quantity) ?? 0;
  if (t.ticketType === "vip") {
    if (rawQty > 0) t.quantity = rawQty;
    else if ((vipTables ?? 0) > 0 && (capacityPerTable ?? 0) > 0)
      t.quantity = (vipTables as number) * (capacityPerTable as number);
    else if ((vipTables ?? 0) > 0) t.quantity = vipTables as number;
    else t.quantity = 1;
  } else {
    t.quantity = rawQty > 0 ? rawQty : 1;
  }

  return t as Ticket;
}

/* ============================================================
   API pública
============================================================ */
export async function getTicketByCode(
  code: string,
  baseOverride?: string
): Promise<Ticket> {
  const clean = code?.toString().trim().normalize("NFKC");
  if (!clean)
    throw { status: 400, code: "code_required", message: "Código requerido" };

  const { data, status } = await getWithFallback(clean, baseOverride);
  const parsed = GetUnionSchema.safeParse(data);

  if (!parsed.success)
    throw { status: 500, message: "Respuesta de servidor inválida", details: data };

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
      message:
        payload.error === "not_found"
          ? "No encontrado"
          : payload.error === "code_required"
            ? "Código requerido"
            : "Error",
      details: payload,
    };
  }

  return normalizeTicket(payload.ticket as Ticket);
}

export async function validateTicket(
  code: string,
  baseOverride?: string
): Promise<{ validated: boolean; validatedAt?: string; ticket: Ticket }> {
  const clean = code?.toString().trim().normalize("NFKC");
  if (!clean)
    throw { status: 400, code: "code_required", message: "Código requerido" };

  const { data, status } = await postWithFallback(clean, baseOverride);
  const parsed = PostUnionSchema.safeParse(data);

  if (!parsed.success)
    throw { status: 500, message: "Respuesta de servidor inválida", details: data };

  const payload = parsed.data;
  if (payload.ok === false) {
    const mapped =
      payload.error === "not_found"
        ? 404
        : ["not_approved", "already_validated"].includes(payload.error)
          ? 409
          : payload.error === "code_required"
            ? 400
            : status || 400;

    throw {
      status: mapped,
      code: payload.error,
      message:
        payload.error === "not_found"
          ? "No encontrado"
          : payload.error === "not_approved"
            ? "Pago no aprobado"
            : payload.error === "already_validated"
              ? "Ya validado"
              : "Validación fallida",
      details: payload,
    };
  }

  const normalizedTicket = normalizeTicket(payload.ticket as Ticket);
  const validatedAt =
    typeof payload.validatedAt === "string"
      ? payload.validatedAt
      : normalizedTicket.validatedAt;

  return { validated: !!payload.validated, validatedAt, ticket: normalizedTicket };
}

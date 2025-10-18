// lib/schemas.ts
import { z } from "zod";

/** Helper: transforma null/undefined -> undefined antes de validar */
const nullToUndef = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((v) => (v == null ? undefined : v), schema);

/** ISO datetime string (opcional, sin null en el tipo final) */
const IsoStringOpt = nullToUndef(z.string().datetime().optional());

/** Número entero opcional (acepta null/undefined y los convierte a undefined) */
const IntOpt = nullToUndef(z.number().int().optional());

/** String opcional (acepta null/undefined y los convierte a undefined) */
const StrOpt = nullToUndef(z.string().optional());

export const TicketSchema = z.object({
  id: z.string(),

  customerName: z.string().default(""),
  customerEmail: z.string().default(""),
  customerPhone: z.string().default(""),
  customerDni: z.string().default(""),

  ticketType: z.enum(["general", "vip"]),
  paymentStatus: z.enum(["pending", "approved", "rejected"]),

  // Cantidad total de entradas (para VIP puede ser mesas*capacidad)
  quantity: nullToUndef(z.number().int().nonnegative().optional()),

  validated: z.boolean(),
  validatedAt: IsoStringOpt, // string | undefined (nunca null)

  purchaseDate: z.string().datetime(), // ISO requerido
  eventDate: IsoStringOpt, // string | undefined (nunca null)

  // ----- VIP -----
  vipLocation: nullToUndef(z.enum(["dj", "piscina", "general"]).optional()), // string | undefined
  tableNumber: IntOpt, // number | undefined
  vipTables: IntOpt, // number | undefined
  capacityPerTable: IntOpt, // number | undefined
});

export type Ticket = z.infer<typeof TicketSchema>;

export const ValidateGetResSchema = z.object({
  ok: z.literal(true),
  ticket: TicketSchema,
});

export const ValidatePostOkSchema = z.object({
  ok: z.literal(true),
  validated: z.boolean(),
  validatedAt: IsoStringOpt, // string | undefined
  ticket: TicketSchema,
});

export const ValidateErrorSchema = z.object({
  ok: z.literal(false),
  error: z.enum([
    "code_required",
    "not_found",
    "not_approved",
    "already_validated",
    "unknown",
  ]),
  // opcionales extra del backend
  status: nullToUndef(z.union([z.number(), z.string()]).optional()),
  validatedAt: IsoStringOpt,
  ticket: TicketSchema.optional(),
});

export type ValidateGetOk = z.infer<typeof ValidateGetResSchema>;
export type ValidatePostOk = z.infer<typeof ValidatePostOkSchema>;
export type ValidateErr = z.infer<typeof ValidateErrorSchema>;

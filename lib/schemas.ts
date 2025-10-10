// lib/schemas.ts
import { z } from "zod";

export const TicketSchema = z.object({
  id: z.string(),
  customerName: z.string(),
  customerEmail: z.string(),
  customerPhone: z.string(),
  customerDni: z.string(),
  ticketType: z.string(),
  paymentStatus: z.enum(["pending", "approved", "rejected"]),
  validated: z.boolean(),
  validatedAt: z.string().datetime().nullable().optional(),
  purchaseDate: z.string(),
  eventDate: z.string().nullable().optional(),
});

export type Ticket = z.infer<typeof TicketSchema>;

export const ValidateGetResSchema = z.object({
  ok: z.literal(true),
  ticket: TicketSchema,
});

export const ValidatePostOkSchema = z.object({
  ok: z.literal(true),
  validated: z.boolean(),
  validatedAt: z.string().datetime().optional(),
  ticket: TicketSchema,
});

export const ValidateErrorSchema = z.object({
  ok: z.literal(false),
  error: z.string(),
  // opcionales extra del backend
  status: z.string().optional(),
  validatedAt: z.string().optional(),
  ticket: TicketSchema.optional(),
});

export type ValidateGetOk = z.infer<typeof ValidateGetResSchema>;
export type ValidatePostOk = z.infer<typeof ValidatePostOkSchema>;
export type ValidateErr = z.infer<typeof ValidateErrorSchema>;

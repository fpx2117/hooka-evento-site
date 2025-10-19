// /lib/validation-code.ts
import { Prisma, PrismaClient } from "@prisma/client";

/** Solo 6 dígitos (0-9) */
export const SIX = /^\d{6}$/;

/** Normaliza y valida SOLO códigos de 6 dígitos */
export function normalizeSixDigitCode(raw: unknown): string | null {
  if (raw == null) return null;
  const s = String(raw)
    .trim()
    .replace(/[\u200B-\u200D\uFEFF]/g, "") // zero-width
    .replace(/[\s-]/g, ""); // espacios y guiones
  return SIX.test(s) ? s : null;
}

function gen6(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Asegura un validationCode de 6 dígitos si no existe (solo Ticket).
 * Idempotente: si ya hay uno válido, lo devuelve.
 *
 * @param tx PrismaClient o Prisma.TransactionClient
 * @param opts { id } — id del ticket
 * @param maxAttempts intentos por si hay colisiones improbables
 */
export async function ensureSixDigitCode(
  tx: PrismaClient | Prisma.TransactionClient,
  opts: { id: string },
  maxAttempts = 12
): Promise<string> {
  const { id } = opts;

  // 1) ¿ya existe?
  const cur = await (tx as PrismaClient).ticket.findUnique({
    where: { id },
    select: { validationCode: true },
  });
  if (cur?.validationCode && SIX.test(cur.validationCode)) {
    return cur.validationCode;
  }

  // 2) Intentar generar y setear solo si sigue vacío (evita carreras)
  for (let i = 0; i < maxAttempts; i++) {
    const code = gen6();

    const ok = await (tx as PrismaClient).ticket.updateMany({
      where: { id, validationCode: null }, // solo si aún está vacío
      data: { validationCode: code },
    });
    if (ok.count === 1) return code; // ganó la carrera

    // si no pudimos setear (porque alguien lo llenó entre medio), re-chequear
    const recheck = await (tx as PrismaClient).ticket.findUnique({
      where: { id },
      select: { validationCode: true },
    });
    if (recheck?.validationCode && SIX.test(recheck.validationCode)) {
      return recheck.validationCode;
    }
  }

  throw new Error("no_pude_generar_validation_code");
}

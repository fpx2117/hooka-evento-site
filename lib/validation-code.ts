// /lib/validation-code.ts
import { Prisma, PrismaClient } from "@prisma/client";

/** ✅ Solo permite 6 dígitos numéricos (000000–999999) */
export const SIX = /^\d{6}$/;

/**
 * Normaliza y valida SOLO códigos de 6 dígitos.
 * Quita espacios, guiones, y caracteres invisibles.
 */
export function normalizeSixDigitCode(raw: unknown): string | null {
  if (raw == null) return null;

  const s = String(raw)
    .trim()
    .replace(/[\u200B-\u200D\uFEFF]/g, "") // zero-width
    .replace(/[\s-]/g, ""); // espacios y guiones

  return SIX.test(s) ? s : null;
}

/** Genera un número aleatorio de 6 dígitos (como string) */
function gen6(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * ✅ Asegura que el ticket tenga un validationCode de 6 dígitos.
 * - Si ya existe y es válido, lo devuelve.
 * - Si no, genera uno nuevo y lo guarda.
 * - Previene colisiones con intentos múltiples.
 *
 * @param tx PrismaClient o Prisma.TransactionClient
 * @param opts { id } — ID del ticket
 * @param maxAttempts Cantidad máxima de intentos en caso de colisión
 */
export async function ensureSixDigitCode(
  tx: PrismaClient | Prisma.TransactionClient,
  opts: { id: string },
  maxAttempts = 12
): Promise<string> {
  const { id } = opts;

  // 1️⃣ Verificar si ya existe un código válido
  const current = await tx.ticket.findUnique({
    where: { id },
    select: { validationCode: true },
  });

  if (current?.validationCode && SIX.test(current.validationCode)) {
    return current.validationCode;
  }

  // 2️⃣ Intentar generar un nuevo código y asignarlo si sigue vacío
  for (let i = 0; i < maxAttempts; i++) {
    const code = gen6();

    const result = await tx.ticket.updateMany({
      where: { id, OR: [{ validationCode: null }, { validationCode: "" }] },
      data: { validationCode: code },
    });

    if (result.count === 1) return code;

    // 3️⃣ Si alguien lo generó entre medio, verificar otra vez
    const recheck = await tx.ticket.findUnique({
      where: { id },
      select: { validationCode: true },
    });

    if (recheck?.validationCode && SIX.test(recheck.validationCode)) {
      return recheck.validationCode;
    }
  }

  throw new Error("no_pude_generar_validation_code");
}

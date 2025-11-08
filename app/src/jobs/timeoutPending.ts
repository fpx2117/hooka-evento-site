// src/jobs/timeoutPending.ts
import { prisma } from "@/lib/prisma";
import { PaymentStatus as PS, TicketType as TT } from "@prisma/client";

const ELIGIBLE: PS[] = [PS.pending, PS.in_process, PS.failed_preference];
const TIMEOUT_MINUTES = Number(process.env.PENDING_TIMEOUT_MINUTES ?? "5");
const BATCH_LIMIT = Number(process.env.TIMEOUT_BATCH_LIMIT ?? "1000");

/**
 * Archiva un ticket pendiente vencido.
 */
async function archiveOne(ticketId: string) {
  return prisma.$transaction(async (tx) => {
    const t = await tx.ticket.findUnique({
      where: { id: ticketId },
      include: {
        vipTable: {
          include: {
            vipLocation: true, // para obtener el name si lo necesitaras a futuro
          },
        },
      },
    });

    if (!t) return { skipped: true, reason: "not_found" as const };
    if (!ELIGIBLE.includes(t.paymentStatus as PS)) {
      return { skipped: true, reason: "status_not_eligible" as const };
    }

    // Crear el histórico con los NOMBRES DE CAMPOS REALES del schema
    await tx.ticketArchive.create({
      data: {
        archivedFromId: t.id,
        eventId: t.eventId,
        archivedAt: new Date(),
        archivedBy: "system-cron",
        archiveReason: "payment_timeout",

        // Tipos y cantidades
        ticketType: t.ticketType,
        gender: t.gender,
        quantity: t.quantity,

        // Campos VIP del schema (todos opcionales en TicketArchive)
        vipLocationId: t.vipLocationId ?? t.vipTable?.vipLocationId ?? null,
        vipTableId: t.vipTableId ?? null,
        capacityPerTable: t.vipTable?.capacityPerTable ?? null,
        tableNumber: t.vipTable?.tableNumber ?? null,

        // Precios y cliente
        totalPrice: t.totalPrice,
        customerName: t.customerName,
        customerEmail: t.customerEmail,
        customerPhone: t.customerPhone,
        customerDni: t.customerDni,

        // Pagos
        paymentId: t.paymentId,
        paymentStatus: t.paymentStatus,
        paymentMethod: t.paymentMethod,

        // Códigos y validaciones
        qrCode: t.qrCode,
        validationCode: t.validationCode,
        validated: t.validated,
        validatedAt: t.validatedAt,

        // Fechas
        purchaseDate: t.purchaseDate,
        eventDate: t.eventDate,
        expiresAt: t.expiresAt,

        // Configs
        ticketConfigId: t.ticketConfigId,
        vipTableConfigId: t.vipTableConfigId ?? null,

        // Meta
        emailSentAt: t.emailSentAt,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
      },
    });

    // (Opcional) Si fuera VIP aprobado y querés revertir el soldCount del config
    // Nota: con ELIGIBLE esto no se ejecuta, pero lo dejamos por si se reutiliza.
    if (
      t.ticketType === TT.vip &&
      t.paymentStatus === PS.approved &&
      t.vipTable?.vipLocationId
    ) {
      const cfg = await tx.vipTableConfig.findUnique({
        where: {
          // <- CORRECTO según @@unique([eventId, vipLocationId])
        eventId_vipLocationId: {
            eventId: t.eventId,
            vipLocationId: t.vipTable.vipLocationId,
          },
        },
        select: { id: true, soldCount: true },
      });

      if (cfg) {
        await tx.vipTableConfig.update({
          where: { id: cfg.id },
          data: { soldCount: Math.max(0, cfg.soldCount - 1) },
        });
      }
    }

    // Eliminar el activo
    await tx.ticket.delete({ where: { id: t.id } });
    return { archived: true as const };
  });
}

/**
 * Proceso principal de limpieza de tickets pendientes vencidos.
 */
export async function runTimeoutPendingJob() {
  const now = new Date();
  const cutoff = new Date(now.getTime() - TIMEOUT_MINUTES * 60_000);

  const items = await prisma.ticket.findMany({
    where: {
      paymentStatus: { in: ELIGIBLE },
      OR: [{ expiresAt: { lte: now } }, { purchaseDate: { lt: cutoff } }],
    },
    select: { id: true },
    take: BATCH_LIMIT,
  });

  let archived = 0;
  for (const it of items) {
    const r = await archiveOne(it.id);
    if (r.archived) archived++;
  }

  return {
    ok: true,
    checked: items.length,
    archived,
    now,
    cutoff,
    timeoutMinutes: TIMEOUT_MINUTES,
  };
}

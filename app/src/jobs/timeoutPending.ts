// src/jobs/timeoutPending.ts
import { prisma } from "@/lib/prisma";
import { PaymentStatus as PS, TicketType as TT } from "@prisma/client";

const ELIGIBLE: PS[] = [PS.pending, PS.in_process, PS.failed_preference];
const TIMEOUT_MINUTES = Number(process.env.PENDING_TIMEOUT_MINUTES ?? "5");
const BATCH_LIMIT = Number(process.env.TIMEOUT_BATCH_LIMIT ?? "1000");

async function archiveOne(ticketId: string) {
  return prisma.$transaction(async (tx) => {
    const t = await tx.ticket.findUnique({ where: { id: ticketId } });
    if (!t) return { skipped: true, reason: "not_found" as const };
    if (!ELIGIBLE.includes(t.paymentStatus as PS)) {
      return { skipped: true, reason: "status_not_eligible" as const };
    }

    await tx.ticketArchive.create({
      data: {
        archivedFromId: t.id,
        eventId: t.eventId,
        archivedAt: new Date(),
        archivedBy: "system-cron",
        archiveReason: "payment_timeout",
        ticketType: t.ticketType,
        gender: t.gender,
        quantity: t.quantity,
        vipLocation: t.vipLocation,
        vipTables: t.vipTables,
        capacityPerTable: t.capacityPerTable,
        tableNumber: t.tableNumber,
        totalPrice: t.totalPrice,
        customerName: t.customerName,
        customerEmail: t.customerEmail,
        customerPhone: t.customerPhone,
        customerDni: t.customerDni,
        paymentId: t.paymentId,
        paymentStatus: t.paymentStatus,
        paymentMethod: t.paymentMethod,
        qrCode: t.qrCode,
        validationCode: t.validationCode,
        validated: t.validated,
        validatedAt: t.validatedAt,
        purchaseDate: t.purchaseDate,
        eventDate: t.eventDate,
        expiresAt: t.expiresAt,
        ticketConfigId: t.ticketConfigId,
        emailSentAt: t.emailSentAt,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
      },
    });

    if (
      t.ticketType === TT.vip &&
      t.paymentStatus === PS.approved &&
      t.vipLocation &&
      t.vipTables
    ) {
      const cfg = await tx.vipTableConfig.findUnique({
        where: {
          eventId_location: { eventId: t.eventId, location: t.vipLocation },
        },
        select: { id: true, soldCount: true },
      });
      if (cfg) {
        await tx.vipTableConfig.update({
          where: { id: cfg.id },
          data: { soldCount: Math.max(0, cfg.soldCount - t.vipTables) },
        });
      }
    }

    await tx.ticket.delete({ where: { id: t.id } });
    return { archived: true as const };
  });
}

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

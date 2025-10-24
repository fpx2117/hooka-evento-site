/* eslint-disable no-console */
import { PrismaClient, PaymentStatus } from "@prisma/client";

const prisma = new PrismaClient();

// minutos desde la compra para considerar timeout
const TIMEOUT_MINUTES = Number(process.env.PENDING_TIMEOUT_MINUTES ?? "5");

async function main() {
  const cutoff = new Date(Date.now() - TIMEOUT_MINUTES * 60_000);

  console.log(
    `[BACKFILL] Archivando tickets con estado pending previos a ${cutoff.toISOString()}`
  );

  // buscar todos los tickets pendientes o en proceso (por seguridad)
  const pendingTickets = await prisma.ticket.findMany({
    where: {
      paymentStatus: {
        in: [
          PaymentStatus.pending,
          PaymentStatus.in_process,
          PaymentStatus.failed_preference,
        ],
      },
      purchaseDate: { lt: cutoff },
    },
  });

  if (pendingTickets.length === 0) {
    console.log("[BACKFILL] No hay tickets para archivar.");
    return;
  }

  console.log(
    `[BACKFILL] Se encontraron ${pendingTickets.length} tickets elegibles.`
  );

  for (const t of pendingTickets) {
    try {
      await prisma.$transaction(async (tx) => {
        await tx.ticketArchive.create({
          data: {
            archivedFromId: t.id,
            eventId: t.eventId,
            archivedAt: new Date(),
            archivedBy: "system-backfill",
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

        await tx.ticket.delete({ where: { id: t.id } });
      });

      console.log(
        `✔ Archivado ticket: ${t.customerName} (${t.customerEmail})`
      );
    } catch (err) {
      console.error(`❌ Error al archivar ${t.id}:`, err);
    }
  }

  console.log("[BACKFILL] Proceso completado ✅");
}

main()
  .catch((err) => {
    console.error("[BACKFILL] Error general:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

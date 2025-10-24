/* eslint-disable no-console */
import { PrismaClient, PaymentStatus } from "@prisma/client";

const prisma = new PrismaClient();

// minutos para considerar timeout (default 5)
const TIMEOUT_MINUTES = Number(process.env.PENDING_TIMEOUT_MINUTES ?? "5");

async function main() {
  const cutoff = new Date(Date.now() - TIMEOUT_MINUTES * 60_000);

  console.log(
    `[backfill] Archivando tickets pending con purchaseDate < ${cutoff.toISOString()}`
  );

  const pendings = await prisma.ticket.findMany({
    where: {
      paymentStatus: PaymentStatus.pending,
      purchaseDate: { lt: cutoff },
    },
  });

  if (pendings.length === 0) {
    console.log("[backfill] No hay tickets para archivar.");
    return;
  }

  console.log(`[backfill] Encontrados: ${pendings.length}`);

  const BATCH = 100;
  for (let i = 0; i < pendings.length; i += BATCH) {
    const slice = pendings.slice(i, i + BATCH);

    await prisma.$transaction(async (tx) => {
      for (const t of slice) {
        await tx.ticketArchive.create({
          data: {
            // 🔸 nuevos metadatos del schema
            archiveReason: "payment_timeout",
            archivedAt: new Date(),
            archivedBy: "system/backfill",

            archivedFromId: t.id,

            eventId: t.eventId,
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
            paymentStatus: t.paymentStatus, // snapshot
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

        // Quitar del vivo (no ajusta stock: no estaba approved)
        await tx.ticket.delete({ where: { id: t.id } });
      }
    });

    console.log(`[backfill] Lote ${i + 1}..${i + slice.length} OK`);
  }

  console.log("[backfill] Finalizado ✅");
}

main()
  .catch((e) => {
    console.error("[backfill] Error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

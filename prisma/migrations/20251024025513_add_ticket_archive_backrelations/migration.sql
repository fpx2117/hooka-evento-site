-- CreateEnum
CREATE TYPE "ArchiveReason" AS ENUM ('user_deleted', 'admin_cancelled', 'payment_timeout', 'refunded', 'charged_back', 'other');

-- CreateTable
CREATE TABLE "TicketArchive" (
    "id" TEXT NOT NULL,
    "archivedFromId" TEXT,
    "eventId" TEXT NOT NULL,
    "ticketType" "TicketType" NOT NULL,
    "gender" "Gender",
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "vipLocation" "TableLocation",
    "vipTables" INTEGER,
    "capacityPerTable" INTEGER,
    "tableNumber" INTEGER,
    "totalPrice" DECIMAL(10,2) NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerEmail" TEXT NOT NULL,
    "customerPhone" TEXT NOT NULL,
    "customerDni" TEXT NOT NULL,
    "paymentId" TEXT,
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'pending',
    "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'mercadopago',
    "qrCode" TEXT,
    "validationCode" TEXT,
    "validated" BOOLEAN NOT NULL DEFAULT false,
    "validatedAt" TIMESTAMP(3),
    "purchaseDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eventDate" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "ticketConfigId" TEXT,
    "emailSentAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archivedBy" TEXT,
    "archiveReason" "ArchiveReason" NOT NULL DEFAULT 'other',
    "archiveNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TicketArchive_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TicketArchive_eventId_idx" ON "TicketArchive"("eventId");

-- CreateIndex
CREATE INDEX "TicketArchive_customerEmail_idx" ON "TicketArchive"("customerEmail");

-- CreateIndex
CREATE INDEX "TicketArchive_customerDni_idx" ON "TicketArchive"("customerDni");

-- CreateIndex
CREATE INDEX "TicketArchive_paymentId_idx" ON "TicketArchive"("paymentId");

-- CreateIndex
CREATE INDEX "TicketArchive_paymentStatus_purchaseDate_idx" ON "TicketArchive"("paymentStatus", "purchaseDate");

-- CreateIndex
CREATE INDEX "TicketArchive_ticketType_gender_idx" ON "TicketArchive"("ticketType", "gender");

-- CreateIndex
CREATE INDEX "TicketArchive_emailSentAt_idx" ON "TicketArchive"("emailSentAt");

-- CreateIndex
CREATE INDEX "TicketArchive_vipLocation_idx" ON "TicketArchive"("vipLocation");

-- CreateIndex
CREATE INDEX "TicketArchive_tableNumber_idx" ON "TicketArchive"("tableNumber");

-- AddForeignKey
ALTER TABLE "TicketArchive" ADD CONSTRAINT "TicketArchive_archivedFromId_fkey" FOREIGN KEY ("archivedFromId") REFERENCES "Ticket"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketArchive" ADD CONSTRAINT "TicketArchive_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketArchive" ADD CONSTRAINT "TicketArchive_ticketConfigId_fkey" FOREIGN KEY ("ticketConfigId") REFERENCES "TicketConfig"("id") ON DELETE SET NULL ON UPDATE CASCADE;

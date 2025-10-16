-- AlterTable
ALTER TABLE "TableReservation" ADD COLUMN     "emailSentAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN     "emailSentAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "TableReservation_emailSentAt_idx" ON "TableReservation"("emailSentAt");

-- CreateIndex
CREATE INDEX "Ticket_emailSentAt_idx" ON "Ticket"("emailSentAt");

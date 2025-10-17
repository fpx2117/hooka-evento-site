-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN     "tableNumber" INTEGER;

-- CreateIndex
CREATE INDEX "Ticket_tableNumber_idx" ON "Ticket"("tableNumber");

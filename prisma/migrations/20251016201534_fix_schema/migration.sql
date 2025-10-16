/*
  Warnings:

  - The `packageType` column on the `TableReservation` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - Added the required column `updatedAt` to the `TableReservation` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Ticket` table without a default value. This is not possible if the table is not empty.
  - Changed the type of `ticketType` on the `Ticket` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Added the required column `updatedAt` to the `TicketConfig` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `VipTableConfig` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "TicketType" AS ENUM ('general', 'vip');

-- CreateEnum
CREATE TYPE "PackageType" AS ENUM ('mesa');

-- DropForeignKey
ALTER TABLE "TableReservation" DROP CONSTRAINT "TableReservation_eventId_fkey";

-- DropForeignKey
ALTER TABLE "Ticket" DROP CONSTRAINT "Ticket_eventId_fkey";

-- DropForeignKey
ALTER TABLE "TicketConfig" DROP CONSTRAINT "TicketConfig_eventId_fkey";

-- DropForeignKey
ALTER TABLE "VipTableConfig" DROP CONSTRAINT "VipTableConfig_eventId_fkey";

-- AlterTable
ALTER TABLE "TableReservation" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
DROP COLUMN "packageType",
ADD COLUMN     "packageType" "PackageType" NOT NULL DEFAULT 'mesa',
ALTER COLUMN "guests" SET DEFAULT 0;

-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "location" "TableLocation",
ADD COLUMN     "tableReservationId" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
DROP COLUMN "ticketType",
ADD COLUMN     "ticketType" "TicketType" NOT NULL;

-- AlterTable
ALTER TABLE "TicketConfig" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "VipTableConfig" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- CreateIndex
CREATE INDEX "Ticket_ticketType_gender_idx" ON "Ticket"("ticketType", "gender");

-- CreateIndex
CREATE INDEX "Ticket_tableReservationId_idx" ON "Ticket"("tableReservationId");

-- CreateIndex
CREATE INDEX "TicketConfig_eventId_idx" ON "TicketConfig"("eventId");

-- CreateIndex
CREATE INDEX "TicketConfig_ticketType_idx" ON "TicketConfig"("ticketType");

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_tableReservationId_fkey" FOREIGN KEY ("tableReservationId") REFERENCES "TableReservation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TableReservation" ADD CONSTRAINT "TableReservation_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketConfig" ADD CONSTRAINT "TicketConfig_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VipTableConfig" ADD CONSTRAINT "VipTableConfig_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

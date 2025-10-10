/*
  Warnings:

  - You are about to alter the column `totalPrice` on the `TableReservation` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(10,2)`.
  - You are about to alter the column `totalPrice` on the `Ticket` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(10,2)`.
  - Added the required column `eventId` to the `TableReservation` table without a default value. This is not possible if the table is not empty.
  - Changed the type of `location` on the `TableReservation` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Added the required column `eventId` to the `Ticket` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "TableLocation" AS ENUM ('piscina', 'dj', 'general');

-- DropIndex
DROP INDEX "TableReservation_qrCode_idx";

-- DropIndex
DROP INDEX "TableReservation_validationCode_idx";

-- DropIndex
DROP INDEX "Ticket_qrCode_idx";

-- DropIndex
DROP INDEX "Ticket_validationCode_idx";

-- AlterTable
ALTER TABLE "TableReservation" ADD COLUMN     "eventId" TEXT NOT NULL,
ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "tables" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "vipTableConfigId" TEXT,
DROP COLUMN "location",
ADD COLUMN     "location" "TableLocation" NOT NULL,
ALTER COLUMN "totalPrice" SET DATA TYPE DECIMAL(10,2);

-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN     "eventId" TEXT NOT NULL,
ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "ticketConfigId" TEXT,
ALTER COLUMN "totalPrice" SET DATA TYPE DECIMAL(10,2);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketConfig" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "ticketType" TEXT NOT NULL,
    "gender" "Gender",
    "price" DECIMAL(10,2) NOT NULL,
    "stockLimit" INTEGER NOT NULL DEFAULT 0,
    "soldCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TicketConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VipTableConfig" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "location" "TableLocation" NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "stockLimit" INTEGER NOT NULL,
    "soldCount" INTEGER NOT NULL DEFAULT 0,
    "capacityPerTable" INTEGER NOT NULL DEFAULT 10,

    CONSTRAINT "VipTableConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Event_code_key" ON "Event"("code");

-- CreateIndex
CREATE INDEX "TicketConfig_eventId_ticketType_gender_idx" ON "TicketConfig"("eventId", "ticketType", "gender");

-- CreateIndex
CREATE UNIQUE INDEX "TicketConfig_eventId_ticketType_gender_key" ON "TicketConfig"("eventId", "ticketType", "gender");

-- CreateIndex
CREATE INDEX "VipTableConfig_eventId_location_idx" ON "VipTableConfig"("eventId", "location");

-- CreateIndex
CREATE UNIQUE INDEX "VipTableConfig_eventId_location_key" ON "VipTableConfig"("eventId", "location");

-- CreateIndex
CREATE INDEX "TableReservation_eventId_idx" ON "TableReservation"("eventId");

-- CreateIndex
CREATE INDEX "TableReservation_location_reservationDate_idx" ON "TableReservation"("location", "reservationDate");

-- CreateIndex
CREATE INDEX "Ticket_eventId_idx" ON "Ticket"("eventId");

-- CreateIndex
CREATE INDEX "Ticket_ticketType_gender_idx" ON "Ticket"("ticketType", "gender");

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_ticketConfigId_fkey" FOREIGN KEY ("ticketConfigId") REFERENCES "TicketConfig"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TableReservation" ADD CONSTRAINT "TableReservation_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TableReservation" ADD CONSTRAINT "TableReservation_vipTableConfigId_fkey" FOREIGN KEY ("vipTableConfigId") REFERENCES "VipTableConfig"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketConfig" ADD CONSTRAINT "TicketConfig_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VipTableConfig" ADD CONSTRAINT "VipTableConfig_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

/*
  Warnings:

  - You are about to drop the column `capacityPerTable` on the `Ticket` table. All the data in the column will be lost.
  - You are about to drop the column `tableNumber` on the `Ticket` table. All the data in the column will be lost.
  - You are about to drop the column `vipLocation` on the `Ticket` table. All the data in the column will be lost.
  - You are about to drop the column `vipTables` on the `Ticket` table. All the data in the column will be lost.
  - You are about to drop the column `capacityPerTable` on the `TicketArchive` table. All the data in the column will be lost.
  - You are about to drop the column `emailSentAt` on the `TicketArchive` table. All the data in the column will be lost.
  - You are about to drop the column `expiresAt` on the `TicketArchive` table. All the data in the column will be lost.
  - You are about to drop the column `paymentId` on the `TicketArchive` table. All the data in the column will be lost.
  - You are about to drop the column `qrCode` on the `TicketArchive` table. All the data in the column will be lost.
  - You are about to drop the column `tableNumber` on the `TicketArchive` table. All the data in the column will be lost.
  - You are about to drop the column `validationCode` on the `TicketArchive` table. All the data in the column will be lost.
  - You are about to drop the column `vipLocation` on the `TicketArchive` table. All the data in the column will be lost.
  - You are about to drop the column `vipTables` on the `TicketArchive` table. All the data in the column will be lost.
  - You are about to drop the column `location` on the `VipTableConfig` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[eventId,vipLocationId]` on the table `VipTableConfig` will be added. If there are existing duplicate values, this will fail.
  - Changed the type of `ticketType` on the `DiscountRule` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `ticketType` on the `TicketConfig` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Added the required column `vipLocationId` to the `VipTableConfig` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "VipTableStatus" AS ENUM ('available', 'reserved', 'sold', 'blocked');

-- DropIndex
DROP INDEX "DiscountRule_eventId_ticketType_gender_isActive_idx";

-- DropIndex
DROP INDEX "Ticket_customerDni_idx";

-- DropIndex
DROP INDEX "Ticket_customerEmail_idx";

-- DropIndex
DROP INDEX "Ticket_emailSentAt_idx";

-- DropIndex
DROP INDEX "Ticket_tableNumber_idx";

-- DropIndex
DROP INDEX "Ticket_vipLocation_idx";

-- DropIndex
DROP INDEX "TicketArchive_customerDni_idx";

-- DropIndex
DROP INDEX "TicketArchive_emailSentAt_idx";

-- DropIndex
DROP INDEX "TicketArchive_paymentId_idx";

-- DropIndex
DROP INDEX "TicketArchive_paymentStatus_purchaseDate_idx";

-- DropIndex
DROP INDEX "TicketArchive_tableNumber_idx";

-- DropIndex
DROP INDEX "TicketArchive_ticketType_gender_idx";

-- DropIndex
DROP INDEX "TicketArchive_vipLocation_idx";

-- DropIndex
DROP INDEX "TicketConfig_eventId_idx";

-- DropIndex
DROP INDEX "TicketConfig_ticketType_idx";

-- DropIndex
DROP INDEX "VipTableConfig_eventId_location_idx";

-- DropIndex
DROP INDEX "VipTableConfig_eventId_location_key";

-- AlterTable
ALTER TABLE "DiscountRule" DROP COLUMN "ticketType",
ADD COLUMN     "ticketType" "TicketType" NOT NULL;

-- AlterTable
ALTER TABLE "Ticket" DROP COLUMN "capacityPerTable",
DROP COLUMN "tableNumber",
DROP COLUMN "vipLocation",
DROP COLUMN "vipTables",
ADD COLUMN     "vipLocationId" TEXT,
ADD COLUMN     "vipTableConfigId" TEXT,
ADD COLUMN     "vipTableId" TEXT;

-- AlterTable
ALTER TABLE "TicketArchive" DROP COLUMN "capacityPerTable",
DROP COLUMN "emailSentAt",
DROP COLUMN "expiresAt",
DROP COLUMN "paymentId",
DROP COLUMN "qrCode",
DROP COLUMN "tableNumber",
DROP COLUMN "validationCode",
DROP COLUMN "vipLocation",
DROP COLUMN "vipTables",
ADD COLUMN     "vipLocationId" TEXT,
ADD COLUMN     "vipTableConfigId" TEXT,
ADD COLUMN     "vipTableId" TEXT;

-- AlterTable
ALTER TABLE "TicketConfig" DROP COLUMN "ticketType",
ADD COLUMN     "ticketType" "TicketType" NOT NULL;

-- AlterTable
ALTER TABLE "VipTableConfig" DROP COLUMN "location",
ADD COLUMN     "vipLocationId" TEXT NOT NULL;

-- DropEnum
DROP TYPE "TableLocation";

-- CreateTable
CREATE TABLE "VipLocation" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VipLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VipTable" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "vipLocationId" TEXT NOT NULL,
    "vipTableConfigId" TEXT,
    "tableNumber" INTEGER NOT NULL,
    "capacityPerTable" INTEGER NOT NULL DEFAULT 10,
    "price" DECIMAL(10,2) NOT NULL,
    "status" "VipTableStatus" NOT NULL DEFAULT 'available',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VipTable_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VipLocation_eventId_name_idx" ON "VipLocation"("eventId", "name");

-- CreateIndex
CREATE INDEX "VipLocation_isActive_idx" ON "VipLocation"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "VipLocation_eventId_name_key" ON "VipLocation"("eventId", "name");

-- CreateIndex
CREATE INDEX "VipTable_eventId_vipLocationId_idx" ON "VipTable"("eventId", "vipLocationId");

-- CreateIndex
CREATE INDEX "VipTable_status_idx" ON "VipTable"("status");

-- CreateIndex
CREATE UNIQUE INDEX "VipTable_eventId_vipLocationId_tableNumber_key" ON "VipTable"("eventId", "vipLocationId", "tableNumber");

-- CreateIndex
CREATE INDEX "DiscountRule_eventId_isActive_idx" ON "DiscountRule"("eventId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "DiscountRule_eventId_ticketType_gender_minQty_key" ON "DiscountRule"("eventId", "ticketType", "gender", "minQty");

-- CreateIndex
CREATE INDEX "Event_code_idx" ON "Event"("code");

-- CreateIndex
CREATE INDEX "Event_date_idx" ON "Event"("date");

-- CreateIndex
CREATE INDEX "Event_isActive_idx" ON "Event"("isActive");

-- CreateIndex
CREATE INDEX "Ticket_vipLocationId_idx" ON "Ticket"("vipLocationId");

-- CreateIndex
CREATE INDEX "Ticket_vipTableId_idx" ON "Ticket"("vipTableId");

-- CreateIndex
CREATE INDEX "TicketArchive_paymentStatus_idx" ON "TicketArchive"("paymentStatus");

-- CreateIndex
CREATE INDEX "TicketArchive_vipLocationId_idx" ON "TicketArchive"("vipLocationId");

-- CreateIndex
CREATE INDEX "TicketArchive_vipTableId_idx" ON "TicketArchive"("vipTableId");

-- CreateIndex
CREATE INDEX "TicketConfig_eventId_ticketType_gender_idx" ON "TicketConfig"("eventId", "ticketType", "gender");

-- CreateIndex
CREATE UNIQUE INDEX "TicketConfig_eventId_ticketType_gender_key" ON "TicketConfig"("eventId", "ticketType", "gender");

-- CreateIndex
CREATE INDEX "VipTableConfig_eventId_vipLocationId_idx" ON "VipTableConfig"("eventId", "vipLocationId");

-- CreateIndex
CREATE UNIQUE INDEX "VipTableConfig_eventId_vipLocationId_key" ON "VipTableConfig"("eventId", "vipLocationId");

-- AddForeignKey
ALTER TABLE "VipLocation" ADD CONSTRAINT "VipLocation_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VipTableConfig" ADD CONSTRAINT "VipTableConfig_vipLocationId_fkey" FOREIGN KEY ("vipLocationId") REFERENCES "VipLocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VipTable" ADD CONSTRAINT "VipTable_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VipTable" ADD CONSTRAINT "VipTable_vipLocationId_fkey" FOREIGN KEY ("vipLocationId") REFERENCES "VipLocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VipTable" ADD CONSTRAINT "VipTable_vipTableConfigId_fkey" FOREIGN KEY ("vipTableConfigId") REFERENCES "VipTableConfig"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_vipLocationId_fkey" FOREIGN KEY ("vipLocationId") REFERENCES "VipLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_vipTableId_fkey" FOREIGN KEY ("vipTableId") REFERENCES "VipTable"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_vipTableConfigId_fkey" FOREIGN KEY ("vipTableConfigId") REFERENCES "VipTableConfig"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketArchive" ADD CONSTRAINT "TicketArchive_vipLocationId_fkey" FOREIGN KEY ("vipLocationId") REFERENCES "VipLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketArchive" ADD CONSTRAINT "TicketArchive_vipTableId_fkey" FOREIGN KEY ("vipTableId") REFERENCES "VipTable"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketArchive" ADD CONSTRAINT "TicketArchive_vipTableConfigId_fkey" FOREIGN KEY ("vipTableConfigId") REFERENCES "VipTableConfig"("id") ON DELETE SET NULL ON UPDATE CASCADE;

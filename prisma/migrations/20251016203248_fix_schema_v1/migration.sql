/*
  Warnings:

  - You are about to drop the column `location` on the `Ticket` table. All the data in the column will be lost.
  - You are about to drop the column `tableReservationId` on the `Ticket` table. All the data in the column will be lost.
  - You are about to drop the `TableReservation` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "TableReservation" DROP CONSTRAINT "TableReservation_eventId_fkey";

-- DropForeignKey
ALTER TABLE "TableReservation" DROP CONSTRAINT "TableReservation_vipTableConfigId_fkey";

-- DropForeignKey
ALTER TABLE "Ticket" DROP CONSTRAINT "Ticket_tableReservationId_fkey";

-- DropIndex
DROP INDEX "Ticket_tableReservationId_idx";

-- AlterTable
ALTER TABLE "Ticket" DROP COLUMN "location",
DROP COLUMN "tableReservationId",
ADD COLUMN     "capacityPerTable" INTEGER,
ADD COLUMN     "vipLocation" "TableLocation",
ADD COLUMN     "vipTables" INTEGER;

-- DropTable
DROP TABLE "TableReservation";

-- DropEnum
DROP TYPE "PackageType";

-- CreateIndex
CREATE INDEX "Ticket_vipLocation_idx" ON "Ticket"("vipLocation");

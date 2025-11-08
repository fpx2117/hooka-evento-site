-- AlterTable
ALTER TABLE "TicketArchive" ADD COLUMN     "capacityPerTable" INTEGER,
ADD COLUMN     "emailSentAt" TIMESTAMP(3),
ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "paymentId" TEXT,
ADD COLUMN     "qrCode" TEXT,
ADD COLUMN     "tableNumber" INTEGER,
ADD COLUMN     "validationCode" TEXT;

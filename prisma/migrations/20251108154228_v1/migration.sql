-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('pending', 'approved', 'rejected', 'in_process', 'failed_preference', 'cancelled', 'refunded', 'charged_back');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('mercadopago', 'transferencia', 'efectivo');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('hombre', 'mujer');

-- CreateEnum
CREATE TYPE "TableLocation" AS ENUM ('piscina', 'dj', 'general');

-- CreateEnum
CREATE TYPE "TicketType" AS ENUM ('general', 'vip');

-- CreateEnum
CREATE TYPE "DiscountType" AS ENUM ('percent', 'amount');

-- CreateEnum
CREATE TYPE "ArchiveReason" AS ENUM ('user_deleted', 'admin_cancelled', 'payment_timeout', 'refunded', 'charged_back', 'other');

-- CreateEnum
CREATE TYPE "VipTableStatus" AS ENUM ('available', 'reserved', 'sold', 'blocked');

-- CreateTable
CREATE TABLE "Admin" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Admin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "totalLimitPersons" INTEGER NOT NULL DEFAULT 0,
    "soldPersons" INTEGER NOT NULL DEFAULT 0,
    "remainingPersons" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ticket" (
    "id" TEXT NOT NULL,
    "ticketType" "TicketType" NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "totalPrice" DECIMAL(10,2) NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerEmail" TEXT NOT NULL,
    "customerPhone" TEXT NOT NULL,
    "customerDni" TEXT NOT NULL,
    "gender" "Gender",
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
    "emailSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "capacityPerTable" INTEGER,
    "vipLocation" "TableLocation",
    "vipTables" INTEGER,
    "tableNumber" INTEGER,
    "eventId" TEXT NOT NULL,
    "ticketConfigId" TEXT,
    "vipLocationId" TEXT,
    "vipTableId" TEXT,
    "vipTableConfigId" TEXT,

    CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id")
);

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
    "vipLocationId" TEXT,
    "vipTableId" TEXT,
    "vipTableConfigId" TEXT,

    CONSTRAINT "TicketArchive_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketConfig" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "ticketType" "TicketType" NOT NULL,
    "gender" "Gender",
    "price" DECIMAL(10,2) NOT NULL,
    "stockLimit" INTEGER NOT NULL DEFAULT 0,
    "soldCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TicketConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VipTableConfig" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "vipLocationId" TEXT NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "stockLimit" INTEGER NOT NULL,
    "soldCount" INTEGER NOT NULL DEFAULT 0,
    "capacityPerTable" INTEGER NOT NULL DEFAULT 10,
    "mapUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VipTableConfig_pkey" PRIMARY KEY ("id")
);

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
    "price" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "status" "VipTableStatus" NOT NULL DEFAULT 'available',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VipTable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscountRule" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "ticketType" "TicketType" NOT NULL,
    "gender" "Gender",
    "minQty" INTEGER NOT NULL,
    "type" "DiscountType" NOT NULL,
    "value" DECIMAL(10,2) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiscountRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Admin_username_key" ON "Admin"("username");

-- CreateIndex
CREATE INDEX "Admin_username_idx" ON "Admin"("username");

-- CreateIndex
CREATE UNIQUE INDEX "Event_code_key" ON "Event"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Ticket_paymentId_key" ON "Ticket"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "Ticket_qrCode_key" ON "Ticket"("qrCode");

-- CreateIndex
CREATE UNIQUE INDEX "Ticket_validationCode_key" ON "Ticket"("validationCode");

-- CreateIndex
CREATE INDEX "Ticket_eventId_idx" ON "Ticket"("eventId");

-- CreateIndex
CREATE INDEX "Ticket_paymentId_idx" ON "Ticket"("paymentId");

-- CreateIndex
CREATE INDEX "Ticket_paymentStatus_purchaseDate_idx" ON "Ticket"("paymentStatus", "purchaseDate");

-- CreateIndex
CREATE INDEX "Ticket_ticketType_gender_idx" ON "Ticket"("ticketType", "gender");

-- CreateIndex
CREATE INDEX "Ticket_customerEmail_idx" ON "Ticket"("customerEmail");

-- CreateIndex
CREATE INDEX "Ticket_customerDni_idx" ON "Ticket"("customerDni");

-- CreateIndex
CREATE INDEX "Ticket_emailSentAt_idx" ON "Ticket"("emailSentAt");

-- CreateIndex
CREATE INDEX "Ticket_vipLocation_idx" ON "Ticket"("vipLocation");

-- CreateIndex
CREATE INDEX "Ticket_tableNumber_idx" ON "Ticket"("tableNumber");

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

-- CreateIndex
CREATE INDEX "TicketConfig_eventId_ticketType_gender_idx" ON "TicketConfig"("eventId", "ticketType", "gender");

-- CreateIndex
CREATE INDEX "TicketConfig_eventId_idx" ON "TicketConfig"("eventId");

-- CreateIndex
CREATE INDEX "TicketConfig_ticketType_idx" ON "TicketConfig"("ticketType");

-- CreateIndex
CREATE UNIQUE INDEX "TicketConfig_eventId_ticketType_gender_key" ON "TicketConfig"("eventId", "ticketType", "gender");

-- CreateIndex
CREATE INDEX "VipTableConfig_eventId_vipLocationId_idx" ON "VipTableConfig"("eventId", "vipLocationId");

-- CreateIndex
CREATE UNIQUE INDEX "VipTableConfig_eventId_vipLocationId_key" ON "VipTableConfig"("eventId", "vipLocationId");

-- CreateIndex
CREATE INDEX "DiscountRule_eventId_ticketType_gender_isActive_idx" ON "DiscountRule"("eventId", "ticketType", "gender", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "DiscountRule_eventId_ticketType_gender_minQty_key" ON "DiscountRule"("eventId", "ticketType", "gender", "minQty");

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_ticketConfigId_fkey" FOREIGN KEY ("ticketConfigId") REFERENCES "TicketConfig"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_vipLocationId_fkey" FOREIGN KEY ("vipLocationId") REFERENCES "VipLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_vipTableId_fkey" FOREIGN KEY ("vipTableId") REFERENCES "VipTable"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_vipTableConfigId_fkey" FOREIGN KEY ("vipTableConfigId") REFERENCES "VipTableConfig"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketArchive" ADD CONSTRAINT "TicketArchive_archivedFromId_fkey" FOREIGN KEY ("archivedFromId") REFERENCES "Ticket"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketArchive" ADD CONSTRAINT "TicketArchive_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketArchive" ADD CONSTRAINT "TicketArchive_ticketConfigId_fkey" FOREIGN KEY ("ticketConfigId") REFERENCES "TicketConfig"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketArchive" ADD CONSTRAINT "TicketArchive_vipLocationId_fkey" FOREIGN KEY ("vipLocationId") REFERENCES "VipLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketArchive" ADD CONSTRAINT "TicketArchive_vipTableId_fkey" FOREIGN KEY ("vipTableId") REFERENCES "VipTable"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketArchive" ADD CONSTRAINT "TicketArchive_vipTableConfigId_fkey" FOREIGN KEY ("vipTableConfigId") REFERENCES "VipTableConfig"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketConfig" ADD CONSTRAINT "TicketConfig_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VipTableConfig" ADD CONSTRAINT "VipTableConfig_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VipTableConfig" ADD CONSTRAINT "VipTableConfig_vipLocationId_fkey" FOREIGN KEY ("vipLocationId") REFERENCES "VipLocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VipLocation" ADD CONSTRAINT "VipLocation_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VipTable" ADD CONSTRAINT "VipTable_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VipTable" ADD CONSTRAINT "VipTable_vipLocationId_fkey" FOREIGN KEY ("vipLocationId") REFERENCES "VipLocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VipTable" ADD CONSTRAINT "VipTable_vipTableConfigId_fkey" FOREIGN KEY ("vipTableConfigId") REFERENCES "VipTableConfig"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscountRule" ADD CONSTRAINT "DiscountRule_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

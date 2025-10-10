-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('pending', 'approved', 'rejected', 'in_process', 'failed_preference', 'cancelled', 'refunded', 'charged_back');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('mercadopago', 'transferencia', 'efectivo');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('hombre', 'mujer');

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
CREATE TABLE "Ticket" (
    "id" TEXT NOT NULL,
    "ticketType" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "totalPrice" DOUBLE PRECISION NOT NULL,
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

    CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TableReservation" (
    "id" TEXT NOT NULL,
    "packageType" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "guests" INTEGER NOT NULL,
    "totalPrice" DOUBLE PRECISION NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerEmail" TEXT NOT NULL,
    "customerPhone" TEXT NOT NULL,
    "customerDni" TEXT NOT NULL,
    "reservationDate" TIMESTAMP(3) NOT NULL,
    "paymentId" TEXT,
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'pending',
    "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'mercadopago',
    "qrCode" TEXT,
    "validationCode" TEXT,
    "validated" BOOLEAN NOT NULL DEFAULT false,
    "validatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TableReservation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Admin_username_key" ON "Admin"("username");

-- CreateIndex
CREATE INDEX "Admin_username_idx" ON "Admin"("username");

-- CreateIndex
CREATE UNIQUE INDEX "Ticket_paymentId_key" ON "Ticket"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "Ticket_qrCode_key" ON "Ticket"("qrCode");

-- CreateIndex
CREATE UNIQUE INDEX "Ticket_validationCode_key" ON "Ticket"("validationCode");

-- CreateIndex
CREATE INDEX "Ticket_customerEmail_idx" ON "Ticket"("customerEmail");

-- CreateIndex
CREATE INDEX "Ticket_paymentId_idx" ON "Ticket"("paymentId");

-- CreateIndex
CREATE INDEX "Ticket_customerDni_idx" ON "Ticket"("customerDni");

-- CreateIndex
CREATE INDEX "Ticket_qrCode_idx" ON "Ticket"("qrCode");

-- CreateIndex
CREATE INDEX "Ticket_validationCode_idx" ON "Ticket"("validationCode");

-- CreateIndex
CREATE INDEX "Ticket_paymentStatus_purchaseDate_idx" ON "Ticket"("paymentStatus", "purchaseDate");

-- CreateIndex
CREATE UNIQUE INDEX "TableReservation_paymentId_key" ON "TableReservation"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "TableReservation_qrCode_key" ON "TableReservation"("qrCode");

-- CreateIndex
CREATE UNIQUE INDEX "TableReservation_validationCode_key" ON "TableReservation"("validationCode");

-- CreateIndex
CREATE INDEX "TableReservation_customerEmail_idx" ON "TableReservation"("customerEmail");

-- CreateIndex
CREATE INDEX "TableReservation_paymentId_idx" ON "TableReservation"("paymentId");

-- CreateIndex
CREATE INDEX "TableReservation_reservationDate_idx" ON "TableReservation"("reservationDate");

-- CreateIndex
CREATE INDEX "TableReservation_customerDni_idx" ON "TableReservation"("customerDni");

-- CreateIndex
CREATE INDEX "TableReservation_qrCode_idx" ON "TableReservation"("qrCode");

-- CreateIndex
CREATE INDEX "TableReservation_validationCode_idx" ON "TableReservation"("validationCode");

-- CreateIndex
CREATE INDEX "TableReservation_paymentStatus_reservationDate_idx" ON "TableReservation"("paymentStatus", "reservationDate");

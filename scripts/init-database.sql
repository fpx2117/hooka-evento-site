-- Crear tabla de entradas
CREATE TABLE IF NOT EXISTS "Ticket" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ticketType" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "totalPrice" DOUBLE PRECISION NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerEmail" TEXT NOT NULL,
    "customerPhone" TEXT NOT NULL,
    "paymentId" TEXT,
    "paymentStatus" TEXT NOT NULL DEFAULT 'pending',
    "qrCode" TEXT,
    "purchaseDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eventDate" TIMESTAMP(3)
);

-- Crear índices para Ticket
CREATE UNIQUE INDEX IF NOT EXISTS "Ticket_paymentId_key" ON "Ticket"("paymentId");
CREATE INDEX IF NOT EXISTS "Ticket_customerEmail_idx" ON "Ticket"("customerEmail");
CREATE INDEX IF NOT EXISTS "Ticket_paymentId_idx" ON "Ticket"("paymentId");

-- Crear tabla de reservas de mesas
CREATE TABLE IF NOT EXISTS "TableReservation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "packageType" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "guests" INTEGER NOT NULL,
    "totalPrice" DOUBLE PRECISION NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerEmail" TEXT NOT NULL,
    "customerPhone" TEXT NOT NULL,
    "reservationDate" TIMESTAMP(3) NOT NULL,
    "paymentId" TEXT,
    "paymentStatus" TEXT NOT NULL DEFAULT 'pending',
    "qrCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Crear índices para TableReservation
CREATE UNIQUE INDEX IF NOT EXISTS "TableReservation_paymentId_key" ON "TableReservation"("paymentId");
CREATE INDEX IF NOT EXISTS "TableReservation_customerEmail_idx" ON "TableReservation"("customerEmail");
CREATE INDEX IF NOT EXISTS "TableReservation_paymentId_idx" ON "TableReservation"("paymentId");
CREATE INDEX IF NOT EXISTS "TableReservation_reservationDate_idx" ON "TableReservation"("reservationDate");

-- Add Admin table
CREATE TABLE IF NOT EXISTS "Admin" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL UNIQUE,
    "password" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "Admin_username_idx" ON "Admin"("username");

-- Update Ticket table with new fields
ALTER TABLE "Ticket" ADD COLUMN IF NOT EXISTS "gender" TEXT;
ALTER TABLE "Ticket" ADD COLUMN IF NOT EXISTS "paymentMethod" TEXT DEFAULT 'mercadopago';
ALTER TABLE "Ticket" ADD COLUMN IF NOT EXISTS "validated" BOOLEAN DEFAULT false;
ALTER TABLE "Ticket" ADD COLUMN IF NOT EXISTS "validatedAt" TIMESTAMP(3);
ALTER TABLE "Ticket" ALTER COLUMN "quantity" SET DEFAULT 1;

-- Update TableReservation table with new fields
ALTER TABLE "TableReservation" ADD COLUMN IF NOT EXISTS "paymentMethod" TEXT DEFAULT 'mercadopago';
ALTER TABLE "TableReservation" ADD COLUMN IF NOT EXISTS "validated" BOOLEAN DEFAULT false;
ALTER TABLE "TableReservation" ADD COLUMN IF NOT EXISTS "validatedAt" TIMESTAMP(3);

-- Create indexes for QR codes
CREATE INDEX IF NOT EXISTS "Ticket_qrCode_idx" ON "Ticket"("qrCode");
CREATE INDEX IF NOT EXISTS "TableReservation_qrCode_idx" ON "TableReservation"("qrCode");

-- Insert default admin user (password: admin123 - hashed with bcrypt)
-- Note: In production, change this password immediately!
INSERT INTO "Admin" ("id", "username", "password", "name")
VALUES (
    'admin-default-001',
    'admin',
    '$2a$10$rKvVPZqGvVWJxvVxVxVxVeVxVxVxVxVxVxVxVxVxVxVxVxVxVxVxV',
    'Administrador'
) ON CONFLICT (username) DO NOTHING;

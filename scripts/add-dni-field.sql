-- Add DNI field to Ticket table
ALTER TABLE "Ticket" ADD COLUMN IF NOT EXISTS "customerDni" TEXT NOT NULL DEFAULT '';

-- Add DNI field to TableReservation table
ALTER TABLE "TableReservation" ADD COLUMN IF NOT EXISTS "customerDni" TEXT NOT NULL DEFAULT '';

-- Create indexes for DNI fields
CREATE INDEX IF NOT EXISTS "Ticket_customerDni_idx" ON "Ticket"("customerDni");
CREATE INDEX IF NOT EXISTS "TableReservation_customerDni_idx" ON "TableReservation"("customerDni");

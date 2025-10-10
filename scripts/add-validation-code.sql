-- Add validationCode column to Ticket table
ALTER TABLE "Ticket" ADD COLUMN "validationCode" TEXT;

-- Add validationCode column to TableReservation table
ALTER TABLE "TableReservation" ADD COLUMN "validationCode" TEXT;

-- Create unique indexes for validation codes
CREATE UNIQUE INDEX "Ticket_validationCode_key" ON "Ticket"("validationCode");
CREATE UNIQUE INDEX "TableReservation_validationCode_key" ON "TableReservation"("validationCode");

-- Create indexes for faster lookups
CREATE INDEX "Ticket_validationCode_idx" ON "Ticket"("validationCode");
CREATE INDEX "TableReservation_validationCode_idx" ON "TableReservation"("validationCode");

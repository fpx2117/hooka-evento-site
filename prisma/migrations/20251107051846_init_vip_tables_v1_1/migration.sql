-- ===========================================
-- FIX SAFE MIGRATION (Production Compatible)
-- Version funcionalmente idéntica al original
-- ===========================================

-- 1️⃣ Asegurar que las columnas nuevas existan
ALTER TABLE "TicketArchive"
ADD COLUMN IF NOT EXISTS "capacityPerTable" INTEGER NULL,
ADD COLUMN IF NOT EXISTS "emailSentAt" TIMESTAMP(3) NULL,
ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMP(3) NULL,
ADD COLUMN IF NOT EXISTS "paymentId" TEXT NULL,
ADD COLUMN IF NOT EXISTS "qrCode" TEXT NULL,
ADD COLUMN IF NOT EXISTS "tableNumber" INTEGER NULL,
ADD COLUMN IF NOT EXISTS "validationCode" TEXT NULL;

-- 2️⃣ Asegurar índices opcionales si Prisma los requiere (según tu schema actual)
DO $$ BEGIN
    CREATE INDEX IF NOT EXISTS "TicketArchive_paymentId_idx" ON "TicketArchive"("paymentId");
EXCEPTION WHEN duplicate_table THEN NULL; END $$;

DO $$ BEGIN
    CREATE INDEX IF NOT EXISTS "TicketArchive_tableNumber_idx" ON "TicketArchive"("tableNumber");
EXCEPTION WHEN duplicate_table THEN NULL; END $$;

DO $$ BEGIN
    CREATE INDEX IF NOT EXISTS "TicketArchive_emailSentAt_idx" ON "TicketArchive"("emailSentAt");
EXCEPTION WHEN duplicate_table THEN NULL; END $$;

-- 3️⃣ Registrar manualmente la migración como aplicada
UPDATE "_prisma_migrations"
SET
  applied_steps_count = 1,
  finished_at = NOW(),
  rolled_back_at = NULL,
  logs = '✅ Columns added manually and safely in production',
  started_at = NOW()
WHERE migration_name = '20251107051846_init_vip_tables_v1_1';

-- ===========================================
-- END SAFE MIGRATION
-- ===========================================

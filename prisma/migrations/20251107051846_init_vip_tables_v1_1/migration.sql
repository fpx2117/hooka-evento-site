-- ===========================================
-- SAFE ALTER FOR PRODUCTION
-- Migration: 20251107051846_init_vip_tables_v1_1
-- ===========================================

ALTER TABLE "TicketArchive"
ADD COLUMN IF NOT EXISTS "capacityPerTable" INTEGER NULL;

ALTER TABLE "TicketArchive"
ADD COLUMN IF NOT EXISTS "emailSentAt" TIMESTAMP(3) NULL;

ALTER TABLE "TicketArchive"
ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMP(3) NULL;

ALTER TABLE "TicketArchive"
ADD COLUMN IF NOT EXISTS "paymentId" TEXT NULL;

ALTER TABLE "TicketArchive"
ADD COLUMN IF NOT EXISTS "qrCode" TEXT NULL;

ALTER TABLE "TicketArchive"
ADD COLUMN IF NOT EXISTS "tableNumber" INTEGER NULL;

ALTER TABLE "TicketArchive"
ADD COLUMN IF NOT EXISTS "validationCode" TEXT NULL;

-- ===========================================
-- Mark migration as completed (optional but recommended)
-- ===========================================
UPDATE "_prisma_migrations"
SET
  applied_steps_count = 1,
  finished_at = NOW(),
  rolled_back_at = NULL,
  logs = '✅ Columns added manually in production, migration fixed safely',
  started_at = NOW()
WHERE migration_name = '20251107051846_init_vip_tables_v1_1';

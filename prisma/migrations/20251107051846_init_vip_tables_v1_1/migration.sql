-- ===========================================
-- FIX MIGRATION 20251107051846_init_vip_tables_v1_1
-- SAFE VERSION - NO DATA LOSS
-- ===========================================

-- 1️⃣ Asegurar que las columnas existen (no duplicar si ya están)
ALTER TABLE "TicketArchive"
ADD COLUMN IF NOT EXISTS "capacityPerTable" INTEGER,
ADD COLUMN IF NOT EXISTS "emailSentAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "paymentId" TEXT,
ADD COLUMN IF NOT EXISTS "qrCode" TEXT,
ADD COLUMN IF NOT EXISTS "tableNumber" INTEGER,
ADD COLUMN IF NOT EXISTS "validationCode" TEXT;

-- 2️⃣ Registrar manualmente la migración como aplicada (solo si falló)
UPDATE "_prisma_migrations"
SET finished_at = NOW(),
    applied_steps_count = 1,
    logs = 'Manually fixed init_vip_tables_v1_1 in production (columns added safely)',
    rolled_back_at = NULL
WHERE migration_name = '20251107051846_init_vip_tables_v1_1';

-- ===========================================
-- END FIX
-- ===========================================

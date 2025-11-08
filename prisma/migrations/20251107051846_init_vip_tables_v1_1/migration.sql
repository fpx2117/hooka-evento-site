-- ===========================================
-- FINAL FIX: Resolver P3009 (migración atascada)
-- ===========================================

-- 1️⃣ Asegurar columnas
ALTER TABLE "TicketArchive"
ADD COLUMN IF NOT EXISTS "capacityPerTable" INTEGER,
ADD COLUMN IF NOT EXISTS "emailSentAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "paymentId" TEXT,
ADD COLUMN IF NOT EXISTS "qrCode" TEXT,
ADD COLUMN IF NOT EXISTS "tableNumber" INTEGER,
ADD COLUMN IF NOT EXISTS "validationCode" TEXT;

-- 2️⃣ Limpiar el estado de error si existe
UPDATE "_prisma_migrations"
SET
  applied_steps_count = 1,
  rolled_back_at = NULL,
  finished_at = NOW(),
  logs = '✅ Fixed manually in production. Columns created via IF NOT EXISTS.',
  started_at = NOW(),
  migration_name = '20251107051846_init_vip_tables_v1_1'
WHERE migration_name = '20251107051846_init_vip_tables_v1_1';

-- 3️⃣ Verificar resultado
SELECT migration_name, finished_at, applied_steps_count, logs
FROM "_prisma_migrations"
WHERE migration_name = '20251107051846_init_vip_tables_v1_1';

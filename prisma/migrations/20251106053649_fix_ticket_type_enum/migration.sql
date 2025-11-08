-- ===========================================
-- SAFE MIGRATION: agregar columnas VIP sin borrar datos
-- ===========================================

-- 1️⃣ Crear el nuevo enum solo si no existe
DO $$ BEGIN
    CREATE TYPE "VipTableStatus" AS ENUM ('available', 'reserved', 'sold', 'blocked');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- 2️⃣ Crear nuevas tablas si no existen
CREATE TABLE IF NOT EXISTS "VipLocation" (
    "id" TEXT PRIMARY KEY,
    "eventId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "VipTable" (
    "id" TEXT PRIMARY KEY,
    "eventId" TEXT NOT NULL,
    "vipLocationId" TEXT NOT NULL,
    "vipTableConfigId" TEXT NULL,
    "tableNumber" INTEGER NOT NULL,
    "capacityPerTable" INTEGER NOT NULL DEFAULT 10,
    "price" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "status" "VipTableStatus" NOT NULL DEFAULT 'available',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 3️⃣ Agregar columnas nuevas a Ticket y TicketArchive sin borrar las viejas
ALTER TABLE "Ticket"
ADD COLUMN IF NOT EXISTS "vipLocationId" TEXT NULL,
ADD COLUMN IF NOT EXISTS "vipTableConfigId" TEXT NULL,
ADD COLUMN IF NOT EXISTS "vipTableId" TEXT NULL;

ALTER TABLE "TicketArchive"
ADD COLUMN IF NOT EXISTS "vipLocationId" TEXT NULL,
ADD COLUMN IF NOT EXISTS "vipTableConfigId" TEXT NULL,
ADD COLUMN IF NOT EXISTS "vipTableId" TEXT NULL;

-- 4️⃣ Agregar columna nueva a VipTableConfig sin tocar las existentes
ALTER TABLE "VipTableConfig"
ADD COLUMN IF NOT EXISTS "vipLocationId" TEXT NULL;

-- 5️⃣ Crear índices si no existen
DO $$ BEGIN
    CREATE INDEX "Ticket_vipLocationId_idx" ON "Ticket"("vipLocationId");
EXCEPTION WHEN duplicate_table THEN NULL; END $$;

DO $$ BEGIN
    CREATE INDEX "Ticket_vipTableId_idx" ON "Ticket"("vipTableId");
EXCEPTION WHEN duplicate_table THEN NULL; END $$;

DO $$ BEGIN
    CREATE INDEX "TicketArchive_vipLocationId_idx" ON "TicketArchive"("vipLocationId");
EXCEPTION WHEN duplicate_table THEN NULL; END $$;

DO $$ BEGIN
    CREATE INDEX "TicketArchive_vipTableId_idx" ON "TicketArchive"("vipTableId");
EXCEPTION WHEN duplicate_table THEN NULL; END $$;

DO $$ BEGIN
    CREATE INDEX "VipTableConfig_eventId_vipLocationId_idx" ON "VipTableConfig"("eventId", "vipLocationId");
EXCEPTION WHEN duplicate_table THEN NULL; END $$;

-- 6️⃣ Crear las foreign keys solo si no existen
DO $$ BEGIN
    ALTER TABLE "VipLocation"
    ADD CONSTRAINT "VipLocation_eventId_fkey" FOREIGN KEY ("eventId")
    REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "VipTableConfig"
    ADD CONSTRAINT "VipTableConfig_vipLocationId_fkey" FOREIGN KEY ("vipLocationId")
    REFERENCES "VipLocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "VipTable"
    ADD CONSTRAINT "VipTable_eventId_fkey" FOREIGN KEY ("eventId")
    REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "VipTable"
    ADD CONSTRAINT "VipTable_vipLocationId_fkey" FOREIGN KEY ("vipLocationId")
    REFERENCES "VipLocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "VipTable"
    ADD CONSTRAINT "VipTable_vipTableConfigId_fkey" FOREIGN KEY ("vipTableConfigId")
    REFERENCES "VipTableConfig"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "Ticket"
    ADD CONSTRAINT "Ticket_vipLocationId_fkey" FOREIGN KEY ("vipLocationId")
    REFERENCES "VipLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "Ticket"
    ADD CONSTRAINT "Ticket_vipTableId_fkey" FOREIGN KEY ("vipTableId")
    REFERENCES "VipTable"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "Ticket"
    ADD CONSTRAINT "Ticket_vipTableConfigId_fkey" FOREIGN KEY ("vipTableConfigId")
    REFERENCES "VipTableConfig"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "TicketArchive"
    ADD CONSTRAINT "TicketArchive_vipLocationId_fkey" FOREIGN KEY ("vipLocationId")
    REFERENCES "VipLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "TicketArchive"
    ADD CONSTRAINT "TicketArchive_vipTableId_fkey" FOREIGN KEY ("vipTableId")
    REFERENCES "VipTable"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "TicketArchive"
    ADD CONSTRAINT "TicketArchive_vipTableConfigId_fkey" FOREIGN KEY ("vipTableConfigId")
    REFERENCES "VipTableConfig"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ===========================================
-- END SAFE MIGRATION
-- ===========================================

-- ===========================================
-- SAFE ALTER TABLE: agrega columnas sin errores si ya existen
-- ===========================================

DO $$
BEGIN
    -- Añadir columna capacityPerTable si no existe
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'TicketArchive' AND column_name = 'capacityPerTable'
    ) THEN
        ALTER TABLE "TicketArchive" ADD COLUMN "capacityPerTable" INTEGER;
    END IF;

    -- Añadir columna emailSentAt si no existe
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'TicketArchive' AND column_name = 'emailSentAt'
    ) THEN
        ALTER TABLE "TicketArchive" ADD COLUMN "emailSentAt" TIMESTAMP(3);
    END IF;

    -- Añadir columna expiresAt si no existe
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'TicketArchive' AND column_name = 'expiresAt'
    ) THEN
        ALTER TABLE "TicketArchive" ADD COLUMN "expiresAt" TIMESTAMP(3);
    END IF;

    -- Añadir columna paymentId si no existe
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'TicketArchive' AND column_name = 'paymentId'
    ) THEN
        ALTER TABLE "TicketArchive" ADD COLUMN "paymentId" TEXT;
    END IF;

    -- Añadir columna qrCode si no existe
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'TicketArchive' AND column_name = 'qrCode'
    ) THEN
        ALTER TABLE "TicketArchive" ADD COLUMN "qrCode" TEXT;
    END IF;

    -- Añadir columna tableNumber si no existe
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'TicketArchive' AND column_name = 'tableNumber'
    ) THEN
        ALTER TABLE "TicketArchive" ADD COLUMN "tableNumber" INTEGER;
    END IF;

    -- Añadir columna validationCode si no existe
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'TicketArchive' AND column_name = 'validationCode'
    ) THEN
        ALTER TABLE "TicketArchive" ADD COLUMN "validationCode" TEXT;
    END IF;
END $$;
-- ===========================================
-- END SAFE ALTER TABLE
-- ===========================================

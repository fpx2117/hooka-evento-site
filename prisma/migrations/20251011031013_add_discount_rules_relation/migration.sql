-- CreateEnum
CREATE TYPE "DiscountType" AS ENUM ('percent', 'amount');

-- CreateTable
CREATE TABLE "DiscountRule" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "ticketType" TEXT NOT NULL,
    "gender" "Gender",
    "minQty" INTEGER NOT NULL,
    "type" "DiscountType" NOT NULL,
    "value" DECIMAL(10,2) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiscountRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DiscountRule_eventId_ticketType_gender_isActive_idx" ON "DiscountRule"("eventId", "ticketType", "gender", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "DiscountRule_eventId_ticketType_gender_minQty_key" ON "DiscountRule"("eventId", "ticketType", "gender", "minQty");

-- AddForeignKey
ALTER TABLE "DiscountRule" ADD CONSTRAINT "DiscountRule_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

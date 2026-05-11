-- AlterTable
ALTER TABLE "Item" ADD COLUMN "utmSource" TEXT;
ALTER TABLE "Inquiry" ADD COLUMN "utmSource" TEXT;

-- CreateIndex
CREATE INDEX "Item_utmSource_idx" ON "Item"("utmSource");

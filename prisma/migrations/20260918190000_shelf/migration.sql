-- Sprint 11A:卖家摊位(dev / SQLite;生产走 db push)
-- CreateTable
CREATE TABLE "Shelf" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "contactValue" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "Shelf_slug_key" ON "Shelf"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Shelf_contactValue_key" ON "Shelf"("contactValue");

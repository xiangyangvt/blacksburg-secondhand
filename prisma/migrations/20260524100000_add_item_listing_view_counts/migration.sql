-- 主动查看计数：用户点开 / 展开卡片时累加，配合 visitor 节流表防止短时间重复计数

ALTER TABLE "Item" ADD COLUMN "viewCount" INTEGER NOT NULL DEFAULT 0;
CREATE INDEX "Item_viewCount_idx" ON "Item"("viewCount");

CREATE TABLE "ItemViewThrottle" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "itemId" TEXT NOT NULL,
  "visitorId" TEXT NOT NULL,
  "viewedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ItemViewThrottle_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ItemViewThrottle_itemId_visitorId_key" ON "ItemViewThrottle"("itemId", "visitorId");
CREATE INDEX "ItemViewThrottle_viewedAt_idx" ON "ItemViewThrottle"("viewedAt");

ALTER TABLE "Listing" ADD COLUMN "viewCount" INTEGER NOT NULL DEFAULT 0;
CREATE INDEX "Listing_viewCount_idx" ON "Listing"("viewCount");

CREATE TABLE "ListingViewThrottle" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "listingId" TEXT NOT NULL,
  "visitorId" TEXT NOT NULL,
  "viewedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ListingViewThrottle_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ListingViewThrottle_listingId_visitorId_key" ON "ListingViewThrottle"("listingId", "visitorId");
CREATE INDEX "ListingViewThrottle_viewedAt_idx" ON "ListingViewThrottle"("viewedAt");

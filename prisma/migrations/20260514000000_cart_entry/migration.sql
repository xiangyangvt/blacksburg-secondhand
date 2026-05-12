-- 购物清单云端去重计数：CartEntry { itemId, visitorId }
-- (itemId, visitorId) 唯一约束 = 真实独立持有人数

CREATE TABLE "CartEntry" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "itemId" TEXT NOT NULL,
  "visitorId" TEXT NOT NULL,
  "addedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CartEntry_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "CartEntry_itemId_visitorId_key" ON "CartEntry"("itemId", "visitorId");
CREATE INDEX "CartEntry_itemId_idx" ON "CartEntry"("itemId");

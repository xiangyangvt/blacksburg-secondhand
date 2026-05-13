-- Inquiry 扩展支持 listing 来源（公开 Q&A）
-- itemId 改为可选；新增 listingId 可选；二者二选一在应用层保证

-- SQLite 不支持直接 ALTER COLUMN，需要重建表
-- 1. 重建：保留原数据
CREATE TABLE "new_Inquiry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "itemId" TEXT,
    "listingId" TEXT,
    "contactType" TEXT NOT NULL,
    "contactValue" TEXT NOT NULL,
    "customContactLabel" TEXT,
    "message" TEXT NOT NULL,
    "sellerReply" TEXT,
    "sellerRepliedAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "ipAddress" TEXT,
    "utmSource" TEXT,
    CONSTRAINT "Inquiry_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Inquiry_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "new_Inquiry" ("id","itemId","contactType","contactValue","customContactLabel","message","sellerReply","sellerRepliedAt","status","createdAt","updatedAt","ipAddress","utmSource")
SELECT "id","itemId","contactType","contactValue","customContactLabel","message","sellerReply","sellerRepliedAt","status","createdAt","updatedAt","ipAddress","utmSource" FROM "Inquiry";

DROP TABLE "Inquiry";
ALTER TABLE "new_Inquiry" RENAME TO "Inquiry";

CREATE INDEX "Inquiry_itemId_createdAt_idx" ON "Inquiry"("itemId", "createdAt");
CREATE INDEX "Inquiry_listingId_createdAt_idx" ON "Inquiry"("listingId", "createdAt");
CREATE INDEX "Inquiry_contactValue_idx" ON "Inquiry"("contactValue");

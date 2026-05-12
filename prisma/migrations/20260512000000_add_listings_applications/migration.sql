-- Sprint 4 L1+L2：室友&转租 数据模型
--
-- 新建：
--   Listing 表（4 种类型 A/B/C/D）
--   Application 表（申请-同意流程）
-- 扩展：
--   Report 表加 listingId / applicationId / 新 targetType
-- 迁移：
--   旧 housing 类目 Item → Listing
--   sell (转租) → type=sublet (C)；buy (求租) → type=co_rent (B)
--   原 item 保留不删（status 不变），但应用层会从 /api/items 过滤掉 category=housing

-- ====== CreateTable: Listing ======
CREATE TABLE "Listing" (
    "id"                  TEXT NOT NULL PRIMARY KEY,
    "type"                TEXT NOT NULL,
    "posterGender"        TEXT NOT NULL DEFAULT 'unspecified',
    "ageRange"            TEXT,
    "lookingForGender"    TEXT NOT NULL DEFAULT 'any',
    "title"               TEXT NOT NULL,
    "description"         TEXT NOT NULL,
    "photoUrls"           TEXT NOT NULL,
    "hasPlace"            BOOLEAN NOT NULL DEFAULT false,
    "housingLayout"       TEXT,
    "moveInStart"         DATETIME,
    "moveInEnd"           DATETIME,
    "budgetMin"           INTEGER,
    "budgetMax"           INTEGER,
    "areas"               TEXT NOT NULL DEFAULT '[]',
    "sleepSchedule"       TEXT,
    "cleanliness"         TEXT,
    "social"              TEXT,
    "smoking"             TEXT,
    "drinking"            TEXT,
    "pets"                TEXT,
    "guests"              TEXT,
    "contactType"         TEXT NOT NULL,
    "contactValue"        TEXT NOT NULL,
    "customContactLabel"  TEXT,
    "editCodeHash"        TEXT NOT NULL,
    "status"              TEXT NOT NULL DEFAULT 'active',
    "createdAt"           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"           DATETIME NOT NULL,
    "bumpedAt"            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress"           TEXT,
    "utmSource"           TEXT,
    "migratedFromItem"    BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX "Listing_status_bumpedAt_idx" ON "Listing"("status", "bumpedAt");
CREATE INDEX "Listing_type_idx"            ON "Listing"("type");
CREATE INDEX "Listing_contactValue_idx"    ON "Listing"("contactValue");

-- ====== CreateTable: Application ======
CREATE TABLE "Application" (
    "id"                  TEXT NOT NULL PRIMARY KEY,
    "listingId"           TEXT NOT NULL,
    "applicantGender"     TEXT NOT NULL,
    "ageRange"            TEXT,
    "contactType"         TEXT NOT NULL,
    "contactValue"        TEXT NOT NULL,
    "customContactLabel"  TEXT,
    "message"             TEXT NOT NULL,
    "editCodeHash"        TEXT NOT NULL,
    "attachedListingId"   TEXT,
    "status"              TEXT NOT NULL DEFAULT 'pending',
    "rejectReason"        TEXT,
    "createdAt"           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"           DATETIME NOT NULL,
    "ipAddress"           TEXT,
    "utmSource"           TEXT,
    CONSTRAINT "Application_listingId_fkey"         FOREIGN KEY ("listingId")         REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Application_attachedListingId_fkey" FOREIGN KEY ("attachedListingId") REFERENCES "Listing"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "Application_listingId_status_idx" ON "Application"("listingId", "status");
CREATE INDEX "Application_contactValue_idx"     ON "Application"("contactValue");

-- ====== AlterTable: Report 加 listing / application 引用 ======
-- SQLite 不支持 ALTER ADD COLUMN with FK constraint，所以新建临时表 + 复制数据
CREATE TABLE "new_Report" (
    "id"             TEXT NOT NULL PRIMARY KEY,
    "targetType"     TEXT NOT NULL,
    "itemId"         TEXT,
    "inquiryId"      TEXT,
    "listingId"      TEXT,
    "applicationId"  TEXT,
    "reason"         TEXT NOT NULL,
    "reporterIp"     TEXT,
    "createdAt"      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Report_itemId_fkey"        FOREIGN KEY ("itemId")        REFERENCES "Item"("id")        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Report_inquiryId_fkey"     FOREIGN KEY ("inquiryId")     REFERENCES "Inquiry"("id")     ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Report_listingId_fkey"     FOREIGN KEY ("listingId")     REFERENCES "Listing"("id")     ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Report_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Report" ("id","targetType","itemId","inquiryId","reason","reporterIp","createdAt")
SELECT "id","targetType","itemId","inquiryId","reason","reporterIp","createdAt" FROM "Report";
DROP TABLE "Report";
ALTER TABLE "new_Report" RENAME TO "Report";
CREATE INDEX "Report_itemId_idx"        ON "Report"("itemId");
CREATE INDEX "Report_inquiryId_idx"     ON "Report"("inquiryId");
CREATE INDEX "Report_listingId_idx"     ON "Report"("listingId");
CREATE INDEX "Report_applicationId_idx" ON "Report"("applicationId");

-- ====== L2: 数据迁移 housing items → Listing ======
-- 旧 sell (转租) → type='sublet' (C)
-- 旧 buy  (求租) → type='co_rent' (B)
-- 其他字段尽量映射；不能解析的字段留默认值
-- 注意：原 Item 行不删，但应用层 GET /api/items 会过滤掉 category='housing'
INSERT INTO "Listing" (
    "id", "type",
    "posterGender", "lookingForGender",
    "title", "description", "photoUrls",
    "hasPlace", "areas",
    "budgetMin", "budgetMax",
    "contactType", "contactValue", "customContactLabel",
    "editCodeHash", "status",
    "createdAt", "updatedAt", "bumpedAt",
    "ipAddress", "utmSource",
    "migratedFromItem"
)
SELECT
    -- 用同样的 id 但加前缀，避免 collision（万一以后想再迁移一次）
    'mig_' || "id",
    CASE WHEN "type" = 'sell' THEN 'sublet' ELSE 'co_rent' END,
    'unspecified',
    'any',
    "title", "description", "photoUrls",
    CASE WHEN "type" = 'sell' THEN 1 ELSE 0 END,
    '[]',
    "price", "price",                         -- 用原价填 min/max 两个；用户后续可改
    "contactType", "contactValue", "customContactLabel",
    "editCodeHash", "status",
    "createdAt", "updatedAt", "bumpedAt",
    "ipAddress", "utmSource",
    1
FROM "Item"
WHERE "category" = 'housing'
  AND "status" IN ('active', 'hidden');     -- deleted 的不迁

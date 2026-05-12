-- Sprint 4 L1：室友&转租 数据模型
--
-- 新建：
--   Listing 表（4 种类型 A/B/C/D）
--   Application 表（申请-同意流程）
-- 扩展：
--   Report 表加 listingId / applicationId / 新 targetType
--
-- 数据迁移：取消（旧 housing 类目只剩 Sean 自己 1 条，手动重发更简单可靠）
-- 处理方式：/api/items GET 把 category='housing' 的 row 排除，前端看不到；
--           Sean 在 /我的发布 二手 tab 里可看到老的 housing item，手动删除后到 /roommates 重发

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

-- 数据迁移部分已删除（见文件顶部注释）

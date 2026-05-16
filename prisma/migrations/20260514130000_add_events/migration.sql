-- Sprint 7 Phase 1:黑堡本地信息流 — Event + ScrapeRun 表

CREATE TABLE "Event" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "source" TEXT NOT NULL,
  "sourceUrl" TEXT NOT NULL,
  "sourceId" TEXT,
  "title" TEXT NOT NULL,
  "titleOriginal" TEXT,
  "description" TEXT,
  "startAt" DATETIME,
  "endAt" DATETIME,
  "location" TEXT,
  "category" TEXT,
  "imageUrl" TEXT,
  "qualityScore" REAL NOT NULL DEFAULT 0.7,
  "scrapedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "publishedAt" DATETIME,
  "status" TEXT NOT NULL DEFAULT 'active'
);

CREATE UNIQUE INDEX "Event_source_sourceUrl_key" ON "Event"("source", "sourceUrl");
CREATE INDEX "Event_startAt_idx" ON "Event"("startAt");
CREATE INDEX "Event_source_idx" ON "Event"("source");
CREATE INDEX "Event_status_startAt_idx" ON "Event"("status", "startAt");
CREATE INDEX "Event_category_idx" ON "Event"("category");

CREATE TABLE "ScrapeRun" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "source" TEXT NOT NULL,
  "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" DATETIME,
  "status" TEXT NOT NULL,
  "itemsFound" INTEGER NOT NULL DEFAULT 0,
  "itemsNew" INTEGER NOT NULL DEFAULT 0,
  "errorMsg" TEXT
);

CREATE INDEX "ScrapeRun_source_startedAt_idx" ON "ScrapeRun"("source", "startedAt");

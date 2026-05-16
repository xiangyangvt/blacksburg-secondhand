-- Phase 2A: Event 加 clickCount + EventClickThrottle 防刷表

-- AlterTable
ALTER TABLE "Event" ADD COLUMN "clickCount" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "Event_clickCount_idx" ON "Event"("clickCount");

-- CreateTable
CREATE TABLE "EventClickThrottle" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventId" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "EventClickThrottle_eventId_visitorId_key" ON "EventClickThrottle"("eventId", "visitorId");

-- CreateIndex
CREATE INDEX "EventClickThrottle_createdAt_idx" ON "EventClickThrottle"("createdAt");

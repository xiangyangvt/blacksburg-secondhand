-- Phase 2C: EventComment + EventContactSend

-- CreateTable
CREATE TABLE "EventComment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventId" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "nickname" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "EventComment_eventId_status_createdAt_idx" ON "EventComment"("eventId", "status", "createdAt");
CREATE INDEX "EventComment_visitorId_idx" ON "EventComment"("visitorId");

-- CreateTable
CREATE TABLE "EventContactSend" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventId" TEXT NOT NULL,
    "fromVisitorId" TEXT NOT NULL,
    "fromNickname" TEXT NOT NULL,
    "fromContactType" TEXT NOT NULL,
    "fromContact" TEXT NOT NULL,
    "fromContactLabel" TEXT,
    "toVisitorId" TEXT NOT NULL,
    "toCommentId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "readAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "EventContactSend_eventId_fromVisitorId_toVisitorId_key" ON "EventContactSend"("eventId", "fromVisitorId", "toVisitorId");
CREATE INDEX "EventContactSend_toVisitorId_status_createdAt_idx" ON "EventContactSend"("toVisitorId", "status", "createdAt");
CREATE INDEX "EventContactSend_fromVisitorId_status_idx" ON "EventContactSend"("fromVisitorId", "status");

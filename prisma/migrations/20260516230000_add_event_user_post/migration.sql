-- Phase 3A: Event 加用户发布字段

ALTER TABLE "Event" ADD COLUMN "posterCodeHash" TEXT;
ALTER TABLE "Event" ADD COLUMN "posterVisitorId" TEXT;
ALTER TABLE "Event" ADD COLUMN "posterNickname" TEXT;
ALTER TABLE "Event" ADD COLUMN "posterContactType" TEXT;
ALTER TABLE "Event" ADD COLUMN "posterContact" TEXT;
ALTER TABLE "Event" ADD COLUMN "posterContactLabel" TEXT;
ALTER TABLE "Event" ADD COLUMN "posterContactPublic" BOOLEAN DEFAULT false;
ALTER TABLE "Event" ADD COLUMN "customCategory" TEXT;
ALTER TABLE "Event" ADD COLUMN "photoUrls" TEXT;

CREATE INDEX "Event_posterVisitorId_idx" ON "Event"("posterVisitorId");

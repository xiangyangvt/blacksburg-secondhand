-- 识别码找回回路 (Sprint 6 UX-5):RecoveryRequest 表
-- 用户丢识别码后提交申请,Sean admin 人工核对处理

CREATE TABLE "RecoveryRequest" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "targetType" TEXT NOT NULL,
  "targetId" TEXT,
  "targetContactValue" TEXT NOT NULL,
  "applicantWechat" TEXT NOT NULL,
  "applicantNote" TEXT,
  "ipAddress" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "adminNotes" TEXT,
  "resolvedEditCode" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);

CREATE INDEX "RecoveryRequest_status_createdAt_idx" ON "RecoveryRequest"("status", "createdAt");
CREATE INDEX "RecoveryRequest_targetId_idx" ON "RecoveryRequest"("targetId");

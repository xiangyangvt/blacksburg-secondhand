-- CreateTable
CREATE TABLE "PendingCloudinaryDeletion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "publicId" TEXT NOT NULL,
    "scheduledFor" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "PendingCloudinaryDeletion_scheduledFor_idx" ON "PendingCloudinaryDeletion"("scheduledFor");

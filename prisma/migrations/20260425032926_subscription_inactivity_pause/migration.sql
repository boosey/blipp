-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "pauseReason" TEXT,
ADD COLUMN     "pausedAt" TIMESTAMP(3),
ADD COLUMN     "resumeToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_resumeToken_key" ON "Subscription"("resumeToken");

-- CreateIndex
CREATE INDEX "Subscription_pausedAt_idx" ON "Subscription"("pausedAt");


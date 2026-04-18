-- CreateEnum
CREATE TYPE "BillingSource" AS ENUM ('STRIPE', 'APPLE');

-- CreateEnum
CREATE TYPE "BillingStatus" AS ENUM ('ACTIVE', 'CANCELLED_PENDING_EXPIRY', 'GRACE_PERIOD', 'EXPIRED', 'REFUNDED', 'PAUSED');

-- AlterTable
ALTER TABLE "Plan" ADD COLUMN     "appleProductIdAnnual" TEXT,
ADD COLUMN     "appleProductIdMonthly" TEXT;

-- CreateTable
CREATE TABLE "BillingSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "source" "BillingSource" NOT NULL,
    "externalId" TEXT NOT NULL,
    "productExternalId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "status" "BillingStatus" NOT NULL,
    "currentPeriodEnd" TIMESTAMP(3),
    "willRenew" BOOLEAN NOT NULL DEFAULT true,
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BillingSubscription_userId_status_idx" ON "BillingSubscription"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "BillingSubscription_source_externalId_key" ON "BillingSubscription"("source", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "Plan_appleProductIdMonthly_key" ON "Plan"("appleProductIdMonthly");

-- CreateIndex
CREATE UNIQUE INDEX "Plan_appleProductIdAnnual_key" ON "Plan"("appleProductIdAnnual");

-- AddForeignKey
ALTER TABLE "BillingSubscription" ADD CONSTRAINT "BillingSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingSubscription" ADD CONSTRAINT "BillingSubscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


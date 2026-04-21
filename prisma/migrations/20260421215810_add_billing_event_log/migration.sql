-- CreateTable
CREATE TABLE "BillingEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "source" "BillingSource" NOT NULL,
    "eventType" TEXT NOT NULL,
    "environment" TEXT,
    "externalId" TEXT,
    "productExternalId" TEXT,
    "status" TEXT NOT NULL,
    "skipReason" TEXT,
    "rawPayload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillingEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BillingEvent_userId_createdAt_idx" ON "BillingEvent"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "BillingEvent_source_createdAt_idx" ON "BillingEvent"("source", "createdAt");

-- AddForeignKey
ALTER TABLE "BillingEvent" ADD CONSTRAINT "BillingEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

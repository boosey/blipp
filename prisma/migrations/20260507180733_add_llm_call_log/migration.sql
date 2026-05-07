-- CreateEnum
CREATE TYPE "LlmCallStatus" AS ENUM ('SUCCESS', 'PARSE_ERROR', 'TIMEOUT', 'RATE_LIMITED', 'AUTH_ERROR', 'OTHER_ERROR');

-- CreateTable
CREATE TABLE "LlmCall" (
    "id" TEXT NOT NULL,
    "jobId" TEXT,
    "stepId" TEXT,
    "episodeId" TEXT,
    "stage" TEXT,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "status" "LlmCallStatus" NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheCreationTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheReadTokens" INTEGER NOT NULL DEFAULT 0,
    "cost" DOUBLE PRECISION,
    "durationMs" INTEGER,
    "errorCategory" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LlmCall_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LlmCall_createdAt_idx" ON "LlmCall"("createdAt");

-- CreateIndex
CREATE INDEX "LlmCall_stepId_idx" ON "LlmCall"("stepId");

-- CreateIndex
CREATE INDEX "LlmCall_provider_model_createdAt_idx" ON "LlmCall"("provider", "model", "createdAt");


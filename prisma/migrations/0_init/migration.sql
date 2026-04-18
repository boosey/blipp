-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "ContentStatus" AS ENUM ('PENDING', 'TRANSCRIPT_READY', 'AUDIO_READY', 'NOT_DELIVERABLE');

-- CreateEnum
CREATE TYPE "DistillationStatus" AS ENUM ('PENDING', 'FETCHING_TRANSCRIPT', 'TRANSCRIPT_READY', 'EXTRACTING_CLAIMS', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "ClipStatus" AS ENUM ('PENDING', 'GENERATING_NARRATIVE', 'GENERATING_AUDIO', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "FeedItemSource" AS ENUM ('SUBSCRIPTION', 'ON_DEMAND', 'SHARED', 'CATALOG');

-- CreateEnum
CREATE TYPE "FeedItemStatus" AS ENUM ('PENDING', 'PROCESSING', 'READY', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PipelineStage" AS ENUM ('TRANSCRIPTION', 'DISTILLATION', 'CLIP_GENERATION', 'NARRATIVE_GENERATION', 'AUDIO_GENERATION', 'BRIEFING_ASSEMBLY');

-- CreateEnum
CREATE TYPE "PipelineJobStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'COMPLETED_DEGRADED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PipelineStepStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED', 'FAILED');

-- CreateEnum
CREATE TYPE "PipelineEventLevel" AS ENUM ('DEBUG', 'INFO', 'WARN', 'ERROR');

-- CreateEnum
CREATE TYPE "BriefingRequestMode" AS ENUM ('USER', 'SEO_BACKFILL', 'CATALOG');

-- CreateEnum
CREATE TYPE "BriefingRequestStatus" AS ENUM ('PENDING', 'PROCESSING', 'CANCELLED', 'COMPLETED', 'COMPLETED_DEGRADED', 'FAILED');

-- CreateEnum
CREATE TYPE "WorkProductType" AS ENUM ('TRANSCRIPT', 'CLAIMS', 'NARRATIVE', 'AUDIO_CLIP', 'BRIEFING_AUDIO', 'SOURCE_AUDIO', 'DIGEST_NARRATIVE', 'DIGEST_CLIP', 'DIGEST_AUDIO');

-- CreateEnum
CREATE TYPE "SttExperimentStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ClaimsExperimentStatus" AS ENUM ('PENDING', 'RUNNING', 'JUDGING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AiStage" AS ENUM ('stt', 'distillation', 'narrative', 'tts', 'geoClassification');

-- CreateEnum
CREATE TYPE "CronRunStatus" AS ENUM ('IN_PROGRESS', 'SUCCESS', 'FAILED');

-- CreateEnum
CREATE TYPE "CronRunLogLevel" AS ENUM ('DEBUG', 'INFO', 'WARN', 'ERROR');

-- CreateEnum
CREATE TYPE "ListenOriginalEventType" AS ENUM ('listen_original_click', 'listen_original_start', 'listen_original_complete');

-- CreateEnum
CREATE TYPE "DeviceType" AS ENUM ('mobile', 'desktop', 'tablet');

-- CreateEnum
CREATE TYPE "AppPlatform" AS ENUM ('ios', 'android', 'web');

-- CreateEnum
CREATE TYPE "ReferralSource" AS ENUM ('feed', 'search', 'share', 'notification');

-- CreateEnum
CREATE TYPE "BillingSource" AS ENUM ('STRIPE', 'APPLE');

-- CreateEnum
CREATE TYPE "BillingStatus" AS ENUM ('ACTIVE', 'CANCELLED_PENDING_EXPIRY', 'GRACE_PERIOD', 'EXPIRED', 'REFUNDED', 'PAUSED');

-- CreateTable
CREATE TABLE "Plan" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "briefingsPerWeek" INTEGER,
    "maxDurationMinutes" INTEGER NOT NULL DEFAULT 5,
    "maxPodcastSubscriptions" INTEGER,
    "pastEpisodesLimit" INTEGER,
    "transcriptAccess" BOOLEAN NOT NULL DEFAULT false,
    "dailyDigest" BOOLEAN NOT NULL DEFAULT false,
    "concurrentPipelineJobs" INTEGER NOT NULL DEFAULT 1,
    "adFree" BOOLEAN NOT NULL DEFAULT false,
    "priorityProcessing" BOOLEAN NOT NULL DEFAULT false,
    "earlyAccess" BOOLEAN NOT NULL DEFAULT false,
    "offlineAccess" BOOLEAN NOT NULL DEFAULT false,
    "publicSharing" BOOLEAN NOT NULL DEFAULT false,
    "priceCentsMonthly" INTEGER NOT NULL DEFAULT 0,
    "stripePriceIdMonthly" TEXT,
    "priceCentsAnnual" INTEGER,
    "stripePriceIdAnnual" TEXT,
    "stripeProductId" TEXT,
    "trialDays" INTEGER NOT NULL DEFAULT 0,
    "appleProductIdMonthly" TEXT,
    "appleProductIdAnnual" TEXT,
    "allowedVoicePresetIds" TEXT[],
    "features" TEXT[],
    "highlighted" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "clerkId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "imageUrl" TEXT,
    "stripeCustomerId" TEXT,
    "subscriptionEndsAt" TIMESTAMP(3),
    "planId" TEXT NOT NULL,
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'active',
    "onboardingComplete" BOOLEAN NOT NULL DEFAULT false,
    "defaultDurationTier" INTEGER NOT NULL DEFAULT 5,
    "defaultVoicePresetId" TEXT,
    "acceptAnyVoice" BOOLEAN NOT NULL DEFAULT false,
    "preferredCategories" TEXT[],
    "excludedCategories" TEXT[],
    "preferredTopics" TEXT[],
    "excludedTopics" TEXT[],
    "zipCode" TEXT,
    "city" TEXT,
    "state" TEXT,
    "country" TEXT DEFAULT 'US',
    "profileCompletedAt" TIMESTAMP(3),
    "welcomeEmailSentAt" TIMESTAMP(3),
    "digestEnabled" BOOLEAN NOT NULL DEFAULT true,
    "digestIncludeSubscriptions" BOOLEAN NOT NULL DEFAULT true,
    "digestIncludeFavorites" BOOLEAN NOT NULL DEFAULT true,
    "digestIncludeRecommended" BOOLEAN NOT NULL DEFAULT true,
    "timezone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PodcastFavorite" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "podcastId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PodcastFavorite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PodcastVote" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "podcastId" TEXT NOT NULL,
    "vote" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PodcastVote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EpisodeVote" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "episodeId" TEXT NOT NULL,
    "vote" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EpisodeVote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Podcast" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "feedUrl" TEXT NOT NULL,
    "imageUrl" TEXT,
    "podcastIndexId" TEXT,
    "appleId" TEXT,
    "author" TEXT,
    "language" TEXT,
    "categories" TEXT[],
    "appleMetadata" JSONB,
    "lastFetchedAt" TIMESTAMP(3),
    "feedHealth" TEXT,
    "feedError" TEXT,
    "episodeCount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "deliverable" BOOLEAN NOT NULL DEFAULT true,
    "geoProcessedAt" TIMESTAMP(3),
    "appleRank" INTEGER,
    "piRank" INTEGER,
    "lastDetailViewedAt" TIMESTAMP(3),
    "source" TEXT,
    "slug" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Podcast_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Episode" (
    "id" TEXT NOT NULL,
    "podcastId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "audioUrl" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "durationSeconds" INTEGER,
    "guid" TEXT NOT NULL,
    "transcriptUrl" TEXT,
    "contentStatus" "ContentStatus" NOT NULL DEFAULT 'PENDING',
    "transcriptR2Key" TEXT,
    "audioR2Key" TEXT,
    "topicTags" TEXT[],
    "slug" TEXT,
    "publicPage" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Episode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Distillation" (
    "id" TEXT NOT NULL,
    "episodeId" TEXT NOT NULL,
    "status" "DistillationStatus" NOT NULL DEFAULT 'PENDING',
    "transcript" TEXT,
    "claimsJson" JSONB,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Distillation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Clip" (
    "id" TEXT NOT NULL,
    "episodeId" TEXT NOT NULL,
    "distillationId" TEXT NOT NULL,
    "durationTier" INTEGER NOT NULL,
    "status" "ClipStatus" NOT NULL DEFAULT 'PENDING',
    "narrativeText" TEXT,
    "wordCount" INTEGER,
    "audioKey" TEXT,
    "audioContentType" TEXT,
    "audioUrl" TEXT,
    "actualSeconds" INTEGER,
    "errorMessage" TEXT,
    "voiceDegraded" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "voicePresetId" TEXT,

    CONSTRAINT "Clip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Briefing" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clipId" TEXT NOT NULL,
    "adAudioUrl" TEXT,
    "adAudioKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Briefing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogBriefing" (
    "id" TEXT NOT NULL,
    "episodeId" TEXT NOT NULL,
    "podcastId" TEXT NOT NULL,
    "durationTier" INTEGER NOT NULL DEFAULT 5,
    "clipId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "stale" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CatalogBriefing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "podcastId" TEXT NOT NULL,
    "durationTier" INTEGER NOT NULL,
    "voicePresetId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "episodeId" TEXT NOT NULL,
    "podcastId" TEXT NOT NULL,
    "briefingId" TEXT,
    "durationTier" INTEGER NOT NULL,
    "source" "FeedItemSource" NOT NULL,
    "status" "FeedItemStatus" NOT NULL DEFAULT 'PENDING',
    "listened" BOOLEAN NOT NULL DEFAULT false,
    "listenedAt" TIMESTAMP(3),
    "playbackPositionSeconds" DOUBLE PRECISION,
    "requestId" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeedItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PipelineJob" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "episodeId" TEXT NOT NULL,
    "durationTier" INTEGER NOT NULL,
    "voicePresetId" TEXT,
    "status" "PipelineJobStatus" NOT NULL DEFAULT 'PENDING',
    "currentStage" "PipelineStage" NOT NULL DEFAULT 'TRANSCRIPTION',
    "distillationId" TEXT,
    "clipId" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "dismissedAt" TIMESTAMP(3),

    CONSTRAINT "PipelineJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PipelineStep" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "stage" "PipelineStage" NOT NULL,
    "status" "PipelineStepStatus" NOT NULL DEFAULT 'PENDING',
    "cached" BOOLEAN NOT NULL DEFAULT false,
    "input" JSONB,
    "output" JSONB,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "cost" DOUBLE PRECISION,
    "model" TEXT,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "cacheCreationTokens" INTEGER,
    "cacheReadTokens" INTEGER,
    "audioSeconds" DOUBLE PRECISION,
    "charCount" INTEGER,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "workProductId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PipelineStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BriefingRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "BriefingRequestStatus" NOT NULL DEFAULT 'PENDING',
    "targetMinutes" INTEGER NOT NULL,
    "items" JSONB NOT NULL,
    "isTest" BOOLEAN NOT NULL DEFAULT false,
    "mode" "BriefingRequestMode" NOT NULL DEFAULT 'USER',
    "errorMessage" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BriefingRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkProduct" (
    "id" TEXT NOT NULL,
    "type" "WorkProductType" NOT NULL,
    "episodeId" TEXT,
    "userId" TEXT,
    "durationTier" INTEGER,
    "voice" TEXT,
    "r2Key" TEXT NOT NULL,
    "sizeBytes" INTEGER,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PipelineEvent" (
    "id" TEXT NOT NULL,
    "stepId" TEXT NOT NULL,
    "level" "PipelineEventLevel" NOT NULL,
    "message" TEXT NOT NULL,
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PipelineEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiServiceError" (
    "id" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "correlationId" TEXT NOT NULL,
    "jobId" TEXT,
    "stepId" TEXT,
    "episodeId" TEXT,
    "category" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "httpStatus" INTEGER,
    "errorMessage" TEXT NOT NULL,
    "rawResponse" TEXT,
    "requestDurationMs" INTEGER NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "maxRetries" INTEGER NOT NULL DEFAULT 0,
    "willRetry" BOOLEAN NOT NULL DEFAULT false,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "rateLimitRemaining" INTEGER,
    "rateLimitResetAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiServiceError_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorEmail" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "scopes" TEXT[],
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SttExperiment" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "SttExperimentStatus" NOT NULL DEFAULT 'PENDING',
    "config" JSONB NOT NULL,
    "totalTasks" INTEGER NOT NULL DEFAULT 0,
    "doneTasks" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "SttExperiment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SttBenchmarkResult" (
    "id" TEXT NOT NULL,
    "experimentId" TEXT NOT NULL,
    "episodeId" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "provider" TEXT,
    "speed" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "costDollars" DOUBLE PRECISION,
    "latencyMs" INTEGER,
    "wer" DOUBLE PRECISION,
    "wordCount" INTEGER,
    "refWordCount" INTEGER,
    "r2AudioKey" TEXT,
    "r2TranscriptKey" TEXT,
    "r2RefTranscriptKey" TEXT,
    "pollingId" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "SttBenchmarkResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClaimsExperiment" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "ClaimsExperimentStatus" NOT NULL DEFAULT 'PENDING',
    "baselineModelId" TEXT NOT NULL,
    "baselineProvider" TEXT NOT NULL,
    "judgeModelId" TEXT NOT NULL,
    "judgeProvider" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "totalTasks" INTEGER NOT NULL DEFAULT 0,
    "doneTasks" INTEGER NOT NULL DEFAULT 0,
    "totalJudgeTasks" INTEGER NOT NULL DEFAULT 0,
    "doneJudgeTasks" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ClaimsExperiment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClaimsBenchmarkResult" (
    "id" TEXT NOT NULL,
    "experimentId" TEXT NOT NULL,
    "episodeId" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "isBaseline" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "claimCount" INTEGER,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "costDollars" DOUBLE PRECISION,
    "latencyMs" INTEGER,
    "coverageScore" DOUBLE PRECISION,
    "weightedCoverageScore" DOUBLE PRECISION,
    "hallucinations" INTEGER,
    "judgeStatus" TEXT,
    "r2ClaimsKey" TEXT,
    "r2JudgeKey" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ClaimsBenchmarkResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PodcastRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "feedUrl" TEXT NOT NULL,
    "title" TEXT,
    "imageUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "podcastId" TEXT,
    "adminNote" TEXT,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PodcastRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformConfig" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "description" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "PlatformConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromptVersion" (
    "id" TEXT NOT NULL,
    "stage" TEXT NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL,
    "label" TEXT,
    "values" JSONB NOT NULL DEFAULT '{}',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "PromptVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VoicePreset" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "config" JSONB NOT NULL,
    "voiceCharacteristics" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VoicePreset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiModel" (
    "id" TEXT NOT NULL,
    "stages" "AiStage"[],
    "modelId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "developer" TEXT NOT NULL,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiModel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiModelProvider" (
    "id" TEXT NOT NULL,
    "aiModelId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerModelId" TEXT,
    "providerLabel" TEXT NOT NULL,
    "pricePerMinute" DOUBLE PRECISION,
    "priceInputPerMToken" DOUBLE PRECISION,
    "priceOutputPerMToken" DOUBLE PRECISION,
    "pricePerKChars" DOUBLE PRECISION,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "limits" JSONB,
    "priceUpdatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiModelProvider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "appleGenreId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PodcastCategory" (
    "podcastId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,

    CONSTRAINT "PodcastCategory_pkey" PRIMARY KEY ("podcastId","categoryId")
);

-- CreateTable
CREATE TABLE "PodcastProfile" (
    "id" TEXT NOT NULL,
    "podcastId" TEXT NOT NULL,
    "categoryWeights" JSONB NOT NULL,
    "topicTags" TEXT[],
    "popularity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "freshness" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "subscriberCount" INTEGER NOT NULL DEFAULT 0,
    "embedding" JSONB,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PodcastProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRecommendationProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "categoryWeights" JSONB NOT NULL,
    "topicTags" TEXT[],
    "listenCount" INTEGER NOT NULL DEFAULT 0,
    "embedding" JSONB,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserRecommendationProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecommendationCache" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "podcasts" JSONB NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecommendationCache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecommendationDismissal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "podcastId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecommendationDismissal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CronJob" (
    "id" TEXT NOT NULL,
    "jobKey" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "intervalMinutes" INTEGER NOT NULL,
    "defaultIntervalMinutes" INTEGER NOT NULL,
    "runAtHour" INTEGER,
    "lastRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CronJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CronRun" (
    "id" TEXT NOT NULL,
    "jobKey" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "status" "CronRunStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "result" JSONB,
    "errorMessage" TEXT,

    CONSTRAINT "CronRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CronRunLog" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "level" "CronRunLogLevel" NOT NULL,
    "message" TEXT NOT NULL,
    "data" JSONB,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CronRunLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogSeedJob" (
    "id" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'additive',
    "source" TEXT NOT NULL DEFAULT 'apple',
    "trigger" TEXT NOT NULL DEFAULT 'admin',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "podcastsDiscovered" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "archivedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "CatalogSeedJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogJobError" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "phase" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "podcastId" TEXT,
    "episodeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CatalogJobError_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EpisodeRefreshJob" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'subscribed',
    "trigger" TEXT NOT NULL DEFAULT 'admin',
    "catalogSeedJobId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "podcastsTotal" INTEGER NOT NULL DEFAULT 0,
    "podcastsCompleted" INTEGER NOT NULL DEFAULT 0,
    "podcastsWithNewEpisodes" INTEGER NOT NULL DEFAULT 0,
    "episodesDiscovered" INTEGER NOT NULL DEFAULT 0,
    "prefetchTotal" INTEGER NOT NULL DEFAULT 0,
    "prefetchCompleted" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "archivedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "EpisodeRefreshJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EpisodeRefreshError" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "phase" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "podcastId" TEXT,
    "episodeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EpisodeRefreshError_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Feedback" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BlippFeedback" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "episodeId" TEXT NOT NULL,
    "briefingId" TEXT,
    "reasons" TEXT[],
    "message" TEXT,
    "isTechnicalFailure" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BlippFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ListenOriginalEvent" (
    "id" TEXT NOT NULL,
    "eventType" "ListenOriginalEventType" NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "deviceType" "DeviceType" NOT NULL,
    "platform" "AppPlatform" NOT NULL,
    "blippId" TEXT NOT NULL,
    "blippDurationMs" INTEGER NOT NULL,
    "episodeId" TEXT NOT NULL,
    "podcastId" TEXT NOT NULL,
    "publisherId" TEXT NOT NULL,
    "referralSource" "ReferralSource" NOT NULL,
    "timeToClickSec" DOUBLE PRECISION NOT NULL,
    "blippCompletionPct" DOUBLE PRECISION NOT NULL,
    "didReturnToBlipp" BOOLEAN NOT NULL DEFAULT false,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "reportBatchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ListenOriginalEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublisherReportBatch" (
    "id" TEXT NOT NULL,
    "publisherId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "totalClicks" INTEGER NOT NULL,
    "totalStarts" INTEGER NOT NULL,
    "totalCompletes" INTEGER NOT NULL,
    "uniqueUsers" INTEGER NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PublisherReportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SportsLeague" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sport" TEXT NOT NULL,
    "country" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SportsLeague_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SportsDivision" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "parentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SportsDivision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SportsTeam" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "nickname" TEXT NOT NULL,
    "abbreviation" TEXT NOT NULL,
    "keywords" TEXT[],
    "leagueId" TEXT NOT NULL,
    "divisionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SportsTeam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SportsTeamMarket" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,

    CONSTRAINT "SportsTeamMarket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserSportsTeam" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserSportsTeam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PodcastGeoProfile" (
    "id" TEXT NOT NULL,
    "podcastId" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'US',
    "scope" TEXT NOT NULL,
    "teamId" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PodcastGeoProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DigestDelivery" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "totalEpisodes" INTEGER NOT NULL DEFAULT 0,
    "completedEpisodes" INTEGER NOT NULL DEFAULT 0,
    "audioKey" TEXT,
    "actualSeconds" INTEGER,
    "episodeCount" INTEGER NOT NULL DEFAULT 0,
    "sources" JSONB NOT NULL DEFAULT '[]',
    "listened" BOOLEAN NOT NULL DEFAULT false,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DigestDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DigestDeliveryEpisode" (
    "id" TEXT NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "episodeId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "entryStage" TEXT,
    "actualSeconds" INTEGER,

    CONSTRAINT "DigestDeliveryEpisode_pkey" PRIMARY KEY ("id")
);

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

-- CreateTable
CREATE TABLE "ServiceKey" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "envKey" TEXT NOT NULL,
    "encryptedValue" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "maskedPreview" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "lastValidated" TIMESTAMP(3),
    "lastValidatedOk" BOOLEAN,
    "lastRotated" TIMESTAMP(3),
    "rotateAfterDays" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Plan_slug_key" ON "Plan"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Plan_stripePriceIdMonthly_key" ON "Plan"("stripePriceIdMonthly");

-- CreateIndex
CREATE UNIQUE INDEX "Plan_stripePriceIdAnnual_key" ON "Plan"("stripePriceIdAnnual");

-- CreateIndex
CREATE UNIQUE INDEX "Plan_stripeProductId_key" ON "Plan"("stripeProductId");

-- CreateIndex
CREATE UNIQUE INDEX "Plan_appleProductIdMonthly_key" ON "Plan"("appleProductIdMonthly");

-- CreateIndex
CREATE UNIQUE INDEX "Plan_appleProductIdAnnual_key" ON "Plan"("appleProductIdAnnual");

-- CreateIndex
CREATE UNIQUE INDEX "User_clerkId_key" ON "User"("clerkId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_stripeCustomerId_key" ON "User"("stripeCustomerId");

-- CreateIndex
CREATE INDEX "PodcastFavorite_userId_idx" ON "PodcastFavorite"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PodcastFavorite_userId_podcastId_key" ON "PodcastFavorite"("userId", "podcastId");

-- CreateIndex
CREATE INDEX "PodcastVote_podcastId_idx" ON "PodcastVote"("podcastId");

-- CreateIndex
CREATE UNIQUE INDEX "PodcastVote_userId_podcastId_key" ON "PodcastVote"("userId", "podcastId");

-- CreateIndex
CREATE INDEX "EpisodeVote_episodeId_idx" ON "EpisodeVote"("episodeId");

-- CreateIndex
CREATE UNIQUE INDEX "EpisodeVote_userId_episodeId_key" ON "EpisodeVote"("userId", "episodeId");

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "PushSubscription_userId_idx" ON "PushSubscription"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Podcast_feedUrl_key" ON "Podcast"("feedUrl");

-- CreateIndex
CREATE UNIQUE INDEX "Podcast_podcastIndexId_key" ON "Podcast"("podcastIndexId");

-- CreateIndex
CREATE UNIQUE INDEX "Podcast_appleId_key" ON "Podcast"("appleId");

-- CreateIndex
CREATE UNIQUE INDEX "Podcast_slug_key" ON "Podcast"("slug");

-- CreateIndex
CREATE INDEX "Episode_podcastId_publishedAt_idx" ON "Episode"("podcastId", "publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Episode_podcastId_guid_key" ON "Episode"("podcastId", "guid");

-- CreateIndex
CREATE UNIQUE INDEX "Episode_podcastId_slug_key" ON "Episode"("podcastId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "Distillation_episodeId_key" ON "Distillation"("episodeId");

-- CreateIndex
CREATE UNIQUE INDEX "Clip_episodeId_durationTier_voicePresetId_key" ON "Clip"("episodeId", "durationTier", "voicePresetId");

-- CreateIndex
CREATE UNIQUE INDEX "Briefing_userId_clipId_key" ON "Briefing"("userId", "clipId");

-- CreateIndex
CREATE INDEX "CatalogBriefing_podcastId_stale_createdAt_idx" ON "CatalogBriefing"("podcastId", "stale", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogBriefing_episodeId_durationTier_key" ON "CatalogBriefing"("episodeId", "durationTier");

-- CreateIndex
CREATE INDEX "Subscription_userId_idx" ON "Subscription"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_userId_podcastId_key" ON "Subscription"("userId", "podcastId");

-- CreateIndex
CREATE INDEX "FeedItem_userId_status_createdAt_idx" ON "FeedItem"("userId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "FeedItem_userId_listened_createdAt_idx" ON "FeedItem"("userId", "listened", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "FeedItem_userId_episodeId_durationTier_key" ON "FeedItem"("userId", "episodeId", "durationTier");

-- CreateIndex
CREATE INDEX "PipelineJob_requestId_status_idx" ON "PipelineJob"("requestId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "WorkProduct_r2Key_key" ON "WorkProduct"("r2Key");

-- CreateIndex
CREATE INDEX "PipelineEvent_stepId_createdAt_idx" ON "PipelineEvent"("stepId", "createdAt");

-- CreateIndex
CREATE INDEX "AiServiceError_service_provider_createdAt_idx" ON "AiServiceError"("service", "provider", "createdAt");

-- CreateIndex
CREATE INDEX "AiServiceError_correlationId_idx" ON "AiServiceError"("correlationId");

-- CreateIndex
CREATE INDEX "AiServiceError_category_createdAt_idx" ON "AiServiceError"("category", "createdAt");

-- CreateIndex
CREATE INDEX "AiServiceError_episodeId_idx" ON "AiServiceError"("episodeId");

-- CreateIndex
CREATE INDEX "AiServiceError_resolved_createdAt_idx" ON "AiServiceError"("resolved", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_idx" ON "AuditLog"("actorId");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_keyHash_key" ON "ApiKey"("keyHash");

-- CreateIndex
CREATE INDEX "SttBenchmarkResult_experimentId_idx" ON "SttBenchmarkResult"("experimentId");

-- CreateIndex
CREATE UNIQUE INDEX "SttBenchmarkResult_experimentId_episodeId_model_provider_sp_key" ON "SttBenchmarkResult"("experimentId", "episodeId", "model", "provider", "speed");

-- CreateIndex
CREATE INDEX "ClaimsBenchmarkResult_experimentId_idx" ON "ClaimsBenchmarkResult"("experimentId");

-- CreateIndex
CREATE UNIQUE INDEX "ClaimsBenchmarkResult_experimentId_episodeId_model_provider_key" ON "ClaimsBenchmarkResult"("experimentId", "episodeId", "model", "provider");

-- CreateIndex
CREATE INDEX "PodcastRequest_status_idx" ON "PodcastRequest"("status");

-- CreateIndex
CREATE UNIQUE INDEX "PodcastRequest_userId_feedUrl_key" ON "PodcastRequest"("userId", "feedUrl");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformConfig_key_key" ON "PlatformConfig"("key");

-- CreateIndex
CREATE INDEX "PromptVersion_stage_idx" ON "PromptVersion"("stage");

-- CreateIndex
CREATE UNIQUE INDEX "PromptVersion_stage_version_key" ON "PromptVersion"("stage", "version");

-- CreateIndex
CREATE UNIQUE INDEX "VoicePreset_name_key" ON "VoicePreset"("name");

-- CreateIndex
CREATE UNIQUE INDEX "AiModel_modelId_key" ON "AiModel"("modelId");

-- CreateIndex
CREATE INDEX "AiModelProvider_aiModelId_idx" ON "AiModelProvider"("aiModelId");

-- CreateIndex
CREATE UNIQUE INDEX "AiModelProvider_aiModelId_provider_key" ON "AiModelProvider"("aiModelId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "Category_appleGenreId_key" ON "Category"("appleGenreId");

-- CreateIndex
CREATE UNIQUE INDEX "Category_slug_key" ON "Category"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "PodcastProfile_podcastId_key" ON "PodcastProfile"("podcastId");

-- CreateIndex
CREATE INDEX "PodcastProfile_computedAt_idx" ON "PodcastProfile"("computedAt");

-- CreateIndex
CREATE UNIQUE INDEX "UserRecommendationProfile_userId_key" ON "UserRecommendationProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "RecommendationCache_userId_key" ON "RecommendationCache"("userId");

-- CreateIndex
CREATE INDEX "RecommendationDismissal_userId_idx" ON "RecommendationDismissal"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "RecommendationDismissal_userId_podcastId_key" ON "RecommendationDismissal"("userId", "podcastId");

-- CreateIndex
CREATE UNIQUE INDEX "CronJob_jobKey_key" ON "CronJob"("jobKey");

-- CreateIndex
CREATE INDEX "CronRun_jobKey_startedAt_idx" ON "CronRun"("jobKey", "startedAt" DESC);

-- CreateIndex
CREATE INDEX "CronRunLog_runId_timestamp_idx" ON "CronRunLog"("runId", "timestamp");

-- CreateIndex
CREATE INDEX "CatalogSeedJob_status_idx" ON "CatalogSeedJob"("status");

-- CreateIndex
CREATE INDEX "CatalogSeedJob_startedAt_idx" ON "CatalogSeedJob"("startedAt");

-- CreateIndex
CREATE INDEX "CatalogSeedJob_archivedAt_idx" ON "CatalogSeedJob"("archivedAt");

-- CreateIndex
CREATE INDEX "CatalogJobError_jobId_idx" ON "CatalogJobError"("jobId");

-- CreateIndex
CREATE INDEX "CatalogJobError_jobId_phase_idx" ON "CatalogJobError"("jobId", "phase");

-- CreateIndex
CREATE INDEX "EpisodeRefreshJob_status_idx" ON "EpisodeRefreshJob"("status");

-- CreateIndex
CREATE INDEX "EpisodeRefreshJob_archivedAt_idx" ON "EpisodeRefreshJob"("archivedAt");

-- CreateIndex
CREATE INDEX "EpisodeRefreshError_jobId_idx" ON "EpisodeRefreshError"("jobId");

-- CreateIndex
CREATE INDEX "EpisodeRefreshError_jobId_phase_idx" ON "EpisodeRefreshError"("jobId", "phase");

-- CreateIndex
CREATE INDEX "Feedback_userId_idx" ON "Feedback"("userId");

-- CreateIndex
CREATE INDEX "Feedback_createdAt_idx" ON "Feedback"("createdAt");

-- CreateIndex
CREATE INDEX "BlippFeedback_userId_idx" ON "BlippFeedback"("userId");

-- CreateIndex
CREATE INDEX "BlippFeedback_episodeId_idx" ON "BlippFeedback"("episodeId");

-- CreateIndex
CREATE INDEX "BlippFeedback_createdAt_idx" ON "BlippFeedback"("createdAt");

-- CreateIndex
CREATE INDEX "BlippFeedback_isTechnicalFailure_createdAt_idx" ON "BlippFeedback"("isTechnicalFailure", "createdAt");

-- CreateIndex
CREATE INDEX "ListenOriginalEvent_publisherId_timestamp_idx" ON "ListenOriginalEvent"("publisherId", "timestamp");

-- CreateIndex
CREATE INDEX "ListenOriginalEvent_userId_timestamp_idx" ON "ListenOriginalEvent"("userId", "timestamp");

-- CreateIndex
CREATE INDEX "ListenOriginalEvent_blippId_eventType_idx" ON "ListenOriginalEvent"("blippId", "eventType");

-- CreateIndex
CREATE INDEX "ListenOriginalEvent_episodeId_timestamp_idx" ON "ListenOriginalEvent"("episodeId", "timestamp");

-- CreateIndex
CREATE INDEX "ListenOriginalEvent_reportBatchId_idx" ON "ListenOriginalEvent"("reportBatchId");

-- CreateIndex
CREATE INDEX "PublisherReportBatch_publisherId_periodStart_idx" ON "PublisherReportBatch"("publisherId", "periodStart");

-- CreateIndex
CREATE UNIQUE INDEX "SportsLeague_name_key" ON "SportsLeague"("name");

-- CreateIndex
CREATE UNIQUE INDEX "SportsDivision_leagueId_name_key" ON "SportsDivision"("leagueId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "SportsTeam_leagueId_abbreviation_key" ON "SportsTeam"("leagueId", "abbreviation");

-- CreateIndex
CREATE INDEX "SportsTeamMarket_city_state_idx" ON "SportsTeamMarket"("city", "state");

-- CreateIndex
CREATE UNIQUE INDEX "SportsTeamMarket_teamId_city_state_key" ON "SportsTeamMarket"("teamId", "city", "state");

-- CreateIndex
CREATE INDEX "UserSportsTeam_userId_idx" ON "UserSportsTeam"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserSportsTeam_userId_teamId_key" ON "UserSportsTeam"("userId", "teamId");

-- CreateIndex
CREATE INDEX "PodcastGeoProfile_city_state_idx" ON "PodcastGeoProfile"("city", "state");

-- CreateIndex
CREATE INDEX "PodcastGeoProfile_podcastId_idx" ON "PodcastGeoProfile"("podcastId");

-- CreateIndex
CREATE UNIQUE INDEX "PodcastGeoProfile_podcastId_city_state_key" ON "PodcastGeoProfile"("podcastId", "city", "state");

-- CreateIndex
CREATE INDEX "DigestDelivery_userId_idx" ON "DigestDelivery"("userId");

-- CreateIndex
CREATE INDEX "DigestDelivery_status_idx" ON "DigestDelivery"("status");

-- CreateIndex
CREATE UNIQUE INDEX "DigestDelivery_userId_date_key" ON "DigestDelivery"("userId", "date");

-- CreateIndex
CREATE INDEX "DigestDeliveryEpisode_deliveryId_idx" ON "DigestDeliveryEpisode"("deliveryId");

-- CreateIndex
CREATE INDEX "DigestDeliveryEpisode_episodeId_status_idx" ON "DigestDeliveryEpisode"("episodeId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "DigestDeliveryEpisode_deliveryId_episodeId_key" ON "DigestDeliveryEpisode"("deliveryId", "episodeId");

-- CreateIndex
CREATE INDEX "BillingSubscription_userId_status_idx" ON "BillingSubscription"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "BillingSubscription_source_externalId_key" ON "BillingSubscription"("source", "externalId");

-- CreateIndex
CREATE INDEX "ServiceKey_provider_idx" ON "ServiceKey"("provider");

-- CreateIndex
CREATE INDEX "ServiceKey_envKey_isPrimary_idx" ON "ServiceKey"("envKey", "isPrimary");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_defaultVoicePresetId_fkey" FOREIGN KEY ("defaultVoicePresetId") REFERENCES "VoicePreset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PodcastFavorite" ADD CONSTRAINT "PodcastFavorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PodcastFavorite" ADD CONSTRAINT "PodcastFavorite_podcastId_fkey" FOREIGN KEY ("podcastId") REFERENCES "Podcast"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PodcastVote" ADD CONSTRAINT "PodcastVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PodcastVote" ADD CONSTRAINT "PodcastVote_podcastId_fkey" FOREIGN KEY ("podcastId") REFERENCES "Podcast"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EpisodeVote" ADD CONSTRAINT "EpisodeVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EpisodeVote" ADD CONSTRAINT "EpisodeVote_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "Episode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Episode" ADD CONSTRAINT "Episode_podcastId_fkey" FOREIGN KEY ("podcastId") REFERENCES "Podcast"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Distillation" ADD CONSTRAINT "Distillation_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "Episode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Clip" ADD CONSTRAINT "Clip_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "Episode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Clip" ADD CONSTRAINT "Clip_distillationId_fkey" FOREIGN KEY ("distillationId") REFERENCES "Distillation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Clip" ADD CONSTRAINT "Clip_voicePresetId_fkey" FOREIGN KEY ("voicePresetId") REFERENCES "VoicePreset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Briefing" ADD CONSTRAINT "Briefing_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Briefing" ADD CONSTRAINT "Briefing_clipId_fkey" FOREIGN KEY ("clipId") REFERENCES "Clip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogBriefing" ADD CONSTRAINT "CatalogBriefing_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "Episode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogBriefing" ADD CONSTRAINT "CatalogBriefing_podcastId_fkey" FOREIGN KEY ("podcastId") REFERENCES "Podcast"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogBriefing" ADD CONSTRAINT "CatalogBriefing_clipId_fkey" FOREIGN KEY ("clipId") REFERENCES "Clip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogBriefing" ADD CONSTRAINT "CatalogBriefing_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "BriefingRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_podcastId_fkey" FOREIGN KEY ("podcastId") REFERENCES "Podcast"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_voicePresetId_fkey" FOREIGN KEY ("voicePresetId") REFERENCES "VoicePreset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedItem" ADD CONSTRAINT "FeedItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedItem" ADD CONSTRAINT "FeedItem_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "Episode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedItem" ADD CONSTRAINT "FeedItem_podcastId_fkey" FOREIGN KEY ("podcastId") REFERENCES "Podcast"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedItem" ADD CONSTRAINT "FeedItem_briefingId_fkey" FOREIGN KEY ("briefingId") REFERENCES "Briefing"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedItem" ADD CONSTRAINT "FeedItem_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "BriefingRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PipelineJob" ADD CONSTRAINT "PipelineJob_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "BriefingRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PipelineJob" ADD CONSTRAINT "PipelineJob_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "Episode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PipelineJob" ADD CONSTRAINT "PipelineJob_voicePresetId_fkey" FOREIGN KEY ("voicePresetId") REFERENCES "VoicePreset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PipelineStep" ADD CONSTRAINT "PipelineStep_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "PipelineJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PipelineStep" ADD CONSTRAINT "PipelineStep_workProductId_fkey" FOREIGN KEY ("workProductId") REFERENCES "WorkProduct"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BriefingRequest" ADD CONSTRAINT "BriefingRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkProduct" ADD CONSTRAINT "WorkProduct_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "Episode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PipelineEvent" ADD CONSTRAINT "PipelineEvent_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "PipelineStep"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SttBenchmarkResult" ADD CONSTRAINT "SttBenchmarkResult_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "SttExperiment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SttBenchmarkResult" ADD CONSTRAINT "SttBenchmarkResult_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "Episode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClaimsBenchmarkResult" ADD CONSTRAINT "ClaimsBenchmarkResult_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "ClaimsExperiment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClaimsBenchmarkResult" ADD CONSTRAINT "ClaimsBenchmarkResult_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "Episode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PodcastRequest" ADD CONSTRAINT "PodcastRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PodcastRequest" ADD CONSTRAINT "PodcastRequest_podcastId_fkey" FOREIGN KEY ("podcastId") REFERENCES "Podcast"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiModelProvider" ADD CONSTRAINT "AiModelProvider_aiModelId_fkey" FOREIGN KEY ("aiModelId") REFERENCES "AiModel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PodcastCategory" ADD CONSTRAINT "PodcastCategory_podcastId_fkey" FOREIGN KEY ("podcastId") REFERENCES "Podcast"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PodcastCategory" ADD CONSTRAINT "PodcastCategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PodcastProfile" ADD CONSTRAINT "PodcastProfile_podcastId_fkey" FOREIGN KEY ("podcastId") REFERENCES "Podcast"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRecommendationProfile" ADD CONSTRAINT "UserRecommendationProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecommendationCache" ADD CONSTRAINT "RecommendationCache_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecommendationDismissal" ADD CONSTRAINT "RecommendationDismissal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecommendationDismissal" ADD CONSTRAINT "RecommendationDismissal_podcastId_fkey" FOREIGN KEY ("podcastId") REFERENCES "Podcast"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CronRun" ADD CONSTRAINT "CronRun_jobKey_fkey" FOREIGN KEY ("jobKey") REFERENCES "CronJob"("jobKey") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CronRunLog" ADD CONSTRAINT "CronRunLog_runId_fkey" FOREIGN KEY ("runId") REFERENCES "CronRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogJobError" ADD CONSTRAINT "CatalogJobError_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "CatalogSeedJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EpisodeRefreshError" ADD CONSTRAINT "EpisodeRefreshError_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "EpisodeRefreshJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlippFeedback" ADD CONSTRAINT "BlippFeedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlippFeedback" ADD CONSTRAINT "BlippFeedback_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "Episode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListenOriginalEvent" ADD CONSTRAINT "ListenOriginalEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListenOriginalEvent" ADD CONSTRAINT "ListenOriginalEvent_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "Episode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SportsDivision" ADD CONSTRAINT "SportsDivision_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "SportsLeague"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SportsDivision" ADD CONSTRAINT "SportsDivision_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "SportsDivision"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SportsTeam" ADD CONSTRAINT "SportsTeam_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "SportsLeague"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SportsTeam" ADD CONSTRAINT "SportsTeam_divisionId_fkey" FOREIGN KEY ("divisionId") REFERENCES "SportsDivision"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SportsTeamMarket" ADD CONSTRAINT "SportsTeamMarket_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "SportsTeam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSportsTeam" ADD CONSTRAINT "UserSportsTeam_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSportsTeam" ADD CONSTRAINT "UserSportsTeam_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "SportsTeam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PodcastGeoProfile" ADD CONSTRAINT "PodcastGeoProfile_podcastId_fkey" FOREIGN KEY ("podcastId") REFERENCES "Podcast"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PodcastGeoProfile" ADD CONSTRAINT "PodcastGeoProfile_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "SportsTeam"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DigestDelivery" ADD CONSTRAINT "DigestDelivery_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DigestDeliveryEpisode" ADD CONSTRAINT "DigestDeliveryEpisode_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "DigestDelivery"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DigestDeliveryEpisode" ADD CONSTRAINT "DigestDeliveryEpisode_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "Episode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingSubscription" ADD CONSTRAINT "BillingSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingSubscription" ADD CONSTRAINT "BillingSubscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


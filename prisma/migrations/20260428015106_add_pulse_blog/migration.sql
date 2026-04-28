-- CreateEnum
CREATE TYPE "PulseEditorStatus" AS ENUM ('NOT_READY', 'READY', 'RETIRED');

-- CreateEnum
CREATE TYPE "PulsePostStatus" AS ENUM ('DRAFT', 'REVIEW', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "PulsePostMode" AS ENUM ('HUMAN', 'AI_ASSISTED');

-- AlterTable
ALTER TABLE "Distillation" ADD COLUMN     "claimsEmbedding" JSONB;

-- CreateTable
CREATE TABLE "PulseEditor" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "bio" TEXT,
    "avatarUrl" TEXT,
    "twitterHandle" TEXT,
    "linkedinUrl" TEXT,
    "websiteUrl" TEXT,
    "expertiseAreas" TEXT[],
    "status" "PulseEditorStatus" NOT NULL DEFAULT 'NOT_READY',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PulseEditor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PulsePost" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "body" TEXT NOT NULL,
    "sourcesMarkdown" TEXT,
    "status" "PulsePostStatus" NOT NULL DEFAULT 'DRAFT',
    "mode" "PulsePostMode" NOT NULL DEFAULT 'AI_ASSISTED',
    "editorId" TEXT NOT NULL,
    "heroImageUrl" TEXT,
    "topicTags" TEXT[],
    "wordCount" INTEGER,
    "quotedWordCount" INTEGER,
    "ratioCheckPassed" BOOLEAN NOT NULL DEFAULT false,
    "generationMeta" JSONB,
    "seoTitle" TEXT,
    "seoDescription" TEXT,
    "scheduledAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "editorReviewedAt" TIMESTAMP(3),
    "editorRejectedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PulsePost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EpisodePulsePost" (
    "episodeId" TEXT NOT NULL,
    "pulsePostId" TEXT NOT NULL,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EpisodePulsePost_pkey" PRIMARY KEY ("episodeId","pulsePostId")
);

-- CreateIndex
CREATE UNIQUE INDEX "PulseEditor_slug_key" ON "PulseEditor"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "PulsePost_slug_key" ON "PulsePost"("slug");

-- CreateIndex
CREATE INDEX "PulsePost_status_publishedAt_idx" ON "PulsePost"("status", "publishedAt");

-- CreateIndex
CREATE INDEX "PulsePost_editorId_publishedAt_idx" ON "PulsePost"("editorId", "publishedAt");

-- CreateIndex
CREATE INDEX "EpisodePulsePost_pulsePostId_displayOrder_idx" ON "EpisodePulsePost"("pulsePostId", "displayOrder");

-- AddForeignKey
ALTER TABLE "PulsePost" ADD CONSTRAINT "PulsePost_editorId_fkey" FOREIGN KEY ("editorId") REFERENCES "PulseEditor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EpisodePulsePost" ADD CONSTRAINT "EpisodePulsePost_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "Episode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EpisodePulsePost" ADD CONSTRAINT "EpisodePulsePost_pulsePostId_fkey" FOREIGN KEY ("pulsePostId") REFERENCES "PulsePost"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- AlterTable: add invalidation metadata for podcasts flagged as music / non-podcast feeds.
ALTER TABLE "Podcast"
  ADD COLUMN "invalidationReason" TEXT,
  ADD COLUMN "invalidatedAt" TIMESTAMP(3);

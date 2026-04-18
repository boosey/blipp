-- CreateEnum
CREATE TYPE "BriefingRequestSource" AS ENUM (
  'ON_DEMAND',
  'SUBSCRIPTION',
  'SHARE',
  'STARTER_PACK',
  'CATALOG_PREGEN_FEED_REFRESH',
  'CATALOG_PREGEN_CRON',
  'CATALOG_PREGEN_ADMIN',
  'SEO_BACKFILL',
  'ADMIN_TEST'
);

-- AlterTable — add with default so existing rows get a value
ALTER TABLE "BriefingRequest"
  ADD COLUMN "source" "BriefingRequestSource" NOT NULL DEFAULT 'ON_DEMAND';

-- Backfill by mode/isTest — these are unambiguous
UPDATE "BriefingRequest" SET "source" = 'SEO_BACKFILL' WHERE "mode" = 'SEO_BACKFILL';
UPDATE "BriefingRequest" SET "source" = 'CATALOG_PREGEN_CRON' WHERE "mode" = 'CATALOG';
UPDATE "BriefingRequest" SET "source" = 'ADMIN_TEST' WHERE "isTest" = TRUE;

-- Backfill USER-mode requests from their FeedItem source (best available signal)
UPDATE "BriefingRequest" br
SET "source" = CASE fi."source"
  WHEN 'SUBSCRIPTION' THEN 'SUBSCRIPTION'::"BriefingRequestSource"
  WHEN 'ON_DEMAND'    THEN 'ON_DEMAND'::"BriefingRequestSource"
  WHEN 'SHARED'       THEN 'SHARE'::"BriefingRequestSource"
  WHEN 'CATALOG'      THEN 'STARTER_PACK'::"BriefingRequestSource"
END
FROM "FeedItem" fi
WHERE fi."requestId" = br."id"
  AND br."mode" = 'USER'
  AND br."isTest" = FALSE
  AND fi."source" IN ('SUBSCRIPTION', 'ON_DEMAND', 'SHARED', 'CATALOG');

-- CreateIndex
CREATE INDEX "BriefingRequest_source_idx" ON "BriefingRequest"("source");

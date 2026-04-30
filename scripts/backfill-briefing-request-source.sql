-- Backfill BriefingRequest.source for subscription-driven requests.
--
-- Why: feed-refresh.ts created BriefingRequests without setting `source`,
-- so they fell back to the schema default ON_DEMAND. The linked FeedItems
-- correctly carry `source = 'SUBSCRIPTION'`, so we use that as the truth
-- signal to backfill the parent BriefingRequest.
--
-- Run on staging first, then production. Wrap in a transaction; review the
-- preview count before COMMIT.

BEGIN;

-- 1. Preview: how many requests will be updated?
SELECT COUNT(*) AS rows_to_update
FROM "BriefingRequest" br
WHERE br.source = 'ON_DEMAND'
  AND EXISTS (
    SELECT 1 FROM "FeedItem" fi
    WHERE fi."requestId" = br.id
      AND fi.source = 'SUBSCRIPTION'
  );

-- 2. Apply.
UPDATE "BriefingRequest" br
SET source = 'SUBSCRIPTION'
WHERE br.source = 'ON_DEMAND'
  AND EXISTS (
    SELECT 1 FROM "FeedItem" fi
    WHERE fi."requestId" = br.id
      AND fi.source = 'SUBSCRIPTION'
  );

-- 3. Verify: distribution after the update.
SELECT source, COUNT(*) AS n
FROM "BriefingRequest"
GROUP BY source
ORDER BY n DESC;

COMMIT;

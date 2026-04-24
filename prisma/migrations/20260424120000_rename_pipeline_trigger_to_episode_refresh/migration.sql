-- Rename the CronJob row key so the scheduled() dispatcher continues to find it
-- after the code rename from pipeline-trigger → episode-refresh.
UPDATE "CronJob"
SET "jobKey" = 'episode-refresh'
WHERE "jobKey" = 'pipeline-trigger';

-- Rename any legacy PlatformConfig cron.* overrides that were migrated from
-- the old layout. Safe no-op if none exist.
UPDATE "PlatformConfig"
SET "key" = 'cron.episode-refresh.enabled'
WHERE "key" = 'cron.pipeline-trigger.enabled';

UPDATE "PlatformConfig"
SET "key" = 'cron.episode-refresh.intervalMinutes'
WHERE "key" = 'cron.pipeline-trigger.intervalMinutes';

UPDATE "PlatformConfig"
SET "key" = 'cron.episode-refresh.lastRunAt'
WHERE "key" = 'cron.pipeline-trigger.lastRunAt';

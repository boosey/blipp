---
name: db-query
description: "Convert natural language questions into SQL queries and run them against the Blipp staging or production PostgreSQL database. Use this skill whenever the user asks about data in the database, wants to look up records, check counts, investigate pipeline state, debug user issues, or explore any data that lives in Neon/PostgreSQL. Triggers on phrases like 'how many users', 'check the database', 'query prod', 'look up episode', 'what's in the pipeline', 'find the user', 'show me all X', or any question that implies reading from the database. Also use when the user says 'db', 'sql', 'query', 'staging db', 'prod db', or references specific tables like PipelineJob, Episode, User, etc. Default to staging unless the user says 'prod' or 'production'."
---

# Database Query Skill

Convert natural language into SQL and execute it against the Blipp Neon PostgreSQL database.

## Executing Queries

Use the query script at `scripts/db-query.ts`. It connects via the `pg` package using connection strings from `.env` (staging) or `neon-config.env` (production).

**Staging** (default):
```bash
npx tsx scripts/db-query.ts 'SELECT "id", "email" FROM "User" LIMIT 5'
```

**Production** (only when user explicitly asks):
```bash
npx tsx scripts/db-query.ts --prod 'SELECT COUNT(*) FROM "User"'
```

## Environment Selection

- **Default to staging** unless the user explicitly says "prod", "production", or "production database"
- If ambiguous, ask which environment
- Always state which environment you're querying in your response

## Safety Rules

- **READ ONLY**: Only execute SELECT statements. Never run INSERT, UPDATE, DELETE, DROP, ALTER, TRUNCATE, or any DDL/DML.
- If the user asks to modify data, explain that this skill is read-only and suggest they use Prisma or the admin UI instead.
- For large result sets, always use LIMIT (default to 20 rows unless the user asks for more).
- When querying production, add an extra confirmation step: tell the user "Querying production..." before executing.

## Schema Reference

The database uses Prisma, so table names are PascalCase (e.g., `"User"`, `"Episode"`, `"PipelineJob"`). Column names are camelCase. You must double-quote table and column names in SQL since PostgreSQL folds unquoted identifiers to lowercase.

### Key Tables and Common Queries

**Users & Auth:**
- `"User"` — id mod externalId (Clerk ID), email, name, planId, isAdmin, createdAt
- `"Plan"` — id, name, slug, limits (briefingsPerDay, etc.)
- `"Subscription"` — userId, podcastId, durationTier, isActive

**Content:**
- `"Podcast"` — id, title, author, feedUrl, imageUrl, isActive
- `"Episode"` — id, podcastId, title, publishedAt, contentStatus (PENDING/TRANSCRIPT_READY/AUDIO_READY/NOT_DELIVERABLE)
- `"Distillation"` — id, episodeId, status, claimsJson, transcript
- `"Clip"` — id, episodeId, durationTier, status, narrative, audioUrl, voicePresetId

**Pipeline:**
- `"PipelineJob"` — id, episodeId, briefingRequestId, status, currentStage, createdAt
- `"PipelineStep"` — id, pipelineJobId, stage, status, model, provider, inputTokens, outputTokens, cost, durationMs, error
- `"PipelineEvent"` — id, pipelineStepId, level, message, data
- `"BriefingRequest"` — id, userId, status, items (JSON), targetMinutes

**Feed:**
- `"FeedItem"` — id, userId, episodeId, clipId, source (SUBSCRIPTION/ON_DEMAND), status
- `"Briefing"` — id, userId, clipId, feedItemId

**AI Models:**
- `"AiModel"` — id, stage, modelId, label, developer, isActive
- `"AiModelProvider"` — id, aiModelId, provider, providerModelId, pricing fields
- `"PlatformConfig"` — key, value (runtime config including prompts)
- `"PromptVersion"` — id, stage, version, values (JSON), label

**Admin/Ops:**
- `"AuditLog"` — id, actorId, action, entityType, entityId, before, after
- `"CronRun"` — id, jobKey, status, startedAt, finishedAt
- `"AiServiceError"` — service, provider, model, category, severity, errorMessage

### Enum Values

- **ContentStatus**: PENDING, TRANSCRIPT_READY, AUDIO_READY, NOT_DELIVERABLE
- **ClipStatus**: PENDING, NARRATIVE_READY, GENERATING_AUDIO, COMPLETED, FAILED
- **PipelineJobStatus**: PENDING, IN_PROGRESS, COMPLETED, FAILED
- **PipelineStepStatus**: PENDING, IN_PROGRESS, COMPLETED, FAILED, SKIPPED
- **PipelineStage**: TRANSCRIPTION, DISTILLATION, NARRATIVE_GENERATION, AUDIO_GENERATION, BRIEFING_ASSEMBLY
- **DistillationStatus**: PENDING, FETCHING_TRANSCRIPT, TRANSCRIPT_READY, EXTRACTING_CLAIMS, COMPLETED, FAILED

## Query Construction Guidelines

1. Always double-quote table and column names: `SELECT "id", "email" FROM "User"`
2. Use `LIMIT 20` by default
3. For counts, no limit needed: `SELECT COUNT(*) FROM "Episode"`
4. For date filtering, use `NOW() - INTERVAL '...'`: `WHERE "createdAt" > NOW() - INTERVAL '24 hours'`
5. Join through foreign keys using the Prisma naming convention (e.g., `"userId"`, `"podcastId"`, `"episodeId"`)
6. JSON fields (claimsJson, items, values, etc.) can be queried with `->` and `->>` operators
7. For text search, use `ILIKE '%term%'`
8. Present results in a readable format — summarize large result sets rather than dumping raw output

## Example Interactions

**User**: "how many users signed up this week?"
```sql
SELECT COUNT(*) FROM "User" WHERE "createdAt" > NOW() - INTERVAL '7 days';
```

**User**: "show me failed pipeline jobs from today"
```sql
SELECT j."id", j."status", j."currentStage", j."error", j."createdAt",
       e."title" as episode_title
FROM "PipelineJob" j
LEFT JOIN "Episode" e ON j."episodeId" = e."id"
WHERE j."status" = 'FAILED' AND j."createdAt" > NOW() - INTERVAL '24 hours'
ORDER BY j."createdAt" DESC LIMIT 20;
```

**User**: "what podcasts does user X subscribe to?"
```sql
SELECT p."title", s."durationTier", s."isActive", s."createdAt"
FROM "Subscription" s
JOIN "Podcast" p ON s."podcastId" = p."id"
WHERE s."userId" = 'USER_ID_HERE'
ORDER BY s."createdAt" DESC;
```

# Prisma Migrations Guide

## Current State

The project uses `prisma migrate deploy` for schema changes. Both staging and production CI apply migrations automatically before deploying the worker. The initial baseline is `prisma/migrations/0_init/` and both databases are marked as having it applied.

## Workflow for a schema change

1. Edit `prisma/schema.prisma`.
2. Generate the migration file:
   ```bash
   npm run db:migrate:new <snake_case_name>
   ```
   This uses the canonical Prisma flow: replays all migrations on disk into the **shadow database** (configured via `SHADOW_DATABASE_URL` in `neon-config.env`), then diffs the result against `prisma/schema.prisma` and writes the SQL to `prisma/migrations/<timestamp>_<name>/migration.sql`. The shadow DB is independent from staging/production, so the script works regardless of what state those happen to be in.
3. Review the generated SQL. For destructive changes (drops, renames) this is where you edit the SQL to preserve data — e.g. rewrite a column-rename as add-new + backfill + drop-old in follow-up migrations.
4. Regenerate the Prisma client locally and commit both the schema and the migration:
   ```bash
   npx prisma generate
   git add prisma/schema.prisma prisma/migrations/
   ```
5. Push. CI runs `prisma migrate deploy` against staging. When you promote to prod, the prod workflow runs `prisma migrate deploy` there too.

### When the shadow DB gets stuck

If `db:migrate:new` fails with `P3006` ("failed to apply cleanly to shadow database"), the shadow has leftover state from a previous run. Reset it:

```bash
npm run db:shadow:reset
```

This drops and recreates the `public` schema on the shadow DB. Safe to run any time — the shadow holds no real data.

## Status and manual control

```bash
npm run db:migrate:status:staging       # what's applied / pending on staging
npm run db:migrate:status:production    # what's applied / pending on production
npm run db:migrate:deploy:staging       # apply pending manually (CI does this on push)
npm run db:migrate:deploy:production    # apply pending manually
```

## Rollback

Prisma Migrate only rolls forward. To undo a change, write a new migration that reverses it (e.g. add back a dropped column) — or restore from a Neon branch / backup.

## Break-glass: force sync

If a migration gets stuck and you need to reconcile schema state urgently:

```bash
npm run db:force-sync:staging        # prisma db push --accept-data-loss
npm run db:force-sync:production     # DO NOT USE unless you understand the consequences
```

After a force-sync, the `_prisma_migrations` history is out of sync with the DB. Fix it with `prisma migrate resolve --applied <migration_name>` (to mark a file as applied without running it) or `--rolled-back` (to clear a failed-migration record).

## How the shadow DB works

The shadow database is a throwaway Neon branch used by `db:migrate:new` to derive the "current" schema from migration history. The flow:

1. Prisma drops everything in the shadow.
2. Replays every migration file in `prisma/migrations/` in order.
3. Compares the resulting state to `schema.prisma`.
4. Outputs the SQL diff as the new migration.

This catches drift between migration files and what `schema.prisma` says, because the shadow is independent of staging/production. The shadow URL is stored in `SHADOW_DATABASE_URL` in `neon-config.env` (gitignored) and read by `prisma.config.ts`.

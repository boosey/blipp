# Prisma Migrations Guide

## Current State

The project uses `prisma migrate deploy` for schema changes. Both staging and production CI apply migrations automatically before deploying the worker. The initial baseline is `prisma/migrations/0_init/` and both databases are marked as having it applied.

## Workflow for a schema change

1. Edit `prisma/schema.prisma`.
2. Generate the migration file:
   ```bash
   npm run db:migrate:new <snake_case_name>
   ```
   This diffs the current **staging database** against `prisma/schema.prisma` and writes the SQL to `prisma/migrations/<timestamp>_<name>/migration.sql`. Staging is treated as the "last-applied state". If a teammate has a migration on main that hasn't hit staging yet, run `npm run db:migrate:deploy:staging` first to apply it, then generate your new migration.
3. Review the generated SQL. For destructive changes (drops, renames) this is where you edit the SQL to preserve data — e.g. rewrite a column-rename as add-new + backfill + drop-old in follow-up migrations.
4. Regenerate the Prisma client locally and commit both the schema and the migration:
   ```bash
   npx prisma generate
   git add prisma/schema.prisma prisma/migrations/
   ```
5. Push. CI runs `prisma migrate deploy` against staging. When you promote to prod, the prod workflow runs `prisma migrate deploy` there too.

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

## Why we don't use `prisma migrate dev`

Prisma's recommended local workflow is `prisma migrate dev`, which replays all migration files against a shadow database, diffs that against `schema.prisma`, and writes the new migration. That catches cases where the real DB has drifted from the migrations on disk.

We don't use it because the project doesn't have a `SHADOW_DATABASE_URL` provisioned. If you want that safety guarantee, add a throwaway Neon DB URL as `shadowDatabaseUrl` in `prisma.config.ts` and switch `scripts/new-migration.mjs` to run `migrate dev --create-only` instead.

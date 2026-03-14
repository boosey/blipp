# Prisma Migrations Guide

## Current State

The project uses `prisma db push` for schema synchronization. This is fine for development but should be replaced with `prisma migrate` for production.

## Migration Workflow

### Development
```bash
# After modifying prisma/schema.prisma:
npx prisma migrate dev --name describe_your_change

# This will:
# 1. Generate a migration SQL file in prisma/migrations/
# 2. Apply it to the dev database
# 3. Regenerate the Prisma client
```

### Production
```bash
# Apply pending migrations to production:
npx prisma migrate deploy

# This applies all unapplied migrations in order.
# Never use `prisma db push` in production.
```

### Baselining Existing Database
```bash
# If the production database already has the schema (from db push):
npx prisma migrate resolve --applied "0001_baseline"

# This marks the baseline migration as already applied.
```

### Rollback
Prisma doesn't support automatic rollbacks. To rollback:
1. Write a new migration that reverses the changes
2. Or restore from a database backup

### CI/CD Integration
The deploy workflow should run `npx prisma migrate deploy` before starting the worker.

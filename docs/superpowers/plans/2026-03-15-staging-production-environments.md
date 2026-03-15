# Staging + Production Environments Implementation Plan

> **For agentic workers:** Use Agent Teams (TeamCreate) for parallel task execution. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a staging environment alongside production using Wrangler environments, with CI/CD that deploys staging on push to main and production via manual trigger.

**Architecture:** Single `wrangler.jsonc` with top-level = staging and `env.production` override. Each environment gets its own Worker, R2 bucket, Hyperdrive, queues, and secrets. Same Neon project, separate databases.

**Tech Stack:** Cloudflare Workers, Wrangler environments, GitHub Actions, Neon PostgreSQL, Clerk, Stripe

**Spec:** `docs/superpowers/specs/2026-03-15-staging-production-environments-design.md`

---

## Prerequisites (Manual — Before Running This Plan)

Before executing the code changes below, these infrastructure resources must be created manually or via CLI. They are documented in the deployment guide (Task 8) but must exist before the first deploy:

1. **Neon:** Create a `staging` database in the existing Neon project. Push schema + seed to it.
2. **Cloudflare R2:** Create `blipp-audio-staging` bucket.
3. **Cloudflare Hyperdrive:** Create `blipp-db-staging` config pointing to the staging Neon database.
4. **Cloudflare Queues:** 7 queues with `-staging` suffix (or let `wrangler deploy` auto-create them).
5. **Cloudflare Secrets:** Set staging secrets via `scripts/set-secrets.sh`.

Production infrastructure (R2 bucket, Hyperdrive, queues, secrets) also needs to be created if not already done.

---

## Chunk 1: Infrastructure Config Changes

### Task 1: Add `APP_ORIGIN` to Env type

**Files:**
- Modify: `worker/types.ts:69` (near `ALLOWED_ORIGINS`)

- [ ] **Step 1: Add `APP_ORIGIN` to Env type**

In `worker/types.ts`, add after the `ALLOWED_ORIGINS` line:

```typescript
/** Base URL for this environment (e.g., https://podblipp.com) — used for Stripe redirect fallbacks */
APP_ORIGIN?: string;
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS (new optional field, no consumers yet)

- [ ] **Step 3: Commit**

```bash
git add worker/types.ts
git commit -m "feat: add APP_ORIGIN env binding for per-environment origin"
```

---

### Task 2: Update CORS origins from blipp.app to podblipp.com

**Files:**
- Modify: `worker/index.ts:66-70` (hardcoded CORS origins)

- [ ] **Step 1: Update hardcoded CORS origins**

In `worker/index.ts`, replace the fallback origins array:

```typescript
// Replace these lines:
          "http://localhost:8787",
          "http://localhost:5173",
          "https://blipp.app",
          "https://www.blipp.app",

// With:
          "http://localhost:8787",
          "http://localhost:5173",
          "https://podblipp.com",
          "https://www.podblipp.com",
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 3: Update CORS test file**

In `worker/__tests__/cors.test.ts`, the `createCorsApp()` function duplicates the CORS origin list inline. Make these exact replacements:

Line 22: `"https://blipp.app",` → `"https://podblipp.com",`
Line 23: `"https://www.blipp.app",` → `"https://www.podblipp.com",`

The `ALLOWED_ORIGINS` override test (line 80) uses `"https://staging.blipp.app"` as an arbitrary test value — this is fine to leave as-is since it's testing the override mechanism, not an actual staging domain.

- [ ] **Step 4: Run CORS tests**

Run: `npx vitest run worker/__tests__/cors.test.ts`
Expected: PASS

- [ ] **Step 5: Run CORS tests again**

Run: `npx vitest run worker/__tests__/cors.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add worker/index.ts worker/__tests__/cors.test.ts
git commit -m "feat: update CORS origins from blipp.app to podblipp.com"
```

---

### Task 3: Update billing route fallback origin

**Files:**
- Modify: `worker/routes/billing.ts:55,104` (two hardcoded `https://blipp.app` references)

- [ ] **Step 1: Update checkout fallback origin**

In `worker/routes/billing.ts`, line 55, replace:

```typescript
const origin = c.req.header("origin") ?? "https://blipp.app";
```

With:

```typescript
const origin = c.req.header("origin") ?? (c.env.APP_ORIGIN || "https://podblipp.com");
```

- [ ] **Step 2: Update portal fallback origin**

In `worker/routes/billing.ts`, line 104, replace:

```typescript
const origin = c.req.header("origin") ?? "https://blipp.app";
```

With:

```typescript
const origin = c.req.header("origin") ?? (c.env.APP_ORIGIN || "https://podblipp.com");
```

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 4: Run billing tests if they exist**

Run: `npx vitest run worker/routes/__tests__/billing.test.ts 2>/dev/null || echo "No billing tests"`
Expected: PASS or no tests found

- [ ] **Step 5: Commit**

```bash
git add worker/routes/billing.ts
git commit -m "feat: use APP_ORIGIN env var for Stripe redirect fallback"
```

---

### Task 4: Restructure wrangler.jsonc for staging + production

**Files:**
- Modify: `wrangler.jsonc` (full restructure)

- [ ] **Step 1: Read the current wrangler.jsonc**

Read `wrangler.jsonc` to confirm current state before modifying.

- [ ] **Step 2: Rewrite wrangler.jsonc**

Replace the entire file with:

```jsonc
{
  "$schema": "./node_modules/wrangler/config-schema.json",
  "name": "blipp-staging",
  "compatibility_date": "2026-02-26",
  "compatibility_flags": ["nodejs_compat"],
  "main": "./worker/index.ts",
  "assets": {
    "not_found_handling": "single-page-application",
    "run_worker_first": ["/api/*"]
  },
  "ai": {
    "binding": "AI"
  },

  // ── Staging (default: npx wrangler deploy) ──

  "vars": {
    "ENVIRONMENT": "staging",
    "APP_ORIGIN": "https://blipp-staging.YOUR-SUBDOMAIN.workers.dev",
    "ALLOWED_ORIGINS": "http://localhost:8787,http://localhost:5173,https://blipp-staging.YOUR-SUBDOMAIN.workers.dev"
  },
  "hyperdrive": [
    {
      "binding": "HYPERDRIVE",
      "id": "<staging-hyperdrive-id>",
      "localConnectionString": ""
    }
  ],
  "r2_buckets": [
    {
      "binding": "R2",
      "bucket_name": "blipp-audio-staging"
    }
  ],
  "queues": {
    "producers": [
      { "binding": "FEED_REFRESH_QUEUE", "queue": "feed-refresh-staging" },
      { "binding": "DISTILLATION_QUEUE", "queue": "distillation-staging" },
      { "binding": "NARRATIVE_GENERATION_QUEUE", "queue": "narrative-generation-staging" },
      { "binding": "AUDIO_GENERATION_QUEUE", "queue": "clip-generation-staging" },
      { "binding": "BRIEFING_ASSEMBLY_QUEUE", "queue": "briefing-assembly-staging" },
      { "binding": "TRANSCRIPTION_QUEUE", "queue": "transcription-staging" },
      { "binding": "ORCHESTRATOR_QUEUE", "queue": "orchestrator-staging" }
    ],
    "consumers": [
      { "queue": "feed-refresh-staging", "max_batch_size": 10, "max_retries": 3 },
      { "queue": "distillation-staging", "max_batch_size": 5, "max_retries": 3 },
      { "queue": "narrative-generation-staging", "max_batch_size": 5, "max_retries": 3 },
      { "queue": "clip-generation-staging", "max_batch_size": 3, "max_retries": 3 },
      { "queue": "briefing-assembly-staging", "max_batch_size": 5, "max_retries": 3 },
      { "queue": "transcription-staging", "max_batch_size": 5, "max_retries": 3 },
      { "queue": "orchestrator-staging", "max_batch_size": 10, "max_retries": 3 }
    ]
  },
  // No cron triggers for staging — tests trigger pipeline on-demand

  // ── Production (npx wrangler deploy --env production) ──

  "env": {
    "production": {
      "name": "blipp",
      "vars": {
        "ENVIRONMENT": "production",
        "APP_ORIGIN": "https://podblipp.com",
        "ALLOWED_ORIGINS": "https://podblipp.com,https://www.podblipp.com"
      },
      "hyperdrive": [
        {
          "binding": "HYPERDRIVE",
          "id": "<production-hyperdrive-id>",
          "localConnectionString": ""
        }
      ],
      "r2_buckets": [
        {
          "binding": "R2",
          "bucket_name": "blipp-audio"
        }
      ],
      "queues": {
        "producers": [
          { "binding": "FEED_REFRESH_QUEUE", "queue": "feed-refresh" },
          { "binding": "DISTILLATION_QUEUE", "queue": "distillation" },
          { "binding": "NARRATIVE_GENERATION_QUEUE", "queue": "narrative-generation" },
          { "binding": "AUDIO_GENERATION_QUEUE", "queue": "clip-generation" },
          { "binding": "BRIEFING_ASSEMBLY_QUEUE", "queue": "briefing-assembly" },
          { "binding": "TRANSCRIPTION_QUEUE", "queue": "transcription" },
          { "binding": "ORCHESTRATOR_QUEUE", "queue": "orchestrator" }
        ],
        "consumers": [
          { "queue": "feed-refresh", "max_batch_size": 10, "max_retries": 3 },
          { "queue": "distillation", "max_batch_size": 5, "max_retries": 3 },
          { "queue": "narrative-generation", "max_batch_size": 5, "max_retries": 3 },
          { "queue": "clip-generation", "max_batch_size": 3, "max_retries": 3 },
          { "queue": "briefing-assembly", "max_batch_size": 5, "max_retries": 3 },
          { "queue": "transcription", "max_batch_size": 5, "max_retries": 3 },
          { "queue": "orchestrator", "max_batch_size": 10, "max_retries": 3 }
        ]
      },
      "triggers": {
        "crons": ["*/30 * * * *"]
      }
    }
  }
}
```

**Note:** `wrangler dev` uses the top-level (staging) config, but `localConnectionString: ""` means it reads from `.dev.vars` (`CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE`) as before. Local dev behavior is unchanged.

- [ ] **Step 3: Validate config**

Run: `npx wrangler deploy --dry-run`
Expected: Dry run succeeds (may warn about placeholder Hyperdrive IDs)

- [ ] **Step 4: Commit**

```bash
git add wrangler.jsonc
git commit -m "feat: restructure wrangler.jsonc for staging + production environments"
```

---

### Task 5: Update set-secrets.sh to support --env flag

**Files:**
- Modify: `scripts/set-secrets.sh`

- [ ] **Step 1: Rewrite set-secrets.sh**

Replace the entire file with:

```bash
#!/bin/bash
# Batch-set Cloudflare Worker secrets from an env file.
# Usage: bash scripts/set-secrets.sh secrets.env [--env production]
#
# File format (one per line):
#   KEY=value
#   # comments and blank lines are skipped
#
# WARNING: Delete the secrets file immediately after use!

set -euo pipefail

if [ -z "${1:-}" ]; then
  echo "Usage: $0 <secrets-file> [--env <environment>]"
  echo ""
  echo "Examples:"
  echo "  $0 secrets-staging.env"
  echo "  $0 secrets-production.env --env production"
  exit 1
fi

SECRETS_FILE="$1"
shift
ENV_FLAG="${*:-}"

if [ ! -f "$SECRETS_FILE" ]; then
  echo "Error: File '$SECRETS_FILE' not found"
  exit 1
fi

if [ -n "$ENV_FLAG" ]; then
  echo "Setting Cloudflare Worker secrets from $SECRETS_FILE ($ENV_FLAG)..."
else
  echo "Setting Cloudflare Worker secrets from $SECRETS_FILE (default/staging)..."
fi
echo ""

count=0
while IFS= read -r line; do
  # Skip empty lines and comments
  [[ -z "$line" || "$line" == \#* ]] && continue

  # Split on first = only
  key="${line%%=*}"
  value="${line#*=}"

  # Skip if no = found
  [[ "$key" == "$line" ]] && continue

  echo "  Setting: $key"
  echo "$value" | npx wrangler secret put "$key" $ENV_FLAG 2>&1 | grep -v "^$" || true
  count=$((count + 1))
done < "$SECRETS_FILE"

echo ""
echo "Done! Set $count secrets."
echo ""
echo "IMPORTANT: Delete '$SECRETS_FILE' now!"
echo "  rm $SECRETS_FILE"
```

- [ ] **Step 2: Commit**

```bash
git add scripts/set-secrets.sh
git commit -m "feat: update set-secrets.sh to support --env flag for multi-environment"
```

---

## Chunk 2: CI/CD Workflows

### Task 6: Create staging deploy workflow

**Files:**
- Create: `.github/workflows/deploy-staging.yml`
- Delete: `.github/workflows/deploy.yml` (replaced)

- [ ] **Step 1: Create deploy-staging.yml**

Create `.github/workflows/deploy-staging.yml`:

```yaml
name: Deploy Staging

on:
  push:
    branches: [main]

jobs:
  deploy-staging:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'
      - run: npm ci --legacy-peer-deps
      - run: npx prisma generate

      - name: Typecheck
        run: npm run typecheck

      - name: Unit tests
        run: npm test
        env:
          NODE_OPTIONS: '--max-old-space-size=4096'

      - name: Build for Staging
        run: npm run build
        env:
          VITE_CLERK_PUBLISHABLE_KEY: ${{ secrets.VITE_CLERK_PUBLISHABLE_KEY_STAGING }}
          VITE_APP_URL: ${{ vars.STAGING_URL }}

      - name: Deploy to Staging
        uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}

      # TODO: Add Playwright E2E tests step here once test suite is written
      # - name: Run E2E tests
      #   run: npx playwright test
      #   env:
      #     BASE_URL: ${{ vars.STAGING_URL }}
```

- [ ] **Step 2: Delete old deploy.yml**

```bash
git rm .github/workflows/deploy.yml
```

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/deploy-staging.yml
git commit -m "feat: replace deploy.yml with deploy-staging.yml for staging-first CI"
```

---

### Task 7: Create production deploy workflow

**Files:**
- Create: `.github/workflows/deploy-production.yml`

- [ ] **Step 1: Create deploy-production.yml**

Create `.github/workflows/deploy-production.yml`:

```yaml
name: Deploy Production

on:
  workflow_dispatch:

jobs:
  verify-staging:
    runs-on: ubuntu-latest
    steps:
      - name: Check staging deploy status
        uses: actions/github-script@v7
        with:
          script: |
            const runs = await github.rest.actions.listWorkflowRuns({
              owner: context.repo.owner,
              repo: context.repo.repo,
              workflow_id: 'deploy-staging.yml',
              branch: 'main',
              status: 'success',
              per_page: 1
            });
            if (runs.data.total_count === 0) {
              core.setFailed('No successful staging deploy found. Deploy to staging first.');
            }
            const lastRun = runs.data.workflow_runs[0];
            const hoursSince = (Date.now() - new Date(lastRun.updated_at).getTime()) / 3600000;
            if (hoursSince > 24) {
              core.warning(`Last successful staging deploy was ${Math.round(hoursSince)} hours ago.`);
            }

  deploy-production:
    needs: verify-staging
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'
      - run: npm ci --legacy-peer-deps
      - run: npx prisma generate

      - name: Typecheck
        run: npm run typecheck

      - name: Unit tests
        run: npm test
        env:
          NODE_OPTIONS: '--max-old-space-size=4096'

      - name: Build for Production
        run: npm run build
        env:
          VITE_CLERK_PUBLISHABLE_KEY: ${{ secrets.VITE_CLERK_PUBLISHABLE_KEY_PRODUCTION }}
          VITE_APP_URL: https://podblipp.com

      - name: Deploy to Production
        uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          command: deploy --env production
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/deploy-production.yml
git commit -m "feat: add manual deploy-production.yml workflow with staging gate"
```

---

## Chunk 3: Deployment Guide Rewrite

### Task 8: Restructure production-deployment.md for both environments

**Files:**
- Modify: `docs/guides/production-deployment.md` (major rewrite)

This is the largest task. The guide needs restructuring to walk through staging first, then production.

- [ ] **Step 1: Read the current guide**

Read `docs/guides/production-deployment.md` in full.

- [ ] **Step 2: Rewrite the guide**

Key structural changes:
1. **Phase 1 (Accounts):** Add note that same accounts serve both environments
2. **Phase 2 (Cloudflare):** Create 2 R2 buckets (`blipp-audio-staging` + `blipp-audio`), 14 queues via CLI (7 with `-staging` suffix + 7 without), 2 Hyperdrive configs via CLI. Update the queue creation script.
3. **Phase 3 (Neon):** Create `staging` database in same project alongside `neondb`. Push schema + seed to both. Document two connection strings.
4. **Phase 4 (Clerk):** Split into 4a (staging — dev instance webhook to `workers.dev` URL, created after first deploy) and 4b (production — full prod instance setup, domain, certs, Google OAuth, webhook to `podblipp.com`)
5. **Phase 5 (Stripe):** Split into 5a (staging — sandbox webhook to `workers.dev` URL, created after first deploy) and 5b (production — full live mode activation, products, portal, webhook to `podblipp.com`)
6. **Phase 6-9:** Unchanged (shared keys)
7. **Phase 10 (CI/CD):** Document two workflows. Add `VITE_CLERK_PUBLISHABLE_KEY_STAGING` and `VITE_CLERK_PUBLISHABLE_KEY_PRODUCTION` as GitHub secrets. Add `STAGING_URL` as a GitHub Actions variable.
8. **Phase 11 (Domain):** Only production gets `podblipp.com`. Staging uses `workers.dev`.
9. **Phase 12 (Secrets):** Two passes — staging (no flag) and production (`--env production`). Show both `secrets-staging.env` and `secrets-production.env` templates. Include `APP_ORIGIN` and `ALLOWED_ORIGINS` as Wrangler vars (not secrets).
10. **Phase 13 (First Deploy):** Deploy staging first (`npx wrangler deploy`). Get the `workers.dev` URL. Create Clerk + Stripe webhook endpoints using that URL. Verify staging. Then deploy production (`npx wrangler deploy --env production`).
11. **Phase 14 (Verification):** Smoke tests for both environments.
12. **Runbook:** Add staging-specific tasks:
    - "Reset staging database" (`npm run clean:pipeline` with staging DATABASE_URL)
    - "Re-seed staging" after schema changes
    - No daily cron checks for staging (no cron)
    - Note that staging AI costs are minimal (cheapest models)

- [ ] **Step 3: Verify all checklist items render as checkboxes**

Review the markdown to make sure all `- [ ]` items are properly formatted.

- [ ] **Step 4: Commit**

```bash
git add docs/guides/production-deployment.md
git commit -m "docs: restructure deployment guide for staging + production environments"
```

---

### Task 9: Update CLAUDE.md references

**Files:**
- Modify: `CLAUDE.md` (project root)

- [ ] **Step 1: Update domain references**

Replace any `blipp.app` references with `podblipp.com` in CLAUDE.md if present.

- [ ] **Step 2: Update queue count**

CLAUDE.md says "6 Cloudflare Queues" — update to "7 Cloudflare Queues" (includes orchestrator).

- [ ] **Step 3: Add staging deploy command**

In the Commands section, add:

```bash
npx wrangler deploy                 # Deploy to staging
npx wrangler deploy --env production # Deploy to production
```

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md with podblipp.com domain and staging commands"
```

---

### Task 10: Update memory and docs references

**Files:**
- Modify: `C:\Users\boose\.claude\projects\C--Users-boose-Projects-blipp\memory\MEMORY.md` (if blipp.app references exist)

- [ ] **Step 1: Check for stale domain references in memory**

Search memory files for `blipp.app` and update to `podblipp.com` where appropriate.

- [ ] **Step 2: Commit memory changes if any**

Only if changes were made.

---

## Execution Order

1. **Task 1** — Add `APP_ORIGIN` to Env type (no dependencies)
2. **Task 2** — Update CORS origins (no dependencies)
3. **Task 3** — Update billing fallback (depends on Task 1)
4. **Task 4** — Restructure wrangler.jsonc (no dependencies)
5. **Task 5** — Update set-secrets.sh (no dependencies)
6. **Task 6** — Create staging workflow (depends on Task 4)
7. **Task 7** — Create production workflow (depends on Task 4)
8. **Task 8** — Rewrite deployment guide (depends on all above)
9. **Task 9** — Update CLAUDE.md (depends on Task 2, 4)
10. **Task 10** — Update memory references (no dependencies)

**Parallelizable:** Tasks 1-5 can all run in parallel. Tasks 6-7 can run in parallel after Task 4. Task 8 should run last.

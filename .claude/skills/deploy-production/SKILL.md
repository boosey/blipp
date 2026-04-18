---
name: deploy-production
description: Trigger the production deploy workflow on GitHub Actions and monitor it to completion. Use when the user says "deploy to production", "deploy prod", "production deploy", "ship to prod", or any variation of deploying to the production environment. Also triggers on /deploy-production.
---

# Deploy Production

Trigger the "Deploy Production" GitHub Actions workflow and monitor it through to completion or failure. This is a `workflow_dispatch` trigger — no push needed.

## Why this workflow exists

After staging is verified, the developer wants a single command that kicks off the production deploy and monitors it without babysitting. The workflow verifies staging passed recently, then runs typecheck, tests, build, and deploys to Cloudflare Workers production.

## The workflow

### Step 1: Confirm with the user

Production deploys are high-stakes. Before proceeding, confirm:

```
About to trigger a production deploy from main. Proceed?
```

If the user already said "deploy to production" or similar, that counts as confirmation — skip this step.

### Step 1.5: Pre-flight — schema migration sanity check

Before triggering, verify production won't end up with a code/schema mismatch.

1. **List recent migrations on disk vs. main:**
   ```bash
   ls -1 prisma/migrations/ | tail -5
   git log --oneline --diff-filter=A -- prisma/migrations/ | head -5
   ```
2. **Check production's migration status:**
   ```bash
   npm run db:migrate:status:production
   ```
   - If output says "Database schema is up to date" → safe.
   - If it lists "Following migrations have not yet been applied" → the deploy will apply them, expected.
   - If it complains about **drift** ("Drift detected" or "schema is not up to date") → STOP. Production has manual changes that aren't in migration history. Resolve drift before deploying (often: `prisma migrate resolve --applied <name>` to mark out-of-band changes as applied).

3. If `prisma/schema.prisma` was edited recently but no corresponding migration was committed (e.g. someone used `db:push:*:force` instead of `db:migrate:new`), the production deploy will succeed but **production DB won't get the new schema**, and code that depends on it will fail at runtime. Check:
   ```bash
   git log --oneline -10 prisma/schema.prisma
   git log --oneline -10 prisma/migrations/
   ```
   If schema commits aren't paired with migration commits, stop and have the user generate/commit the missing migration first.

### Step 2: Trigger the workflow

```bash
gh workflow run deploy-production.yml --ref main
```

If this fails, report the error and stop.

### Step 3: Wait for GitHub to register the run

GitHub Actions takes 15-30 seconds to create a run after a workflow_dispatch trigger. You MUST sleep first or you'll find a stale run.

**Run this sleep as its own standalone Bash call. Do not skip it.**

```bash
sleep 15
```

### Step 4: Find the CI run

Find the run you just triggered:

```bash
gh run list --workflow "Deploy Production" --limit 5 --json databaseId,startedAt,status,event,headBranch --jq '.[] | select(.headBranch=="main" and .event=="workflow_dispatch")'
```

Check the `startedAt` timestamp — only use a run that started within the last 60 seconds. If none found, retry every 5 seconds for up to 60 more seconds:

```bash
sleep 5 && gh run list --workflow "Deploy Production" --limit 5 --json databaseId,startedAt,status,event,headBranch --jq '.[] | select(.headBranch=="main" and .event=="workflow_dispatch")'
```

If still nothing after ~75 seconds total, tell the user no run was detected.

**Red flags that you grabbed the wrong run:**
- `status` is already `completed` — a run that finished instantly is the old one
- `startedAt` is more than 2 minutes ago

### Step 5: Monitor with step-by-step progress

Once you have the correct run ID, poll the run's jobs and steps to show real-time progress. Do NOT use `gh run watch` — instead, poll with `gh run view` so you can display individual step status.

#### 5a: Print the step checklist header

Output a message like:

```
Monitoring production deploy #<RUN_ID>...
```

#### 5b: Poll loop

Poll every 15 seconds using:

```bash
gh run view <RUN_ID> --json jobs --jq '.jobs[] | .name as $job | .steps[] | "\($job)\t\(.status)\t\(.conclusion)\t\(.name)"'
```

After each poll, print the **full updated checklist** across both jobs. The deploy-production workflow has two jobs with these meaningful steps (skip internal "Set up job" / "Complete job" / "Post" steps):

**Job 1: verify-staging**
1. Verify staging deployment succeeded

**Job 2: deploy-production**
2. Checkout
3. Setup Node
4. npm ci
5. Prisma generate
6. Create Prisma barrel export
7. Apply migrations to production database
8. Typecheck
9. Tests
10. Build for Production
11. Patch wrangler config for production
12. Deploy to Production

For each step, show:
- `✅` if completed successfully (`conclusion` is `success`)
- `❌` if failed (`conclusion` is `failure`)
- `⏳` if in progress (`status` is `in_progress`)
- `⬜` if not started yet (`status` is `queued` or not yet present)
- `⏭️` if skipped (`conclusion` is `skipped`) — this happens for deploy-production steps when verify-staging fails

Example output during a run:

```
✅ Verify staging deployment succeeded
✅ Checkout
✅ Setup Node
✅ npm ci
✅ Prisma generate
✅ Create Prisma barrel export
✅ Apply migrations to production database
✅ Typecheck
⏳ Tests
⬜ Build for Production
⬜ Patch wrangler config
⬜ Deploy to Production
```

Keep polling and reprinting until the overall run status is `completed`. Use `sleep 15` between polls (run sleep as its own Bash call, same as Step 3).

#### 5c: Final result

When the run finishes:

- **Success**: Print the final checklist (all ✅) followed by:
  ```
  ✅ Production deploy complete.
  ```
- **Failure**: Print the final checklist (showing which step(s) got ❌), then read failed logs with `gh run view <RUN_ID> --log-failed`, report which step failed, and offer to investigate. Common failures:
  - **verify-staging**: Staging hasn't been deployed recently or last staging deploy failed
  - **prisma migrate deploy**: Drift detected or a migration failed — run `npm run db:migrate:status:production` to investigate. If a migration SQL file is broken, fix it and redeploy. In emergencies only, `npm run db:force-sync:production` bypasses migrations (then `prisma migrate resolve` to re-sync history).
  - **Hyperdrive binding timeout**: Transient Cloudflare error — just re-run
  - **typecheck/test/build**: Code issue — investigate

## Important constraints

- Always confirm before triggering (unless the user's message is already an explicit request)
- Don't push code as part of this workflow — it only triggers the existing workflow
- Don't use the Agent or TodoWrite tools — keep it simple and sequential

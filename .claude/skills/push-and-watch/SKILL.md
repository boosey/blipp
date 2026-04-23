---
name: push-and-watch
description: Commit current session changes, push to remote, and monitor the CI staging build to completion. Use when the user says "push and watch", "ship it", "commit and deploy", "push and monitor", wants to commit + push + watch CI, or any variation of committing work and watching the deploy. Also triggers on /push-and-watch. This is the go-to skill for getting work from local to deployed staging with CI verification.
---

# Push and Watch

Commit the current session's changes, push to remote, and monitor the CI staging build through to completion or failure. No manual steps — everything is automated.

## Why this workflow exists

After finishing work, the developer wants a single command that gets their changes committed, pushed, and deployed to staging with CI monitoring — without babysitting each step. The CI build is triggered automatically by pushing to main; we just need to find and watch the right run.

## The workflow

### Step 0: Pre-flight — schema changes need migrations

**Before committing**, check if `prisma/schema.prisma` is modified relative to `HEAD`:

```bash
git diff --name-only HEAD prisma/schema.prisma
```

If schema.prisma is modified, also check whether a new migration file accompanies it:

```bash
git status --short prisma/migrations/
```

If schema.prisma changed but no new `prisma/migrations/<ts>_<name>/migration.sql` is staged, **stop and tell the user**:

> Schema is modified but no new migration file exists. CI runs `prisma migrate deploy`, which only applies migration files — it will NOT pick up bare schema.prisma edits. The deploy will succeed but the new schema won't reach the database, and code that depends on it will break at runtime.
>
> Run `npm run db:migrate:new <snake_case_name>` to generate the migration, review the SQL, then re-run this skill.

If the user already pushed the schema directly via `npm run db:push:staging:force` (skipping migrations), they need to:
1. Generate the migration anyway: `npm run db:migrate:new <name>`
2. Mark it as already-applied on staging so CI doesn't re-run the SQL: `prisma migrate resolve --applied <migration_name>` against the staging DB
3. Commit the migration file

Otherwise CI will fail with "relation already exists" the first time the migration tries to apply. Skip step 0 if no schema changes.

### Step 1: Commit

Run these in parallel:
- `git status` (never use `-uall`)
- `git diff` (staged + unstaged)
- `git log --oneline -5` (for commit message style)

From the diff, generate a conventional commit message:
- Summarize the nature of the change (feat, fix, chore, docs, refactor, etc.)
- Focus on the "why" not the "what"
- Keep the subject line under 72 characters
- Add a body if the change is non-trivial

Stage specific files (not `git add -A` — avoid secrets/binaries), then commit using a HEREDOC for the message:

```bash
git commit -m "$(cat <<'EOF'
type(scope): subject line

Optional body explaining why.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

If there are no changes to commit, skip straight to Step 2 (there may be unpushed commits).

### Step 2: Push

Always pull --rebase before pushing. The CI staging workflow commits a version bump back to main after every deploy, so the remote will almost always be 1 commit ahead. Rebasing first avoids the rejected-push/retry cycle.

```bash
git pull --rebase origin main && git push origin main
```

If the rebase has conflicts, stop and tell the user — don't force push.

### Step 3: Wait for GitHub to register the CI run

GitHub Actions takes 30-60 seconds to create a new run after a push. If you check immediately, you'll find the *previous* build (already completed) and falsely report success. This has happened repeatedly — it's the single most common failure mode of this workflow.

**The harness blocks standalone `sleep` ≥ 2s. You MUST run the wait via Bash with `run_in_background: true` so the harness notifies you on completion. Do NOT poll, do NOT reason your way out of waiting.**

Run this as a backgrounded Bash call (`run_in_background: true`) and **wait for the completion notification** before doing anything else:

```bash
sleep 30 && gh run list --limit 5 --json databaseId,startedAt,status,event,headBranch --jq '.[] | select(.headBranch=="main" and .event=="push")'
```

Combining the sleep with the first `gh run list` in one backgrounded call gives you both the wait and the first lookup in a single notification — no second round trip needed.

**Do not** run a foreground `gh run list` while the background task is still in flight. The notification's output is the result — use it. Running a foreground duplicate wastes a tool call and the stale background notification will land later as confusing noise.

### Step 4: Find the CI run

IGNORE any run ID from the PostToolUse hook — it references a stale completed run. Find the run yourself:

```bash
gh run list --limit 5 --json databaseId,startedAt,status,event,headBranch --jq '.[] | select(.headBranch=="main" and .event=="push")'
```

Check the `startedAt` timestamp — only use a run that started within the last 90 seconds. If none found, retry by running this in the background (`run_in_background: true`) and waiting for the completion notification:

```bash
sleep 10 && gh run list --limit 5 --json databaseId,startedAt,status,event,headBranch --jq '.[] | select(.headBranch=="main" and .event=="push")'
```

Repeat up to ~6 times. If still nothing after that, tell the user no CI run was detected. Never call `sleep` as a standalone foreground Bash command — the harness blocks it.

**Red flags that you grabbed the wrong run:**
- `status` is already `completed` — a run that finished in under 30 seconds is almost certainly the old one
- `startedAt` is more than 2 minutes ago

### Step 5: Monitor with step-by-step progress

Once you have the correct run ID, poll the run's jobs and steps to show real-time progress. Do NOT use `gh run watch` — instead, poll with `gh run view` so you can display individual step status.

#### 5a: Print the step checklist header

Output a message like:

```
Monitoring CI run #<RUN_ID>...
```

#### 5b: Poll loop

Use a strict 15-second cadence. **Do not expand the interval** no matter how long a CI step takes — a slow `npm test` does not mean you should sleep longer. Always 15s.

**Exact procedure for each cycle — follow this literally:**

1. Launch ONE Bash call with `run_in_background: true`:
   ```bash
   sleep 15 && gh run view <RUN_ID> --json status,conclusion,jobs --jq '{status, conclusion, steps: [.jobs[0].steps[] | "\(.status)\t\(.conclusion)\t\(.name)"]}'
   ```
2. **Stop. Do nothing else until the `<task-notification>` for this background task arrives.** No Read calls, no foreground duplicate, no other tool invocations. The harness will send you the notification when the sleep finishes and the command exits.
3. When the notification arrives, Read the output file it points to. Parse the JSON.
4. Print the updated checklist (see format below).
5. If `status != "completed"`, go back to step 1. Otherwise move to Step 5c.

**Anti-patterns — do not do these (they cause phantom processes and double work):**

- ❌ Reading the output file immediately after launching the background task. It will be empty because the sleep hasn't finished. Reading it does not advance time.
- ❌ Running a foreground `gh run view ...` "just to check" while a background poll is pending. That creates a duplicate and leaves the background orphaned — its late-arriving notification will land in the conversation minutes after the deploy completes as confusing noise.
- ❌ Increasing the sleep duration because CI feels slow. Stay at 15s.
- ❌ Launching a second background poll before the first one's notification arrives.

**One poll in flight at a time.** If the previous background task hasn't completed yet, wait — don't launch another.

After each successful read, print the **full updated checklist** of the CI steps that matter. The deploy-staging workflow has these meaningful steps (skip the internal GitHub "Set up job" / "Complete job" / "Post" steps — only show steps that correspond to real build work):

1. Checkout
2. Setup Node
3. npm ci
4. Prisma generate
5. Create Prisma barrel export
6. Check for schema drift (migrations vs schema.prisma)
7. Apply migrations to staging database
8. Bump patch version
9. Typecheck
10. Tests
11. Build for Staging
12. Deploy to Staging
13. Commit version bump

For each step, show:
- `✅` if completed successfully (`conclusion` is `success`)
- `❌` if failed (`conclusion` is `failure`)
- `⏳` if in progress (`status` is `in_progress`)
- `⬜` if not started yet (`status` is `queued` or not yet present)

Example output during a run:

```
✅ Checkout
✅ Setup Node
✅ npm ci
✅ Prisma generate
✅ Create Prisma barrel export
✅ Check for schema drift (migrations vs schema.prisma)
✅ Apply migrations to staging database
✅ Bump patch version
✅ Typecheck
⏳ Tests
⬜ Build for Staging
⬜ Deploy to Staging
⬜ Commit version bump
```

If the same step stays `⏳` across several polls (e.g. a long test run), that is normal — keep polling at 15s. Do not switch strategies.

#### 5c: Final result

When the run finishes:

- **Success**: Print the final checklist (all ✅) followed by a success message:
  ```
  ✅ CI passed — staging deploy complete.
  ```
- **Failure**: Print the final checklist (showing which step(s) got ❌), then report which step failed and offer to investigate. Common failures:
  - **Check for schema drift**: schema.prisma was edited without generating a migration. Run `npm run db:migrate:new <name>` locally, review the generated SQL, commit + push.
  - **Apply migrations to staging database**: Drift, broken migration SQL, or "relation already exists" if schema was previously force-pushed. Run `npm run db:migrate:status:staging` to investigate. If a migration is broken, fix the SQL and re-push. If staging DB is out of sync with migration history, `prisma migrate resolve --applied <name>` can re-sync.
  - **typecheck/test/build**: Code issue — investigate.

## Important constraints

- Never skip hooks (`--no-verify`) or bypass signing unless the user explicitly asks
- Never force push to main
- If a pre-commit hook fails, fix the issue and create a NEW commit (don't amend)
- Don't run tests, typecheck, or build as part of this workflow — CI handles that
- Don't use the Agent or TodoWrite tools — keep it simple and sequential

---
name: push-and-watch
description: Commit current session changes, push to remote, and monitor the CI staging build to completion. Use when the user says "push and watch", "ship it", "commit and deploy", "push and monitor", wants to commit + push + watch CI, or any variation of committing work and watching the deploy. Also triggers on /push-and-watch. This is the go-to skill for getting work from local to deployed staging with CI verification.
---

# Push and Watch

Commit the current session's changes, push to remote, and monitor the CI staging build through to completion or failure. No manual steps — everything is automated.

## Why this workflow exists

After finishing work, the developer wants a single command that gets their changes committed, pushed, and deployed to staging with CI monitoring — without babysitting each step. The CI build is triggered automatically by pushing to main; we just need to find and watch the right run.

## The workflow

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

**You MUST run this sleep as its own standalone Bash call. Do not skip it, do not combine it with other commands, do not reason your way out of it.**

```bash
sleep 30
```

### Step 4: Find the CI run

IGNORE any run ID from the PostToolUse hook — it references a stale completed run. Find the run yourself:

```bash
gh run list --limit 5 --json databaseId,startedAt,status,event,headBranch --jq '.[] | select(.headBranch=="main" and .event=="push")'
```

Check the `startedAt` timestamp — only use a run that started within the last 90 seconds. If none found, retry every 5 seconds for up to 60 more seconds:

```bash
sleep 5 && gh run list --limit 5 --json databaseId,startedAt,status,event,headBranch --jq '.[] | select(.headBranch=="main" and .event=="push")'
```

If still nothing after ~90 seconds total, tell the user no CI run was detected.

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

Poll every 15 seconds using:

```bash
gh run view <RUN_ID> --json jobs --jq '.jobs[0].steps[] | "\(.status)\t\(.conclusion)\t\(.name)"'
```

After each poll, print the **full updated checklist** of the CI steps that matter. The deploy-staging workflow has these meaningful steps (skip the internal GitHub "Set up job" / "Complete job" / "Post" steps — only show steps that correspond to real build work):

1. Checkout
2. Setup Node
3. npm ci
4. Prisma generate
5. Create Prisma barrel export
6. Push schema to staging database
7. Bump patch version
8. Typecheck
9. Tests
10. Build for Staging
11. Deploy to Staging
12. Commit version bump

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
✅ Push schema to staging database
✅ Bump patch version
✅ Typecheck
⏳ Tests
⬜ Build for Staging
⬜ Deploy to Staging
⬜ Commit version bump
```

Keep polling and reprinting until the overall run status is `completed`. To avoid flooding the chat, use `sleep 15` between polls (run sleep as its own Bash call, same as Step 3).

#### 5c: Final result

When the run finishes:

- **Success**: Print the final checklist (all ✅) followed by a success message:
  ```
  ✅ CI passed — staging deploy complete.
  ```
- **Failure**: Print the final checklist (showing which step(s) got ❌), then report which step failed and offer to investigate.

## Important constraints

- Never skip hooks (`--no-verify`) or bypass signing unless the user explicitly asks
- Never force push to main
- If a pre-commit hook fails, fix the issue and create a NEW commit (don't amend)
- Don't run tests, typecheck, or build as part of this workflow — CI handles that
- Don't use the Agent or TodoWrite tools — keep it simple and sequential

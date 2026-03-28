# Deploy Process

All deployments require explicit board approval via GitHub Environment protection rules.

## Workflow

```
Code change → PR → CI checks → Merge to main → CI runs on main
                                                      ↓
                                        Manual trigger: Deploy Staging
                                        (requires board approval via GitHub Environment)
                                                      ↓
                                        Manual trigger: Deploy Production
                                        (requires board approval via GitHub Environment)
```

## Environments

| Environment | Workflow | Trigger | Approval |
|-------------|----------|---------|----------|
| **Staging** | `deploy-staging.yml` | `workflow_dispatch` (manual) | GitHub Environment `staging` — board reviewer required |
| **Production** | `deploy-production.yml` | `workflow_dispatch` (manual) | GitHub Environment `production` — board reviewer required |

## How to Deploy

### 1. Staging

1. Go to **Actions → Deploy Staging → Run workflow** on the `main` branch.
2. A board member with Environment reviewer access must approve the pending deployment.
3. Once approved, the workflow runs: install → prisma → typecheck → test → build → deploy to Cloudflare Workers (staging).

### 2. Production

1. Go to **Actions → Deploy Production → Run workflow**.
2. The workflow first verifies a recent successful staging deployment exists.
3. A board member must approve the pending deployment via the `production` Environment gate.
4. Once approved: install → prisma → typecheck → test → build → deploy to Cloudflare Workers (production).

## CI (Automatic)

- **On push to `main`**: `ci.yml` runs typecheck + tests (no deploy).
- **On pull request to `main`**: `ci.yml` runs typecheck + tests.

## Branch Protection (Required)

`main` branch should have:
- Require pull request before merging (at least 1 approval)
- Require status checks to pass (CI workflow)

## Prerequisites

A repo admin must configure:
1. GitHub Environments `staging` and `production` with required reviewers (board members)
2. Branch protection rules on `main`

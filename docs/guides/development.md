# Development Guide

Comprehensive guide for setting up, running, and developing the Blipp project locally.

## Prerequisites

- **Node.js 20+** (LTS recommended)
- **npm** -- always use `--legacy-peer-deps` due to Clerk peer dependency conflicts
- **Git**
- Accounts and API keys for: Clerk, Stripe, Neon, Anthropic, OpenAI, Podcast Index

## Initial Setup

### 1. Clone and Install

```bash
git clone https://github.com/boosey/blipp.git
cd blipp
npm install --legacy-peer-deps
```

### 2. Create Environment Files

Two env files at project root (both gitignored):

#### `.dev.vars` (Worker secrets -- used by Wrangler)

```env
# Auth (Clerk)
CLERK_SECRET_KEY=sk_test_...
CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_WEBHOOK_SECRET=whsec_placeholder

# Payments (Stripe sandbox)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_placeholder

# Database (Neon pooled connection string)
DATABASE_URL=postgresql://neondb_owner:PASSWORD@ep-xxxxx-pooler.REGION.aws.neon.tech/neondb?sslmode=require

# AI APIs
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...

# Podcast Index
PODCAST_INDEX_KEY=...
PODCAST_INDEX_SECRET=...
```

#### `.env` (Vite client vars + Prisma CLI)

```env
# Prisma CLI reads this for db push / migrate / studio
DATABASE_URL=postgresql://neondb_owner:PASSWORD@ep-xxxxx-pooler.REGION.aws.neon.tech/neondb?sslmode=require

VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
VITE_APP_URL=http://localhost:5173
```

**Important:** The `.env` `DATABASE_URL` must use the Neon **pooler** endpoint (hostname contains `-pooler`, port 5432, `sslmode=require`). Do not use the direct endpoint.

Webhook secrets (`CLERK_WEBHOOK_SECRET`, `STRIPE_WEBHOOK_SECRET`) use placeholders for local dev since webhooks are not called locally. The app runs fine without them.

### 3. Set Up the Database

```bash
# Generate Prisma client (Cloudflare runtime)
npx prisma generate

# Push schema to Neon (creates all tables)
npx prisma db push

# Seed initial data (plans, etc.)
npx prisma db seed
```

#### Prisma Cloudflare Runtime Quirk

After `npx prisma generate`, you must manually create a barrel export file at `src/generated/prisma/index.ts`. The Cloudflare runtime generator does not produce one automatically. This file is gitignored, so it must be recreated after every fresh clone or `prisma generate`.

You can verify the database setup with Prisma Studio:

```bash
npx prisma studio
```

### 4. Run the Dev Server

```bash
npm run dev
```

This runs `scripts/dev.mjs`, which:
1. Reads `DATABASE_URL` from `.dev.vars`
2. Exports it as `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE`
3. Starts `vite dev` (via the Cloudflare Vite plugin)

The app runs at **http://localhost:8787**. The Worker handles `/api/*` requests, and the Vite SPA serves everything else.

---

## Service Account Setup

If you need to create accounts from scratch, here is what each service provides and where to sign up.

| Service | Purpose | Sign Up | Cost |
|---------|---------|---------|------|
| **Clerk** | Authentication (sign-up, sign-in, sessions) | [dashboard.clerk.com](https://dashboard.clerk.com/sign-up) | Free tier |
| **Neon** | Serverless PostgreSQL | [neon.tech](https://neon.tech) | Free tier (0.5 GB) |
| **Stripe** | Payments and subscriptions | [dashboard.stripe.com](https://dashboard.stripe.com/register) | Free sandbox |
| **Anthropic** | Claude API for distillation | [console.anthropic.com](https://console.anthropic.com/) | $5 min credits |
| **OpenAI** | TTS audio generation | [platform.openai.com](https://platform.openai.com/) | $5 min credits |
| **Podcast Index** | Podcast search and discovery | [api.podcastindex.org](https://api.podcastindex.org/signup) | Free |

### Clerk Setup

1. Create an application named `Blipp`
2. Enable **Email address** and **Google** sign-in
3. Google SSO uses Clerk's shared dev credentials -- no Google Cloud project needed for local dev
4. Copy the **Publishable key** (`pk_test_`) and **Secret key** (`sk_test_`) from Configure > API keys

### Neon Setup

1. Create a project named `blipp` with database `neondb`
2. Copy both the **pooled** (`-pooler` hostname) and **direct** connection strings
3. Use the pooled string in `.dev.vars` and `.env`

### Stripe Setup

1. Create a sandbox named `blipp-dev` (no bank details needed)
2. Copy the sandbox **Secret key** (`sk_test_`) from Developers > API keys
3. Products are not needed for local dev -- billing flows won't work end-to-end without them

### Anthropic / OpenAI Setup

Both require purchasing API credits ($5 minimum). Without credits, API requests fail even with a valid key.

### Podcast Index Setup

Completely free. Sign up and check your email for the API Key and API Secret.

---

## Scripts Reference

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server (Worker + Vite SPA at localhost:8787) |
| `npm run build` | Production build (Vite) |
| `npm test` | Run all tests (Vitest) |
| `npm run test:integration` | Run integration tests |
| `npm run typecheck` | Type check (`tsc --noEmit`) |
| `npm run clean:requests` | Clean BriefingRequest data (uses raw `pg`, not Prisma) |
| `npm run clean:pipeline` | Clean pipeline data (uses raw `pg`) |
| `npm run db:check` | Database health check (uses raw `pg`) |

---

## Running Tests

```bash
# All tests
npm test

# Specific test file
npx vitest run worker/queues/__tests__/feed-refresh.test.ts

# Worker tests (may need memory increase)
NODE_OPTIONS="--max-old-space-size=4096" npx vitest run worker/

# Type checking
npm run typecheck
```

### Test Helpers

Test utilities live in `tests/helpers/mocks.ts`:

- `createMockPrisma()` -- Mock Prisma client with all models
- `createMockEnv()` -- Mock Env bindings (queues, R2, Hyperdrive)
- `createMockContext()` -- Mock Hono context with `executionCtx`

### Vitest v4 Mock Gotcha

`vi.clearAllMocks()` resets `mockResolvedValue` implementations. If you use `clearAllMocks` in `afterEach`, re-set your mocks in `beforeEach`.

---

## Key Development Patterns

### Hono Route Pattern

```typescript
const routes = new Hono<{ Bindings: Env }>();
routes.use("*", requireAuth);
routes.get("/", async (c) => {
  const prisma = createPrismaClient(c.env.HYPERDRIVE);
  try {
    // ... query
    return c.json({ data: result });
  } finally {
    c.executionCtx.waitUntil(prisma.$disconnect());
  }
});
```

### Database Access

Always use `createPrismaClient(env.HYPERDRIVE)` per-request. Always disconnect in a `finally` block via `c.executionCtx.waitUntil(prisma.$disconnect())`. Never share a PrismaClient across requests.

### Queue Handler Pattern

Each queue handler follows this structure:

1. Create PrismaClient from env
2. Iterate over batch messages
3. Process each message in try/catch
4. `msg.ack()` on success, `msg.retry()` on failure
5. Disconnect Prisma in `finally`

### Admin Routes

- Do **not** duplicate `clerkMiddleware()` in admin route files -- it is applied globally in `worker/index.ts`
- Admin routes use the `requireAdmin` middleware from `worker/middleware/admin.ts`
- Admin auth checks the `isAdmin` boolean on the User model

---

## Branch Strategy

| Branch | Purpose |
|--------|---------|
| `main` | Production baseline |
| `moonchild-admin-ui` | Active admin platform + demand-driven pipeline (worktree) |

Feature branches and large redesigns use git worktrees (`.claude/worktrees/`).

---

## Prisma Workflow

### Schema Changes

```bash
# Edit prisma/schema.prisma, then:
npx prisma db push        # Sync schema to Neon (no migration files)
npx prisma generate        # Regenerate client
```

Use `db push` for prototyping. Switch to `prisma migrate dev` when you need migration history.

### Runtime Configuration

The `PlatformConfig` table stores runtime config as key-value pairs. Access via `getConfig(prisma, key, fallback)` from `worker/lib/config.ts` (caches for 60 seconds).

### Cloudflare Runtime

The Prisma schema uses `runtime = "cloudflare"` and the `@prisma/adapter-pg` adapter to connect through Hyperdrive. The generated client output goes to `src/generated/prisma/`.

---

## Deployment

See [environment-setup.md](./environment-setup.md) for full staging and production deployment instructions, including:

- Cloudflare Workers Paid plan setup
- R2 bucket, Queues, and Hyperdrive creation
- Stripe products and webhook configuration
- Clerk production instance
- Google OAuth custom credentials
- Custom domain setup

Quick deploy (assuming infrastructure exists):

```bash
# Set secrets
npx wrangler secret put CLERK_SECRET_KEY
npx wrangler secret put CLERK_PUBLISHABLE_KEY
# ... (all secrets from .dev.vars)

# Deploy
npx wrangler deploy
```

---

## Known Issues and Workarounds

### npm install requires --legacy-peer-deps

Clerk packages have peer dependency conflicts. Always run:

```bash
npm install --legacy-peer-deps
```

### Prisma Cloudflare runtime -- no barrel export

After `npx prisma generate`, manually create `src/generated/prisma/index.ts` re-exporting the generated files. This file is gitignored and must be recreated after fresh clones.

### Neon free tier cold starts

First request after idle takes 5-10 seconds. Neon spins down compute after 5 minutes of inactivity on the free tier.

### OOM running all worker tests

Running the full worker test suite can cause heap allocation failure:

```bash
# Fix: increase Node memory limit
NODE_OPTIONS="--max-old-space-size=4096" npx vitest run worker/

# Or: run tests in smaller batches
npx vitest run worker/queues/__tests__/feed-refresh.test.ts
```

### Tailwind v4 syntax

- `@keyframes` must be placed outside the `@theme` block
- Use `var(--color-*)` instead of `theme()` for color references

### Pre-existing test failures

`src/__tests__/discover.test.tsx` and `src/__tests__/settings.test.tsx` have 2 known failures unrelated to pipeline work. These can be ignored during development.

### Clerk compatibility shim

`src/shims/clerk-load-script.ts` handles a version mismatch between `@clerk/clerk-react` and `@hono/clerk-auth`. See `docs/plans/phase0-decisions.md` for details.

### wrangler.jsonc Hyperdrive placeholder

The config contains `<hyperdrive-config-id>` as a placeholder. Replace with a real Hyperdrive config ID for remote deployment. Local dev works without it (uses `localConnectionString` instead).

# Blipp - Project Instructions

## Quick Reference

### Commands
```bash
npm run dev              # Start dev server (localhost:8787)
npm run build            # Vite production build
npm test                 # Run all tests (vitest)
npm run typecheck        # TypeScript check (tsc --noEmit)
npx prisma generate      # Regenerate Prisma client
npx prisma db push       # Push schema to database
npx prisma db seed       # Seed plans data
npm run clean:requests   # Clean BriefingRequest data
npm run clean:pipeline   # Clean pipeline data
npm run db:check         # Database health check
```

### Install
```bash
npm install --legacy-peer-deps   # ALWAYS use --legacy-peer-deps
```

### Testing
```bash
npx vitest run worker/queues/__tests__/feed-refresh.test.ts  # Single file
NODE_OPTIONS="--max-old-space-size=4096" npx vitest run worker/  # Worker tests (needs memory)
```

## Architecture
- **Runtime**: Cloudflare Workers — single worker with fetch/queue/scheduled handlers
- **API**: Hono v4 framework, routes at `/api/*`
- **DB**: PostgreSQL (Neon) via Prisma 7 + `@prisma/adapter-pg` + Hyperdrive
- **Auth**: Clerk (`clerkMiddleware()` applied globally to `/api/*`)
- **Frontend**: React 19 + Vite 7 + Tailwind v4 + shadcn/ui
- **Queues**: 6 Cloudflare Queues for pipeline processing
- **Storage**: R2 for audio clips, briefings, work products

## Key Conventions

### Hono Route Pattern
```typescript
const routes = new Hono<{ Bindings: Env }>();
routes.get("/", async (c) => {
  const prisma = createPrismaClient(c.env.HYPERDRIVE);
  try {
    return c.json({ data: result });
  } finally {
    c.executionCtx.waitUntil(prisma.$disconnect());
  }
});
```
Always create PrismaClient per-request, always disconnect in `finally`.

### Queue Handler Pattern
Iterate batch messages, try/catch each, `msg.ack()` on success, `msg.retry()` on failure.

### Admin Routes
All at `/api/admin/*`. Use `requireAdmin` middleware (checks `User.isAdmin`). Do NOT add `clerkMiddleware()` — it's global.

### Test Pattern
Use factories from `tests/helpers/mocks.ts`: `createMockPrisma()`, `createMockEnv()`, `createMockContext()`.

## File Structure
```
worker/           — Backend (Hono API + queue handlers)
  index.ts        — Entry point
  types.ts        — Env type
  routes/         — API routes (public + admin/)
  queues/         — 6 queue consumers + orchestrator
  middleware/     — auth.ts, admin.ts
  lib/            — Shared utilities (db, config, tts, etc.)
src/              — Frontend (React SPA)
  pages/          — User pages + admin/ pages
  layouts/        — AppLayout, AdminLayout
  components/     — Shared components
  lib/            — API client, admin-api hook
prisma/           — Schema + seed
docs/             — Architecture, pipeline, API ref, data model, guides
```

## Common Pitfalls
- **npm install**: Always `--legacy-peer-deps`
- **Prisma generate**: Must manually create `src/generated/prisma/index.ts` barrel export (gitignored)
- **DATABASE_URL**: Use Neon pooler endpoint (port 5432, `sslmode=require`)
- **Tailwind v4**: `@keyframes` outside `@theme` block; `var(--color-*)` not `theme()`
- **Tests OOM**: Run worker tests in batches or with `--max-old-space-size=4096`
- **Vitest v4**: `vi.clearAllMocks()` clears `mockResolvedValue`; re-set mocks in `beforeEach`
- **Clerk middleware**: Applied once globally — don't duplicate in route files

## Documentation
See `docs/` for comprehensive docs:
- `docs/architecture.md` — System architecture
- `docs/pipeline.md` — Pipeline design
- `docs/admin-platform.md` — Admin platform
- `docs/api-reference.md` — API reference
- `docs/data-model.md` — Data model
- `docs/guides/development.md` — Development guide
- `docs/guides/environment-setup.md` — Service account setup

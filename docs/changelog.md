# Changelog

## 0.8.41 — 0.8.52 (Mar 18–21, 2026)

118 commits across 12 version bumps.

### Voice Presets
- Per-provider voice configuration (OpenAI, Groq, Cloudflare Workers AI)
- Plan-gated access — system default always available, premium voices restricted by plan
- User-selectable default voice in settings
- Admin management page for creating/editing presets

### Feed & Discover
- Netflix-style Discover page with curated rows, episode/podcast tabs
- Episode recommendations on Home page powered by the new rec engine
- Collapsible curated rows with "Play All" queue functionality
- Blipp status indicators on episode cards (ready, processing, etc.)
- Share button on feed items — uses briefing ID so recipients can play shared content
- Infinite scroll + carousel chevrons on Discover
- Swipe-to-dismiss on player sheet, close button on podcast modal for desktop
- Tap podcast artwork in mini-player to open detail sheet
- Episode votes (thumbs up/down) on feed items and podcast cards
- Creating sweep glow behind new feed items
- Diversified curated rows (max 2 episodes per podcast) and browse list (max 3 per page)
- Load More button as fallback for desktop infinite scroll

### Recommendation Engine
- Topic extraction module using LLM analysis
- Embeddings generation via Cloudflare Workers AI
- Topic Jaccard + embedding cosine similarity scoring at episode level
- Curated recommendation row generation with diversity controls
- Vote, overlap, and dismissal signals integrated into scoring
- Admin pages: Settings, Embeddings, Topics tabs for monitoring and config
- Episode browse API with pagination

### Admin — Prompt Management
- Full CRUD prompt editor with reset-to-default
- Prompt versioning with version history, activate, and notes
- Change description input on each version save
- Stage-level grouped versioning — all prompts in a stage (e.g., narrative) saved as one atomic version

### Admin — Stage Configuration
- Unified page combining model selection and prompt editing per pipeline stage
- 3-tier model fallback (primary/secondary/tertiary) with stage enable/disable toggle

### Admin — Catalog Seed
- Real-time progress monitor with per-stage tracking (discover, upsert, feed refresh, prefetch)
- Pause/cancel/resume with cooperative queue consumer checks
- Confirmation dialogs for destructive actions
- Pagination on seed job accordions
- R2 audio cleanup on reseed
- Additive seed mode (add new podcasts without removing existing)
- Configurable podcast discover count via system config

### Claims Benchmark
- Schema for benchmark experiments with configurable parameters
- Two-phase benchmark runner (extraction + comparison)
- LLM-as-judge scoring module with multi-criteria evaluation
- Admin page for running benchmarks and viewing results

### Validation & Observability
- Zod request validation on 15+ API endpoints (me, podcasts, briefings, billing, ads)
- Sentry integration with `withSentry` wrapper for error tracking
- Anthropic prompt caching (`cache_control`) on system messages to reduce LLM costs

### UX Polish
- Light/dark/system theme switching with persistent preference
- Feed filters, grouping, and sort controls
- Settings page overhaul
- Subscription management improvements (detail page actions, removed 3-dot menu)
- Compact player layout, mini-player visibility fixes
- Mobile fixes: overflow, bottom nav active state, symmetric padding
- Skip onboarding for shared play links
- Strip HTML tags from podcast descriptions

### Infrastructure
- **Automated schema deploys** — CI runs `prisma db push` before `wrangler deploy` in both staging and production. Breaking changes fail with clear instructions.
- Devcontainer for GitHub Codespaces with web terminal (ttyd)
- iOS Capacitor Clerk proxy for native CORS
- Production deployment guide restructured into 12-phase walkthrough
- Force push scripts (`db:push:staging:force`, `db:push:production:force`) for breaking schema changes

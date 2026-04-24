# External Services Inventory

Flat list of every third-party service Blipp depends on, with login URL, account email, password-manager vault entry name, and rotation cadence. No secrets live in this file — it's an index that points at the vault.

**Conventions:**
- `Vault entry`: the exact name of the entry in the shared password manager. If it doesn't exist yet, create it and record the name here.
- `Account email`: which email is the billing / admin identity for that account.
- `Rotation`: how often we rotate the credential, or "N/A" if the credential is a verified domain / static identifier.
- `Used by`: which part of the system breaks if the credential is revoked.

**When a service is retired, do not delete its row — move it to the "Retired" table at the bottom with the retirement date. Retired vault entries should be archived, not deleted, until credentials have been rotated out of any possible caches.**

**Morning review todo (2026-04-24):** Boose to walk through every row and confirm vault entry names. Several API keys across these services are known to be invalid; audit and rotate as part of this pass.

---

## Infrastructure

| Service | Login URL | Account email | Vault entry | Rotation | Used by |
|---------|-----------|---------------|-------------|----------|---------|
| Cloudflare | https://dash.cloudflare.com | TBD | _TBD_ | 90d for API tokens | Worker hosting, R2, Queues, KV, Hyperdrive, AI, DNS |
| Neon | https://console.neon.com | TBD | _TBD_ | 90d for API keys | Postgres (staging + production branches) |
| GitHub | https://github.com/boosey/blipp | TBD | _TBD_ | PATs: 90d | Source, Actions CI/CD, `GITHUB_TOKEN` for Apple catalog refresh |
| Anthropic | https://console.anthropic.com | TBD | _TBD_ | 90d | Distillation + narrative LLMs |
| OpenAI | https://platform.openai.com | TBD | _TBD_ | 90d | TTS, fallback STT |
| Groq | https://console.groq.com | TBD | _TBD_ | 90d (optional) | Fast STT fallback |
| Deepgram | https://console.deepgram.com | TBD | _TBD_ | 90d (optional) | Nova STT fallback |
| Podcast Index | https://api.podcastindex.org | TBD | _TBD_ | Indefinite (regenerable) | Catalog + feed refresh |

## Auth & Billing

| Service | Login URL | Account email | Vault entry | Rotation | Used by |
|---------|-----------|---------------|-------------|----------|---------|
| Clerk | https://dashboard.clerk.com | TBD | _TBD_ | Keys regenerable | Auth (dev + prod instances) |
| Stripe | https://dashboard.stripe.com | TBD | _TBD_ | Restricted keys: 90d | Web/desktop subscriptions, customer portal |
| RevenueCat | https://app.revenuecat.com | TBD | _TBD_ | 90d for REST v2 key | iOS IAP subscriptions, entitlement sync |

## Email (split between Zoho Mail and ZeptoMail — different products, same company)

| Service | Login URL | Account email | Vault entry | Rotation | Used by |
|---------|-----------|---------------|-------------|----------|---------|
| Zoho Mail | https://mail.zoho.com | TBD | _TBD_ (one per mailbox) | Mailbox passwords: 180d | `welcome@`, `support@`, `boose@` mailboxes |
| ZeptoMail | https://www.zoho.com/zeptomail | TBD | _TBD_ | 90d for Send Mail token | Welcome email via `WELCOME_EMAIL_QUEUE` |

## Mobile

| Service | Login URL | Account email | Vault entry | Rotation | Used by |
|---------|-----------|---------------|-------------|----------|---------|
| Apple Developer | https://developer.apple.com/account | TBD | _TBD_ | $99/yr renewal; app-specific passwords 180d | iOS app signing, TestFlight, App Store Connect |
| App Store Connect | https://appstoreconnect.apple.com | TBD | _TBD_ | IAP shared secret: rotate on request | iOS app listing, IAP config, TestFlight |

## Marketing & Analytics

| Service | Login URL | Account email | Vault entry | Rotation | Used by |
|---------|-----------|---------------|-------------|----------|---------|
| Google Analytics 4 | https://analytics.google.com | TBD | _TBD_ | N/A (tag ID: `G-TK6ES8S96S`) | Web traffic, funnel analytics |
| Google Ads | https://ads.google.com | TBD | _TBD_ | N/A (conversion ID: `AW-18076796933`) | Paid acquisition, conversion tracking |
| Buffer | https://buffer.com | TBD | _TBD_ | Reauth as needed | Social post scheduling |
| Google Cloud (OAuth) | https://console.cloud.google.com | TBD | _TBD_ | Client secret: 180d | Google SSO in Clerk production |

> GA4 and Google Ads tags live in `docs/Marketing/Google Analytics/Tag.txt` and `docs/Marketing/Google Ads/Google tag.txt`. They are **not yet injected into the deployed app's `index.html`** — this is tracked as a pre-launch task. If/when injected, update this table with the injection location.

## Helper App / Agent API Keys

Keys used by local tooling, MCPs, agents, and helper scripts — not the Worker itself. Several are known to be stale; this table is the morning-review anchor.

| Key / Service | Purpose | Vault entry | Validity | Notes |
|---------------|---------|-------------|----------|-------|
| Claude Code MCP — admin | Calls `/api/admin/*` from MCP | _TBD_ | Unknown — audit | Rotates via admin UI |
| Claude Code MCP — db-query | Read-only Neon query for skill | _TBD_ | Unknown — audit | Should be a role with `SELECT` only |
| Claude Cowork agents | (none yet) | — | — | Candidates in runbook Cron Jobs Reference |
| Cloudflare wrangler CLI | Local deploys | _TBD_ | Rotate if machine changes | Separate from `CF_API_TOKEN` admin-UI token |
| Browser extension / "Claude for Chrome" history sweep | One-off discovery of forgotten services | — | Manual task for 2026-04-24 | Cannot be automated from inside this repo |

---

## Retired

_(move rows here with a retirement date when a service is no longer used — do not delete)_

| Service | Retired on | Notes |
|---------|-----------|-------|

---

## Change Log

- 2026-04-24 — Initial inventory created as part of launch-readiness runbook pass.

# RevenueCat Setup Guide

Setup runbook for the iOS In-App Purchase side of Blipp's hybrid billing system. The web app uses Stripe; the iOS app uses Apple IAP brokered through RevenueCat. Both feed the same `BillingSubscription` table and entitlement is recomputed from the union.

> **Architecture:** see `docs/architecture.md` for the full hybrid billing flow. This guide is the ops-side checklist.

---

## Prerequisites

- Apple Developer Program account (paid, $99/year)
- App Store Connect access for the Blipp app record
- RevenueCat account (free tier is fine)
- Admin access to the Blipp app at `/admin/service-keys` and `/admin/plans`

---

## 1. App Store Connect — Subscription Products

For each Blipp plan that should be purchasable on iOS, create one subscription product per billing interval.

1. Sign in to [App Store Connect](https://appstoreconnect.apple.com/)
2. **My Apps → Blipp → Subscriptions**
3. Create a **Subscription Group** (e.g. "Blipp Pro") — Apple groups subscriptions so users can move between tiers within a group
4. Add a **Subscription** for each (plan, interval) pair you want to sell:

   | Field | Example |
   |---|---|
   | Reference Name | `Pro Monthly` |
   | Product ID | `com.blipp.app.pro.monthly` |
   | Subscription Duration | `1 month` |
   | Price | match the web price (Apple takes 30% — price accordingly) |

5. Repeat for annual: `com.blipp.app.pro.annual`, `1 year`
6. Fill in localizations and review screenshots (Apple requires these before the products go live). Sandbox testing works without review.
7. Note the **App-Specific Shared Secret** (App Information → App-Specific Shared Secret) — RevenueCat needs this to validate receipts.

---

## 2. RevenueCat — Project Setup

1. Sign in to [RevenueCat](https://app.revenuecat.com/)
2. In the **Projects** dropdown at the top of the dashboard, click **+ Create new project** and name it **Blipp** (or per-environment: `Blipp Staging`, `Blipp Production`). New projects ship with a **Test Store** by default — you can ignore it; we're adding a real App Store app next.
3. **Project settings → Apps & providers → + New app → App Store**
   - Bundle ID: `com.blipp.app`
   - App-Specific Shared Secret: paste from step 1.7
   - Save the app, then open it and go to the **In-app purchase key configuration** tab:
     - Upload the `.p8` generated at App Store Connect → **Users and Access → Integrations → In-App Purchase** (click *Generate In-App Purchase Key* — the `.p8` is a one-shot download, save it somewhere safe). Required for StoreKit 2 / Purchases v5+; without it, transactions silently fail to record.
     - Paste the **Issuer ID** shown at the top of that same App Store Connect page. If you don't see an Issuer ID there, create any App Store Connect API key on the adjacent tab and the Issuer ID will appear (it's shared across both key types).
     - Click **Save changes**.
4. **Products** → import the products you created in App Store Connect (RevenueCat auto-discovers them once the IAP key is uploaded)
5. **Entitlements → + New** → name it `pro` (one entitlement per access tier — most setups need just one)
6. **Offerings → Default** → attach the products as packages:
   - `$rc_monthly` → `com.blipp.app.pro.monthly`
   - `$rc_annual` → `com.blipp.app.pro.annual`
7. **API keys** → copy the **Apple SDK key** (`appl_...`) — this is the *public* key the mobile app uses

---

## 3. RevenueCat — Server Webhook

RevenueCat is the source of truth for subscription state. Configure it to fire on every event so the Blipp worker can update `BillingSubscription` rows.

1. **Project settings → Integrations → + New → Webhooks**
2. Configure:
   - **URL (staging):** `https://api-staging.podblipp.com/api/webhooks/revenuecat`
   - **URL (production):** `https://api.podblipp.com/api/webhooks/revenuecat`
   - **Authorization header:** generate a random 32-byte secret (e.g. `openssl rand -hex 32`). Store it — you'll paste it into Blipp admin in step 5
   - **Environment:** set staging RC project to send sandbox events, production to send production
3. Save
4. **API → REST API v2** → copy the REST API key (`sk_...`) — this is the *secret* key the worker uses to verify purchases server-side

---

## 4. Blipp Admin — Wire the Plan Product IDs

For each Blipp plan that maps to iOS products:

1. In Blipp admin, go to **Plans → Edit** the plan
2. Fill in:
   - **Apple Monthly Product ID:** `com.blipp.app.pro.monthly`
   - **Apple Annual Product ID:** `com.blipp.app.pro.annual`
3. Save

The `/api/plans` endpoint will now return these IDs alongside the Stripe price IDs, and the iOS client will use them to call StoreKit.

---

## 5. Blipp Admin — Service Keys

Paste both RevenueCat secrets into Blipp's service key registry:

1. Go to **Admin → Service Keys**
2. **Billing group → RevenueCat Webhook Secret** (`billing.revenuecat-webhook`)
   → paste the random secret from step 3.2
3. **Billing group → RevenueCat REST API** (`billing.revenuecat-rest`)
   → paste the REST API key (`sk_...`) from step 3.4
4. Repeat for both staging and production environments

---

## 6. Mobile Client — Build-Time Config

The iOS app needs the **Apple SDK key** at build time (it's public, but tied to the RC project).

1. Add to your `.env` (and the production env in CI):
   ```
   VITE_REVENUECAT_APPLE_API_KEY=appl_xxxxxxxxxxxxxxxxx
   ```
2. Rebuild the iOS bundle: `npm run build && npx cap sync ios`

---

## 7. Sandbox Testing

1. **App Store Connect → Users and Access → Sandbox Testers** → create a test account (use an email that is NOT linked to a real Apple ID)
2. On the test device: **Settings → App Store → Sandbox Account** → sign in with the test user
3. Launch Blipp from Xcode (sideloaded, not TestFlight)
4. Tap an upgrade button on the pricing page → StoreKit sheet appears with sandbox pricing
5. Confirm purchase → toast says "Subscription activated"
6. Verify in Blipp admin:
   - Database has a `BillingSubscription` row with `source=APPLE`, `status=ACTIVE`
   - The user's `planId` was recomputed
7. Check the worker logs for `revenuecat_webhook_received` entries — RC fires both `INITIAL_PURCHASE` (immediate) and a `RENEWAL` once the sandbox subscription auto-renews (sandbox renews every few minutes)

### Test the Restore flow

1. Delete the app, reinstall, sign in as the same Clerk user
2. Pricing page → tap **Restore purchases**
3. Confirm the entitlement comes back without re-charging

---

## 8. Production Cutover Checklist

- [ ] Production RC project created and pointing to App Store Connect production
- [ ] Production webhook configured with a *different* secret than staging
- [ ] Production service keys pasted into production admin
- [ ] Plans on production DB have `appleProductId*` values matching the live App Store Connect product IDs
- [ ] App Store Connect subscription products are **Approved** (not just "Ready to Submit") — Apple reviews them separately from the app binary
- [ ] iOS build has the production `VITE_REVENUECAT_APPLE_API_KEY` baked in
- [ ] App binary submitted to App Store Review with a sandbox tester credentials in the review notes (Apple reviewers must be able to test the IAP flow)

---

## Common Issues

**"Purchase not found on RevenueCat subscriber"** (from `POST /api/iap/link`)
The client's StoreKit purchase succeeded but RC hasn't synced yet. The webhook is authoritative — recomputeEntitlement will catch up on the next event. Safe to ignore unless reproducible.

**Webhook returns 401**
Authorization header mismatch. Confirm the secret in Blipp admin (`billing.revenuecat-webhook`) exactly matches the one in the RC dashboard webhook config. RC sends it raw OR as `Bearer <secret>` — both are accepted.

**Sandbox events ignored in production**
Intentional. The webhook handler skips `environment=SANDBOX` events when the worker is the production deployment, to keep test purchases out of the production billing table. Use the staging RC project + staging worker for sandbox testing.

**No products show in the StoreKit sheet**
Three usual causes, in order of likelihood:
1. The product is not yet in "Ready to Submit" or "Approved" state in App Store Connect
2. The bundle ID in Xcode doesn't match the App Store Connect record
3. The sandbox tester is signed into a different App Store country than the products are configured for

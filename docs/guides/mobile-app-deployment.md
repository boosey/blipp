# Mobile App Deployment Guide

Complete step-by-step guide for building and deploying Blipp as a native iOS app via Capacitor, and optionally adding Android support.

---

## Table of Contents

1. [Prerequisites & Critical Constraints](#1-prerequisites--critical-constraints)
2. [Option A: Personal Device Testing (Free, No Apple Account)](#2-option-a-personal-device-testing-free-no-apple-account)
3. [Option B: TestFlight Beta Distribution](#3-option-b-testflight-beta-distribution)
4. [Option C: App Store Public Release](#4-option-c-app-store-public-release)
5. [Apple Developer Account Setup](#5-apple-developer-account-setup)
6. [Building the iOS App](#6-building-the-ios-app)
7. [Configuring Signing & Capabilities in Xcode](#7-configuring-signing--capabilities-in-xcode)
8. [Installing on Your iPhone (Development)](#8-installing-on-your-iphone-development)
9. [TestFlight Distribution](#9-testflight-distribution)
10. [App Store Submission](#10-app-store-submission)
11. [Adding Android Support](#11-adding-android-support)
12. [Ongoing Maintenance](#12-ongoing-maintenance)
13. [Troubleshooting](#13-troubleshooting)

---

## 1. Prerequisites & Critical Constraints

### You Need a Mac

**This is non-negotiable for iOS.** Apple requires Xcode, which only runs on macOS. Your options:

| Option | Cost | Notes |
|--------|------|-------|
| **Mac hardware** (Mac Mini, MacBook, etc.) | $599+ | Most reliable. Mac Mini M2 is the cheapest option. |
| **macOS VM** (via UTM on Apple Silicon, or cloud) | Free–$50/mo | Apple's EULA requires Apple hardware for macOS VMs. |
| **Cloud Mac service** (MacStadium, AWS EC2 Mac) | $30–90/mo | Remote Mac you SSH/VNC into. |
| **GitHub Actions macOS runner** | Free (2000 min/mo) | For CI/CD builds only, not interactive Xcode work. |
| **Borrow a Mac** | Free | Just need it for the build + deploy steps. |

**Recommendation for getting started:** Borrow a Mac or use a cloud Mac service for the initial setup. Once you have signing configured, you can automate builds with GitHub Actions.

### Software Requirements (on the Mac)

- **Xcode 15+** — Download from the Mac App Store (free, ~12 GB)
- **Xcode Command Line Tools** — Run: `xcode-select --install`
- **Node.js 18+** — Same version you use for development
- **CocoaPods** (may not be needed since project uses SPM, but good to have): `sudo gem install cocoapods`

### Decide Your Distribution Path

| Path | Cost | Apple Account Needed | Time to Install | Audience |
|------|------|---------------------|-----------------|----------|
| **Personal device (free provisioning)** | Free | Free Apple ID | Minutes | Just you, 1 device |
| **Ad Hoc (direct install)** | $99/year | Apple Developer Program | Hours (first time) | Up to 100 registered devices |
| **TestFlight** | $99/year | Apple Developer Program | 1–2 days (first review) | Up to 10,000 testers |
| **App Store** | $99/year | Apple Developer Program | 1–7 days (review) | Public |

---

## 2. Option A: Personal Device Testing (Free, No Apple Account)

This is the fastest path to get Blipp on YOUR iPhone. No cost, no approvals.

**Limitations:**
- App expires after **7 days** (must reinstall)
- Only **3 apps** can be sideloaded at a time
- Only works on devices physically connected to the Mac
- Cannot use push notifications or some entitlements
- Cannot distribute to others

If these limits are fine for personal use, skip to [Section 6: Building the iOS App](#6-building-the-ios-app) — you just need a free Apple ID.

---

## 3. Option B: TestFlight Beta Distribution

Best for sharing with friends, testers, or a small audience before going public.

**What you get:**
- Install via TestFlight app (no cable needed)
- Up to 10,000 external testers
- Builds expire after 90 days
- Apple does a lightweight review (usually 24–48 hours for first build)

**Required:** Apple Developer Program ($99/year). See [Section 5](#5-apple-developer-account-setup).

---

## 4. Option C: App Store Public Release

Full public release. Requires the most preparation.

**Additional requirements beyond TestFlight:**
- App Store listing (screenshots, description, keywords, etc.)
- Privacy policy URL (required by Apple)
- App review (1–7 days, can be rejected)
- App icons in all required sizes (Capacitor handles this with one 1024x1024 image)
- Must comply with App Store Review Guidelines

---

## 5. Apple Developer Account Setup

### Step 1: Create an Apple ID (if you don't have one)

1. Go to https://appleid.apple.com
2. Click "Create Your Apple ID"
3. Use a real email — this becomes your developer identity
4. Enable **two-factor authentication** (required for developer accounts)

### Step 2: Enroll in the Apple Developer Program

> Skip this step if you're only doing free personal device testing (Option A).

1. Go to https://developer.apple.com/programs/enroll/
2. Sign in with your Apple ID
3. Choose **Individual** enrollment (vs. Organization)
   - Individual: Just your name. Simpler, faster.
   - Organization: Requires a D-U-N-S number (takes 1–2 weeks to get). Use this if you want "PodBlipp LLC" or similar as the publisher name.
4. Pay the **$99/year** fee
5. Wait for Apple to process enrollment — **usually 24–48 hours**, sometimes up to a week

### Step 3: Accept Agreements

Once enrolled:
1. Log in at https://developer.apple.com
2. Go to **Account** > **Agreements, Tax, and Banking**
3. Accept the **Apple Developer Agreement**
4. If you plan to sell the app or use in-app purchases, complete the **Paid Apps** agreement (requires bank account + tax info)

### Step 4: Register Your App ID

1. Go to https://developer.apple.com/account/resources/identifiers/list
2. Click **+** to register a new identifier
3. Select **App IDs** > **App**
4. Enter:
   - **Description:** Blipp
   - **Bundle ID:** Select "Explicit" and enter `com.blipp.app`
5. Under **Capabilities**, enable what you need:
   - **Associated Domains** (if using universal links)
   - **Push Notifications** (if adding later)
   - Leave others off unless needed
6. Click **Continue** > **Register**

### Step 5: Create a Provisioning Profile (for Ad Hoc / App Store)

> For free personal testing with automatic signing, Xcode handles this — skip this step.

**For TestFlight / App Store:**
1. Go to https://developer.apple.com/account/resources/profiles/list
2. Click **+**
3. Select **App Store Connect** (for TestFlight + App Store)
4. Select your App ID (`com.blipp.app`)
5. Select your **Distribution Certificate** (create one if prompted — Xcode can do this automatically)
6. Name it (e.g., "Blipp App Store")
7. Download and double-click to install

---

## 6. Building the iOS App

These steps happen on the Mac.

### Step 1: Clone and Install Dependencies

```bash
git clone https://github.com/PodBlipp/blipp.git
cd blipp
npm install --legacy-peer-deps
```

### Step 2: Set Up Environment Files

The Vite build only needs **one** env var: `VITE_CLERK_PUBLISHABLE_KEY`. No backend env files (`.dev.vars`, `DATABASE_URL`, etc.) are needed — the native app talks to `https://podblipp.com` at runtime (see `src/lib/api-base.ts`).

Copy **one** of these to the Mac:
- **`.env.production`** — contains the production Clerk key (`pk_live_...`). Vite reads this automatically during `npm run build`.
- **`.env`** — contains the test/dev Clerk key (`pk_test_...`). Use this if you want to test against your dev Clerk instance.

That's it. No other files are needed for the build.

### Step 3: Generate Prisma Client

The Prisma generated client is gitignored, so you must generate it locally:

```bash
npx prisma generate
echo 'export * from "./client";' > src/generated/prisma/index.ts
```

The barrel export (`index.ts`) isn't auto-created by Prisma — without it, the build fails with "cannot resolve generated/prisma".

### Step 4: Build the Web App

```bash
npm run build
```

This outputs to `dist/client/` — the directory Capacitor is configured to serve.

### Step 5: Sync to iOS

```bash
npx cap sync ios
```

This:
- Copies `dist/client/` into the iOS project's `public/` folder
- Resolves any Capacitor plugin dependencies
- Updates the native project configuration

### Step 6: Open in Xcode

```bash
npx cap open ios
```

This opens `ios/App/App.xcodeproj` in Xcode.

---

## 7. Configuring Signing & Capabilities in Xcode

### For Free Personal Testing

1. In Xcode, select the **App** target in the left sidebar
2. Go to the **Signing & Capabilities** tab
3. Check **Automatically manage signing**
4. Under **Team**, select your Apple ID
   - If not listed: Xcode menu > **Settings** > **Accounts** > **+** > sign in with your Apple ID
5. Xcode will auto-create a provisioning profile. The **Bundle Identifier** should already be `com.blipp.app`
   - If you see an error about the bundle ID being taken (because someone else registered it on the App Store), change it temporarily to something unique like `com.yourname.blipp`

### For Developer Program (TestFlight / App Store)

1. Same steps as above, but select your **paid Developer Team** instead of personal team
2. Ensure the Bundle Identifier matches your registered App ID: `com.blipp.app`
3. Xcode will manage certificates and provisioning profiles automatically

---

## 8. Installing on Your iPhone (Development)

### Step 1: Connect Your iPhone

1. Plug your iPhone into the Mac via USB/USB-C cable
2. On your iPhone: **Trust This Computer** when prompted
3. On your iPhone: Go to **Settings > Privacy & Security > Developer Mode** and enable it (iOS 16+)
   - Your phone will restart

### Step 2: Select Your Device in Xcode

1. In Xcode's toolbar, click the device dropdown (next to the scheme name "App")
2. Select your iPhone from the list
   - If it says "Unavailable", wait — Xcode is processing the device's symbols (can take several minutes the first time)

### Step 3: Build and Run

1. Click the **Play** button (or `Cmd + R`)
2. First build takes a few minutes (resolving SPM packages, compiling)
3. If you see **"Could not launch App"** with a trust error:
   - On your iPhone: **Settings > General > VPN & Device Management**
   - Find your developer certificate and tap **Trust**
   - Try building again
4. Blipp should launch on your phone!

### What to Verify

- App loads and shows the login screen
- Clerk authentication works (login/signup)
- API calls reach `https://podblipp.com` successfully
- Audio playback works
- Safe area insets look correct (no content under the notch/Dynamic Island)

---

## 9. TestFlight Distribution

### Step 1: Create an App in App Store Connect

1. Go to https://appstoreconnect.apple.com
2. Click **My Apps** > **+** > **New App**
3. Fill in:
   - **Platform:** iOS
   - **Name:** Blipp (must be unique on the App Store — if taken, try "Blipp - Podcast Briefings")
   - **Primary Language:** English (U.S.)
   - **Bundle ID:** Select `com.blipp.app` from dropdown
   - **SKU:** `com.blipp.app` (any unique string)
   - **User Access:** Full Access
4. Click **Create**

### Step 2: Archive the App in Xcode

1. In Xcode, set the device to **Any iOS Device (arm64)** (not a simulator or specific device)
2. Go to **Product > Archive**
3. Wait for the archive to build (a few minutes)
4. The **Organizer** window opens when done

### Step 3: Upload to App Store Connect

1. In the Organizer, select your archive
2. Click **Distribute App**
3. Select **App Store Connect** > **Upload**
4. Follow the prompts:
   - **App Store Connect distribution options:** Leave defaults (strip Swift symbols, upload symbols)
   - **Signing:** Automatic (let Xcode handle it)
5. Click **Upload**
6. Wait for processing (5–30 minutes; you'll get an email when ready)

### Step 4: Set Up TestFlight

1. Back in App Store Connect, go to your app > **TestFlight** tab
2. The build should appear (status: "Processing" then "Ready to Submit" or "Approved")

**Internal Testing (immediate, no review):**
1. Under **Internal Group**, add yourself and up to 100 internal testers (must be App Store Connect users)
2. Testers get an email invite to install via the TestFlight app

**External Testing (requires review):**
1. Click **+** next to "External Groups" to create a group
2. Add the build to the group
3. Fill in:
   - **What to Test:** Brief description for testers
   - **Contact info and privacy policy URL**
4. Submit for **Beta App Review** (usually approved within 24–48 hours)
5. Once approved, add testers by email — they get an invite to install via TestFlight

### Step 5: Installing via TestFlight

Testers (including you) do this:
1. Install the **TestFlight** app from the App Store (free)
2. Open the invite email on the iPhone and tap **View in TestFlight**
3. Tap **Install**
4. Blipp is now on the home screen

---

## 10. App Store Submission

### Step 1: Prepare App Store Listing

In App Store Connect, go to your app's **App Information** and **Prepare for Submission** sections. You'll need:

| Field | What to Provide |
|-------|----------------|
| **App Name** | Blipp (or "Blipp - Podcast Briefings") |
| **Subtitle** | Your podcasts, distilled to fit your time |
| **Category** | News or Entertainment |
| **Description** | 1–2 paragraphs about what Blipp does |
| **Keywords** | podcast, briefing, summary, audio, news, short |
| **Support URL** | A webpage or GitHub link |
| **Privacy Policy URL** | **Required.** A hosted privacy policy page. |
| **Screenshots** | At least 3 screenshots for iPhone 6.7" and 6.5" (see below) |
| **App Icon** | Auto-uploaded from your binary |
| **Age Rating** | Fill out the questionnaire (likely 4+ or 12+) |

### Step 2: Take Screenshots

You need screenshots for at least these device sizes:
- **6.7" Display** (iPhone 15 Pro Max) — required
- **6.5" Display** (iPhone 11 Pro Max) — required

**Easy way:** Run on the iOS Simulator in Xcode at these sizes, then use `Cmd + S` to save screenshots.

**Sizes (in pixels):**
- 6.7": 1290 x 2796
- 6.5": 1284 x 2778

You need 3–10 screenshots per size.

### Step 3: Privacy Policy

Apple requires a privacy policy URL. At minimum, create a page that covers:
- What data you collect (email via Clerk, listening history, podcast preferences)
- How you use it (personalization, not sold to third parties)
- Data retention and deletion (user can delete account)
- Contact information

Host it at something like `https://podblipp.com/privacy` or a simple GitHub Pages site.

### Step 4: Submit for Review

1. In App Store Connect, go to your app version
2. Under **Build**, click **+** and select your uploaded build
3. Fill in all required fields (version info, contact info, review notes)
4. Under **App Review Information**, provide:
   - **Demo account:** If login is required, provide test credentials for the reviewer
   - **Notes:** Explain what the app does and how to test it
5. Click **Submit for Review**

### Step 5: App Review

- **Timeline:** 1–7 days (most apps reviewed within 24–48 hours)
- **Common rejection reasons:**
  - Missing privacy policy
  - Broken login/signup flow
  - Crashes or blank screens
  - Incomplete or placeholder content
  - Missing demo account credentials
  - In-app purchases not using Apple's IAP system (if you have Stripe subscriptions visible in the app, this is a risk — see Troubleshooting)
- If rejected, you'll get specific feedback. Fix and resubmit.

### Step 6: Release

Once approved, you can:
- **Release immediately**
- **Release on a specific date**
- **Manually release** when you're ready

---

## 11. Adding Android Support

The Capacitor code is iOS-only right now. To add Android:

### Step 1: Install the Android Platform

```bash
npm install @capacitor/android --legacy-peer-deps
npx cap add android
```

This creates the `android/` directory with a full Android Studio project.

### Step 2: Build and Sync

```bash
npm run build
npx cap sync android
npx cap open android   # Opens in Android Studio
```

### Step 3: Google Play Developer Account

1. Go to https://play.google.com/console
2. Pay the **one-time $25 fee**
3. Complete identity verification (1–3 days)
4. Create your app listing

### Step 4: Sideloading (No Account Needed)

For personal testing without a Play Store account:
1. Build an APK from Android Studio: **Build > Build Bundle(s) / APK(s) > Build APK**
2. Transfer the APK to your phone (USB, email, Drive, etc.)
3. On your phone: **Settings > Security > Install from unknown sources** (enable for your file manager)
4. Open the APK and install

---

## 12. Ongoing Maintenance

### Updating the App

Every time you update Blipp's frontend:

```bash
npm run build           # Build latest web code
npx cap sync ios        # Sync to iOS project
# Open Xcode, bump version number if needed, archive and upload
```

### Version Numbering

In Xcode (or in `ios/App/App.xcodeproj`):
- **MARKETING_VERSION** (e.g., `1.0`, `1.1`, `2.0`) — what users see
- **CURRENT_PROJECT_VERSION** (e.g., `1`, `2`, `3`) — must increment with every upload to App Store Connect

### Capacitor Updates

```bash
npm install @capacitor/cli@latest @capacitor/core@latest @capacitor/ios@latest --legacy-peer-deps
npx cap sync ios
```

Then test thoroughly — major Capacitor updates can change native project structure.

---

## 13. Troubleshooting

### "The certificate is not trusted" on iPhone
Go to **Settings > General > VPN & Device Management**, find your developer profile, tap **Trust**.

### Xcode says bundle ID is already taken
Someone else registered `com.blipp.app` on the App Store. For personal testing, change to `com.yourname.blipp` temporarily. For App Store, you'll need a unique ID — consider `app.podblipp.blipp` or similar.

### Build fails with SPM package resolution errors
In Xcode: **File > Packages > Reset Package Caches**, then try building again.

### Clerk login doesn't work on device
The `allowNavigation` in `capacitor.config.ts` must include your Clerk domain. Currently set to `*.clerk.accounts.dev`. If you've moved to a production Clerk domain, update this.

### API calls fail on device
The app uses `https://podblipp.com` as the API base on native (see `src/lib/api-base.ts`). Ensure:
- Your production deployment is running
- CORS allows the Capacitor origin (`capacitor://localhost` on iOS)

If CORS is blocking, add `capacitor://localhost` to your allowed origins in the worker.

### App Store rejection for payment-related issues
If Blipp shows Stripe subscription options in the iOS app, Apple may reject it. Apple requires apps to use **In-App Purchase (IAP)** for digital subscriptions sold within iOS apps (and takes a 15–30% cut). Options:
- Remove subscription UI from the native app (let users subscribe via web)
- Implement Apple IAP alongside Stripe
- Use the "reader app" exemption if applicable

### White/blank screen on device
Run `npx cap sync ios` again. The `ios/App/App/public/` folder may be empty — it's gitignored and must be populated by cap sync.

### Safe area issues (content under notch)
Already handled — your `index.html` has `viewport-fit=cover` and Capacitor config has `contentInset: "automatic"`. If you still see issues, use CSS `env(safe-area-inset-top)` etc.

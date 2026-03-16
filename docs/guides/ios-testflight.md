# iOS TestFlight Distribution Guide

Complete step-by-step guide for getting Blipp onto iPhones via TestFlight.

## What's Already Done

- Capacitor installed (`@capacitor/core`, `@capacitor/cli`, `@capacitor/ios`)
- iOS project scaffolded at `ios/`
- `capacitor.config.ts` configured (app ID `com.blipp.app`, web dir `dist/client`)
- API base URL helper routes native API calls to `https://podblipp.com`
- CORS updated to allow `capacitor://localhost` origin
- Build and sync verified working

## What's Left

| Step | Requires Mac | Requires Apple Developer Account |
|------|:---:|:---:|
| 1. Create app icon & splash screen | No | No |
| 2. Install `@capacitor/assets` and generate | No | No |
| 3. Complete Apple Developer enrollment | No | Yes |
| 4. Register Bundle ID | No | Yes |
| 5. Create App Store Connect record | No | Yes |
| 6. Open project in Xcode & configure signing | Yes | Yes |
| 7. Test on simulator | Yes | No |
| 8. Test on physical device | Yes | Yes (free Apple ID works for dev) |
| 9. Archive & upload to App Store Connect | Yes | Yes |
| 10. Configure TestFlight & invite testers | No | Yes |

---

## Step 1: Create App Icon & Splash Screen

### App Icon

You need a single **1024x1024 PNG** file. Requirements:
- Fully opaque (no transparency — transparent areas render as black)
- sRGB color space
- Square, no rounded corners (Apple applies the squircle mask automatically)
- No alpha channel

**Optional iOS 18 dark/tinted variants** (recommended for a polished look):
- **Dark variant**: Use a transparent background; iOS fills with a dark color. Foreground should be lighter.
- **Tinted variant**: Provide a fully opaque grayscale image. iOS applies the user's chosen tint.

If you skip these, iOS auto-generates them (usually poorly — just darkens/desaturates your icon).

### Splash Screen

You need a **2732x2732 PNG**. The launch screen uses `scaleAspectFill` (center-cropped), so keep your logo/content centered within ~1200x1200 pixels of the center.

### Where to Put Them

Create an `assets/` directory in the project root:

```
assets/
  icon-only.png          # 1024x1024, your app icon
  icon-only-dark.png     # 1024x1024, optional dark variant
  icon-only-tinted.png   # 1024x1024, optional tinted variant (grayscale)
  splash.png             # 2732x2732, launch screen
  splash-dark.png        # 2732x2732, optional dark launch screen
```

---

## Step 2: Generate Assets with @capacitor/assets

This official tool places correctly sized files into the Xcode project.

```bash
# Install
npm install --save-dev @capacitor/assets --legacy-peer-deps

# Generate (after placing source files in assets/)
npx @capacitor/assets generate --ios
```

This updates:
- `ios/App/App/Assets.xcassets/AppIcon.appiconset/` — all icon sizes + `Contents.json`
- `ios/App/App/Assets.xcassets/Splash.imageset/` — splash screen images

**After generating, rebuild and sync:**

```bash
npm run build && npx cap sync ios
```

---

## Step 3: Complete Apple Developer Enrollment

**Cost**: $99 USD/year

**Requirements (Individual)**:
- Apple Account (Apple ID) with two-factor authentication enabled
- You must be the legal age of majority in your jurisdiction
- Valid credit card

**How to enroll**:
1. Go to [developer.apple.com/programs/enroll](https://developer.apple.com/programs/enroll/) or use the **Apple Developer** app on iPhone/iPad
2. Sign in with your Apple ID
3. Agree to the Apple Developer Agreement
4. Purchase the membership

**Timeline**: Apple says enrollment takes "a few hours" but can take up to 48 hours for identity verification. You'll get an email when approved.

**You cannot proceed past this point until enrollment is active.**

---

## Step 4: Register the Bundle ID

Once enrollment is approved:

1. Go to [Certificates, Identifiers & Profiles](https://developer.apple.com/account/resources/identifiers/list)
2. Click **"+"** to register a new identifier
3. Select **App IDs**, then **App**
4. Description: `Blipp iOS App`
5. Bundle ID: select **Explicit**, enter: `com.blipp.app`
6. Enable any capabilities you need now or later:
   - **Push Notifications** — recommended for a podcast app (notify when new briefings are ready)
   - Others can be added later
7. Click **Continue** then **Register**

**The Bundle ID cannot be changed after creation.** Make sure `com.blipp.app` matches `appId` in `capacitor.config.ts`.

---

## Step 5: Create the App Store Connect Record

1. Go to [App Store Connect](https://appstoreconnect.apple.com/)
2. Click **Apps** > **"+"** (top left) > **New App**
3. Fill in:
   - **Platforms**: iOS
   - **Name**: `Blipp`
   - **Primary Language**: English (U.S.)
   - **Bundle ID**: Select `com.blipp.app` from the dropdown (registered in step 4)
   - **SKU**: `blipp-ios-001` (any internal identifier, not visible to users)
   - **User Access**: Full Access
4. Click **Create**

While you're here, fill in the **App Privacy** section (required for TestFlight external testing):
- Navigate to your app > **App Privacy**
- Declare what data Blipp collects (email, usage data, etc.) and how it's used
- This must be accurate — inaccurate privacy info causes rejection

---

## Step 6: Open in Xcode & Configure Signing

**You need a Mac with Xcode 16.0+ installed for all remaining steps.**

### 6a. Build and sync

```bash
# From the project root
npm run build && npx cap sync ios
```

### 6b. Open in Xcode

```bash
npx cap open ios
```

This opens `ios/App/App.xcodeproj` in Xcode.

### 6c. Configure signing

1. In Xcode's **Project Navigator** (left sidebar), click the **App** project (blue icon at top)
2. Select the **App** target under TARGETS
3. Go to the **Signing & Capabilities** tab
4. Check **"Automatically manage signing"**
5. Under **Team**, click the dropdown and select your Apple Developer team
   - If not listed, go to Xcode > Settings > Accounts, sign in with your Apple ID
6. Verify **Bundle Identifier** reads `com.blipp.app`
7. Xcode will automatically create/download the necessary provisioning profile

If you see a red error about provisioning, make sure:
- Your enrollment is fully active
- The Bundle ID is registered (step 4)
- You're signed in with the correct Apple ID

### 6d. Set deployment target

1. Still on the **App** target, go to the **General** tab
2. Under **Minimum Deployments**, set iOS version to **16.0** (or whatever minimum you want)
   - iOS 16 covers iPhone 8 and newer
   - iOS 17 covers iPhone XS and newer
   - Lower = more devices, higher = fewer compatibility issues

### 6e. Set version number

1. In the **General** tab, set:
   - **Version**: `1.0.0` (marketing version shown to users)
   - **Build**: `1` (auto-incremented by Xcode on upload, or set manually)

---

## Step 7: Test on Simulator

Before investing time in device testing, verify the app works on a simulator.

1. In Xcode, select a simulator device from the scheme selector (e.g., **iPhone 16 Pro**)
2. Press **Cmd+R** (or Product > Run)
3. The simulator launches with Blipp loaded

**What to verify**:
- [ ] App launches without white/blank screen
- [ ] The SPA loads and renders correctly
- [ ] Navigation works (routes, back button, swipe gestures)
- [ ] Clerk auth flow works (sign in, sign out)
- [ ] API calls succeed (check for CORS errors in Safari's Web Inspector — see debugging tips below)
- [ ] Audio playback works
- [ ] Safe area / notch handling looks correct
- [ ] The splash screen displays your custom image (not the default Capacitor logo)

### Debugging the WebView

To inspect the WebView in the simulator:
1. Open **Safari** on your Mac
2. Go to **Safari > Settings > Advanced** > check "Show features for web developers"
3. With the simulator running, go to **Develop > Simulator - iPhone ... > localhost** (or `capacitor://localhost`)
4. Safari's Web Inspector opens — you can see console logs, network requests, DOM, etc.

This is critical for debugging API calls and auth flows.

---

## Step 8: Test on a Physical Device

Simulator testing misses real-world issues (networking, performance, touch precision). Test on a real iPhone before uploading.

### 8a. Connect your iPhone

1. Connect iPhone to Mac via USB (or set up wireless debugging: Window > Devices and Simulators > check "Connect via network")
2. On the iPhone, go to **Settings > Privacy & Security > Developer Mode** and enable it (required for iOS 16+)
3. Trust the computer when prompted on the iPhone

### 8b. Run on device

1. In Xcode, select your iPhone from the scheme selector (it appears under "Devices")
2. Press **Cmd+R**
3. First time: your iPhone may prompt you to trust the developer certificate. Go to **Settings > General > VPN & Device Management** and trust your developer certificate.

### 8c. What to verify (in addition to simulator checks)

- [ ] App installs and launches on device
- [ ] Network requests work over cellular and WiFi
- [ ] Audio plays through speakers and headphones
- [ ] Performance is acceptable (no jank, smooth scrolling)
- [ ] Haptics work (if using Capacitor Haptics plugin)
- [ ] The app doesn't get killed by iOS memory pressure

---

## Step 9: Archive & Upload to App Store Connect

This creates the production build and sends it to Apple.

### 9a. Pre-upload checklist

Before archiving, verify:

- [ ] `npm run build` produces a clean production build
- [ ] `npx cap sync ios` copies latest web assets
- [ ] No `server.url` pointing to localhost in `capacitor.config.ts`
- [ ] App icon is your custom icon (not default Capacitor logo)
- [ ] Splash screen is customized
- [ ] Bundle ID matches between Xcode, `capacitor.config.ts`, and App Store Connect
- [ ] Version and build number are set in Xcode
- [ ] Tested on a real device
- [ ] Clerk auth flow works in the Capacitor WebView
- [ ] API calls to `podblipp.com` work from the app

### 9b. Create the archive

1. In Xcode, set the build destination to **"Any iOS Device (arm64)"** (not a simulator)
2. Go to **Product > Archive**
3. Wait for the build to complete (1-5 minutes)
4. The **Organizer** window opens showing your archive

### 9c. Upload to App Store Connect

1. In the Organizer, select your archive
2. Click **"Distribute App"**
3. Select **"App Store Connect"** > **Next**
4. Select **"Upload"** > **Next**
5. Options:
   - **Upload your app's symbols**: Yes (for crash reports)
   - **Manage version and build number**: Yes
6. Signing: select **"Automatically manage signing"**
7. Click **Upload**
8. Wait for upload to complete

**After upload**: Apple processes the build (5-30 minutes). You'll get an email when processing finishes. If there are issues (missing icons, invalid entitlements, privacy manifest problems), you'll get an email about those too.

### 9d. Common upload failures

| Error | Fix |
|-------|-----|
| Missing app icon | Run `@capacitor/assets generate --ios`, re-sync, re-archive |
| Invalid provisioning profile | Check signing in Xcode, make sure team is set |
| Missing privacy manifest | Add `PrivacyInfo.xcprivacy` to the Xcode project (see appendix) |
| Build number already used | Increment the build number in Xcode General tab |

---

## Step 10: Configure TestFlight & Invite Testers

### Internal Testing (fast, no Apple review)

Best for your team and close collaborators. Up to 100 testers. Builds available immediately.

1. In App Store Connect, go to your app > **TestFlight** tab
2. Click **Internal Testing** in the sidebar
3. Click **"+"** to create a group (e.g., "Core Team")
4. Add testers by their App Store Connect email addresses
   - These people must have App Store Connect accounts on your team
5. Select the build you uploaded
6. Click **Save**
7. Testers receive an email invitation

### External Testing (for wider distribution, requires Beta App Review)

For anyone with an email or a public link. Up to 10,000 testers.

1. In TestFlight, click **External Testing** in the sidebar
2. Click **"+"** to create a group (e.g., "Beta Testers")
3. **Provide Test Information** (required):
   - **Beta App Description**: "Blipp distills your favorite podcasts into short audio briefings. Test the latest features and report any issues."
   - **Feedback Email**: Your email
   - **Beta App Review Information**:
     - **Test account**: Provide a working Clerk test account (email + password) so the reviewer can sign in
     - **Notes**: Any context about what's being tested
   - **Privacy URL**: If you have one
4. Add testers:
   - **By email**: Enter individual email addresses
   - **Public link**: Generate a link that anyone can use to join (set an enrollment limit)
5. Select the build and **Submit for Beta App Review**

### What Apple Reviews for External Testing

Beta App Review is lighter than full App Store review, but checks:
- App launches and doesn't crash
- Core features work (audio playback, auth flow)
- You provided test account credentials
- No illegal content
- Privacy info is accurate

**Timeline**: Usually 24-48 hours. Often faster.

**Tip**: Subsequent builds for the same app version may not need re-review.

### How Testers Install

1. Tester receives your invitation email (or public link)
2. They install the **TestFlight** app from the App Store (free)
3. Open the email/link on their iPhone — it opens TestFlight
4. Tap **Accept**, then **Install**
5. The app appears on their home screen with an orange dot (beta indicator)
6. When you upload new builds, testers get a notification to update

**Build expiration**: TestFlight builds expire after **90 days**.

---

## Ongoing Workflow

Once everything is set up, the cycle for pushing updates is:

```bash
# 1. Make changes to the web app
# 2. Build and sync
npm run build && npx cap sync ios

# 3. Open Xcode, archive, upload
npx cap open ios
# Product > Archive > Distribute App > Upload
```

For faster iteration without re-archiving, you can use live reload during development:

```bash
# Add to capacitor.config.ts temporarily (REMOVE before archiving):
# server: { url: 'http://YOUR_LAN_IP:5174', cleartext: true }
npx cap sync ios
npx cap open ios
# Run on device — web changes hot-reload without rebuilding
```

---

## Appendix

### A. Privacy Manifest (PrivacyInfo.xcprivacy)

Apple requires this for App Store / TestFlight. If the file doesn't exist yet, create it in Xcode:

1. In Xcode, right-click the **App** group > **New File**
2. Search for "App Privacy" > select **App Privacy**
3. Add it to the App target

Minimum content (Capacitor uses UserDefaults):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>NSPrivacyAccessedAPITypes</key>
  <array>
    <dict>
      <key>NSPrivacyAccessedAPIType</key>
      <string>NSPrivacyAccessedAPICategoryUserDefaults</string>
      <key>NSPrivacyAccessedAPITypeReasons</key>
      <array>
        <string>CA92.1</string>
      </array>
    </dict>
  </array>
</dict>
</plist>
```

### B. App Review Risk: Guideline 4.2 (Minimum Functionality)

Apple rejects apps that are "just a website in a WebView." Since Blipp is a Capacitor wrapper around a web app, take steps to differentiate from a basic web clip:

- **Native splash screen and app icon** (done via steps 1-2)
- **Push notifications** — consider adding `@capacitor/push-notifications` to notify users when new briefings are ready
- **Native audio controls** — lock screen / control center playback controls make the app feel native
- **Haptic feedback** — `@capacitor/haptics` for button taps, pull-to-refresh
- **Offline handling** — the PWA service worker already provides this, but make sure it works in the Capacitor WebView
- **Proper navigation** — swipe-back gesture, no browser chrome visible

The more "native" the app feels, the less likely a 4.2 rejection.

### C. Useful Capacitor Plugins to Consider

| Plugin | Purpose |
|--------|---------|
| `@capacitor/push-notifications` | Push notifications (new briefing ready, etc.) |
| `@capacitor/haptics` | Haptic feedback on interactions |
| `@capacitor/status-bar` | Control status bar appearance |
| `@capacitor/splash-screen` | Programmatic splash screen control |
| `@capacitor/app` | App lifecycle events (foreground/background) |
| `@capacitor/keyboard` | Keyboard show/hide events, accessory bar |

Install with `npm install <plugin> --legacy-peer-deps`, then `npx cap sync ios`.

### D. NPM Scripts to Add

Consider adding these to `package.json` for convenience:

```json
{
  "scripts": {
    "cap:sync": "npm run build && npx cap sync ios",
    "cap:open": "npx cap open ios",
    "cap:run": "npm run build && npx cap sync ios && npx cap run ios"
  }
}
```

### E. Clerk Auth in Capacitor WebView

Clerk's sign-in flow may open external URLs (Google OAuth, etc.). Make sure:

1. `allowNavigation` in `capacitor.config.ts` includes your Clerk domain (`*.clerk.accounts.dev` is already configured)
2. OAuth redirects work — Clerk's redirect URL must point back to the Capacitor app. You may need to configure a custom URL scheme (`blipp://`) as a redirect URI in your Clerk dashboard.
3. Test the full sign-in/sign-out flow on a real device before uploading to TestFlight.

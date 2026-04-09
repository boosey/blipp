# PodBlipp User Manual

## What is Blipp?

Blipp (PodBlipp) is a podcast briefing app that turns hour-long podcast episodes into short audio briefings you can listen to in minutes. Instead of committing to full episodes, Blipp distills the key points into bite-sized audio summaries — called **Blipps** — that range from 2 to 30 minutes long.

Blipp is available as a web app and can be installed as a Progressive Web App (PWA) on your phone for quick access.

---

## Getting Started

### Creating an Account

1. Visit the Blipp landing page.
2. Tap **Sign In** to create an account or log in using your existing credentials (Google, email, etc.).
3. Authentication is handled through Clerk — you can sign in with social providers or email.

### Onboarding

After your first sign-in, you will be guided through a 3-step onboarding flow:

**Step 1 — Welcome**
A brief introduction explaining what Blipp does: "Your podcasts, distilled." Tap **Get Started** to continue.

**Step 2 — Pick Your Podcasts**
- Browse the podcast catalog displayed in a grid layout.
- Use the **search bar** to find specific podcasts by name.
- Filter by **category** using the pill buttons (News, Technology, Business, Comedy, Science, Sports, Culture, Health, Education, True Crime, etc.).
- Tap a podcast to select it — a checkmark appears on selected podcasts.
- Your plan determines how many subscriptions you can add. A counter at the bottom shows "X of Y subscriptions selected."
- When ready, tap **Subscribe to X podcast(s)** to proceed.
- You can also tap **Skip for now** to complete onboarding without subscribing.

**Step 3 — Confirmation**
- If you subscribed: You will see a message that briefings are being created and usually take 2-5 minutes.
- Tap **Go to Feed** to see your main feed.

---

## Navigation

Blipp uses a **bottom navigation bar** with four tabs:

| Tab | Icon | Description |
|-----|------|-------------|
| **Home** | House | Your main feed of briefings |
| **Discover** | Search | Browse and search for podcasts and episodes |
| **Library** | Library | Your subscriptions, favorites, and listening history |
| **Settings** | Gear | Account, preferences, and plan management |

The **header** at the top includes:
- The Blipp logo (left)
- A **feedback button** (speech bubble icon) to send feedback to the Blipp team
- Your **profile avatar** (right) for account management

---

## Home (Your Feed)

The Home screen is your main hub. It displays all your briefings (Blipps) organized by date.

### Feed Filters

Filter your feed using the pill buttons at the top:

- **All** — Every briefing in your feed
- **New** — Unlistened briefings only
- **Subscriptions** — Briefings from your subscribed podcasts (generated automatically)
- **On Demand** — Briefings you requested manually for specific episodes
- **Creating** — Briefings currently being generated

Each filter shows a count in parentheses (e.g., "New (3)").

### Feed Items

Each feed item (Blipp) shows:
- Podcast artwork
- Episode title
- Podcast name
- Duration
- Status indicator (Creating, Ready, Failed)

**Status meanings:**
- **Creating** (amber badge with spinner) — The briefing is being generated. Usually ready in 2-5 minutes.
- **Ready / In Feed** (green) — Available to play. Tap to listen.
- **Listened** — You have already played this briefing.
- **Failed** — Generation failed. You can retry.

### Interactions

- **Tap a feed item** to play the briefing.
- **Swipe left** on a feed item to remove it from your feed (with 5-second undo option).
- **Swipe right** to add it to your playback queue.
- **Play All** button — Plays all unlistened ready briefings in sequence.
- **Pull down** to refresh the feed.
- **Cancel** — Tap the Cancel button on a "Creating" item to cancel the briefing generation.

### Suggested Next Blipp

Below the filters, you may see a "Suggested Next Blipp" row with curated episode recommendations based on your listening habits.

### Install Prompt

On supported browsers, you may see an "Install Blipp" banner prompting you to add the app to your home screen for quick access.

---

## Discover

The Discover page lets you find new podcasts and episodes.

### Search

Use the search bar at the top to search across both podcasts and episodes. Results update as you type.

### Category Filters

Scroll through the category pill buttons to filter by genre. Categories are loaded dynamically from the catalog.

### Browse Tabs

Switch between two browse modes:

- **Podcasts** — Browse the full podcast catalog as a list.
- **Episodes** — Browse individual episodes from across all podcasts.

Both tabs support infinite scrolling — scroll down and more results load automatically.

### Sort Options

Tap the sort icon (arrows) to change the sort order:
- **Apple Rank** — Default ranking
- **Popularity** — Most popular
- **Subscriptions** — Most subscribed on Blipp
- **Favorites** — Most favorited on Blipp

### Curated Rows

When not searching, the Discover page shows curated recommendation rows such as trending podcasts, popular episodes, and personalized suggestions ("You might want to subscribe").

### Podcast Cards

Each podcast card shows the title, author, description, episode count, and subscriber count. Tap a podcast to open its detail view.

### Request a Podcast

Cannot find a podcast? Scroll to the bottom and tap **"Can't find a podcast? Request it"** to submit a request. Enter the podcast name and tap **Request**. You can track your requests in the "My Requests" section that appears below.

---

## Podcast Detail

When you tap a podcast (from Discover, Library, or anywhere else), a detail sheet slides up showing:

### Podcast Info
- Podcast artwork, title, and author
- Episode count
- Description (tap to expand/collapse)

### Actions

- **Subscribe** — Tap to subscribe. You will be prompted to choose a briefing duration tier (2, 5, 10, 15, or 30 minutes). Once subscribed, Blipp automatically creates briefings for new episodes.
- **Unsubscribe** — Removes the subscription. No more automatic briefings.
- **Change Duration** — Tap the duration badge (e.g., "5m") next to the Unsubscribe button to change how long your briefings are.
- **Change Voice** — Tap the "Voice" button to select a different voice style for this subscription.
- **Favorite** (heart icon) — Add the podcast to your favorites. Favorites help personalize your recommendations.
- **Vote** (thumbs up/down) — Rate the podcast to improve your recommendations.

### Episodes List

Below the podcast info, all episodes are listed with:
- Episode title (tap to expand description)
- Publish date and original episode duration
- **Blipp button** — Tap to create an on-demand briefing for that specific episode. Choose the duration tier from the dropdown that appears.
- Status indicators: "Creating...", "In Feed", "Listened", or "Retry" (for failed briefings)
- Thumbs up/down voting for individual episodes
- **Search episodes** — Tap the search icon next to "Episodes" to filter episodes by title or description.
- **Cancel** — Cancel a briefing that is currently being created.

### Plan Limits

- If you have reached your subscription limit, you will see an upgrade prompt instead of the Subscribe button, with options to upgrade or manage existing subscriptions.
- Older episodes may be locked depending on your plan. You will see a dimmed "Blipp" button with an upgrade prompt.

---

## Library

The Library page has three tabs:

### Favorites
Shows all podcasts you have favorited as a grid. Tap a podcast to open its detail view. Remove a favorite by tapping the trash icon that appears on hover/long press.

### Subscriptions
Shows all your active subscriptions in a grid. Each subscription displays:
- Podcast artwork
- Podcast title
- Duration tier badge (e.g., "5m")

Tap a subscription to open the podcast detail view where you can manage it (change duration, change voice, or unsubscribe).

The tab header shows your subscription count relative to your plan limit (e.g., "Subscriptions (3 of 5)") and turns amber if you have reached your limit.

### History
Shows your listening history with three stats at the top:
- **Briefings** — Total number of briefings you have listened to
- **Min listened** — Total minutes of briefings played
- **Min saved** — Time saved compared to listening to the full original episodes

Below the stats, listened briefings are grouped by date. Tap any item to replay it.

---

## Audio Player

### Mini Player
When you play a briefing, a compact mini player bar appears at the bottom of the screen (above the navigation). It shows:
- Podcast artwork (or "Ad" badge during ad breaks)
- Episode title and podcast name
- Play/Pause button
- Progress bar along the top edge

Tap the mini player to expand it into the full player sheet.

### Full Player Sheet
The expanded player provides full playback controls including play/pause, skip, progress scrubbing, and more.

### Playback Queue
- Use **Play All** on the Home feed to queue all unlistened briefings.
- Swipe right on individual feed items to add them to the queue.
- The player automatically advances to the next item in the queue.

---

## Settings

### Account
Displays your profile picture, name, and email address.

### Usage
Shows your current usage with visual progress bars:
- **Briefings** — How many briefings you have used vs. your plan limit (or "Unlimited")
- **Subscriptions** — How many subscriptions you are using vs. your plan limit

### Plans
View and compare available plans. You can switch between Monthly and Annual billing. Tap **Upgrade** to be redirected to the Stripe checkout page.

If you already have a paid plan, use the billing portal to update payment methods, view invoices, or cancel your subscription.

### Appearance
Choose your theme:
- **Light** — Light mode
- **Dark** — Dark mode
- **System** — Follow your device system preference

### App Config
- **Card Artwork Size** — Adjust the artwork size on podcast and episode cards (XS, S, M, L, XL).

### Notifications
- **Push Notifications** — Toggle to receive browser push notifications when new briefings are ready.

### Storage and Downloads
Manage offline storage settings for downloaded briefings.

### Default Blipp Duration
Set your default briefing length (2, 5, 10, 15, or 30 minutes). This is the duration used when you tap the "Blipp" button on an episode. Longer durations may require a higher-tier plan.

### Default Voice
Choose the default voice style for your briefings from available voice presets.

### Voice Delivery
- **Accept any available voice** — Toggle this on to receive briefings faster by accepting any cached voice instead of waiting for your preferred voice to be generated. This is useful when speed matters more than voice consistency.

### Data and Privacy
- **Export My Data** — Download all your Blipp data as a JSON file.
- **Delete Account** — Permanently delete your account and all associated data. Requires typing "DELETE" to confirm. This action cannot be undone.

### About
Shows the current app version, with links to Terms of Service and Privacy Policy.

### Sign Out
Tap to sign out of your Blipp account.

---

## Sending Feedback

Tap the **speech bubble icon** in the top-right corner of any page to open the feedback dialog. Type your message and submit it directly to the Blipp team. This is the best way to report issues or suggest improvements.

---

## Key Concepts

### What is a Blipp?
A Blipp is a short audio briefing generated from a podcast episode. It distills the key points and claims from the original episode into a condensed audio summary using AI (transcription, claim extraction, narrative generation, and text-to-speech).

### Subscription vs. On-Demand Briefings
- **Subscription briefings** — When you subscribe to a podcast, Blipp automatically generates briefings for new episodes as they are published. These appear with the "Subscriptions" filter.
- **On-Demand briefings** — You can create a briefing for any specific episode by tapping the "Blipp" button on that episode. These appear with the "On Demand" filter.

### Duration Tiers
Blipps come in 5 duration options:
- **2 minutes** — Ultra-quick summary
- **5 minutes** — Quick briefing (default for most plans)
- **10 minutes** — Moderate detail
- **15 minutes** — Detailed briefing
- **30 minutes** — Comprehensive summary

Longer tiers may be restricted based on your plan level.

### How Briefings Are Generated
When you request a Blipp (or one is auto-generated from a subscription):
1. The podcast RSS feed is refreshed to get the latest episode data.
2. The episode audio is transcribed using speech-to-text AI.
3. Key claims and insights are extracted (distillation).
4. A narrative is generated from the key points.
5. Audio is produced using text-to-speech with your selected voice.
6. The final briefing is assembled and appears in your feed.

This pipeline typically takes **2-5 minutes**. You will see a "Creating" badge in your feed while it is in progress.

### Plans and Limits
Blipp offers multiple plan tiers (including a free tier). Plans differ in:
- Number of podcast subscriptions allowed
- Number of briefings per billing cycle
- Maximum briefing duration available
- Access to older/archived episodes

You can view and upgrade your plan in **Settings > Plans**.

---

## Tips and Tricks

1. **Play All for your commute** — Hit "Play All" on the Home feed to queue up all your unlistened briefings for hands-free listening.
2. **Use the New filter** — Quickly see only your unlistened briefings.
3. **Swipe to manage** — Swipe left to remove items you are not interested in; swipe right to add to your playback queue.
4. **Pull to refresh** — Pull down on most pages to refresh content.
5. **Install as an app** — When prompted, install Blipp as a PWA for a native app-like experience with home screen access.
6. **Adjust artwork size** — In Settings > App Config, adjust card artwork size to your visual preference.
7. **Accept any voice for speed** — Enable "Accept any available voice" in Settings to get briefings delivered faster when a cached version exists.
8. **Favorite podcasts** — Even if you do not subscribe, favorite podcasts you are interested in. This improves your curated recommendations on the Discover page.
9. **Vote on episodes** — Thumbs up/down on episodes and podcasts helps Blipp learn your preferences and serve better recommendations.
10. **Request missing podcasts** — Cannot find a podcast in the catalog? Use the request feature at the bottom of the Discover page.

---

## Troubleshooting

### Briefing stuck on "Creating"
Briefings usually take 2-5 minutes. If it has been longer than 5 minutes, try pulling to refresh your feed. If the briefing has failed, you will see a "Retry" button to try again.

### Cannot subscribe to more podcasts
You have likely reached your plan subscription limit. Check **Settings > Usage** to see your current usage. Upgrade your plan for more subscriptions, or remove an existing subscription to make room.

### No briefings in my feed
Make sure you have subscribed to at least one podcast. If you skipped onboarding, go to **Discover** to find and subscribe to podcasts. Briefings from new subscriptions take 2-5 minutes to generate.

### Audio not playing
- Check your device volume and ensure you are not in silent/vibrate mode.
- Try closing and reopening the app or refreshing the page.
- If the briefing shows as "Ready" but will not play, try refreshing.

### Push notifications not working
- Make sure you have enabled them in **Settings > Notifications**.
- Check that your browser allows notifications from Blipp.
- Push notifications may not be available on all browsers or devices.

---

## Contact and Support

For help, questions, or feedback:
- Use the **in-app feedback button** (speech bubble icon in the header)
- Email: **support@podblipp.com**

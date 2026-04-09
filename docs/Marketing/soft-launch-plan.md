# Blipp Soft Launch Plan

## Current Status

**Phase:** Post-invite, transitioning to growth channels
**Users:** ~20 (from personal invites)
**Next moves:** SEO optimization, social media presence, paid ads

---

## Messaging Foundation (Live on Landing Page)

**Headline:** "All your podcasts in a blipp."
**Problem:** "Too many podcasts. Not enough time."
**Description:** "Blipp turns full podcast episodes into short, voice-narrated summaries called Blipps. Choose how much time you have - 2, 5, 10, 15, or 30 minutes - and Blipp delivers the most important insights from any episode."
**Tagline:** "Hear the signal without the noise."
**CTA:** "Start Blipping"
**Closing:** "Start listening smarter. Don't binge. Just Blipp."

**Feature pillars:**
1. Search any podcast - find an episode and instantly create a Blipp
2. Choose your time - 2-30 minute summaries tailored to your schedule
3. Subscribe to shows - automatic Blipps when new episodes drop
4. Listen to the original - one tap to the full episode

---

## Phase 1: SEO Optimization

**Goal:** Capture organic search traffic from people already looking for podcast summaries, notes, and time-saving tools.

### Technical SEO
- [ ] Ensure landing page has proper meta tags, Open Graph, and structured data (Product schema)
- [ ] Page speed audit - target < 2s LCP (Cloudflare + Vite should help)
- [ ] Add sitemap.xml and robots.txt
- [ ] Set up Google Search Console and Bing Webmaster Tools
- [ ] Ensure mobile responsiveness scores 95+ on PageSpeed Insights

### Keyword Targets

| Keyword Cluster | Monthly Volume (est.) | Intent | Priority |
|-|-|-|-|
| podcast summary / podcast summaries | High | Transactional | P0 |
| podcast notes | Medium | Informational | P0 |
| podcast highlights | Medium | Informational | P1 |
| too many podcasts | Low | Problem-aware | P1 |
| podcast transcript summary | Medium | Transactional | P1 |
| best podcast episodes [topic] | High | Navigational | P2 (content) |
| [podcast name] summary | Long-tail | Transactional | P0 (at scale) |
| [podcast name] [episode] notes | Long-tail | Transactional | P0 (at scale) |

### Content Strategy: The 500-Page SEO Flywheel

The core SEO play is **programmatic content generation at scale**. The goal is to build a minimum of **500 indexable pages** to establish meaningful search presence.

#### What is a "Blipp Page"? (New Feature — Must Be Built)

A Blipp page is a **new public-facing web page that needs to be developed**. It does not exist today. Here is what this means concretely:

**What exists today:**
- Blipp creates **audio summaries** (voice-narrated) delivered inside the web app
- The pipeline generates **text scripts** for those audio summaries as an intermediate step
- These text scripts are **not published anywhere** — they are internal to the pipeline and not delivered to users

**What a "Blipp page" would be:**
- A new public web page that takes the existing text script and presents it as a readable, SEO-optimized summary page
- This is an **entirely new feature** that does not exist yet — it requires new routes, templates, and a content publishing pipeline
- URLs would look like `/podcasts/lex-fridman/ep-412-sam-altman` or `/podcasts/huberman-lab/how-to-improve-sleep`

**Why build this:**
- The text scripts already exist in the pipeline, so the content generation cost is near zero
- Each page captures long-tail search traffic ("lex fridman sam altman summary", "huberman sleep podcast notes")
- Each page doubles as a product demo — visitors see what Blipp produces, then sign up to get the audio version
- At 500+ pages, this creates a meaningful SEO footprint that compounds over time

**Each Blipp page would contain:**
- Episode title, podcast name, publish date
- Key takeaways / highlights derived from the text script (reformatted for reading, not just the raw script)
- Topics and tags for internal linking
- CTA to sign up and listen to the full audio Blipp or original episode
- Structured data (PodcastEpisode schema) for rich search results
- Optionally, a short audio preview clip

**Key engineering requirement:** This is a net-new feature. The CTO would need to scope: public page routes, a rendering template, sitemap generation, and a policy for which episodes get public pages (all? curated? user-opted-in?).

#### How to Reach 500 Pages

| Content Type | Volume Target | How |
|-|-|-|
| Popular podcast episode Blipp pages | 300+ | Auto-generate from most-subscribed podcasts; curate top episodes from 30-50 popular shows |
| Category landing pages | 20-30 | "/podcasts/tech", "/podcasts/business", "/podcasts/science", "/podcasts/health", etc. |
| Podcast show pages | 50-100 | "/podcasts/lex-fridman" - show overview + links to all Blipp'd episodes |
| Blog posts (editorial) | 20-30 | "Why You Don't Need to Listen to Every Podcast", topic roundups, comparisons |
| How-it-works / comparison pages | 5-10 | "Blipp vs reading transcripts", "How Blipp works", "Blipp for teams" |
| **Total** | **500+** | |

#### Implementation Approach

**Phase 1a - Build the Blipp page feature + seed content (Weeks 1-3):**
- [ ] CTO to scope and build public Blipp page routes + template
- [ ] Design the page layout (SEO meta, structured data, text content, CTAs)
- [ ] Decide policy: which episodes get public pages (start with curated popular shows)
- [ ] Generate Blipp pages for 50 popular episodes across 10 top podcasts
- [ ] Create 10 category landing pages
- [ ] Create 10 podcast show pages
- [ ] Launch sitemap with all pages

**Phase 1b - Scale content (Weeks 4-8):**
- [ ] Expand to 300+ episode Blipp pages (batch-process popular back catalogs)
- [ ] Add new Blipp pages automatically as the pipeline processes episodes
- [ ] Internal linking: each Blipp page links to its show page, category page, and related episodes
- [ ] Monitor Search Console for which pages get indexed and which queries drive impressions

**Phase 1c - Optimize (Ongoing):**
- [ ] Identify top-performing pages and optimize titles/descriptions
- [ ] Add "related Blipps" sections for internal link juice
- [ ] Refresh stale pages when episodes get re-summarized
- [ ] Track indexed page count - target 500 indexed within 8 weeks

### Other Content Pages
- [ ] **How it works page:** SEO-optimized explainer targeting "podcast summary app" and "AI podcast notes"
- [ ] **Blog post #1:** "Why You Don't Need to Listen to Every Podcast Episode" (problem-aware keyword targeting)
- [ ] **Blog post #2:** "The Best Way to Keep Up With 10+ Podcasts" (solution-aware)

### SEO Timeline
- Week 1-2: Technical SEO audit + fixes + CTO scopes/builds Blipp page feature
- Week 3: Seed 50 Blipp pages + category pages + show pages + "How it works"
- Week 4-5: First two blog posts live, expand to 150+ Blipp pages
- Week 6-8: Scale to 500+ pages, optimize based on Search Console data
- Ongoing: Every new popular Blipp becomes a new indexed page automatically

---

## Phase 2: Social Media

**Goal:** Build organic awareness and community among podcast listeners. Drive sign-ups through shareable content.

### Channels (Priority Order)

**Twitter/X (P0)**
- Account: @blippapp (or similar)
- Content mix: podcast insights from Blipps, product updates, podcast culture takes
- Post frequency: 3-5x/week
- Thread format: "We Blipped [popular episode] - here are the 5 key takeaways in 60 seconds"
- Engage with podcast hosts and listeners in replies

**Reddit (P0)**
- Target subreddits: r/podcasts, r/productivity, r/getdisciplined, r/podcasting
- Approach: Provide value first (answer questions about podcast management), mention Blipp only when directly relevant
- Post a genuine "Show Reddit" post in r/SideProject or r/startups
- Never spam - Reddit detects and punishes this

**LinkedIn (P1)**
- Founder posts about the problem Blipp solves (professionals too busy to listen)
- Target: knowledge workers, executives, commuters
- 1-2 posts/week from founder account

**Instagram/TikTok (P2 - defer until content engine is running)**
- Short video: "I Blipped a 3-hour podcast into 5 minutes" format
- Only pursue if early traction on X/Reddit proves the content works

### Content Playbook
- Share real Blipp outputs (with podcast creator permission where possible)
- "What I learned from [podcast] in 5 minutes" threads
- Before/after: "90 min episode -> 5 min Blipp" comparisons
- User testimonials from the 20 early users (ask for quotes)
- Link back to public Blipp pages once built (drives SEO + social traffic loop)

### Timeline
- Week 1: Set up accounts, write first 5 posts, start engaging on Reddit
- Week 2: First Twitter thread, first Reddit value post
- Week 3-4: Establish rhythm, measure engagement, double down on what works

---

## Phase 3: Paid Ads (Small Budget, High Intent)

**Goal:** Test paid acquisition on high-intent channels at minimal spend. Find CAC benchmarks before scaling.

### Budget: $300-500/week to start

### Google Ads (P0 - start here)

**Search campaigns:**
- Keywords: "podcast summary app", "podcast notes tool", "AI podcast summary", "podcast highlights"
- Ad copy: Lead with "All your podcasts in a blipp" headline, "Hear the signal without the noise" description
- Landing page: Direct to main landing page with UTM tracking
- Budget: $200-300/week
- Target: CPC < $2, CTR > 3%

**What to measure first:**
- Cost per sign-up (target: < $10 during soft launch)
- Sign-up to first-Blipp conversion
- Day-7 retention of paid-acquired users vs organic

### Meta Ads - Instagram/Facebook (P1 - week 2+)

**Audience targeting:**
- Interest: Podcasts, Spotify, Apple Podcasts, productivity apps
- Lookalike: Upload email list of 20 current users (small but directional)
- Budget: $100-200/week
- Creative: Short video or carousel showing the Blipp experience

### What NOT to do yet
- No brand awareness campaigns (too early, no budget for it)
- No broad targeting (waste of spend)
- No scaling until CAC and retention benchmarks are established
- No ad spend > $500/week until we see sign-up -> retained user conversion working

### Timeline
- Week 1: Set up Google Ads account, write 3 ad variants, launch search campaign
- Week 2: Measure initial CPC and sign-ups; set up Meta Ads if Google shows promise
- Week 3-4: Optimize - pause underperforming keywords/ads, scale winners
- Decision gate at $1,000 total spend: Is CAC < $10? Are paid users retaining? If yes, increase budget. If no, pause and diagnose.

---

## Tracking & Metrics

| Metric | Target | Channel |
|-|-|-|
| Indexed pages | 500+ | SEO (by week 8) |
| Organic search impressions/week | 5,000+ | SEO (by month 2) |
| Organic sign-ups/week | 20+ | SEO |
| Social followers (X) | 200+ | Social (month 1) |
| Reddit referral sign-ups | 10+ | Social |
| Google Ads CPC | < $2 | Paid |
| Cost per sign-up (paid) | < $10 | Paid |
| Day-7 retention (all channels) | > 40% | All |
| Total users (end of soft launch) | 200+ | All |

## Exit Criteria (Gate to Hard Launch)

All must be met before proceeding to hard launch:
- [ ] 200+ total users
- [ ] Day-7 retention consistently > 40%
- [ ] Pipeline success rate > 98%
- [ ] Listen-through rate > 60%
- [ ] At least one acquisition channel showing repeatable, cost-effective sign-ups
- [ ] CAC benchmark established (< $10 for paid)
- [ ] No critical onboarding blockers
- [ ] Top user-reported pain points resolved
- [ ] 500+ pages indexed in Google Search Console
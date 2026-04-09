# Blipp Hard Launch Plan

## Objective

Scale Blipp to a broad audience with confidence that the product delivers value, the pipeline handles load, and the growth engine is repeatable. Transition from invite-only to public availability.

## Prerequisites (from Soft Launch Exit Criteria)

All soft launch exit criteria must be met before hard launch begins:
- Day-7 retention consistently > 40%
- Pipeline success rate > 98%
- Listen-through rate > 60%
- Organic referral signal present
- No critical onboarding blockers
- Unit economics validated at projected scale

## Hard Launch Phases

### Phase 1: Public Launch (Week 1-2)

**Goal:** Remove invite gates. Make Blipp publicly available.

- Open sign-up to all users (remove waitlist/invite requirement)
- Landing page is already live with final messaging (see Messaging section below)
- App store submission (if mobile planned) or PWA promotion
- Announce on owned channels:
  - Product Hunt launch (coordinate for maximum visibility)
  - Hacker News Show HN post
  - Twitter/X announcement thread
  - LinkedIn post from founders
- Press outreach to 10-15 podcast/tech journalists with personalized pitches
- Activate referral program: "Give a friend Blipp, get a month of Pro free"

### Phase 2: Growth Engine (Week 3-8)

**Goal:** Build repeatable acquisition channels.

**Content Marketing:**
- Launch blog with weekly posts: "Best podcasts for [topic]" listicles, "What we learned building an AI briefing engine"
- SEO-optimized landing pages for top podcast categories (tech, business, science, culture)
- Create sample briefings for popular podcasts as shareable content

**Community & Partnerships:**
- Partner with 5-10 podcast creators for co-promotion ("Get the Blipp summary of our latest episode")
- Sponsor 2-3 relevant newsletters (podcast-focused, productivity-focused)
- Engage in podcast communities: Reddit, Discord servers, podcast forums

**Paid Acquisition (measured, not blitz):**
- Start with small budget ($500-1000/week) on high-intent channels
- Google Ads: target "podcast summary", "podcast notes", "podcast transcript" keywords
- Social ads: Instagram/Facebook targeting podcast listeners
- Measure CAC per channel weekly; kill underperformers fast

### Phase 3: Retention & Monetization (Week 4-12)

**Goal:** Convert free users to paid, maximize LTV.

- Enforce free tier limits (e.g., 3 briefings/week free, unlimited on Pro)
- Implement upgrade nudges at natural friction points (limit hit, premium podcast requested)
- Email drip campaign: onboarding sequence (day 0, 1, 3, 7, 14) highlighting features
- Win-back campaign for churned users at day 30
- A/B test pricing: monthly vs annual, price points

## Key Metrics (Hard Launch)

| Metric | Target | Timeframe |
|--------|--------|-----------|
| Monthly sign-ups | 1,000+ | By month 2 |
| Day-7 retention | > 35% (at scale) | Ongoing |
| Free-to-paid conversion | > 5% | By month 3 |
| CAC (paid channels) | < $15 | Ongoing |
| LTV:CAC ratio | > 3:1 | By month 4 |
| MRR | $5,000+ | By month 3 |
| Pipeline p95 latency | < 20 min | Ongoing |
| Uptime | > 99.5% | Ongoing |

## Messaging (Hard Launch) - Aligned with Live Landing Page

The landing page is already deployed with final messaging. All hard launch communications should use these exact lines for consistency:

**Primary headline:** "All your podcasts in a blipp."
**Problem statement:** "Too many podcasts. Not enough time."
**Product description:** "Blipp turns full podcast episodes into short, voice-narrated summaries called Blipps. Choose how much time you have - 2, 5, 10, 15, or 30 minutes - and Blipp delivers the most important insights from any episode. Hear something great? Tap through to the full original anytime."
**Tagline:** "Hear the signal without the noise."
**CTA:** "Start Blipping"
**Closing hook:** "Start listening smarter. Don't binge. Just Blipp."

**Feature pillars (from landing page):**
1. **Search any podcast** - Find an episode and instantly create a Blipp
2. **Choose your time** - 2-30 minute summaries tailored to your schedule
3. **Subscribe to shows** - Get automatic Blipps whenever new episodes drop
4. **Listen to the original** - One tap takes you to the full episode

**Channel-specific adaptations:**
- **Product Hunt:** Lead with headline + product description. Demo briefing link.
- **Hacker News:** Technical angle - "We built an AI that distills podcasts into voice briefings"
- **Twitter/X thread:** Headline > problem > 4 feature pillars > CTA
- **Press pitch:** Problem statement > product description > differentiator ("Not transcripts. Not show notes. Audio briefings that sound natural and capture what matters.")
- **Referral messaging:** "Don't binge. Just Blipp. Share with a friend."

## Channel Strategy

| Channel | Role | Budget | Priority |
|---------|------|--------|----------|
| Product Hunt | Spike awareness | Free | P0 - launch day |
| SEO / Content | Sustainable organic | Free (time) | P0 - start week 1 |
| Referral program | Viral loop | Revenue share | P0 - launch day |
| Podcast partnerships | Credibility + reach | Revenue share | P1 - week 2+ |
| Google Ads | High-intent capture | $500-1k/wk | P1 - week 3+ |
| Social ads | Awareness | $300/wk | P2 - week 4+ |
| Newsletter sponsorships | Targeted reach | $200-500/placement | P2 - week 4+ |

## Infrastructure Readiness

- [ ] Load testing: pipeline handles 10x current volume
- [ ] Auto-scaling or queue backpressure tuning for burst traffic
- [ ] CDN and caching optimized for audio delivery (R2 + CF)
- [ ] Monitoring dashboards: real-time sign-ups, pipeline health, error rates
- [ ] On-call rotation or alerting for launch week
- [ ] Customer support process defined (response SLA, escalation path)

## Launch Day Runbook

1. Remove invite gate (deploy config change)
2. Publish landing page updates (already live - verify final state)
3. Submit Product Hunt listing
4. Post Hacker News Show HN
5. Send announcement tweets/posts
6. Monitor pipeline health dashboard
7. Respond to early feedback within 2 hours
8. End-of-day retrospective: sign-ups, errors, sentiment
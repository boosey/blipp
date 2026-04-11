# $500 Pre-Flight Ad Test Plan

**Purpose:** Before raising family money, spend $500 of your own money to test whether Google Ads can actually acquire Blipp customers at a price that makes the business work. This is a **learning exercise**, not a growth exercise. The goal is *information*, not users.

**Hard rule:** Do not raise a dollar from family until this test is complete and you have honest answers to the questions below.

---

## 1. What you're actually testing

You are **not** testing whether ads can make Blipp successful. You are testing four very specific things, in order of importance:

1. **Can you get people to click your ad at a reasonable cost?** (Click-through rate, cost per click)
2. **Do the people who click actually sign up?** (Landing page conversion rate)
3. **Do the people who sign up actually use the product?** (Activation rate)
4. **Do any of them become paying customers?** (Conversion to paid, cost per paying customer)

Each of those is a gate. If you fail at gate 1, gates 2–4 don't matter. Run the test in a way that lets you see clearly at which gate you lose people.

---

## 2. Budget allocation

**Total:** $500
**Timeline:** 3 weeks

| Week | Daily spend | Weekly total | Cumulative |
|---|---|---|---|
| Week 1 | $20/day | $140 | $140 |
| Week 2 | $25/day | $175 | $315 |
| Week 3 | $25/day | $175 | $490 |

Leave ~$10 unspent as a buffer for Google's billing cycle overlap and any one-day overspend.

**Why these numbers:**
- Low enough that the total loss is survivable if you learn nothing
- High enough that you'll accumulate real click volume — at least a few hundred clicks across the three weeks, which is the minimum for conversion rates to mean anything
- Staged so you can **kill the test in Week 1** if the click-through rate is disastrous, without spending the rest

---

## 3. Ad setup

### 3a. Platforms

**Start with Google Ads only.** One platform, one learning target. Adding Facebook, Reddit, or TikTok at the same time will triple your complexity and halve your signal.

If Blipp's customers are highly visual or impulse-driven, you could swap Google Ads for Meta Ads instead — but pick *one*. Do not split the $500 across platforms.

### 3b. Campaign structure

Create **one campaign** containing **one ad group** containing **three ad variations**. Do not create five ad groups and ten keywords — you don't have the budget for statistical significance across that many dimensions.

### 3c. Ad variations — test three headlines

The biggest lever in a pre-flight test is the headline. Write three different angles for the same product:

- **Variation A — Problem-focused:** lead with the pain point ("Tired of [specific problem]?")
- **Variation B — Outcome-focused:** lead with the result ("Get [specific outcome] in [time]")
- **Variation C — Identity-focused:** lead with who it's for ("For [specific type of person] who want [thing]")

Let Google rotate them evenly. Do not enable "optimized" rotation in Week 1 — you want clean comparison data, not Google's early guess about which is best.

### 3d. Keywords / targeting

- Start with **5–10 tightly relevant keyword phrases**, all as "phrase match" or "exact match" — never "broad match" on a $500 budget. Broad match will burn through your money on irrelevant traffic.
- Set a **location filter** to wherever Blipp is actually usable (likely US, or US + Canada + UK if applicable).
- Set a **daily budget cap** at the daily spend number above, and double-check it's enforced.
- Set a **max CPC bid cap** at around $2–$3 to start. If Google tells you that's too low to show your ads at all, raise it to $4, but do not let it run open-ended.

### 3e. Negative keywords

Before launching, add an obvious negative keyword list: "free", "jobs", "salary", "how to", "tutorial", "login", any competitor names you don't want to appear alongside. This prevents ~20% of your budget from evaporating on junk traffic.

---

## 4. Landing page setup

### 4a. One landing page, not the homepage

Send ad traffic to a **dedicated landing page**, not the Blipp homepage. The homepage serves many audiences; the landing page serves exactly one — the person who just clicked the ad. This single change often doubles conversion rate.

The landing page should have:

- **A headline that matches the ad's promise.** If the ad said "Get X in Y days," the landing page's top line says the same thing. Mismatch kills conversion.
- **A 1-sentence subhead** explaining what Blipp does, in plain language, to someone who has never heard of it
- **One clear call to action** — a single sign-up button above the fold. Not three buttons, not a navigation bar, not a pricing table.
- **2–4 proof points** (features, benefits, screenshots) below the fold
- **No footer links that let people wander off** — remove your nav bar on this page
- **Mobile layout that actually works.** At least half your clicks will come from phones.

### 4b. Sign-up flow

The signup flow from landing page to "in the product" should be as short as physically possible. Every field you ask for loses you customers. For the pre-flight, consider:

- Email-only signup if possible, with password set later
- No credit card required at signup
- No "verify your email before continuing" blocker if you can avoid it
- A visible "I'm in" moment within 60 seconds of clicking the ad

### 4c. Tracking you need to set up before launching

This is non-negotiable. If you launch the test without tracking, you will have spent $500 to learn nothing.

- [ ] **Google Analytics 4** (free) on the landing page
- [ ] **Google Ads conversion tracking** — fire a conversion event on sign-up completion (you already have this shipping per your recent commits)
- [ ] **UTM parameters** on all ad URLs so you can tell Google Ads traffic apart from organic
- [ ] **A way to see which ad variation converted** — Google Ads will do this automatically if set up correctly
- [ ] **An event that fires when a new user completes their first meaningful action in the product** (activation) — this is the one most founders skip and later regret

---

## 5. Metrics to track

Track these in a simple spreadsheet, updated at the end of each week.

| Metric | Definition | Why it matters |
|---|---|---|
| **Impressions** | How many times the ad was shown | Sanity check — are you even being shown? |
| **Clicks** | How many people clicked the ad | Volume of your funnel |
| **CTR (Click-through rate)** | Clicks ÷ Impressions | Tells you if the ad copy is working |
| **CPC (Cost per click)** | Total spend ÷ Clicks | Tells you if keywords are overpriced |
| **Landing page visits** | From GA4 | Should roughly match clicks |
| **Sign-ups** | People who completed the sign-up form | Tells you if the landing page is working |
| **Signup conversion rate** | Signups ÷ Landing page visits | The most important number in the test |
| **Cost per signup** | Total spend ÷ Signups | Rough early CAC |
| **Activation** | Signups who completed a meaningful first action | Tells you if sign-ups are real |
| **Paying conversions** | Signups who paid anything | Rare at this scale, but track it |

You will not get statistically significant answers on all of these from $500. You will get **directional** answers on all of them, and **signal** on the top three. That is the goal.

---

## 6. Decision thresholds — go / no-go / fix-and-retry

At the end of Week 1, pause and look at the numbers. Do the same at the end of Week 2 and Week 3.

### Gate 1: Are the ads getting clicked?

**Metric: CTR**

- **Good: CTR above 2%** — ads are resonating, proceed
- **Okay: CTR 1–2%** — ads are working but not great, proceed and tune
- **Bad: CTR below 1%** — nobody cares about your ad copy; the rest of the test is a waste until you fix this
- **Terrible: CTR below 0.5%** — pause the test in Week 1, rewrite all three headlines, and restart

### Gate 2: Are clickers signing up?

**Metric: Landing page conversion rate**

- **Good: 5%+ sign-up rate** — the landing page is doing its job
- **Okay: 2–5%** — it works but has room to improve
- **Bad: under 2%** — the ad is drawing people who don't want what Blipp sells, or the landing page is failing to convince them
- **Diagnostic:** If CTR is high but signup rate is low, the ad is over-promising or the landing page is under-delivering. Fix the mismatch before continuing.

### Gate 3: Are sign-ups real?

**Metric: Activation rate (signups who do something meaningful)**

- **Good: 50%+ activation** — the sign-ups are real humans who wanted the product
- **Okay: 25–50%** — there's friction in onboarding that's costing you users
- **Bad: under 25%** — people are signing up for the wrong reasons (curiosity, confusion, or bots), or the product itself is failing them in the first session

### Gate 4: Does anyone pay?

**Metric: Cost per paying customer (CAC)**

Honestly, you will probably not get enough paying conversions from $500 to say anything definitive. That's fine. The question you're trying to answer at this stage is: **"Did even one or two people pay, and if so, roughly what did they cost me?"**

- **Encouraging:** At least 1–3 paying customers, CAC under ~$200
- **Worrying:** Zero paying customers but healthy activation — the product/pricing/nurture flow has a problem
- **Critical:** Zero paying customers and low activation — the funnel is broken upstream of payment

---

## 7. What you do with the results

### If the test results are encouraging (enough gates pass)

You have a real story to tell family contributors:

> "I spent $500 of my own money and here are the exact numbers. CTR was X%, signup rate was Y%, activation was Z%, and I got N paying customers at a CAC of roughly $M. At scale, if those numbers hold, the $42k ad budget should bring in approximately [conservative range] of paying users. Here's what I'm uncertain about and here's what I'll be watching."

That pitch is dramatically more credible than anything you could say without the data.

### If the results are mixed

Do not raise yet. Identify the weakest gate, fix it, and run a second small test ($200–$300) on the fixed version. If the second test improves, *then* raise.

### If the results are bad

**Do not raise.** Take the outcome seriously. Options:

- Rework the landing page, ad targeting, or pricing and test again with another small budget
- Reconsider whether ads are the right acquisition channel at all — maybe Blipp needs a different go-to-market (content, community, partnerships, outbound)
- Reconsider whether the product needs more work before acquisition spend makes sense

Any of those is a better outcome than raising family money on a broken funnel.

---

## 8. Common mistakes to avoid

- **Spending the $500 in one week** — you want three weeks of learning, not a three-day blitz
- **Changing the ads every day** — every change resets your learning; hold variations fixed for at least a week
- **Running broad match keywords** — the fastest way to waste the budget
- **Sending traffic to the homepage** — dedicated landing page, every time
- **Not installing conversion tracking before launching** — you'll blow the budget and learn nothing
- **Judging CTR or CPC against "industry benchmarks" blogs** — your benchmarks are Blipp's own numbers vs. what the economics require, not what some blog post about dentists said
- **Mistaking "I got some sign-ups" for "it works"** — sign-ups that don't activate or pay are just noise
- **Deciding the test is a failure on Day 2** — give the data room to stabilize; algorithms take 3–5 days to start showing your ads efficiently
- **Deciding the test is a success on Day 2** — the first wave of clicks is always the cheapest and highest-intent; numbers usually get worse before they stabilize

---

## 9. Pre-launch checklist

Before you press "launch" on the Google Ads campaign, confirm every line below.

- [ ] Dedicated landing page is live at a clean URL
- [ ] Landing page headline matches at least one of the three ad variations
- [ ] Single call-to-action button above the fold
- [ ] Landing page works on mobile (tested on an actual phone)
- [ ] Sign-up flow is as short as possible
- [ ] Google Analytics 4 tag is firing on the landing page
- [ ] Google Ads conversion tracking fires on successful sign-up
- [ ] Activation event fires on first meaningful in-product action
- [ ] UTM parameters on all ad URLs
- [ ] Three ad variations written, reviewed, and entered
- [ ] 5–10 phrase-match or exact-match keywords added
- [ ] Negative keyword list added
- [ ] Daily budget cap set
- [ ] Max CPC bid cap set
- [ ] Campaign location filter set
- [ ] Spreadsheet ready to log daily/weekly metrics
- [ ] Calendar reminder to review numbers at end of Week 1 (and pause if catastrophic)

---

## 10. What success looks like

At the end of three weeks and $500, you should be able to answer these questions clearly:

1. **Can I show an ad to the right people at a price I can afford?** (yes/no/maybe — with a number)
2. **Of the people who click, what fraction sign up?** (a percentage, with at least 200+ clicks of data behind it)
3. **Of the people who sign up, what fraction actually use the product?** (a percentage)
4. **Did anyone pay, and if so, what did they cost me?** (a number, even if it's a very rough one)
5. **What is the single biggest thing I'd fix before spending real money?**

If you can answer those five questions honestly, the $500 was well spent — even if the answers are bad. Especially if the answers are bad, actually. Bad answers now save $42k of family money from being spent on a broken funnel.

---

## 11. Adversarial reminder

The temptation during this test will be to interpret every number charitably — to tell yourself the CTR is "not that bad," the sign-up rate is "probably going to improve at scale," the lack of paying customers is "because the test was small." **Resist that.** Numbers at $500 do not magically get better at $45,000 — they usually get worse, because the highest-intent traffic is always the cheapest.

If the pre-flight is encouraging, scaling has upside. If the pre-flight is discouraging, scaling just makes the losses bigger.

Be honest with yourself about which you're looking at. Your family is going to trust you to be honest with them; start by being honest with yourself first.

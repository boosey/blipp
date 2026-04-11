# Blipp — Friends & Family Funding Prospectus

**Version 1.0** — April 2026

---

## Please read this first

This document describes an opportunity to help fund Blipp, a software product I have been building on my own for the past several months. I am offering this opportunity to a small circle of family and friends who know me personally.

Before you read anything else, I need you to understand one thing:

> **You can lose every dollar you put in. All of it. Zero back. This is not a bank deposit, not a loan with a guarantee, not a safe investment. Early-stage software products fail far more often than they succeed. If losing this money would change your life, hurt your family, delay your retirement, or damage our relationship, please do not participate. I would rather have you at Thanksgiving than have your money.**

I will repeat this warning throughout the document, because it is the most important thing in it.

---

## 1. What Blipp is

Blipp is a software product I have been building as the sole developer. Without going deep into the technical details here, it is a web-based service that users sign up for, pay a subscription to, and use through their browser. The product is built, working, and ready to put in front of real users. What it does not yet have is customers or revenue.

I have personally put **400+ hours** of work into Blipp so far, acting in every role the project needs: business analyst, solution designer, CTO, and senior developer. A blended market rate for someone filling all four of those roles is roughly **$300/hour**, which means I have already contributed approximately **$120,000 of labor** to Blipp for free. I am not asking anyone to pay me back for that work. I am mentioning it only so you understand that I have significant skin in the game before asking anyone else for anything, and that every additional hour I put in going forward is also unpaid.

## 2. What I am asking for

I am asking a small group of family and friends to help fund the **operating costs** of running Blipp for its first year. Operating costs means two things:

1. **Advertising** — paying Google and similar platforms to show Blipp to potential customers
2. **Infrastructure** — the servers, databases, and services that keep the product running

I am **not** asking anyone to pay me a salary. I will continue to do all the development, customer support, and day-to-day operations myself, for free, alongside whatever else I am doing to pay my own bills. The money raised here goes entirely into making the product visible to customers and keeping the lights on.

## 3. How much I am raising and when

I am splitting the fundraise into **two rounds of $22,500 each**, for a total of **$45,000 across the year**.

- **Round 1** — $22,500, raised now, covers months 1 through 6
- **Round 2** — $22,500, raised around month 5, covers months 7 through 12

Splitting it this way protects both of us. After six months, we will have real data showing whether the product is working. If it is, Round 2 is an easy decision. If it is not, we can talk honestly about whether to continue at all, adjust course, or shut it down. Nobody is locked into a twelve-month commitment on day one.

**Minimum contribution:** $1,000
**Maximum contribution per person, per round:** $15,000 (so a single contributor can put in up to $30,000 total across both rounds)
**Hard cap on total raised:** $50,000 across both rounds combined (I will close the round and turn away additional money if we hit this)

## 3a. Current state of Blipp (as of this document)

**The product itself.** Blipp is functional end to end. Users can sign up, authenticate, pay, use the core product, and be supported. The infrastructure is deployed to production on Cloudflare. All the major pieces — authentication, billing, the processing pipeline, the admin tools I use to operate it, and the user-facing interface — are built and working.

**Customers.** Zero paying customers as of this writing. This is not a product that has been quietly growing in the background; it is a finished-enough product that has not yet been put in front of its audience at any meaningful scale.

**Launch planning.** I have written detailed launch plans covering both a soft launch (small, quiet rollout to a limited audience for learning) and a hard launch (scaled-up paid acquisition with supporting content and social channels). These live in the project's `docs/` folder as `soft-launch-plan.md` and `hard-launch-plan.md` and can be shared with any potential contributor who wants to read the full playbook before deciding.

**Personal pre-flight ad spend — results TBD.** Before I ask anyone else to fund advertising, I am spending a small amount of my own money (roughly $500) on a structured three-week Google Ads pre-flight test. The purpose is to measure whether paid advertising can actually acquire Blipp customers at a price that makes the business viable, before scaling spending to $100/day with other people's money. The full test plan is documented at `docs/fundraising/preflight-test-plan.md`. **At the time you are reading this version of the document, the results of that pre-flight test may or may not be available.** If they are not, I will update this section with the actual numbers — click-through rate, sign-up conversion rate, activation rate, and cost per paying customer — before asking for any contribution. **If you are reading this document and this section still says "TBD," ask me where the pre-flight data is before you decide anything.**

## 4. Where the money goes

### Round 1 — Months 1 through 6 — $22,500

**Advertising — approximately $15,900**

I will not spend the full advertising budget on day one. Blasting money at ads before the funnel is proven is how new products waste their runway. Instead, I will ramp up slowly over the first eight weeks, learning what works at each spending level before increasing it.

| Week | Daily ad budget | Weekly spend |
|---|---|---|
| 1 | $20/day | $140 |
| 2 | $30/day | $210 |
| 3 | $40/day | $280 |
| 4 | $50/day | $350 |
| 5 | $60/day | $420 |
| 6 | $75/day | $525 |
| 7 | $90/day | $630 |
| 8 onward | $100/day | $700 |

After week 8, ad spend holds at roughly $100/day for the remainder of the six-month period, assuming the ads are actually bringing in customers. If the data shows that ads at a given level are not working, I will pause or reduce spend and work on the product instead. **Advertising budget is a ceiling, not a commitment to burn money.**

**Infrastructure — approximately $3,000**

About $500 per month for the collection of third-party services Blipp depends on to operate. Several of these services are on free tiers today, but any one of them can become a meaningful line item as user volume grows, and the AI-related services in particular can scale into much higher costs with heavy usage.

The current service stack includes:

- **Cloudflare** — hosting, edge compute (Workers), queues, object storage (R2), and the CDN that delivers the product to users
- **Neon** — managed PostgreSQL database
- **Clerk** — user authentication, sign-in, and account management
- **Stripe** — subscription billing and payment processing
- **Anthropic** — AI model provider (Claude), used in the content pipeline
- **OpenAI** — AI model provider, used for specific pipeline stages
- **Groq** — high-speed AI inference provider for latency-sensitive stages
- **Deepgram** — audio transcription
- **Composio** — external tool/integration orchestration
- **Buffer** — social media scheduling and posting
- **Google Ads** — paid customer acquisition
- **Google Analytics** — user and funnel analytics
- **Google Workspace** — email, documents, and business communication
- **Dynu** — dynamic DNS for supporting infrastructure
- **PaperclipAI** — supporting AI service running on a spare laptop at no cloud cost today
- **Podcast Index** — podcast metadata and discovery API
- **Apple Podcasts** — podcast directory and distribution

Several of these are at the free tier today. As Blipp grows, some of them — especially the AI inference providers (Anthropic, OpenAI, Groq, Deepgram) — can become the largest single line items in the entire budget, because their costs scale directly with usage. I'll track this closely in the weekly reports and flag any service that is trending toward a material cost jump before it happens.

**If infrastructure costs run under budget**, I will redirect the savings into additional advertising spend, within the limits of whatever the ad data says is working. The goal is to put every available dollar into customer acquisition, not to leave money sitting unspent.

**Operating capital buffer — approximately $3,600**

Payment processing fees, unexpected service cost increases, small tools and subscriptions, and a cushion for the things I have not thought of yet.

### Round 2 — Months 7 through 12 — $22,500

- **Advertising** — approximately $18,200 (roughly $100/day for the full six months)
- **Infrastructure** — approximately $3,000
- **Operating capital buffer** — approximately $1,300

Round 2 only happens if Round 1 has produced real, visible results. If it has not, we have a different conversation instead of automatically moving forward.

## 5. What you get in return

### A note on valuation before we discuss terms

Before describing the structure, I want to be honest about something fundamental: **Blipp, right now, has a fair-market valuation of $0.00.**

That is not false modesty. It is simply how early-stage software companies are valued. A company with zero paying customers, no revenue history, no proven distribution channel, and a single founder has no objective basis for a valuation. Any number I put on it — $100,000, $1 million, $10 million — would be made up.

More importantly, even if Blipp becomes a modestly successful business, **it will most likely always have a valuation of $0 in the sense that matters to investors.** Here's why: professional investors make money from equity when a company is either acquired by a larger company or goes public. Small, bootstrapped SaaS products of the kind Blipp is likely to become — ones that might eventually generate a nice income but are not rocketing toward a billion-dollar exit — rarely get acquired, and essentially never go public. The equity in such a company can technically exist on paper forever without ever converting into real money for the people who own it.

This is why an equity offering would not make sense here. **Equity in a company worth $0, with no realistic path to a liquidity event, is itself worth $0.** I would be offering you nothing dressed up to look like something, and any honest investor would walk away.

So instead of equity, I am offering a structure that **actually pays you from real money, if real money starts coming in**: a revenue share.

### The structure

This is not an equity deal. You are not buying shares in a company. You are not going to own a piece of Blipp. I want to be very clear about that, because it protects both of us from awkward conversations later.

Instead, you get a **revenue share** — a cut of the money Blipp takes in from customers, paid to you until you have been paid back 2.5 times what you put in.

### The formula

> For every **$1,000** you contribute, you receive **0.5% of Blipp's gross revenue** (the total money paid by customers before expenses) until you have been paid back **2.5 times** your original contribution. After that, your share drops to **0.1% per $1,000 contributed** for **five additional years**, then ends.

A note on "gross" rather than "net": this formula is deliberately based on gross revenue — the actual money customers pay, as it appears in Stripe — rather than net revenue (gross minus costs). Gross is independently verifiable, un-gameable, and does not depend on how I categorize expenses. It keeps the deal simple and avoids the kind of quiet accounting disagreements that can turn into family arguments later.

### What that looks like in dollars

| Your contribution | Your revenue share | Paid back when you've received | Tail (5 years) |
|---|---|---|---|
| $1,000 | 0.5% of gross | $2,500 | 0.1% |
| $2,500 | 1.25% of gross | $6,250 | 0.25% |
| $5,000 | 2.5% of gross | $12,500 | 0.5% |
| $10,000 | 5.0% of gross | $25,000 | 1.0% |
| $15,000 | 7.5% of gross | $37,500 | 1.5% |

### How fast could you get paid back?

Honest answer: **I have no idea, and anyone who tells you they know is lying.** But here are some scenarios to give you a sense of the range.

**Subscription pricing.** Blipp's current subscription plans are **$8/month** and **$12/month**, with modest discounts available for annual (yearly upfront) subscriptions. For the scenarios below, I'm assuming that roughly **10% of paying subscribers choose the higher plan** and the remaining 90% choose the lower plan, which gives a **blended average of about $8.40 per paying subscriber per month** — before annual discounts, which would pull the blended number down slightly.

**A note on future revenue beyond subscriptions.** Like most freemium products, Blipp will have a large majority of users on the free tier at any given time, and the scenarios in the table below only count revenue from the minority who convert to a paid plan. There is a planned second revenue stream that is not reflected in these numbers: **audio ads served to free-tier users**. Blipp's core experience is audio-based, which makes it a natural fit for short, sponsored audio insertions that free users would hear as part of the product. This is not built yet and is not counted as revenue in any of the scenarios below — but if and when it ships, it would add a second revenue line that scales with free-tier usage rather than paid conversion, and would count as gross revenue under this agreement the same way subscription revenue does. In other words, audio ad revenue would flow through the same 0.5%-per-$1,000 formula and could meaningfully accelerate payback if the free tier grows faster than the paid tier — which, for most freemium products, it does.

**Assumptions for the table.** The full $45,000 is raised across both rounds, you personally contribute $10,000, the working-proposal rate of 0.5% gross per $1,000 applies (meaning you hold a 5% revenue share until the 2.5× cap is hit), and subscriber counts use the $8.40 blended ARPU.

| If Blipp reaches… | Paying subscribers needed | Your monthly payment (at 5% of gross) | Months to recoup your $10,000 (1×) | Months to reach the $25,000 cap (2.5×) |
|---|---|---|---|---|
| $2,000/month gross revenue | ~240 subscribers | $100 | 100 months (~8.3 years) | 250 months (~20.8 years, probably never) |
| $5,000/month gross revenue | ~595 subscribers | $250 | 40 months (~3.3 years) | 100 months (~8.3 years) |
| $10,000/month gross revenue | ~1,190 subscribers | $500 | 20 months (~1.7 years) | 50 months (~4.2 years) |
| $30,000/month gross revenue | ~3,570 subscribers | $1,500 | ~7 months | ~17 months (~1.4 years) |
| $0/month gross revenue | 0 subscribers | $0 | Never | Never |

**A few things to notice when reading this table:**

- **The subscriber counts are the hardest part of the table to achieve.** Getting to even 240 paying subscribers is real work — that's 240 people who signed up, used the product, and decided it was worth paying for every month. The dollar amounts are a direct consequence of the subscriber counts, not the other way around.
- **Getting your money back (1×) and hitting the 2.5× cap are very different timelines.** Getting your original $10,000 back happens much earlier than reaching the $25,000 cap. Most of the "return" on this kind of deal comes in the second half of the payback curve, not the first.
- **The most likely outcome for any early-stage product is the last row.** Please internalize that before writing a check.

### Why revenue share instead of equity

Four reasons, in order of importance:

1. **Blipp has a fair-market valuation of $0 right now, and will most likely always have a fair-market valuation of $0.** As explained earlier in this section, small bootstrapped SaaS products rarely get acquired and essentially never go public. Equity in a company with no realistic liquidity event is a piece of paper that never converts into money, no matter how well the business does. Revenue share pays out from actual customer payments, which is the only kind of money this business is likely to ever produce.
2. **It's simpler.** No cap table, no shareholder votes, no complicated tax forms, no "what happens when my cousin wants to sell her shares" problem.
3. **It actually pays you if things go well but never get acquired.** Equity only pays out if the company is sold or goes public, which is rare. Revenue share pays you from real customer payments as soon as they start coming in.
4. **It's honest about what this is.** This is me asking people who care about me to fund a bet, with an upside if the bet pays off. Pretending it's a Silicon Valley seed round with term sheets and liquidation preferences would be dishonest.

## 6. What I commit to doing

**Every week**, I will send a written update to all contributors containing:

- **Users** — how many signed up, how many are actively using the product, how many canceled
- **Income** — every dollar that came in from customers that week
- **Expenses** — every dollar that went out, broken down by category (ads, infrastructure, fees, etc.)
- **What I worked on** — a plain summary of what I built, fixed, or shipped that week
- **What is working and what is not** — my honest assessment, including when things are going badly

**Every month**, I will send a longer update that includes the running total of expenses vs. budget, so you can see exactly where your money has gone.

**If something goes wrong**, you will hear about it from me first, in writing, with an explanation of what happened and what I am doing about it. I will not hide bad news or delay it to make myself look better.

**If the product is clearly failing**, I will tell you. I will not keep burning your money out of pride.

## 7. What I cannot commit to

I cannot commit to a specific revenue target, a specific number of users, a specific timeline for profitability, or a specific outcome of any kind. Anyone who commits to those things in an early-stage product is either lying or does not understand the business they are in.

What I can commit to is **effort, honesty, and transparency**. That is all any early-stage founder can honestly offer.

## 8. The risks — please read this section twice

I am going to list the specific ways you can lose your money, because you deserve to know them clearly before deciding.

1. **Nobody wants the product.** This is the most common outcome. I build a product, run ads, and nobody signs up or the people who sign up don't stay. The money goes into advertising that produces no return. You receive nothing.

2. **The ads don't work at a sustainable price.** Google Ads can be expensive. If it costs $100 to acquire a customer who only pays $10/month and churns after two months, the math never works. I may discover this only after spending part of your money. You receive little or nothing.

3. **A competitor shows up with more money.** A well-funded competitor could enter the same space and outspend me on ads, features, or both. Blipp could be a fine product that simply loses the race. You receive little or nothing.

4. **I get sick, injured, or burned out.** I am one person. If I can't work for an extended period, the product stalls. I do not have a co-founder or backup. You receive little or nothing.

5. **A platform change breaks the business.** Blipp relies on several third-party services (cloud hosting, authentication, payment processing, Google Ads itself). If any of them change their terms, pricing, or policies in a way that damages Blipp, there may be nothing I can do about it.

6. **I make a bad decision.** I am going to make mistakes. Some will be small. One or two might be large. I will do my best, but I cannot promise perfection.

7. **Revenue never reaches the level where payback is meaningful.** Even if Blipp technically succeeds at a small level — say, a few thousand dollars a month in revenue — it may take so long for you to be paid back that the return is effectively worthless.

**You should assume, when you write the check, that you will not see the money again. If the thought of losing this money makes you feel sick, do not participate. If you can treat it like money spent on a meaningful gift to someone you care about — with the small possibility of a return someday — then this might be right for you.**

## 9. How to participate

If after reading all of this you still want to be part of it:

1. **Tell me how much you want to contribute**, within the $1,000 to $15,000 per-round range
2. **Tell me honestly whether you can afford to lose it.** I will not take money from anyone who cannot. I reserve the right to decline any contribution if I think it is too much for the person offering it.
3. **I will send you a simple written agreement** covering everything in this document. I will have a lawyer review it first so that we are both protected. The agreement will cost me a few hundred dollars regardless of how many people participate, and I will pay for it myself.
4. **You will have at least one week** to read the agreement, ask questions, and walk away with zero hard feelings.
5. **Once the agreement is signed**, you will wire the funds to a dedicated account I will set up specifically for this purpose. Your money will not mix with my personal accounts.
6. **Weekly updates start immediately.**

## 10. Questions I expect you to ask

**"What if I need my money back early?"**
You can't get it back. Once it's committed, it's spent on ads and infrastructure. This is the single biggest reason to only contribute money you can afford to lose.

**"What if Blipp gets huge and sold for millions?"**
You still only get the revenue share described above, capped at 2.5× your contribution plus the five-year tail. You will not get a piece of a sale. That might feel unfair if it happens, and I want to be upfront about it now so there are no hard feelings later. If you want to own a piece of the company, this is not the right deal for you.

**"What if you raise a big professional investment round later?"**
Your revenue share continues unchanged. Professional investors would be buying equity in the company, which is a separate thing from your revenue share on gross sales.

**"What if the two rounds don't fill completely?"**
If Round 1 only raises, say, $15,000, I will scale the ad spending down to match. The product will still run, just with less fuel. Round 2 might be adjusted or skipped entirely.

**"Can I put in more in Round 2 than Round 1?"**
Yes. The per-person limit is **$15,000 per round**, and a single contributor can put up to **$30,000 total across both rounds combined**. So you could, for example, put in $5,000 in Round 1 and $15,000 in Round 2, or any other combination that stays within those limits.

**"What if I want to drop out between Round 1 and Round 2?"**
That's fine. Your Round 1 revenue share stays in place under the original terms. You are under no obligation to participate in Round 2.

**"What if I tell you no?"**
We are still family/friends. This document will never be mentioned again unless you bring it up. I promise.

## 11. My commitment to you, in plain words

I am asking you to trust me with money. I take that seriously. In return, I commit to:

- Spending every dollar on what I said I would spend it on
- Telling you the truth every week, especially when the truth is uncomfortable
- Working hard, because my own 450 hours and thousands more to come are riding on the same bet
- Treating this as a real obligation, not a favor I am collecting from relatives
- Walking away honestly if the thing clearly isn't working, rather than dragging it out

And above all: **protecting our relationship first, and the money second.** If at any point this arrangement starts to damage how we relate to each other, I want you to tell me, and we will figure out how to unwind it gracefully.

Thank you for reading this far. Whatever you decide, it means a lot that you took the time.

— [Your name]

---

## Appendix A — Glossary of terms

This section explains every term in this document that might be unfamiliar, along with a few extras you might run into if you read more about startup funding elsewhere.

### Financial and funding terms

**Acquisition** — When a larger company buys a smaller one. For example, if Google bought Blipp, that would be an acquisition. Investors who own equity get paid out in an acquisition; revenue share holders do not, unless the deal is specifically structured to include them.

**Burn rate** — How fast a company spends money each month. If Blipp spends $4,000/month and has $24,000 in the bank, its "runway" is six months.

**Cap / Valuation cap** — In an equity deal (not this deal), the maximum company valuation at which an investor's money converts into shares. Lower cap = more ownership for the investor.

**Cap table** — A list of everyone who owns a piece of a company and how much. Because this deal does not involve equity, Blipp does not need a cap table for it.

**Check** — Slang for an investment. "A $10,000 check" means someone contributed $10,000.

**Close (the round)** — The point at which fundraising stops and no more money is accepted.

**Contribution** — In this document, the money a friend or family member gives to fund Blipp's operating costs. It is not a loan, not a donation, and not a purchase of shares.

**Dilution** — When new investors join a company, existing owners' percentages go down ("get diluted"). Does not apply to this deal because nobody is buying ownership.

**Equity** — A piece of ownership in a company. Shares of stock are equity. **This deal does not involve equity.**

**Gross revenue** — Total money received from customers, before subtracting any expenses. If Blipp collects $10,000 from customers in a month, gross revenue is $10,000, even if Blipp spent $8,000 to earn it.

**Net revenue / Net income** — What's left after expenses. Blipp revenue share payments are based on **gross revenue**, not net, which is better for you (you don't have to trust my accounting of expenses).

**Liquidation preference** — An equity term that doesn't apply here. Mentioned only because you may see it elsewhere.

**Operating costs** — The ongoing cost of running the business. For Blipp, this is mostly advertising and infrastructure.

**Pre-revenue** — A company that has not yet made money from customers. Blipp is currently pre-revenue.

**Revenue share** — An agreement where an investor receives a percentage of a company's sales instead of owning shares. **This is the deal being offered here.**

**Round (funding round)** — A period during which a company raises a specific amount of money from a specific group of investors under specific terms. This prospectus describes two rounds.

**Runway** — How many months a company can operate before running out of money. If Blipp has $22,500 and spends $3,750/month, its runway is six months.

**SAFE (Simple Agreement for Future Equity)** — A common early-stage investment contract that converts into shares later. **Not being used in this deal.** Mentioned because you may have seen it elsewhere.

**Seed round / Series A** — Terms for different stages of professional venture capital fundraising. **Not what this is.** This is a friends-and-family round, which is smaller, earlier, and less formal.

**Term sheet** — A formal document outlining investment terms, usually associated with professional investors. This prospectus serves a similar purpose for this deal but is written to be readable by humans.

**Valuation** — What a company is "worth" on paper. For an early-stage product with no customers, valuation is essentially made up. **Blipp is not assigning itself a valuation in this deal**, which is one of the reasons the deal is structured as revenue share.

### Product and startup terms

**Activation rate** — The percentage of people who sign up for a product and then actually use it in a meaningful way for the first time. For Blipp, this would mean the percentage of new sign-ups who complete whatever first real action proves they intended to use the product, not just that they filled out a form. High activation means your sign-ups are real; low activation means people are signing up and immediately bouncing, which is a sign the onboarding or the product itself is failing them.

**ARR (Annual Recurring Revenue)** — The annualized value of subscription revenue. If Blipp has 100 customers each paying $10/month, MRR is $1,000 and ARR is $12,000.

**CAC (Customer Acquisition Cost)** — How much it costs to acquire one paying customer. If Blipp spends $1,000 on ads and gets 10 new customers, CAC is $100. See also "Cost per paying customer," which is the same concept when specifically tied to paid advertising spend.

**Churn** — When customers cancel their subscription. High churn is one of the most common reasons early-stage subscription products fail.

**Click-through rate (CTR)** — The percentage of people who see an ad and then click on it. If an ad is shown to 1,000 people and 15 of them click, the CTR is 1.5%. CTR is the first signal of whether ad copy and targeting are working — a low CTR means nobody cares about the ad, and everything downstream of it is irrelevant until that's fixed.

**Conversion rate** — The percentage of people who take a desired action. For example, the percentage of people who click an ad and then sign up.

**Cost per paying customer** — How much you spent on acquisition (typically advertising) divided by the number of people who actually became paying customers, not just sign-ups. This is the most economically meaningful version of CAC because it measures the full cost of turning a stranger into revenue. If Blipp spends $500 on ads, gets 50 sign-ups, and 5 of those sign-ups become paying customers, the cost per paying customer is $100. This number is the one that determines whether the business math works — if cost per paying customer is higher than the lifetime value of that customer, the business loses money on every sale.

**Funnel** — The path a potential customer takes from first seeing an ad to becoming a paying customer. Each step of the funnel loses some people; the goal is to lose as few as possible.

**LTV (Lifetime Value)** — The total amount of money an average customer pays before they churn. A healthy subscription business has LTV significantly greater than CAC.

**MRR (Monthly Recurring Revenue)** — Total subscription revenue per month.

**PMF (Product-Market Fit)** — The point at which a product clearly has customers who want it, pay for it, and stick around. Pre-PMF is risky; post-PMF is where most of the value gets created.

**Pre-revenue** — See above.

**SaaS (Software as a Service)** — A business model where customers pay a recurring subscription to use software delivered over the internet. Blipp is a SaaS product.

**Sign-up conversion rate** — The percentage of people who arrive on the landing page and then complete the sign-up form. If 200 people visit the landing page and 10 of them sign up, the sign-up conversion rate is 5%. This is one of the most important numbers in any paid-acquisition funnel — once you know your CTR is working, this is the next gate. A healthy sign-up conversion rate for a SaaS product is typically somewhere between 2% and 10% depending on the product, the audience, and how much friction is in the sign-up flow.

### Technical infrastructure terms (only if you're curious)

**Cloud hosting** — Renting computer time from a large provider (Amazon, Google, Cloudflare, etc.) rather than owning servers. Blipp runs on cloud infrastructure, which is part of the $500/month infrastructure budget.

**Database** — Where user accounts and customer data are stored. Blipp uses a managed cloud database.

**Infrastructure** — Collectively, all the services Blipp depends on to function: hosting, database, authentication, email, payments, etc.

### Legal and document terms

**Disclosure** — Telling you something important that you have a right to know. This entire document is one long disclosure.

**Prospectus** — A document explaining an investment opportunity. This word is traditionally used for formal public offerings, but I am using it here to mean "the document you read before deciding whether to help fund Blipp." This is not a legally registered securities offering.

**Securities law** — The body of law regulating public investment offerings. Friends-and-family rounds under specific dollar thresholds and investor types are generally exempt from the most complex requirements, but the agreement I send you will be reviewed by a lawyer to make sure we are compliant with the exemptions.

---

## Appendix B — The single most important reminder

> **You can lose every dollar you put in. This is not a safe investment. It is a bet. Only participate if you can afford to lose the money and still feel fine about our relationship the next morning.**

If you've read the whole document and you still want in, we'll talk.

If you've read the whole document and you want out, we'll never discuss it again.

Either answer is the right answer, depending on your situation. There is no wrong one.

Thank you.

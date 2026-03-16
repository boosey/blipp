/**
 * Blipp — Stripe Products & Prices Setup
 *
 * Creates Stripe products and prices for each paid Plan in the database,
 * then updates the Plan records with the generated Stripe IDs.
 *
 * Skips the "free" plan (no Stripe product needed).
 * Skips plans that already have a stripeProductId set.
 *
 * Usage:
 *   DATABASE_URL="postgres://..." STRIPE_SECRET_KEY="sk_test_..." npx tsx scripts/setup-stripe.ts
 *
 * Run twice — once for staging (sandbox key + staging DB) and once for production (live key + prod DB).
 */

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma-node";
import Stripe from "stripe";
import "dotenv/config";

const databaseUrl = process.env.DATABASE_URL;
const stripeKey = process.env.STRIPE_SECRET_KEY;

if (!databaseUrl) {
  console.error("ERROR: DATABASE_URL is required");
  console.error("Usage: DATABASE_URL=... STRIPE_SECRET_KEY=... npx tsx scripts/setup-stripe.ts");
  process.exit(1);
}

if (!stripeKey) {
  console.error("ERROR: STRIPE_SECRET_KEY is required");
  console.error("Usage: DATABASE_URL=... STRIPE_SECRET_KEY=... npx tsx scripts/setup-stripe.ts");
  process.exit(1);
}

const adapter = new PrismaPg({ connectionString: databaseUrl });
const prisma = new PrismaClient({ adapter });
const stripe = new Stripe(stripeKey);

const isLive = stripeKey.startsWith("sk_live_");
const mode = isLive ? "LIVE" : "SANDBOX";

async function main() {
  console.log(`\n══  Stripe Setup (${mode})  ══\n`);

  const plans = await prisma.plan.findMany({
    where: { priceCentsMonthly: { gt: 0 } },
    orderBy: { sortOrder: "asc" },
  });

  if (plans.length === 0) {
    console.log("No paid plans found in database. Run 'npx prisma db seed' first.");
    return;
  }

  console.log(`Found ${plans.length} paid plan(s): ${plans.map((p) => p.name).join(", ")}\n`);

  for (const plan of plans) {
    if (plan.stripeProductId) {
      console.log(`[SKIP] ${plan.name} — already has Stripe product: ${plan.stripeProductId}`);
      continue;
    }

    console.log(`[CREATE] ${plan.name}...`);

    // Create Stripe product
    const product = await stripe.products.create({
      name: plan.name,
      description: plan.description || undefined,
      metadata: { blipp_plan_slug: plan.slug },
    });
    console.log(`  Product: ${product.id}`);

    // Create monthly price
    const monthlyPrice = await stripe.prices.create({
      product: product.id,
      currency: "usd",
      unit_amount: plan.priceCentsMonthly,
      recurring: { interval: "month" },
      metadata: { blipp_plan_slug: plan.slug, interval: "monthly" },
    });
    console.log(`  Monthly price: ${monthlyPrice.id} ($${(plan.priceCentsMonthly / 100).toFixed(2)}/mo)`);

    // Create annual price (if plan has annual pricing)
    let annualPrice: Stripe.Price | null = null;
    if (plan.priceCentsAnnual) {
      annualPrice = await stripe.prices.create({
        product: product.id,
        currency: "usd",
        unit_amount: plan.priceCentsAnnual,
        recurring: { interval: "year" },
        metadata: { blipp_plan_slug: plan.slug, interval: "annual" },
      });
      console.log(`  Annual price:  ${annualPrice.id} ($${(plan.priceCentsAnnual / 100).toFixed(2)}/yr)`);
    }

    // Update Plan record with Stripe IDs
    await prisma.plan.update({
      where: { id: plan.id },
      data: {
        stripeProductId: product.id,
        stripePriceIdMonthly: monthlyPrice.id,
        stripePriceIdAnnual: annualPrice?.id || null,
      },
    });
    console.log(`  [OK] ${plan.name} updated in database\n`);
  }

  console.log("══  Done  ══\n");

  // Summary
  const updated = await prisma.plan.findMany({
    where: { stripeProductId: { not: null } },
    orderBy: { sortOrder: "asc" },
  });

  console.log("Plan → Stripe mapping:");
  for (const p of updated) {
    console.log(`  ${p.name} (${p.slug})`);
    console.log(`    Product:  ${p.stripeProductId}`);
    console.log(`    Monthly:  ${p.stripePriceIdMonthly}`);
    console.log(`    Annual:   ${p.stripePriceIdAnnual || "(none)"}`);
  }
  console.log("");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });

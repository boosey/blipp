import { PrismaClient } from "../src/generated/prisma";

const prisma = new PrismaClient();

async function main() {
  await prisma.plan.upsert({
    where: { tier: "FREE" },
    update: {},
    create: {
      tier: "FREE",
      name: "Free",
      priceCents: 0,
      stripePriceId: null,
      stripeProductId: null,
      features: [
        "3 briefings per week",
        "Up to 5 min briefings",
        "3 podcast subscriptions",
      ],
      highlighted: false,
      sortOrder: 0,
    },
  });

  await prisma.plan.upsert({
    where: { tier: "PRO" },
    update: {},
    create: {
      tier: "PRO",
      name: "Pro",
      priceCents: 999,
      stripePriceId: process.env.STRIPE_PRO_PRICE_ID ?? null,
      stripeProductId: process.env.STRIPE_PRO_PRODUCT_ID ?? null,
      features: [
        "Unlimited briefings",
        "Up to 15 min briefings",
        "Unlimited podcast subscriptions",
        "Priority processing",
      ],
      highlighted: true,
      sortOrder: 1,
    },
  });

  await prisma.plan.upsert({
    where: { tier: "PRO_PLUS" },
    update: {},
    create: {
      tier: "PRO_PLUS",
      name: "Pro+",
      priceCents: 1999,
      stripePriceId: process.env.STRIPE_PRO_PLUS_PRICE_ID ?? null,
      stripeProductId: process.env.STRIPE_PRO_PLUS_PRODUCT_ID ?? null,
      features: [
        "Unlimited briefings",
        "Up to 30 min briefings",
        "Unlimited podcast subscriptions",
        "Priority processing",
        "Early access to new features",
      ],
      highlighted: false,
      sortOrder: 2,
    },
  });

  console.log("Seeded plans.");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });

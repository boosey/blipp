/**
 * Bootstrap script: creates a default Free plan and promotes a user to admin.
 *
 * Usage:
 *   npx tsx prisma/bootstrap.ts                    # creates Free plan only
 *   npx tsx prisma/bootstrap.ts admin@example.com   # also promotes user to admin
 *
 * Safe to run multiple times (idempotent).
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma-node";
import "dotenv/config";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  // 1. Create default Free plan if missing
  const existing = await prisma.plan.findFirst({ where: { isDefault: true } });
  if (existing) {
    console.log(`Default plan already exists: "${existing.name}" (${existing.slug})`);
  } else {
    await prisma.plan.create({
      data: {
        name: "Free",
        slug: "free",
        priceCentsMonthly: 0,
        briefingsPerWeek: 3,
        maxDurationMinutes: 5,
        maxPodcastSubscriptions: 3,
        isDefault: true,
        features: ["3 briefings per week", "Up to 5 min briefings", "3 podcast subscriptions"],
        sortOrder: 0,
      },
    });
    console.log("Created default Free plan.");
  }

  // 2. Promote user to admin by email (if provided)
  const email = process.argv[2];
  if (email) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      console.log(`No user found with email "${email}" — sign in first, then re-run.`);
    } else if (user.isAdmin) {
      console.log(`User "${email}" is already an admin.`);
    } else {
      await prisma.user.update({ where: { email }, data: { isAdmin: true } });
      console.log(`Promoted "${email}" to admin.`);
    }
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });

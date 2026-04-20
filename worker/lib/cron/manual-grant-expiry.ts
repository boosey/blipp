import type { CronLogger } from "./runner";
import { recomputeEntitlement } from "../entitlement";

type PrismaLike = {
  billingSubscription: {
    findMany: (args: any) => Promise<any[]>;
    update: (args: any) => Promise<any>;
  };
  user: { update: (args: any) => Promise<any> };
  plan: { findFirst: (args: any) => Promise<any> };
};

/**
 * Marks expired MANUAL BillingSubscription rows as EXPIRED and recomputes the
 * affected user's entitlement so they drop back to the default plan (or a lower
 * paid tier from another active row) once the grant window closes.
 */
export async function runManualGrantExpiryJob(
  prisma: PrismaLike,
  logger: CronLogger
): Promise<Record<string, unknown>> {
  const now = new Date();

  const expired = await prisma.billingSubscription.findMany({
    where: {
      source: "MANUAL",
      status: "ACTIVE",
      currentPeriodEnd: { lt: now },
    },
    select: { id: true, userId: true, planId: true, currentPeriodEnd: true },
    take: 500,
  });

  if (expired.length === 0) {
    await logger.info("No expired manual grants");
    return { expired: 0 };
  }

  await logger.info(`Expiring ${expired.length} manual grant(s)`);

  let downgraded = 0;
  let failed = 0;

  for (const row of expired) {
    try {
      await prisma.billingSubscription.update({
        where: { id: row.id },
        data: { status: "EXPIRED" },
      });
      await recomputeEntitlement(prisma as any, row.userId);
      downgraded++;
    } catch (err) {
      failed++;
      const msg = err instanceof Error ? err.message : String(err);
      await logger.error(`Failed to expire grant ${row.id}: ${msg}`, {
        userId: row.userId,
      });
    }
  }

  return { expired: expired.length, downgraded, failed };
}

import type { CronLogger } from "./runner";
import { getConfig } from "../config";

type PrismaLike = {
  plan: { findFirst: (args: any) => Promise<any> };
  user: { findMany: (args: any) => Promise<any[]> };
  platformConfig: { findUnique: (args: any) => Promise<any> };
};

/**
 * User Lifecycle job: checks for users whose free trial has expired.
 * Currently logs only; future: restrict access, send reminder emails.
 */
export async function runUserLifecycleJob(
  prisma: PrismaLike,
  logger: CronLogger
): Promise<Record<string, unknown>> {
  const trialDays = await getConfig(prisma, "user.trialDays", 14);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - trialDays);

  await logger.info(`Checking for users with expired ${trialDays}-day free trials`);

  const defaultPlan = await prisma.plan.findFirst({ where: { isDefault: true } });
  if (!defaultPlan) {
    await logger.warn("No default plan found in database — cannot check trial expirations");
    return { checked: false, reason: "no_default_plan" };
  }

  await logger.info(`Using default plan "${defaultPlan.id}", cutoff date ${cutoff.toISOString()}`);

  const expiredTrialUsers = await prisma.user.findMany({
    where: {
      planId: defaultPlan.id,
      stripeCustomerId: null,
      createdAt: { lt: cutoff },
    },
    select: { id: true, email: true, createdAt: true },
    take: 100,
  });

  if (expiredTrialUsers.length > 0) {
    await logger.info(`Found ${expiredTrialUsers.length} user(s) with expired trials`);
  } else {
    await logger.info("No expired trial users found");
  }

  // Future: send reminder emails, restrict features
  return { expiredCount: expiredTrialUsers.length, trialDays };
}

import type { CronLogger } from "./runner";

type PrismaLike = {
  plan: { findFirst: (args: any) => Promise<any> };
  user: { findMany: (args: any) => Promise<any[]> };
};

/**
 * User Lifecycle job: checks for users whose free trial has expired.
 * Currently logs only; future: restrict access, send reminder emails.
 */
export async function runUserLifecycleJob(
  prisma: PrismaLike,
  logger: CronLogger
): Promise<Record<string, unknown>> {
  const trialDays = 14;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - trialDays);

  const defaultPlan = await prisma.plan.findFirst({ where: { isDefault: true } });
  if (!defaultPlan) {
    await logger.info("no_default_plan", {});
    return { checked: false, reason: "no_default_plan" };
  }

  const expiredTrialUsers = await prisma.user.findMany({
    where: {
      planId: defaultPlan.id,
      stripeCustomerId: null,
      createdAt: { lt: cutoff },
    },
    select: { id: true, email: true, createdAt: true },
    take: 100,
  });

  await logger.info("trial_expiration_check", {
    expiredCount: expiredTrialUsers.length,
    trialDays,
  });

  // Future: send reminder emails, restrict features
  return { expiredCount: expiredTrialUsers.length, trialDays };
}

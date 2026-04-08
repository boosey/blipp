import type { CronLogger } from "./runner";
import type { Env } from "../../types";
import { getLocalHour } from "../digest-helpers";

type PrismaLike = {
  user: { findMany: (args: any) => Promise<any[]> };
  digestDelivery: { findMany: (args: any) => Promise<any[]> };
  platformConfig: { findUnique: (args: any) => Promise<any> };
};

/**
 * Daily Digest cron job.
 *
 * Runs every hour. For each digest-enabled user whose local 3 AM == current
 * UTC hour, enqueues a DIGEST_ORCHESTRATOR message (if not already delivered today).
 */
export async function runDailyDigestJob(
  prisma: PrismaLike,
  env: Env,
  logger: CronLogger
): Promise<Record<string, unknown>> {
  const utcHour = new Date().getUTCHours();
  const today = new Date().toISOString().slice(0, 10);

  // Load all digest-enabled users
  const users = await prisma.user.findMany({
    where: { digestEnabled: true },
    select: { id: true, timezone: true },
  });

  // Filter to users whose local 3 AM == current UTC hour
  const eligible = users.filter((u: any) => {
    const localHour = getLocalHour(utcHour, u.timezone);
    return localHour === 3;
  });

  if (eligible.length === 0) {
    await logger.info("no_eligible_users", { utcHour, totalDigestUsers: users.length });
    return { eligible: 0, enqueued: 0, skipped: 0 };
  }

  // Dedup against already-delivered today
  const existing = await prisma.digestDelivery.findMany({
    where: { userId: { in: eligible.map((u: any) => u.id) }, date: today },
    select: { userId: true },
  });
  const delivered = new Set(existing.map((e: any) => e.userId));
  const toProcess = eligible.filter((u: any) => !delivered.has(u.id));

  // Enqueue to DIGEST_ORCHESTRATOR_QUEUE in batches of 100
  for (let i = 0; i < toProcess.length; i += 100) {
    const batch = toProcess.slice(i, i + 100);
    await env.DIGEST_ORCHESTRATOR_QUEUE.sendBatch(
      batch.map((u: any) => ({ body: { userId: u.id, date: today } }))
    );
  }

  await logger.info("digest_users_enqueued", {
    utcHour,
    totalDigestUsers: users.length,
    eligible: eligible.length,
    enqueued: toProcess.length,
    skipped: delivered.size,
  });

  return { eligible: eligible.length, enqueued: toProcess.length, skipped: delivered.size };
}

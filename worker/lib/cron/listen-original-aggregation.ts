import type { CronLogger } from "./runner";

type PrismaLike = {
  listenOriginalEvent: {
    groupBy: (args: any) => Promise<any[]>;
    updateMany: (args: any) => Promise<{ count: number }>;
    count: (args: any) => Promise<number>;
  };
  publisherReportBatch: {
    create: (args: any) => Promise<any>;
  };
};

/**
 * Daily aggregation job: groups listen-original events by publisher for the
 * previous day, creates PublisherReportBatch rows, and stamps events with
 * the batch ID.
 */
export async function runListenOriginalAggregationJob(
  prisma: PrismaLike,
  logger: CronLogger
): Promise<Record<string, unknown>> {
  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setUTCHours(0, 0, 0, 0); // start of today = end of yesterday
  const periodStart = new Date(periodEnd);
  periodStart.setUTCDate(periodStart.getUTCDate() - 1); // start of yesterday

  await logger.info("Starting listen-original aggregation", {
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
  });

  // Check if there are any events to aggregate
  const totalEvents = await prisma.listenOriginalEvent.count({
    where: {
      timestamp: { gte: periodStart, lt: periodEnd },
      reportBatchId: null,
    },
  });

  if (totalEvents === 0) {
    await logger.info("No unbatched events for period, skipping");
    return { batchesCreated: 0, eventsProcessed: 0 };
  }

  // Group by publisher
  const publisherGroups = await prisma.listenOriginalEvent.groupBy({
    by: ["publisherId"],
    where: {
      timestamp: { gte: periodStart, lt: periodEnd },
      reportBatchId: null,
    },
    _count: { id: true },
  });

  let batchesCreated = 0;
  let eventsStamped = 0;

  for (const group of publisherGroups) {
    const publisherId = group.publisherId;

    // Count by event type
    const [clicks, starts, completes, uniqueUserRows] = await Promise.all([
      prisma.listenOriginalEvent.count({
        where: {
          publisherId,
          eventType: "listen_original_click",
          timestamp: { gte: periodStart, lt: periodEnd },
          reportBatchId: null,
        },
      }),
      prisma.listenOriginalEvent.count({
        where: {
          publisherId,
          eventType: "listen_original_start",
          timestamp: { gte: periodStart, lt: periodEnd },
          reportBatchId: null,
        },
      }),
      prisma.listenOriginalEvent.count({
        where: {
          publisherId,
          eventType: "listen_original_complete",
          timestamp: { gte: periodStart, lt: periodEnd },
          reportBatchId: null,
        },
      }),
      prisma.listenOriginalEvent.groupBy({
        by: ["userId"],
        where: {
          publisherId,
          timestamp: { gte: periodStart, lt: periodEnd },
          reportBatchId: null,
        },
      }),
    ]);

    const batch = await prisma.publisherReportBatch.create({
      data: {
        publisherId,
        periodStart,
        periodEnd,
        totalClicks: clicks,
        totalStarts: starts,
        totalCompletes: completes,
        uniqueUsers: uniqueUserRows.length,
      },
    });

    // Stamp events with batch ID
    const updated = await prisma.listenOriginalEvent.updateMany({
      where: {
        publisherId,
        timestamp: { gte: periodStart, lt: periodEnd },
        reportBatchId: null,
      },
      data: { reportBatchId: batch.id },
    });

    eventsStamped += updated.count;
    batchesCreated++;

    await logger.info(`Batch created for publisher ${publisherId}`, {
      batchId: batch.id,
      clicks,
      starts,
      completes,
      uniqueUsers: uniqueUserRows.length,
      eventsStamped: updated.count,
    });
  }

  await logger.info("Aggregation complete", { batchesCreated, eventsStamped });
  return { batchesCreated, eventsProcessed: eventsStamped };
}

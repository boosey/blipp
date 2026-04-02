import type { CronLogger } from "./runner";

type PrismaLike = {
  listenOriginalEvent: {
    groupBy: (args: any) => Promise<any[]>;
    count: (args: any) => Promise<number>;
  };
  publisherReportBatch: {
    create: (args: any) => Promise<any>;
  };
};

/**
 * Daily aggregation job: groups listen-original events by publisher for the
 * previous day and creates PublisherReportBatch rows.
 *
 * Events are immutable — no stamping. Reports filter by receivedAt range.
 * clickThroughRate is null until blipp impression tracking exists (see POD-96).
 */
export async function runListenOriginalAggregationJob(
  prisma: PrismaLike,
  logger: CronLogger,
): Promise<Record<string, unknown>> {
  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setUTCHours(0, 0, 0, 0);
  const periodStart = new Date(periodEnd);
  periodStart.setUTCDate(periodStart.getUTCDate() - 1);

  await logger.info("Starting listen-original aggregation", {
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
  });

  // Group by publisher for the period
  const publisherGroups = await prisma.listenOriginalEvent.groupBy({
    by: ["publisherId"],
    where: {
      receivedAt: { gte: periodStart, lt: periodEnd },
    },
    _count: { id: true },
  });

  if (publisherGroups.length === 0) {
    await logger.info("No events for period, skipping");
    return { batchesCreated: 0, eventsProcessed: 0 };
  }

  let batchesCreated = 0;
  let totalEventsProcessed = 0;

  for (const group of publisherGroups) {
    const publisherId = group.publisherId;
    const periodFilter = {
      publisherId,
      receivedAt: { gte: periodStart, lt: periodEnd },
    };

    const [clicks, starts, completes, uniqueUserRows] = await Promise.all([
      prisma.listenOriginalEvent.count({
        where: { ...periodFilter, eventType: "listen_original_click" },
      }),
      prisma.listenOriginalEvent.count({
        where: { ...periodFilter, eventType: "listen_original_start" },
      }),
      prisma.listenOriginalEvent.count({
        where: { ...periodFilter, eventType: "listen_original_complete" },
      }),
      prisma.listenOriginalEvent.groupBy({
        by: ["userId"],
        where: periodFilter,
      }),
    ]);

    await prisma.publisherReportBatch.create({
      data: {
        publisherId,
        periodStart,
        periodEnd,
        totalClicks: clicks,
        totalStarts: starts,
        totalCompletes: completes,
        uniqueUsers: uniqueUserRows.length,
        clickThroughRate: null, // No impression data yet (POD-96)
      },
    });

    totalEventsProcessed += group._count.id;
    batchesCreated++;

    await logger.info(`Batch created for publisher ${publisherId}`, {
      clicks,
      starts,
      completes,
      uniqueUsers: uniqueUserRows.length,
    });
  }

  await logger.info("Aggregation complete", { batchesCreated, totalEventsProcessed });
  return { batchesCreated, eventsProcessed: totalEventsProcessed };
}

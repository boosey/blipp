import { checkCostThresholds } from "../cost-alerts";
import type { CronLogger } from "./runner";

type PrismaLike = {
  platformConfig: {
    upsert: (args: any) => Promise<any>;
  };
  aiModelProvider: {
    findMany: (args: any) => Promise<any[]>;
    update: (args: any) => Promise<any>;
  };
};

/**
 * Monitoring job: refreshes AI model pricing and checks cost threshold alerts.
 */
export async function runMonitoringJob(
  prisma: PrismaLike,
  logger: CronLogger
): Promise<Record<string, unknown>> {
  // Refresh AI model pricing
  const { refreshPricing } = await import("../pricing-updater");
  const { updated } = await refreshPricing(prisma as any);
  await logger.info("pricing_refreshed", { updated });

  // Check cost thresholds
  const costAlerts = await checkCostThresholds(prisma as any);
  if (costAlerts.length > 0) {
    await prisma.platformConfig.upsert({
      where: { key: "cost.alert.active" },
      update: { value: costAlerts as any },
      create: {
        key: "cost.alert.active",
        value: costAlerts as any,
        description: "Active cost threshold alerts",
      },
    });
    await logger.warn("cost_threshold_exceeded", { alerts: costAlerts as any });
  } else {
    await logger.info("cost_check_ok", { alertCount: 0 });
  }

  return { pricingUpdated: updated, costAlerts: costAlerts.length };
}

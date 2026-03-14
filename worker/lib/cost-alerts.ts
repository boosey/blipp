import { getConfig } from "./config";

interface CostAlert {
  type: "daily" | "weekly";
  threshold: number;
  actual: number;
  triggeredAt: string;
  acknowledged: boolean;
}

export async function checkCostThresholds(prisma: any): Promise<CostAlert[]> {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekStart = new Date(todayStart);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());

  const [dailyCost, weeklyCost] = await Promise.all([
    prisma.pipelineStep.aggregate({
      _sum: { cost: true },
      where: { createdAt: { gte: todayStart }, cost: { not: null } },
    }),
    prisma.pipelineStep.aggregate({
      _sum: { cost: true },
      where: { createdAt: { gte: weekStart }, cost: { not: null } },
    }),
  ]);

  const dailySpend = dailyCost._sum.cost ?? 0;
  const weeklySpend = weeklyCost._sum.cost ?? 0;

  const dailyThreshold = (await getConfig(prisma, "cost.alert.dailyThreshold", 5.0)) as number;
  const weeklyThreshold = (await getConfig(prisma, "cost.alert.weeklyThreshold", 25.0)) as number;

  const alerts: CostAlert[] = [];
  if (dailySpend >= dailyThreshold) {
    alerts.push({
      type: "daily",
      threshold: dailyThreshold,
      actual: Math.round(dailySpend * 100) / 100,
      triggeredAt: new Date().toISOString(),
      acknowledged: false,
    });
  }
  if (weeklySpend >= weeklyThreshold) {
    alerts.push({
      type: "weekly",
      threshold: weeklyThreshold,
      actual: Math.round(weeklySpend * 100) / 100,
      triggeredAt: new Date().toISOString(),
      acknowledged: false,
    });
  }

  return alerts;
}

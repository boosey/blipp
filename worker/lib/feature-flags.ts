import { getConfig } from "./config";

interface FeatureFlag {
  enabled: boolean;
  rolloutPercentage: number;
  planAvailability: string[];
  userAllowlist: string[];
  userDenylist: string[];
  startDate?: string;
  endDate?: string;
}

export async function isFeatureEnabled(
  prisma: any,
  featureName: string,
  context: { userId?: string; planSlug?: string }
): Promise<boolean> {
  const flag = await getConfig<FeatureFlag | null>(
    prisma,
    `feature.${featureName}`,
    null
  );

  if (!flag || !(flag as FeatureFlag).enabled) return false;
  const f = flag as FeatureFlag;

  if (context.userId && f.userDenylist?.includes(context.userId)) return false;
  if (context.userId && f.userAllowlist?.includes(context.userId)) return true;

  const now = new Date();
  if (f.startDate && now < new Date(f.startDate)) return false;
  if (f.endDate && now > new Date(f.endDate)) return false;

  if (f.planAvailability?.length > 0 && context.planSlug) {
    if (!f.planAvailability.includes(context.planSlug)) return false;
  }

  if (f.rolloutPercentage < 100 && context.userId) {
    const hash = await deterministicHash(`${context.userId}:${featureName}`);
    const bucket = hash % 100;
    if (bucket >= f.rolloutPercentage) return false;
  }

  return true;
}

async function deterministicHash(input: string): Promise<number> {
  const data = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const view = new DataView(hashBuffer);
  return view.getUint32(0) % 10000;
}

export async function getActiveFlags(
  prisma: any,
  context: { userId?: string; planSlug?: string }
): Promise<Record<string, boolean>> {
  try {
    const configs = await prisma.platformConfig.findMany({
      where: { key: { startsWith: "feature." } },
    });

    const flags: Record<string, boolean> = {};
    for (const config of configs) {
      const featureName = config.key.replace("feature.", "");
      flags[featureName] = await isFeatureEnabled(prisma, featureName, context);
    }
    return flags;
  } catch {
    return {};
  }
}

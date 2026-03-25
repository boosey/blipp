import { Hono } from "hono";
import type { Env } from "../types";
import { requireAuth } from "../middleware/auth";
import { getCurrentUser } from "../lib/admin-helpers";

/** Public plans route — no auth required for listing. */
export const plans = new Hono<{ Bindings: Env }>();

plans.get("/", async (c) => {
  const prisma = c.get("prisma") as any;
  const allPlans = await prisma.plan.findMany({
    where: { active: true },
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      slug: true,
      name: true,
      description: true,
      priceCentsMonthly: true,
      priceCentsAnnual: true,
      features: true,
      highlighted: true,
      // Limits
      briefingsPerWeek: true,
      maxDurationMinutes: true,
      maxPodcastSubscriptions: true,
      pastEpisodesLimit: true,
      // Content Delivery
      onDemandRequestsPerWeek: true,
      outputFormats: true,
      transcriptAccess: true,
      refreshLatencyTier: true,
      dailyDigest: true,
      weeklyRecap: true,
      narrativeDepthTier: true,
      episodeHighlightClips: true,
      // Pipeline & Processing
      aiModelTier: true,
      ttsModelTier: true,
      sttModelTier: true,
      customInstructions: true,
      retryBudget: true,
      concurrentPipelineJobs: true,
      // Feature flags
      adFree: true,
      priorityProcessing: true,
      earlyAccess: true,
      researchMode: true,
      crossPodcastSynthesis: true,
      // Library & Discovery
      topicTracking: true,
      customCollections: true,
      searchBriefings: true,
      catalogAccess: true,
      savedSearches: true,
      rssExport: true,
      apiAccess: true,
      // Personalization
      tonePresets: true,
      languageSupport: true,
      focusTopics: true,
      skipTopics: true,
      briefingIntro: true,
      maxStorageDays: true,
      offlineAccess: true,
      publicSharing: true,
      interactiveBriefing: true,
    },
  });
  return c.json(allPlans);
});

/** GET /current — returns the authenticated user's current plan. */
plans.get("/current", requireAuth, async (c) => {
  const prisma = c.get("prisma") as any;
  const user = await getCurrentUser(c, prisma);
  const fullUser = await prisma.user.findUnique({
    where: { id: user.id },
    include: { plan: true },
  });
  return c.json({
    plan: {
      id: fullUser.plan.id,
      name: fullUser.plan.name,
      slug: fullUser.plan.slug,
      priceCentsMonthly: fullUser.plan.priceCentsMonthly,
    },
  });
});

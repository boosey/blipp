import { Hono } from "hono";
import { z } from "zod/v4";
import type { Env } from "../types";
import { getAuth } from "../middleware/auth";
import { getConfig } from "../lib/config";
import { validateBody } from "../lib/validation";

const ads = new Hono<{ Bindings: Env }>();

const adEventSchema = z.object({
  briefingId: z.string().optional(),
  feedItemId: z.string().optional(),
  placement: z.enum(["preroll", "postroll"]),
  event: z.enum([
    "impression",
    "start",
    "firstQuartile",
    "midpoint",
    "thirdQuartile",
    "complete",
    "error",
  ]),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

/**
 * GET /ads/config — Returns resolved ad config for the current user.
 * Query: ?briefingId=xxx&podcastCategory=technology&durationTier=5
 */
ads.get("/config", async (c) => {
  const prisma = c.get("prisma") as any;
  const auth = getAuth(c);

  // Check if ads are globally enabled
  const adsEnabled = await getConfig(prisma, "ads.enabled", false);
  if (!adsEnabled) {
    return c.json({ adsEnabled: false });
  }

  // Check if user's plan is ad-free
  if (auth?.userId) {
    try {
      const user = await prisma.user.findUnique({
        where: { clerkId: auth.userId },
        include: { plan: true },
      });
      if (user?.plan?.adFree) {
        return c.json({ adsEnabled: false });
      }
    } catch {
      // If we can't check the plan, proceed with ads enabled
    }
  }

  const briefingId = c.req.query("briefingId") ?? "";
  const podcastCategory = c.req.query("podcastCategory") ?? "";
  const durationTier = c.req.query("durationTier") ?? "";

  const resolve = (url: string): string =>
    url
      .replace("[CACHE_BUSTER]", String(Math.floor(Math.random() * 1e10)))
      .replace("[CONTENT_ID]", briefingId)
      .replace("[CONTENT_CATEGORY]", podcastCategory)
      .replace("[DURATION_TIER]", durationTier);

  const [prerollEnabled, prerollVastUrl, postrollEnabled, postrollVastUrl] =
    await Promise.all([
      getConfig(prisma, "ads.preroll.enabled", false),
      getConfig(prisma, "ads.preroll.vastUrl", ""),
      getConfig(prisma, "ads.postroll.enabled", false),
      getConfig(prisma, "ads.postroll.vastUrl", ""),
    ]);

  return c.json({
    adsEnabled: true,
    preroll: {
      enabled: prerollEnabled as boolean,
      vastTagUrl: prerollEnabled && prerollVastUrl ? resolve(prerollVastUrl as string) : null,
    },
    postroll: {
      enabled: postrollEnabled as boolean,
      vastTagUrl: postrollEnabled && postrollVastUrl ? resolve(postrollVastUrl as string) : null,
    },
  });
});

/**
 * POST /ads/event — Client-side ad event logging.
 * Body: { briefingId, feedItemId, placement, event, metadata }
 */
ads.post("/event", async (c) => {
  const auth = getAuth(c);
  const body = await validateBody(c, adEventSchema);

  // Phase 1: structured console.log
  console.log(
    JSON.stringify({
      level: "info",
      action: "ad_event",
      userId: auth?.userId ?? "anonymous",
      briefingId: body.briefingId ?? null,
      feedItemId: body.feedItemId ?? null,
      placement: body.placement,
      event: body.event,
      metadata: body.metadata ?? {},
      ts: new Date().toISOString(),
    })
  );

  return c.json({ success: true });
});

export { ads };

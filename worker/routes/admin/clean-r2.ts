import { Hono } from "hono";
import type { Env } from "../../types";
import { getConfig } from "../../lib/config";
import { sendBatchedFeedRefresh } from "../../lib/queue-helpers";

const cleanR2Routes = new Hono<{ Bindings: Env }>();

/**
 * DELETE /work-products — Delete all R2 objects under the wp/ prefix.
 * Protected by CLERK_SECRET_KEY (a stable server secret, not a session token).
 * Used by the clean:pipeline script.
 */
cleanR2Routes.delete("/work-products", async (c) => {
  const authHeader = c.req.header("Authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token || token !== c.env.CLERK_SECRET_KEY) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  let totalDeleted = 0;
  let cursor: string | undefined;
  do {
    const listed = await c.env.R2.list({ prefix: "wp/", cursor, limit: 500 });
    if (listed.objects.length > 0) {
      await Promise.all(listed.objects.map((obj) => c.env.R2.delete(obj.key)));
      totalDeleted += listed.objects.length;
    }
    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);

  return c.json({ data: { deleted: totalDeleted } });
});

/**
 * POST /bulk-refresh — Queue feed refresh for a list of podcast IDs.
 * Protected by CLERK_SECRET_KEY bearer token.
 * Used by the apple-discover script after upserting podcasts into the DB.
 */
cleanR2Routes.post("/bulk-refresh", async (c) => {
  const authHeader = c.req.header("Authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token || token !== c.env.CLERK_SECRET_KEY) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const { podcastIds, refreshJobId } = await c.req.json();
  if (!podcastIds?.length) {
    return c.json({ error: "podcastIds (string[]) required" }, 400);
  }

  const prisma = c.get("prisma") as any;
  const batchConcurrency = (await getConfig(prisma, "pipeline.feedRefresh.batchConcurrency", 10)) as number;
  await sendBatchedFeedRefresh(c.env.FEED_REFRESH_QUEUE, podcastIds, batchConcurrency, {
    type: "manual",
    ...(refreshJobId && { refreshJobId }),
  });

  return c.json({ data: { queued: podcastIds.length } });
});

export { cleanR2Routes };

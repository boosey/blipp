import { Hono } from "hono";
import type { Env } from "../../types";

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

export { cleanR2Routes };

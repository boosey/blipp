import { createClerkClient } from "@clerk/backend";
import type { Env } from "../types";

/** Shape of the user data export (GDPR Article 20). */
export interface UserDataExport {
  exportedAt: string;
  user: {
    id: string;
    email: string;
    name: string | null;
    createdAt: string;
    plan: { name: string; slug: string };
  };
  subscriptions: Array<{
    podcastTitle: string;
    durationTier: number;
    subscribedAt: string;
  }>;
  feedItems: Array<{
    episodeTitle: string;
    podcastTitle: string;
    status: string;
    listened: boolean;
    listenedAt: string | null;
    createdAt: string;
  }>;
  briefingRequests: Array<{
    status: string;
    targetMinutes: number;
    createdAt: string;
  }>;
}

/** Build a complete data export for a user. */
export async function buildUserExport(
  prisma: any,
  userId: string
): Promise<UserDataExport> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    include: {
      plan: { select: { name: true, slug: true } },
      subscriptions: {
        include: { podcast: { select: { title: true } } },
      },
      feedItems: {
        include: {
          episode: { select: { title: true } },
          podcast: { select: { title: true } },
        },
      },
      briefingRequests: true,
    },
  });

  return {
    exportedAt: new Date().toISOString(),
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      createdAt: user.createdAt.toISOString(),
      plan: { name: user.plan.name, slug: user.plan.slug },
    },
    subscriptions: user.subscriptions.map((s: any) => ({
      podcastTitle: s.podcast.title,
      durationTier: s.durationTier,
      subscribedAt: s.createdAt.toISOString(),
    })),
    feedItems: user.feedItems.map((fi: any) => ({
      episodeTitle: fi.episode?.title ?? "Unknown",
      podcastTitle: fi.podcast?.title ?? "Unknown",
      status: fi.status,
      listened: fi.listened,
      listenedAt: fi.listenedAt?.toISOString() ?? null,
      createdAt: fi.createdAt.toISOString(),
    })),
    briefingRequests: user.briefingRequests.map((br: any) => ({
      status: br.status,
      targetMinutes: br.targetMinutes,
      createdAt: br.createdAt.toISOString(),
    })),
  };
}

/** Delete all R2 objects with a given prefix. */
export async function deleteR2ByPrefix(
  r2: R2Bucket,
  prefix: string
): Promise<number> {
  let deleted = 0;
  let cursor: string | undefined;
  do {
    const listed = await r2.list({ prefix, cursor, limit: 1000 });
    const keys = listed.objects.map((o) => o.key);
    if (keys.length > 0) {
      await Promise.all(keys.map((k) => r2.delete(k)));
      deleted += keys.length;
    }
    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);
  return deleted;
}

/** Delete a user's account and all associated data (GDPR Article 17). */
export async function deleteUserAccount(
  prisma: any,
  env: Env,
  userId: string,
  clerkId: string
): Promise<{ r2Deleted: number }> {
  // 1. Fetch user info before deletion
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      stripeCustomerId: true,
    },
  });

  let r2Deleted = 0;

  // 2. Delete Stripe customer (best-effort)
  if (user?.stripeCustomerId) {
    try {
      const { createStripeClient } = await import("./stripe");
      const stripe = createStripeClient(env.STRIPE_SECRET_KEY);
      await stripe.customers.del(user.stripeCustomerId);
    } catch (err) {
      console.error(
        JSON.stringify({
          level: "warn",
          action: "user_delete_stripe_cleanup_failed",
          userId,
          error: err instanceof Error ? err.message : String(err),
          ts: new Date().toISOString(),
        })
      );
    }
  }

  // 4. Delete Clerk user (best-effort)
  try {
    const clerk = createClerkClient({ secretKey: env.CLERK_SECRET_KEY });
    await clerk.users.deleteUser(clerkId);
  } catch (err) {
    console.error(
      JSON.stringify({
        level: "warn",
        action: "user_delete_clerk_cleanup_failed",
        userId,
        error: err instanceof Error ? err.message : String(err),
        ts: new Date().toISOString(),
      })
    );
  }

  // 5. Delete DB user (cascades to subscriptions, feed items, briefings, requests)
  await prisma.user.delete({ where: { id: userId } });

  return { r2Deleted };
}

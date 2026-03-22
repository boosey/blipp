import { Hono } from "hono";
import type { Env } from "../../types";

const storageRoutes = new Hono<{ Bindings: Env }>();

/**
 * GET /orphans — Find R2 objects not referenced by any DB record.
 * Lists all R2 keys and compares against Episode, Clip, and WorkProduct tables.
 */
storageRoutes.get("/orphans", async (c) => {
  const prisma = c.get("prisma") as any;

  // 1. List all R2 objects (paginated)
  const r2Keys = new Set<string>();
  let cursor: string | undefined;
  do {
    const listed = await c.env.R2.list({ cursor, limit: 1000 });
    for (const obj of listed.objects) {
      r2Keys.add(obj.key);
    }
    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);

  // 2. Collect all DB-referenced R2 keys
  const dbKeys = new Set<string>();

  // WorkProduct.r2Key
  const workProducts = await prisma.workProduct.findMany({
    select: { r2Key: true },
  });
  for (const wp of workProducts) {
    if (wp.r2Key) dbKeys.add(wp.r2Key);
  }

  // Episode.transcriptR2Key + Episode.audioR2Key
  const episodes = await prisma.episode.findMany({
    where: {
      OR: [
        { transcriptR2Key: { not: null } },
        { audioR2Key: { not: null } },
      ],
    },
    select: { transcriptR2Key: true, audioR2Key: true },
  });
  for (const ep of episodes) {
    if (ep.transcriptR2Key) dbKeys.add(ep.transcriptR2Key);
    if (ep.audioR2Key) dbKeys.add(ep.audioR2Key);
  }

  // Clip.audioKey
  const clips = await prisma.clip.findMany({
    where: { audioKey: { not: null } },
    select: { audioKey: true },
  });
  for (const clip of clips) {
    if (clip.audioKey) dbKeys.add(clip.audioKey);
  }

  // 3. Diff
  const orphanedR2: string[] = [];
  for (const key of r2Keys) {
    if (!dbKeys.has(key)) orphanedR2.push(key);
  }

  const referencedButMissing: string[] = [];
  for (const key of dbKeys) {
    if (!r2Keys.has(key)) referencedButMissing.push(key);
  }

  return c.json({
    data: {
      r2Total: r2Keys.size,
      dbReferencesTotal: dbKeys.size,
      orphanedInR2: orphanedR2.length,
      missingFromR2: referencedButMissing.length,
      orphanedKeys: orphanedR2.slice(0, 500),
      missingKeys: referencedButMissing.slice(0, 500),
    },
  });
});

/**
 * DELETE /orphans — Delete orphaned R2 objects not referenced by any DB record.
 * Requires { confirm: true } in the request body.
 * Accepts optional { keys: string[] } to delete specific keys, otherwise deletes all orphans.
 */
storageRoutes.delete("/orphans", async (c) => {
  const prisma = c.get("prisma") as any;
  const body = await c.req.json().catch(() => ({}));

  if (!body.confirm) {
    return c.json({ error: "Send { confirm: true } to delete orphaned R2 objects." }, 400);
  }

  // If specific keys provided, validate they're actually orphaned then delete
  if (body.keys && Array.isArray(body.keys)) {
    const dbKeys = new Set<string>();
    const workProducts = await prisma.workProduct.findMany({ select: { r2Key: true } });
    for (const wp of workProducts) { if (wp.r2Key) dbKeys.add(wp.r2Key); }
    const episodes = await prisma.episode.findMany({
      where: { OR: [{ transcriptR2Key: { not: null } }, { audioR2Key: { not: null } }] },
      select: { transcriptR2Key: true, audioR2Key: true },
    });
    for (const ep of episodes) {
      if (ep.transcriptR2Key) dbKeys.add(ep.transcriptR2Key);
      if (ep.audioR2Key) dbKeys.add(ep.audioR2Key);
    }
    const clips = await prisma.clip.findMany({ where: { audioKey: { not: null } }, select: { audioKey: true } });
    for (const clip of clips) { if (clip.audioKey) dbKeys.add(clip.audioKey); }

    const safeToDelete = (body.keys as string[]).filter((k: string) => !dbKeys.has(k));
    if (safeToDelete.length > 0) {
      await Promise.all(safeToDelete.map((key: string) => c.env.R2.delete(key)));
    }
    return c.json({ data: { deleted: safeToDelete.length, skippedReferenced: body.keys.length - safeToDelete.length } });
  }

  // Full orphan cleanup — re-derive the orphan list and delete all
  const r2Keys = new Set<string>();
  let cursor: string | undefined;
  do {
    const listed = await c.env.R2.list({ cursor, limit: 1000 });
    for (const obj of listed.objects) r2Keys.add(obj.key);
    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);

  const dbKeys = new Set<string>();
  const workProducts = await prisma.workProduct.findMany({ select: { r2Key: true } });
  for (const wp of workProducts) { if (wp.r2Key) dbKeys.add(wp.r2Key); }
  const episodes = await prisma.episode.findMany({
    where: { OR: [{ transcriptR2Key: { not: null } }, { audioR2Key: { not: null } }] },
    select: { transcriptR2Key: true, audioR2Key: true },
  });
  for (const ep of episodes) {
    if (ep.transcriptR2Key) dbKeys.add(ep.transcriptR2Key);
    if (ep.audioR2Key) dbKeys.add(ep.audioR2Key);
  }
  const clips = await prisma.clip.findMany({ where: { audioKey: { not: null } }, select: { audioKey: true } });
  for (const clip of clips) { if (clip.audioKey) dbKeys.add(clip.audioKey); }

  const orphans: string[] = [];
  for (const key of r2Keys) {
    if (!dbKeys.has(key)) orphans.push(key);
  }

  // Delete in batches of 100
  let deleted = 0;
  for (let i = 0; i < orphans.length; i += 100) {
    const batch = orphans.slice(i, i + 100);
    await Promise.all(batch.map((key) => c.env.R2.delete(key)));
    deleted += batch.length;
  }

  return c.json({ data: { deleted, r2Total: r2Keys.size, dbReferencesTotal: dbKeys.size } });
});

export { storageRoutes };

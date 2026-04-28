/**
 * Admin Pulse routes (Phase 4 / Task 9).
 *
 * Surfaces:
 * - Editor management — create/list/update PulseEditor rows. Editor is
 *   NOT_READY by default; admin marks READY once bio + sameAs are set.
 * - Post management — list (filterable), get, update, transition through
 *   DRAFT → REVIEW → SCHEDULED → PUBLISHED → ARCHIVED, plus citation links.
 * - Validation — runs the Phase 4.0 hardened rules (3:1 ratio, 50-word
 *   per-source cap, sources-footer requirement) and returns findings.
 *   Hard rules (sources, ratio, editor.READY) block publish transitions.
 */
import { Hono } from "hono";
import type { Env } from "../../types";
import { parsePagination, paginatedResponse } from "../../lib/admin-helpers";
import { validatePulsePost, type QuoteEntry } from "../../lib/pulse/validation";

export const pulseAdminRoutes = new Hono<{ Bindings: Env }>();

const POST_STATUSES = ["DRAFT", "REVIEW", "SCHEDULED", "PUBLISHED", "ARCHIVED"] as const;
const POST_MODES = ["HUMAN", "AI_ASSISTED"] as const;
const EDITOR_STATUSES = ["NOT_READY", "READY", "RETIRED"] as const;
type PostStatus = (typeof POST_STATUSES)[number];

const POST_DETAIL_SELECT = {
  id: true,
  slug: true,
  title: true,
  subtitle: true,
  body: true,
  sourcesMarkdown: true,
  status: true,
  mode: true,
  editorId: true,
  heroImageUrl: true,
  topicTags: true,
  wordCount: true,
  quotedWordCount: true,
  ratioCheckPassed: true,
  generationMeta: true,
  seoTitle: true,
  seoDescription: true,
  scheduledAt: true,
  publishedAt: true,
  editorReviewedAt: true,
  editorRejectedReason: true,
  createdAt: true,
  updatedAt: true,
  editor: { select: { id: true, slug: true, name: true, status: true } },
  episodes: {
    orderBy: { displayOrder: "asc" },
    include: {
      episode: {
        select: {
          id: true,
          slug: true,
          title: true,
          podcast: { select: { id: true, slug: true, title: true } },
        },
      },
    },
  },
};

// ── Editors ────────────────────────────────────────────────────────────

pulseAdminRoutes.get("/editors", async (c) => {
  const prisma = c.get("prisma") as any;
  const editors = await prisma.pulseEditor.findMany({
    orderBy: [{ status: "asc" }, { createdAt: "asc" }],
  });
  return c.json({ data: editors });
});

pulseAdminRoutes.post("/editors", async (c) => {
  const prisma = c.get("prisma") as any;
  const body = await c.req.json();
  const slug = String(body?.slug ?? "").trim();
  const name = String(body?.name ?? "").trim();
  if (!slug || !name) {
    return c.json({ error: "slug and name are required" }, 400);
  }

  const created = await prisma.pulseEditor.create({
    data: {
      slug,
      name,
      bio: body?.bio ?? null,
      avatarUrl: body?.avatarUrl ?? null,
      twitterHandle: body?.twitterHandle ?? null,
      linkedinUrl: body?.linkedinUrl ?? null,
      websiteUrl: body?.websiteUrl ?? null,
      expertiseAreas: Array.isArray(body?.expertiseAreas) ? body.expertiseAreas : [],
      // Always start NOT_READY — admin must explicitly flip to READY when bio + sameAs
      // are filled in.
      status: "NOT_READY",
    },
  });
  return c.json({ data: created }, 201);
});

pulseAdminRoutes.patch("/editors/:id", async (c) => {
  const prisma = c.get("prisma") as any;
  const { id } = c.req.param();
  const body = await c.req.json();

  const data: Record<string, unknown> = {};
  for (const k of ["name", "bio", "avatarUrl", "twitterHandle", "linkedinUrl", "websiteUrl"] as const) {
    if (k in body) data[k] = body[k] ?? null;
  }
  if (Array.isArray(body?.expertiseAreas)) data.expertiseAreas = body.expertiseAreas;
  if (typeof body?.status === "string") {
    if (!EDITOR_STATUSES.includes(body.status as any)) {
      return c.json({ error: `status must be one of: ${EDITOR_STATUSES.join(", ")}` }, 400);
    }
    data.status = body.status;
  }

  if (Object.keys(data).length === 0) {
    return c.json({ error: "No valid fields to update" }, 400);
  }

  const updated = await prisma.pulseEditor.update({ where: { id }, data });
  return c.json({ data: updated });
});

// ── Posts ──────────────────────────────────────────────────────────────

pulseAdminRoutes.get("/", async (c) => {
  const prisma = c.get("prisma") as any;
  const { page, pageSize, skip } = parsePagination(c);
  const status = c.req.query("status");
  const mode = c.req.query("mode");

  const where: Record<string, unknown> = {};
  if (status && POST_STATUSES.includes(status as PostStatus)) where.status = status;
  if (mode && POST_MODES.includes(mode as any)) where.mode = mode;

  const [data, total] = await Promise.all([
    prisma.pulsePost.findMany({
      where,
      orderBy: [{ createdAt: "desc" }],
      skip,
      take: pageSize,
      select: {
        id: true,
        slug: true,
        title: true,
        status: true,
        mode: true,
        wordCount: true,
        scheduledAt: true,
        publishedAt: true,
        createdAt: true,
        updatedAt: true,
        editor: { select: { id: true, slug: true, name: true, status: true } },
      },
    }),
    prisma.pulsePost.count({ where }),
  ]);

  return c.json(paginatedResponse(data, total, page, pageSize));
});

pulseAdminRoutes.get("/:id", async (c) => {
  const prisma = c.get("prisma") as any;
  const { id } = c.req.param();
  const post = await prisma.pulsePost.findUnique({
    where: { id },
    select: POST_DETAIL_SELECT,
  });
  if (!post) return c.json({ error: "Pulse post not found" }, 404);

  const validation = validatePulsePost({
    title: post.title,
    body: post.body,
    sourcesMarkdown: post.sourcesMarkdown,
    status: post.status,
    mode: post.mode,
    ratioCheckPassed: post.ratioCheckPassed,
    quotes: extractQuotesFromMeta(post.generationMeta),
    editor: post.editor ? { status: post.editor.status } : null,
  });

  return c.json({ data: post, validation });
});

pulseAdminRoutes.post("/", async (c) => {
  const prisma = c.get("prisma") as any;
  const body = await c.req.json();
  const slug = String(body?.slug ?? "").trim();
  const title = String(body?.title ?? "").trim();
  const editorId = String(body?.editorId ?? "").trim();
  if (!slug || !title || !editorId) {
    return c.json({ error: "slug, title, and editorId are required" }, 400);
  }
  const mode = POST_MODES.includes(body?.mode) ? body.mode : "HUMAN";

  const post = await prisma.pulsePost.create({
    data: {
      slug,
      title,
      subtitle: body?.subtitle ?? null,
      body: body?.body ?? "",
      sourcesMarkdown: body?.sourcesMarkdown ?? null,
      status: "DRAFT",
      mode,
      editorId,
      heroImageUrl: body?.heroImageUrl ?? null,
      topicTags: Array.isArray(body?.topicTags) ? body.topicTags : [],
      generationMeta: { mode: mode === "HUMAN" ? "human" : "ai_assisted", quoteCounts: {} },
    },
    select: POST_DETAIL_SELECT,
  });

  return c.json({ data: post }, 201);
});

pulseAdminRoutes.patch("/:id", async (c) => {
  const prisma = c.get("prisma") as any;
  const { id } = c.req.param();
  const body = await c.req.json();

  const existing = await prisma.pulsePost.findUnique({
    where: { id },
    select: { id: true, status: true, generationMeta: true },
  });
  if (!existing) return c.json({ error: "Pulse post not found" }, 404);

  const data: Record<string, unknown> = {};
  for (const k of [
    "title",
    "subtitle",
    "body",
    "sourcesMarkdown",
    "heroImageUrl",
    "seoTitle",
    "seoDescription",
  ] as const) {
    if (k in body) data[k] = body[k] ?? null;
  }
  if ("scheduledAt" in body) {
    data.scheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : null;
  }
  if (Array.isArray(body?.topicTags)) data.topicTags = body.topicTags;
  if (typeof body?.ratioCheckPassed === "boolean") data.ratioCheckPassed = body.ratioCheckPassed;

  // Quotes: persist into generationMeta.quoteCounts so the validator can read
  // them back without a dedicated table.
  let nextMeta = (existing.generationMeta ?? {}) as Record<string, unknown>;
  let quotesInBody: QuoteEntry[] | undefined;
  if (Array.isArray(body?.quotes)) {
    quotesInBody = (body.quotes as any[])
      .map((q) => ({ sourceId: String(q?.sourceId ?? ""), words: Number(q?.words ?? 0) }))
      .filter((q) => q.sourceId && q.words > 0);
    const quoteCounts: Record<string, number> = {};
    for (const q of quotesInBody) {
      quoteCounts[q.sourceId] = (quoteCounts[q.sourceId] ?? 0) + q.words;
    }
    nextMeta = { ...nextMeta, quotes: quotesInBody, quoteCounts };
    data.generationMeta = nextMeta;
    data.quotedWordCount = quotesInBody.reduce((acc, q) => acc + q.words, 0);
  }

  // Recompute and persist wordCount whenever body changes (cheap).
  if ("body" in body) {
    const { countMarkdownWords } = await import("../../lib/pulse/validation");
    data.wordCount = countMarkdownWords(String(body.body ?? ""));
  }

  if (Object.keys(data).length === 0) {
    return c.json({ error: "No valid fields to update" }, 400);
  }

  const updated = await prisma.pulsePost.update({
    where: { id },
    data,
    select: POST_DETAIL_SELECT,
  });

  const validation = validatePulsePost({
    title: updated.title,
    body: updated.body,
    sourcesMarkdown: updated.sourcesMarkdown,
    status: updated.status,
    mode: updated.mode,
    ratioCheckPassed: updated.ratioCheckPassed,
    quotes: extractQuotesFromMeta(updated.generationMeta),
    editor: updated.editor ? { status: updated.editor.status } : null,
  });

  return c.json({ data: updated, validation });
});

// ── Citations ─────────────────────────────────────────────────────────

pulseAdminRoutes.put("/:id/citations", async (c) => {
  const prisma = c.get("prisma") as any;
  const { id } = c.req.param();
  const body = await c.req.json();
  const episodeIds: string[] = Array.isArray(body?.episodeIds)
    ? (body.episodeIds as any[]).map((x) => String(x)).filter(Boolean)
    : [];

  const post = await prisma.pulsePost.findUnique({ where: { id }, select: { id: true } });
  if (!post) return c.json({ error: "Pulse post not found" }, 404);

  // Replace citation set: delete existing + create new (small N, simplest).
  await prisma.episodePulsePost.deleteMany({ where: { pulsePostId: id } });
  if (episodeIds.length > 0) {
    await prisma.episodePulsePost.createMany({
      data: episodeIds.map((episodeId, displayOrder) => ({
        pulsePostId: id,
        episodeId,
        displayOrder,
      })),
      skipDuplicates: true,
    });
  }
  return c.json({ success: true, count: episodeIds.length });
});

// ── Transitions ───────────────────────────────────────────────────────

pulseAdminRoutes.post("/:id/transitions/:action", async (c) => {
  const prisma = c.get("prisma") as any;
  const { id, action } = c.req.param();

  const post = await prisma.pulsePost.findUnique({
    where: { id },
    select: POST_DETAIL_SELECT,
  });
  if (!post) return c.json({ error: "Pulse post not found" }, 404);

  const now = new Date();
  let nextStatus: PostStatus | null = null;
  const data: Record<string, unknown> = {};

  switch (action) {
    case "review":
      if (post.status !== "DRAFT") return c.json({ error: `Cannot review from ${post.status}` }, 400);
      nextStatus = "REVIEW";
      break;

    case "approve":
    case "schedule": {
      if (!["DRAFT", "REVIEW"].includes(post.status)) {
        return c.json({ error: `Cannot schedule from ${post.status}` }, 400);
      }
      const validation = runValidation(post);
      if (!validation.ok) {
        return c.json({ error: "Validation failed", validation }, 400);
      }
      nextStatus = "SCHEDULED";
      data.editorReviewedAt = now;
      const body = await c.req.json().catch(() => ({}));
      if (body?.scheduledAt) data.scheduledAt = new Date(body.scheduledAt);
      break;
    }

    case "publish": {
      if (!["DRAFT", "REVIEW", "SCHEDULED"].includes(post.status)) {
        return c.json({ error: `Cannot publish from ${post.status}` }, 400);
      }
      const validation = runValidation(post);
      if (!validation.ok) {
        return c.json({ error: "Validation failed", validation }, 400);
      }
      nextStatus = "PUBLISHED";
      data.publishedAt = now;
      data.editorReviewedAt = post.editorReviewedAt ?? now;
      break;
    }

    case "reject": {
      const body = await c.req.json().catch(() => ({}));
      const reason = String(body?.reason ?? "").trim();
      if (!reason) return c.json({ error: "reason is required" }, 400);
      nextStatus = "DRAFT";
      data.editorRejectedReason = reason;
      break;
    }

    case "archive":
      nextStatus = "ARCHIVED";
      break;

    default:
      return c.json({ error: `Unknown action: ${action}` }, 400);
  }

  data.status = nextStatus;
  const updated = await prisma.pulsePost.update({
    where: { id },
    data,
    select: POST_DETAIL_SELECT,
  });
  return c.json({ data: updated });
});

// ── Helpers ────────────────────────────────────────────────────────────

function extractQuotesFromMeta(meta: unknown): QuoteEntry[] {
  if (!meta || typeof meta !== "object") return [];
  const m = meta as Record<string, unknown>;
  if (Array.isArray(m.quotes)) {
    return (m.quotes as any[])
      .map((q) => ({ sourceId: String(q?.sourceId ?? ""), words: Number(q?.words ?? 0) }))
      .filter((q) => q.sourceId && q.words > 0);
  }
  if (m.quoteCounts && typeof m.quoteCounts === "object") {
    return Object.entries(m.quoteCounts as Record<string, number>).map(([sourceId, words]) => ({
      sourceId,
      words: Number(words) || 0,
    }));
  }
  return [];
}

function runValidation(post: any) {
  return validatePulsePost({
    title: post.title,
    body: post.body,
    sourcesMarkdown: post.sourcesMarkdown,
    status: post.status,
    mode: post.mode,
    ratioCheckPassed: post.ratioCheckPassed,
    quotes: extractQuotesFromMeta(post.generationMeta),
    editor: post.editor ? { status: post.editor.status } : null,
  });
}

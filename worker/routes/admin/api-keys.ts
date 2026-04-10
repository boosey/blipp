import { Hono } from "hono";
import type { Env } from "../../types";
import { parsePagination, paginatedResponse, getCurrentUser } from "../../lib/admin-helpers";

const apiKeysRoutes = new Hono<{ Bindings: Env }>();

// GET / — List all API keys (hashed, not plaintext)
apiKeysRoutes.get("/", async (c) => {
  const prisma = c.get("prisma") as any;
  const { page, pageSize, skip } = parsePagination(c);

  const [keys, total] = await Promise.all([
    prisma.apiKey.findMany({
      skip,
      take: pageSize,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        keyPrefix: true,
        scopes: true,
        userId: true,
        expiresAt: true,
        lastUsedAt: true,
        revokedAt: true,
        createdAt: true,
        user: { select: { email: true } },
      },
    }),
    prisma.apiKey.count(),
  ]);

  return c.json(paginatedResponse(keys, total, page, pageSize));
});

// POST / — Create a new API key (returns plaintext ONCE)
apiKeysRoutes.post("/", async (c) => {
  const prisma = c.get("prisma") as any;
  const body = await c.req.json<{
    name: string;
    scopes: string[];
    expiresAt?: string;
  }>();

  if (!body.name || !body.scopes?.length) {
    return c.json({ error: "name and scopes are required" }, 400);
  }

  // Resolve Clerk auth → DB User.id (ApiKey.userId is an FK to User.id, not clerkId)
  const currentUser = await getCurrentUser(c, prisma);

  // Generate random key
  const randomBytes = new Uint8Array(32);
  crypto.getRandomValues(randomBytes);
  const hexKey = Array.from(randomBytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const plaintext = `blp_live_${hexKey}`;
  const keyPrefix = plaintext.slice(0, 12);

  // Hash for storage
  const keyBytes = new TextEncoder().encode(plaintext);
  const hashBuffer = await crypto.subtle.digest("SHA-256", keyBytes);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const keyHash = hashArray
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const apiKey = await prisma.apiKey.create({
    data: {
      name: body.name,
      keyHash,
      keyPrefix,
      scopes: body.scopes,
      userId: currentUser.id,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
    },
  });

  // Return plaintext ONCE — never stored
  return c.json(
    {
      data: {
        id: apiKey.id,
        name: apiKey.name,
        key: plaintext, // Only time this is returned
        keyPrefix,
        scopes: apiKey.scopes,
        createdAt: apiKey.createdAt.toISOString(),
      },
    },
    201
  );
});

// DELETE /:id — Revoke an API key
apiKeysRoutes.delete("/:id", async (c) => {
  const prisma = c.get("prisma") as any;
  const id = c.req.param("id");

  const key = await prisma.apiKey.findUnique({ where: { id } });
  if (!key) return c.json({ error: "API key not found" }, 404);
  if (key.revokedAt) return c.json({ error: "Already revoked" }, 409);

  await prisma.apiKey.update({
    where: { id },
    data: { revokedAt: new Date() },
  });

  return c.json({ data: { id, revoked: true } });
});

export { apiKeysRoutes };

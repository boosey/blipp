# Offline Audio Prefetch and Instant Playback — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the dormant `StorageManager` into the audio path, add HMAC-signed query-token URLs so the audio element can stream without a bearer header, and add a prefetcher that warms the StorageManager from feed events. Net effect: tap-to-play is near-instantaneous on cache hit, fast-streaming on cache miss, and previously-played items work in low/no-coverage areas.

**Architecture:** Three layers — (1) server: `GET /api/briefings/:id/audio-url` returns a short-lived HMAC-signed URL; the existing `/audio` route gains a token-or-Clerk auth branch. (2) client: `StorageManager.getPlayableUrl()` becomes the integration seam — returns local cached URL or signed URL, and side-effects a background download-to-store. (3) client: `Prefetcher` singleton reacts to feed events and `canplay` events, single-concurrent download, paused under active playback / offline / cellular-without-opt-in.

**Tech Stack:** Cloudflare Workers + Hono + Prisma 7 + R2 (server). React 19 + Vite 7 + TypeScript + Capacitor iOS + IndexedDB + Cache API + Capacitor Filesystem (client). Vitest for tests.

**Spec:** `docs/superpowers/specs/2026-04-24-offline-prefetch-design.md`

---

## File Structure

**New server files**
- `worker/lib/audio-token.ts` — HMAC sign/verify (mirrors `worker/lib/subscription-pause.ts:126-194`)
- `worker/lib/__tests__/audio-token.test.ts`
- `worker/routes/__tests__/briefings-audio-url.test.ts`
- `worker/routes/__tests__/briefings-audio-token-auth.test.ts`

**New client files**
- `src/lib/network-tier.ts` — `"wifi" | "cellular" | "offline"` classifier
- `src/services/prefetcher.ts` — coordinator singleton
- `src/__tests__/network-tier.test.ts`
- `src/__tests__/prefetcher.test.ts`

**Modified server files**
- `worker/types.ts` — add `AUDIO_TOKEN_SECRET?: string`
- `worker/routes/briefings.ts` — add `GET /:id/audio-url`; modify `GET /:id/audio` for token-auth branch
- `tests/helpers/mocks.ts` — add `AUDIO_TOKEN_SECRET` to `createMockEnv()`

**Modified client files**
- `src/services/storage-manager.ts` — add `getPlayableUrl()`, `pruneNotInFeed()`, plus reads of `prefetch.cellular.enabled`/`prefetch.enabled` flags
- `src/__tests__/storage-manager.test.ts` (or `src/services/__tests__/`) — extend
- `src/contexts/audio-context.tsx` — replace fetch-blob block with `getPlayableUrl`; wire `markListened` + prefetcher hook on `canplay`; `clearAll` on signout
- `src/contexts/storage-context.tsx` — initialize prefetcher singleton
- `src/pages/Home.tsx` (and any other feed-load call site) — call `prefetcher.scheduleFromFeed(items)`
- `src/components/storage-settings.tsx` — add "Prefetch on cellular" radio

---

## Task 1: HMAC audio-token utility

**Files:**
- Create: `worker/lib/audio-token.ts`
- Create: `worker/lib/__tests__/audio-token.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `worker/lib/__tests__/audio-token.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { signAudioToken, verifyAudioToken } from "../audio-token";

const env = { AUDIO_TOKEN_SECRET: "test-audio-secret-xyz" };

describe("audio-token: round-trip", () => {
  it("signs and verifies a token", async () => {
    const { token, exp } = await signAudioToken(env, {
      briefingId: "b1",
      userId: "u1",
      ttlSeconds: 300,
    });
    const result = await verifyAudioToken(env, {
      briefingId: "b1",
      userId: "u1",
      token,
      exp,
    });
    expect(result).toBe("ok");
  });

  it("rejects a tampered token", async () => {
    const { token, exp } = await signAudioToken(env, {
      briefingId: "b1",
      userId: "u1",
      ttlSeconds: 300,
    });
    const tampered = token.slice(0, -3) + "AAA";
    const result = await verifyAudioToken(env, {
      briefingId: "b1",
      userId: "u1",
      token: tampered,
      exp,
    });
    expect(result).toBe("invalid");
  });

  it("rejects a token signed with a different secret", async () => {
    const { token, exp } = await signAudioToken(env, {
      briefingId: "b1",
      userId: "u1",
      ttlSeconds: 300,
    });
    const result = await verifyAudioToken(
      { AUDIO_TOKEN_SECRET: "different-secret" },
      { briefingId: "b1", userId: "u1", token, exp }
    );
    expect(result).toBe("invalid");
  });

  it("rejects an expired exp", async () => {
    const past = Math.floor(Date.now() / 1000) - 10;
    const { token } = await signAudioToken(env, {
      briefingId: "b1",
      userId: "u1",
      ttlSeconds: -100,
    });
    const result = await verifyAudioToken(env, {
      briefingId: "b1",
      userId: "u1",
      token,
      exp: past,
    });
    expect(result).toBe("expired");
  });

  it("rejects a token bound to a different briefingId", async () => {
    const { token, exp } = await signAudioToken(env, {
      briefingId: "b1",
      userId: "u1",
      ttlSeconds: 300,
    });
    const result = await verifyAudioToken(env, {
      briefingId: "b2",
      userId: "u1",
      token,
      exp,
    });
    expect(result).toBe("invalid");
  });

  it("rejects a token bound to a different userId", async () => {
    const { token, exp } = await signAudioToken(env, {
      briefingId: "b1",
      userId: "u1",
      ttlSeconds: 300,
    });
    const result = await verifyAudioToken(env, {
      briefingId: "b1",
      userId: "u2",
      token,
      exp,
    });
    expect(result).toBe("invalid");
  });

  it("falls back to derived secret when AUDIO_TOKEN_SECRET unset", async () => {
    const fallbackEnv = { CLERK_WEBHOOK_SECRET: "whsec_test_123" };
    const { token, exp } = await signAudioToken(fallbackEnv, {
      briefingId: "b1",
      userId: "u1",
      ttlSeconds: 300,
    });
    const result = await verifyAudioToken(fallbackEnv, {
      briefingId: "b1",
      userId: "u1",
      token,
      exp,
    });
    expect(result).toBe("ok");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run worker/lib/__tests__/audio-token.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `worker/lib/audio-token.ts`**

```typescript
export interface AudioTokenEnv {
  AUDIO_TOKEN_SECRET?: string;
  CLERK_WEBHOOK_SECRET?: string;
}

export interface SignArgs {
  briefingId: string;
  userId: string;
  ttlSeconds: number;
}

export interface VerifyArgs {
  briefingId: string;
  userId: string;
  token: string;
  exp: number;
}

export type VerifyResult = "ok" | "expired" | "invalid";

export async function signAudioToken(
  env: AudioTokenEnv,
  args: SignArgs,
): Promise<{ token: string; exp: number }> {
  const exp = Math.floor(Date.now() / 1000) + args.ttlSeconds;
  const payload = `${args.briefingId}.${args.userId}.${exp}`;
  const token = await sign(env, payload);
  return { token, exp };
}

export async function verifyAudioToken(
  env: AudioTokenEnv,
  args: VerifyArgs,
): Promise<VerifyResult> {
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(args.exp) || args.exp <= now) return "expired";
  const payload = `${args.briefingId}.${args.userId}.${args.exp}`;
  const expected = await sign(env, payload);
  if (!constantTimeEq(args.token, expected)) return "invalid";
  return "ok";
}

function getSecret(env: AudioTokenEnv): string {
  if (env.AUDIO_TOKEN_SECRET) return env.AUDIO_TOKEN_SECRET;
  if (env.CLERK_WEBHOOK_SECRET) return `audio-token:${env.CLERK_WEBHOOK_SECRET}`;
  return "audio-token:default-dev-secret";
}

async function sign(env: AudioTokenEnv, payload: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(getSecret(env)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const buf = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return base64UrlEncode(new Uint8Array(buf));
}

function base64UrlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function constantTimeEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run worker/lib/__tests__/audio-token.test.ts`
Expected: PASS — all 7 tests green.

- [ ] **Step 5: Commit**

```bash
git add worker/lib/audio-token.ts worker/lib/__tests__/audio-token.test.ts
git commit -m "feat(audio): HMAC sign/verify utility for short-lived audio URLs"
```

---

## Task 2: Add `AUDIO_TOKEN_SECRET` to env type and mock helper

**Files:**
- Modify: `worker/types.ts`
- Modify: `tests/helpers/mocks.ts`

- [ ] **Step 1: Add the env field**

In `worker/types.ts`, inside the `Env` type definition, before the closing brace add:

```typescript
  /** HMAC secret for audio URL tokens (optional — falls back to derivation off CLERK_WEBHOOK_SECRET) */
  AUDIO_TOKEN_SECRET?: string;
  /** Server kill-switch for the audio token endpoint. If "false", `/audio-url` returns 503. */
  ENABLE_AUDIO_TOKEN?: string;
```

- [ ] **Step 2: Add to mock env**

In `tests/helpers/mocks.ts`, inside `createMockEnv()`'s return object, add:

```typescript
    AUDIO_TOKEN_SECRET: "audio_secret_mock",
    ENABLE_AUDIO_TOKEN: "true",
```

- [ ] **Step 3: Verify typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add worker/types.ts tests/helpers/mocks.ts
git commit -m "feat(audio): add AUDIO_TOKEN_SECRET and ENABLE_AUDIO_TOKEN env vars"
```

---

## Task 3: `GET /api/briefings/:id/audio-url` endpoint

**Files:**
- Modify: `worker/routes/briefings.ts`
- Create: `worker/routes/__tests__/briefings-audio-url.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `worker/routes/__tests__/briefings-audio-url.test.ts`. Mirror the pattern in `worker/routes/__tests__/briefings-ondemand.test.ts` (look there if you need a more complete reference).

```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";
import { Hono } from "hono";
import { briefings } from "../briefings";
import { createMockEnv, createMockPrisma } from "../../../tests/helpers/mocks";
import { verifyAudioToken } from "../../lib/audio-token";

function buildApp(prisma: any, userId = "user_1") {
  const app = new Hono<{ Bindings: any }>();
  app.use("/*", async (c, next) => {
    c.set("prisma", prisma);
    // Stand in for clerkMiddleware: setting clerkAuth so requireAuth + getCurrentUser succeed.
    c.set("clerkAuth" as any, { userId });
    await next();
  });
  app.route("/", briefings);
  return app;
}

describe("GET /:id/audio-url", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns a signed URL for the briefing owner", async () => {
    const prisma = createMockPrisma();
    prisma.user.findFirst.mockResolvedValue({ id: "user_db_1", clerkUserId: "user_1" });
    prisma.briefing.findFirst.mockResolvedValue({
      id: "br_1",
      userId: "user_db_1",
      clip: { audioKey: "clips/abc.mp3" },
    });
    const app = buildApp(prisma);
    const res = await app.request(
      "/br_1/audio-url",
      { method: "GET" },
      { ...createMockEnv() },
    );
    expect(res.status).toBe(200);
    const body = await res.json() as { url: string; expiresAt: number };
    expect(body.url).toMatch(/\/api\/briefings\/br_1\/audio\?t=[A-Za-z0-9_-]+&exp=\d+/);
    const nowSec = Math.floor(Date.now() / 1000);
    expect(body.expiresAt).toBeGreaterThan(nowSec);
    expect(body.expiresAt - nowSec).toBeLessThanOrEqual(310);

    const params = new URL(`http://x${body.url.replace("/api/briefings/br_1/audio", "")}`).searchParams;
    const result = await verifyAudioToken(createMockEnv(), {
      briefingId: "br_1",
      userId: "user_db_1",
      token: params.get("t")!,
      exp: Number(params.get("exp")),
    });
    expect(result).toBe("ok");
  });

  it("returns 404 for a briefing owned by a different user", async () => {
    const prisma = createMockPrisma();
    prisma.user.findFirst.mockResolvedValue({ id: "user_db_1", clerkUserId: "user_1" });
    prisma.briefing.findFirst.mockResolvedValue(null); // not owned by caller
    const app = buildApp(prisma);
    const res = await app.request(
      "/br_other/audio-url",
      { method: "GET" },
      { ...createMockEnv() },
    );
    expect(res.status).toBe(404);
  });

  it("returns 409 audio_not_ready when audioKey missing", async () => {
    const prisma = createMockPrisma();
    prisma.user.findFirst.mockResolvedValue({ id: "user_db_1", clerkUserId: "user_1" });
    prisma.briefing.findFirst.mockResolvedValue({
      id: "br_1",
      userId: "user_db_1",
      clip: { audioKey: null },
    });
    const app = buildApp(prisma);
    const res = await app.request(
      "/br_1/audio-url",
      { method: "GET" },
      { ...createMockEnv() },
    );
    expect(res.status).toBe(409);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("audio_not_ready");
  });

  it("returns 503 when ENABLE_AUDIO_TOKEN=false", async () => {
    const prisma = createMockPrisma();
    prisma.user.findFirst.mockResolvedValue({ id: "user_db_1", clerkUserId: "user_1" });
    prisma.briefing.findFirst.mockResolvedValue({
      id: "br_1",
      userId: "user_db_1",
      clip: { audioKey: "clips/abc.mp3" },
    });
    const app = buildApp(prisma);
    const env = { ...createMockEnv(), ENABLE_AUDIO_TOKEN: "false" };
    const res = await app.request("/br_1/audio-url", { method: "GET" }, env);
    expect(res.status).toBe(503);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run worker/routes/__tests__/briefings-audio-url.test.ts`
Expected: FAIL — route not registered (404 instead of 200, etc.).

- [ ] **Step 3: Implement the route**

In `worker/routes/briefings.ts`:

Add the import at the top with other imports:

```typescript
import { signAudioToken } from "../lib/audio-token";
```

Add the new route handler immediately after the existing `briefings.get("/:id/audio", ...)` handler (after line 325, before the closing of the file):

```typescript
/**
 * GET /:id/audio-url — Issue a short-lived signed URL for the briefing audio.
 *
 * Returns: { url, expiresAt } where url is a query-token-authenticated form
 * of /:id/audio that the audio element can stream from directly without a
 * bearer header.
 */
briefings.get("/:id/audio-url", async (c) => {
  if (c.env.ENABLE_AUDIO_TOKEN === "false") {
    return c.json({ error: "audio_token_disabled" }, 503);
  }

  const briefingId = c.req.param("id");
  const prisma = c.get("prisma") as any;
  const user = await getCurrentUser(c, prisma);

  const briefing = await prisma.briefing.findFirst({
    where: { id: briefingId, userId: user.id },
    include: { clip: { select: { audioKey: true } } },
  });

  if (!briefing) {
    return c.json({ error: "Briefing not found" }, 404);
  }
  if (!briefing.clip?.audioKey) {
    return c.json({ error: "audio_not_ready" }, 409);
  }

  const { token, exp } = await signAudioToken(c.env, {
    briefingId,
    userId: user.id,
    ttlSeconds: 300,
  });

  return c.json({
    url: `/api/briefings/${briefingId}/audio?t=${token}&exp=${exp}`,
    expiresAt: exp,
  });
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run worker/routes/__tests__/briefings-audio-url.test.ts`
Expected: PASS — all 4 tests.

- [ ] **Step 5: Commit**

```bash
git add worker/routes/briefings.ts worker/routes/__tests__/briefings-audio-url.test.ts
git commit -m "feat(audio): add GET /:id/audio-url returning HMAC-signed audio URL"
```

---

## Task 4: Modify `/audio` route to accept token-or-Clerk auth

**Files:**
- Modify: `worker/routes/briefings.ts`
- Create: `worker/routes/__tests__/briefings-audio-token-auth.test.ts`

The existing `/audio` route is currently behind `briefings.use("*", requireAuth)`. We need to allow query-token requests to reach it without Clerk auth. Approach: register the token-handled GET on the route, keep `requireAuth` for the rest, and have the handler check token first; if no token, fall through to `requireAuth` semantics by calling `getCurrentUser`.

Easier: split the audio handler into two sub-handlers behind a single path, conditionally applying auth. Cleanest path is to register `briefings.get("/:id/audio", ...)` BEFORE the `briefings.use("*", requireAuth)` line, and inside check for `t`+`exp` query params; if absent, run the auth check inline.

Inspect `worker/routes/briefings.ts` line 16: `briefings.use("*", requireAuth);`. The audio route at line 271 currently inherits this. We need to bypass it conditionally.

- [ ] **Step 1: Write the failing tests**

Create `worker/routes/__tests__/briefings-audio-token-auth.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";
import { Hono } from "hono";
import { briefings } from "../briefings";
import { createMockEnv, createMockPrisma } from "../../../tests/helpers/mocks";
import { signAudioToken } from "../../lib/audio-token";

function buildApp(prisma: any, opts: { userId?: string; setAuth?: boolean } = {}) {
  const app = new Hono<{ Bindings: any }>();
  app.use("/*", async (c, next) => {
    c.set("prisma", prisma);
    if (opts.setAuth !== false) {
      c.set("clerkAuth" as any, { userId: opts.userId ?? "user_1" });
    }
    await next();
  });
  app.route("/", briefings);
  return app;
}

const audioBytes = new Uint8Array([1, 2, 3, 4, 5]);
function makeEnvWithR2() {
  const env = createMockEnv();
  (env.R2 as any).get = vi.fn().mockResolvedValue({
    body: new Blob([audioBytes]).stream(),
    size: audioBytes.byteLength,
    etag: '"abc"',
  });
  return env;
}

describe("GET /:id/audio with token auth", () => {
  beforeEach(() => vi.clearAllMocks());

  it("streams audio with a valid token (no Clerk auth)", async () => {
    const prisma = createMockPrisma();
    prisma.briefing.findFirst.mockResolvedValue({
      id: "br_1",
      userId: "user_db_1",
      clip: { audioKey: "clips/abc.mp3", audioContentType: "audio/mpeg" },
    });

    const env = makeEnvWithR2();
    const { token, exp } = await signAudioToken(env, {
      briefingId: "br_1",
      userId: "user_db_1",
      ttlSeconds: 300,
    });

    const app = buildApp(prisma, { setAuth: false }); // no Clerk auth context
    const res = await app.request(`/br_1/audio?t=${token}&exp=${exp}`, { method: "GET" }, env);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("audio/mpeg");
  });

  it("returns 401 token_expired when exp is past", async () => {
    const prisma = createMockPrisma();
    const env = makeEnvWithR2();
    const past = Math.floor(Date.now() / 1000) - 10;
    const { token } = await signAudioToken(env, {
      briefingId: "br_1",
      userId: "user_db_1",
      ttlSeconds: -100,
    });

    const app = buildApp(prisma, { setAuth: false });
    const res = await app.request(`/br_1/audio?t=${token}&exp=${past}`, { method: "GET" }, env);
    expect(res.status).toBe(401);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("token_expired");
  });

  it("returns 401 on tampered token", async () => {
    const prisma = createMockPrisma();
    const env = makeEnvWithR2();
    const { token, exp } = await signAudioToken(env, {
      briefingId: "br_1",
      userId: "user_db_1",
      ttlSeconds: 300,
    });
    const tampered = token.slice(0, -3) + "AAA";

    const app = buildApp(prisma, { setAuth: false });
    const res = await app.request(`/br_1/audio?t=${tampered}&exp=${exp}`, { method: "GET" }, env);
    expect(res.status).toBe(401);
  });

  it("falls through to Clerk auth when no token present (regression)", async () => {
    const prisma = createMockPrisma();
    prisma.user.findFirst.mockResolvedValue({ id: "user_db_1", clerkUserId: "user_1" });
    prisma.briefing.findFirst.mockResolvedValue({
      id: "br_1",
      userId: "user_db_1",
      clip: { audioKey: "clips/abc.mp3", audioContentType: "audio/mpeg" },
    });
    const env = makeEnvWithR2();

    const app = buildApp(prisma); // with Clerk auth context
    const res = await app.request("/br_1/audio", { method: "GET" }, env);
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run worker/routes/__tests__/briefings-audio-token-auth.test.ts`
Expected: FAIL — token request returns 401/404 (no token branch yet).

- [ ] **Step 3: Modify the audio route**

In `worker/routes/briefings.ts`:

Add to the imports:
```typescript
import { verifyAudioToken } from "../lib/audio-token";
```

Replace the existing `briefings.get("/:id/audio", async (c) => { ... })` handler entirely with the version below. The new logic: if a `t` query param is present, verify it (no Clerk needed); if it's absent, fall back to the existing `getCurrentUser` flow.

```typescript
briefings.get("/:id/audio", async (c) => {
  const briefingId = c.req.param("id");
  const prisma = c.get("prisma") as any;
  const tokenParam = c.req.query("t");
  const expParam = c.req.query("exp");

  let userId: string | null = null;

  if (tokenParam && expParam) {
    // Token path — find the briefing first to get its userId, then verify against it.
    const owner = await prisma.briefing.findUnique({
      where: { id: briefingId },
      select: { userId: true },
    });
    if (!owner) {
      return c.json({ error: "Briefing not found" }, 404);
    }
    const result = await verifyAudioToken(c.env, {
      briefingId,
      userId: owner.userId,
      token: tokenParam,
      exp: Number(expParam),
    });
    if (result === "expired") {
      return c.json({ error: "token_expired" }, 401);
    }
    if (result !== "ok") {
      return c.json({ error: "invalid_token" }, 401);
    }
    userId = owner.userId;
  } else {
    // Clerk path — existing behavior
    const user = await getCurrentUser(c, prisma);
    userId = user.id;
  }

  const briefing = await prisma.briefing.findFirst({
    where: { id: briefingId, userId },
    include: {
      clip: { select: { audioKey: true, audioContentType: true } },
    },
  });

  if (!briefing) {
    return c.json({ error: "Briefing not found" }, 404);
  }

  if (!briefing.clip?.audioKey) {
    return c.json({ error: "Audio not found" }, 404);
  }

  const clipObj = await c.env.R2.get(briefing.clip.audioKey);
  if (!clipObj) {
    return c.json({ error: "Audio not found" }, 404);
  }

  const headers: Record<string, string> = {
    "Content-Type": briefing.clip.audioContentType || "audio/mpeg",
    "Content-Length": String(clipObj.size),
    "Cache-Control": "public, max-age=604800, immutable",
    "Accept-Ranges": "bytes",
  };
  if (clipObj.etag) headers["ETag"] = clipObj.etag;

  // Handle range requests for streaming/seeking
  const range = c.req.header("Range");
  if (range) {
    const body = await clipObj.arrayBuffer();
    const match = range.match(/bytes=(\d+)-(\d*)/);
    if (match) {
      const start = parseInt(match[1], 10);
      const end = match[2] ? parseInt(match[2], 10) : body.byteLength - 1;
      const slice = body.slice(start, end + 1);
      return new Response(slice, {
        status: 206,
        headers: {
          ...headers,
          "Content-Length": String(slice.byteLength),
          "Content-Range": `bytes ${start}-${end}/${body.byteLength}`,
        },
      });
    }
  }

  return new Response(clipObj.body, { headers });
});
```

Note: `briefings.use("*", requireAuth)` at line 16 still wraps the route. To allow token-only requests through, we need the requireAuth middleware to skip when `t` is present. Modify the middleware or move the audio route registration above the `requireAuth` guard.

Cleanest approach: move the audio route registration above the `briefings.use("*", requireAuth)` line. The handler does its own auth check (token or Clerk). Steps:

1. In `worker/routes/briefings.ts`, cut the entire `briefings.get("/:id/audio", ...)` and `briefings.get("/:id/audio-url", ...)` handlers.
2. Paste them immediately AFTER `export const briefings = new Hono<{ Bindings: Env }>();` (line 14) and BEFORE `briefings.use("*", requireAuth);` (line 16).

This way the audio routes register first and aren't subjected to `requireAuth`. The audio handler does its own auth (token or Clerk via `getCurrentUser`). The audio-url handler always uses Clerk via `getCurrentUser`.

- [ ] **Step 4: Run all briefings tests to verify no regression**

Run:
```
npx vitest run worker/routes/__tests__/briefings-audio-url.test.ts \
  worker/routes/__tests__/briefings-audio-token-auth.test.ts \
  worker/routes/__tests__/briefings-cancel.test.ts \
  worker/routes/__tests__/briefings-ondemand.test.ts
```
Expected: PASS — all four files green.

- [ ] **Step 5: Commit**

```bash
git add worker/routes/briefings.ts worker/routes/__tests__/briefings-audio-token-auth.test.ts
git commit -m "feat(audio): accept HMAC query token on GET /:id/audio for streamable URLs"
```

---

## Task 5: Network tier classifier

**Files:**
- Create: `src/lib/network-tier.ts`
- Create: `src/__tests__/network-tier.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/__tests__/network-tier.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { getNetworkTier } from "../lib/network-tier";

const realNavigator = globalThis.navigator;

function setNavigator(patch: Partial<Navigator> & { connection?: any }) {
  Object.defineProperty(globalThis, "navigator", {
    value: { ...realNavigator, ...patch },
    configurable: true,
  });
}

describe("getNetworkTier", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    Object.defineProperty(globalThis, "navigator", { value: realNavigator, configurable: true });
    vi.useRealTimers();
  });

  it("returns 'offline' when navigator.onLine is false", () => {
    setNavigator({ onLine: false });
    expect(getNetworkTier()).toBe("offline");
  });

  it("returns 'wifi' when connection.type is 'wifi'", () => {
    setNavigator({ onLine: true, connection: { type: "wifi", effectiveType: "4g" } });
    expect(getNetworkTier()).toBe("wifi");
  });

  it("returns 'cellular' when connection.type is 'cellular'", () => {
    setNavigator({ onLine: true, connection: { type: "cellular", effectiveType: "4g" } });
    expect(getNetworkTier()).toBe("cellular");
  });

  it("treats effectiveType '4g' as wifi-tier when connection.type missing", () => {
    setNavigator({ onLine: true, connection: { effectiveType: "4g" } });
    expect(getNetworkTier()).toBe("wifi");
  });

  it("treats effectiveType '3g' as cellular-tier when connection.type missing", () => {
    setNavigator({ onLine: true, connection: { effectiveType: "3g" } });
    expect(getNetworkTier()).toBe("cellular");
  });

  it("falls back to 'cellular' (conservative) when Connection API is unavailable", () => {
    setNavigator({ onLine: true });
    expect(getNetworkTier()).toBe("cellular");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/network-tier.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/network-tier.ts`**

```typescript
export type NetworkTier = "wifi" | "cellular" | "offline";

interface NetworkInformationLike {
  type?: string;
  effectiveType?: string;
}

interface NavigatorWithConnection extends Navigator {
  connection?: NetworkInformationLike;
  mozConnection?: NetworkInformationLike;
  webkitConnection?: NetworkInformationLike;
}

export function getNetworkTier(): NetworkTier {
  if (typeof navigator === "undefined") return "cellular";
  const nav = navigator as NavigatorWithConnection;
  if (nav.onLine === false) return "offline";

  const conn = nav.connection ?? nav.mozConnection ?? nav.webkitConnection;
  if (!conn) return "cellular"; // conservative default (e.g., iOS Safari/WebKit)

  if (conn.type === "wifi" || conn.type === "ethernet") return "wifi";
  if (conn.type === "cellular") return "cellular";

  // Type missing — heuristic on effectiveType
  if (conn.effectiveType === "4g") return "wifi";
  return "cellular";
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/network-tier.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/network-tier.ts src/__tests__/network-tier.test.ts
git commit -m "feat(client): add network-tier classifier for prefetch policy"
```

---

## Task 6: `StorageManager.getPlayableUrl` and `pruneNotInFeed`

**Files:**
- Modify: `src/services/storage-manager.ts`
- Modify: `src/__tests__/storage-manager.test.ts` (or create if absent — check `src/__tests__/` first)

- [ ] **Step 1: Locate or create the test file**

Run: `npx vitest list src/__tests__/storage-manager.test.ts 2>/dev/null || ls src/__tests__/`

If the file doesn't exist, create `src/__tests__/storage-manager.test.ts` with the structure used by other tests in `src/__tests__/`. If it exists, append the new test cases to it.

- [ ] **Step 2: Write the failing tests**

Append (or create with) the following tests. These mock `fetch` for the network calls and use `fake-indexeddb` if the file already imports it; otherwise add `import "fake-indexeddb/auto";` at the top.

```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";
import "fake-indexeddb/auto";
import { StorageManager } from "../services/storage-manager";

// Capacitor mock — non-native path so writeBlob/readBlob use Cache API
vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => false },
}));

// Mock the global fetch for signed-URL requests
const originalFetch = globalThis.fetch;

function makeBlob(bytes = 1024) {
  const arr = new Uint8Array(bytes);
  return new Blob([arr]);
}

describe("StorageManager.getPlayableUrl", () => {
  let manager: StorageManager;

  beforeEach(async () => {
    indexedDB.deleteDatabase("blipp-storage-test");
    manager = new StorageManager({ dbName: "blipp-storage-test" });
    await manager.init();
    globalThis.fetch = vi.fn();
  });

  it("returns a local URL on cache hit without calling fetch", async () => {
    const blob = makeBlob();
    await manager.store("br_1", blob);

    const url = await manager.getPlayableUrl("br_1");
    expect(url).toMatch(/^blob:|^file:|^\//); // Cache API resolves later; here we expect blob://
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("on cache miss, fetches signed URL and returns it", async () => {
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        url: "/api/briefings/br_2/audio?t=abc&exp=999",
        expiresAt: 999,
      }),
    });

    const url = await manager.getPlayableUrl("br_2");
    expect(url).toBe("/api/briefings/br_2/audio?t=abc&exp=999");
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/briefings/br_2/audio-url",
      expect.any(Object),
    );
  });

  it("on cache hit but readBlob returns null, treats as miss and removes manifest entry", async () => {
    const blob = makeBlob();
    await manager.store("br_3", blob);
    // Wipe the underlying Cache so readBlob returns null
    const cache = await caches.open("blipp-storage-test");
    await cache.delete("/blipp-audio/br_3");

    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        url: "/api/briefings/br_3/audio?t=xyz&exp=999",
        expiresAt: 999,
      }),
    });

    const url = await manager.getPlayableUrl("br_3");
    expect(url).toBe("/api/briefings/br_3/audio?t=xyz&exp=999");
    const entry = await manager.getEntry("br_3");
    expect(entry).toBeUndefined(); // stale entry was removed
  });

  it("throws when the signed-URL fetch fails", async () => {
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 500,
    });

    await expect(manager.getPlayableUrl("br_4")).rejects.toThrow();
  });
});

describe("StorageManager.pruneNotInFeed", () => {
  let manager: StorageManager;

  beforeEach(async () => {
    indexedDB.deleteDatabase("blipp-storage-test");
    manager = new StorageManager({ dbName: "blipp-storage-test" });
    await manager.init();
  });

  it("removes entries not in the active feed", async () => {
    await manager.store("br_keep", makeBlob());
    await manager.store("br_drop", makeBlob());

    await manager.pruneNotInFeed(["br_keep"]);

    expect(await manager.has("br_keep")).toBe(true);
    expect(await manager.has("br_drop")).toBe(false);
  });

  it("does not remove the currently-playing entry even if it's not in the feed", async () => {
    await manager.store("br_playing", makeBlob());
    manager.setCurrentlyPlaying("br_playing");

    await manager.pruneNotInFeed([]); // empty active list

    expect(await manager.has("br_playing")).toBe(true);
  });
});

afterAll(() => {
  globalThis.fetch = originalFetch;
});
```

(If `fake-indexeddb` is not yet a devDependency, install it: `npm install -D fake-indexeddb --legacy-peer-deps` and commit the lockfile change in this task's commit.)

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/storage-manager.test.ts`
Expected: FAIL — methods not implemented.

- [ ] **Step 4: Implement the methods**

In `src/services/storage-manager.ts`, add to the `StorageManager` class (after `markListened`):

```typescript
  /**
   * Resolve a playable URL for the audio element.
   *
   * Cache hit → returns a local blob:// (web) or file:// (native) URL.
   * Cache miss → fetches /api/briefings/:id/audio-url and returns the signed URL.
   * Stale manifest (readBlob returns null) → removes entry, treats as miss.
   *
   * Note: this method does NOT trigger the background download-to-store on miss.
   * That side-effect is the prefetcher's job — call it explicitly after a miss
   * if you want the next play of this item to be instant.
   */
  async getPlayableUrl(briefingId: string): Promise<string> {
    const entry = await this.getEntry(briefingId);
    if (entry) {
      const blob = await readBlob(briefingId);
      if (blob) {
        return URL.createObjectURL(blob);
      }
      // Manifest is stale — clean up and fall through to network.
      await this.remove(briefingId);
    }

    const res = await fetch(`/api/briefings/${briefingId}/audio-url`, {
      credentials: "include",
    });
    if (!res.ok) {
      throw new Error(`audio-url fetch failed: ${res.status}`);
    }
    const body = (await res.json()) as { url: string; expiresAt: number };
    return body.url;
  }

  /**
   * Reap cached entries whose briefingId is no longer in the active feed.
   * Never removes the currently-playing entry.
   */
  async pruneNotInFeed(activeBriefingIds: string[]): Promise<void> {
    const active = new Set(activeBriefingIds);
    const entries = await this.getAllEntries();
    for (const entry of entries) {
      if (active.has(entry.briefingId)) continue;
      if (entry.briefingId === this.currentlyPlayingId) continue;
      await this.remove(entry.briefingId);
    }
  }
```

For native (Capacitor) `getPlayableUrl`: the existing `readBlob` returns a `Blob` regardless of platform (on native it reads via Filesystem API and constructs a Blob). `URL.createObjectURL(blob)` works in WKWebView. No platform branch needed in `getPlayableUrl`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/storage-manager.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/services/storage-manager.ts src/__tests__/storage-manager.test.ts package.json package-lock.json
git commit -m "feat(storage): add getPlayableUrl and pruneNotInFeed to StorageManager"
```

---

## Task 7: Migrate audio-context to use `getPlayableUrl`; wire `markListened`

**Files:**
- Modify: `src/contexts/audio-context.tsx`

The existing `beginContent` block at `src/contexts/audio-context.tsx:122-129` does the slow blob-fetch-then-set-src. Replace it with `getPlayableUrl`. Also wire `storageManager.markListened` into the existing 30s listened timer.

- [ ] **Step 1: Read the current `beginContent` block and listened timer**

Open `src/contexts/audio-context.tsx`. Identify:
- The `beginContent` function around line 110-140.
- The 30s listened-timer logic — search for `listenedTimerRef.current = setTimeout`.

- [ ] **Step 2: Replace the fetch block in `beginContent`**

Find:
```typescript
      try {
        const token = await getToken();
        const res = await fetch(
          `${getApiBase()}/api/briefings/${item.briefing.id}/audio`,
          { headers: token ? { Authorization: `Bearer ${token}` } : {} }
        );
        if (!res.ok) throw new Error(`Audio fetch failed: ${res.status}`);
        const blob = await res.blob();
        audio.src = URL.createObjectURL(blob);
      } catch {
        setIsLoading(false);
        setError("Failed to load audio");
        return;
      }
```

Replace with:
```typescript
      try {
        const url = await storageManager.getPlayableUrl(item.briefing.id);
        audio.src = url;
      } catch {
        setIsLoading(false);
        setError("Failed to load audio");
        return;
      }
```

Note: the `storageManager` reference comes from `useStorage()`. Add the import and hook usage at the top of the `AudioProvider` component:

```typescript
import { useStorage } from "./storage-context";
// ...inside AudioProvider:
const { manager: storageManager } = useStorage();
```

(Ensure the import path matches the actual file structure. `storage-context.tsx` lives in the same directory.)

- [ ] **Step 3: Wire `markListened` into the listened timer**

Find the `setTimeout` that fires after 30s of content playback (search for `listenedFiredRef.current` and `apiFetch(\`/feed/`). Inside that callback, after the existing `apiFetch(...)` call, add:

```typescript
        storageManager.markListened(item.briefing.id).catch(() => {});
```

- [ ] **Step 4: Verify typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Run existing audio-context-related tests**

Run: `npx vitest run src/__tests__/feed-item.test.tsx src/__tests__/home-feed.test.tsx src/__tests__/player-share.test.tsx`
Expected: PASS — no regressions. Existing tests may need their mocks updated to provide a `useStorage` value. If a test fails with "useStorage must be used within a StorageProvider", wrap the rendered tree with a mocked StorageProvider, or mock `useStorage` directly:

```typescript
vi.mock("../contexts/storage-context", () => ({
  useStorage: () => ({
    manager: {
      getPlayableUrl: vi.fn().mockResolvedValue("blob:test"),
      markListened: vi.fn().mockResolvedValue(undefined),
    },
    usage: null,
    isReady: true,
    refreshUsage: vi.fn(),
    clearCache: vi.fn(),
    setBudget: vi.fn(),
  }),
  StorageProvider: ({ children }: { children: React.ReactNode }) => children,
}));
```

- [ ] **Step 6: Commit**

```bash
git add src/contexts/audio-context.tsx
git commit -m "feat(audio): route playback through StorageManager.getPlayableUrl"
```

---

## Task 8: Prefetcher core — queue + scheduleFromFeed + single-worker loop

**Files:**
- Create: `src/services/prefetcher.ts`
- Create: `src/__tests__/prefetcher.test.ts`

- [ ] **Step 1: Write the failing tests (core only)**

Create `src/__tests__/prefetcher.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import "fake-indexeddb/auto";
import { Prefetcher } from "../services/prefetcher";
import { StorageManager } from "../services/storage-manager";

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => false },
}));

vi.mock("../lib/network-tier", () => ({
  getNetworkTier: vi.fn(() => "wifi"),
}));

const originalFetch = globalThis.fetch;

function makeFeedItem(briefingId: string | null) {
  return {
    id: `fi_${briefingId ?? "nil"}`,
    briefing: briefingId ? { id: briefingId } : null,
  } as any;
}

async function makeManager(): Promise<StorageManager> {
  const m = new StorageManager({ dbName: `pf-${Math.random()}` });
  await m.init();
  return m;
}

describe("Prefetcher.scheduleFromFeed", () => {
  let prefetcher: Prefetcher;
  let manager: StorageManager;

  beforeEach(async () => {
    manager = await makeManager();
    prefetcher = new Prefetcher(manager, { cellularEnabled: false });
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    prefetcher.dispose();
    globalThis.fetch = originalFetch;
    vi.clearAllMocks();
  });

  it("filters out items without a briefing", async () => {
    prefetcher.scheduleFromFeed([makeFeedItem(null), makeFeedItem("br_a")]);
    expect(prefetcher.queueSize()).toBe(1);
  });

  it("filters out already-cached items", async () => {
    await manager.store("br_a", new Blob([new Uint8Array(10)]));
    prefetcher.scheduleFromFeed([makeFeedItem("br_a"), makeFeedItem("br_b")]);
    expect(prefetcher.queueSize()).toBe(1);
  });

  it("takes the first 10 items on wifi", async () => {
    const items = Array.from({ length: 15 }, (_, i) => makeFeedItem(`br_${i}`));
    prefetcher.scheduleFromFeed(items);
    expect(prefetcher.queueSize()).toBe(10);
  });

  it("takes only first 2 on cellular when cellular not enabled in settings", async () => {
    const { getNetworkTier } = await import("../lib/network-tier");
    (getNetworkTier as any).mockReturnValue("cellular");
    const items = Array.from({ length: 15 }, (_, i) => makeFeedItem(`br_${i}`));
    prefetcher.scheduleFromFeed(items);
    expect(prefetcher.queueSize()).toBe(0); // cellular off → no prefetch
  });

  it("takes first 2 when cellular is opted-in", async () => {
    prefetcher.dispose();
    prefetcher = new Prefetcher(manager, { cellularEnabled: true });
    const { getNetworkTier } = await import("../lib/network-tier");
    (getNetworkTier as any).mockReturnValue("cellular");
    const items = Array.from({ length: 15 }, (_, i) => makeFeedItem(`br_${i}`));
    prefetcher.scheduleFromFeed(items);
    expect(prefetcher.queueSize()).toBe(2);
  });

  it("takes nothing when offline", async () => {
    const { getNetworkTier } = await import("../lib/network-tier");
    (getNetworkTier as any).mockReturnValue("offline");
    prefetcher.scheduleFromFeed([makeFeedItem("br_a")]);
    expect(prefetcher.queueSize()).toBe(0);
  });
});

describe("Prefetcher worker loop (single concurrency)", () => {
  let prefetcher: Prefetcher;
  let manager: StorageManager;

  beforeEach(async () => {
    manager = await makeManager();
    prefetcher = new Prefetcher(manager, { cellularEnabled: false });
    let calls = 0;
    globalThis.fetch = vi.fn(async (url: any) => {
      calls++;
      const u = String(url);
      if (u.includes("/audio-url")) {
        const id = u.match(/briefings\/(.+?)\/audio-url/)![1];
        return {
          ok: true,
          json: async () => ({
            url: `/api/briefings/${id}/audio?t=tok&exp=9999999999`,
            expiresAt: 9999999999,
          }),
        } as any;
      }
      // The audio bytes
      return {
        ok: true,
        blob: async () => new Blob([new Uint8Array(64)]),
      } as any;
    });
  });

  afterEach(() => {
    prefetcher.dispose();
    globalThis.fetch = originalFetch;
    vi.clearAllMocks();
  });

  it("drains the queue: stores all items in StorageManager", async () => {
    const items = Array.from({ length: 3 }, (_, i) => ({ id: `fi_${i}`, briefing: { id: `br_${i}` } }) as any);
    prefetcher.scheduleFromFeed(items);
    await prefetcher.drainForTesting();

    expect(await manager.has("br_0")).toBe(true);
    expect(await manager.has("br_1")).toBe(true);
    expect(await manager.has("br_2")).toBe(true);
  });

  it("never has more than one fetch in flight at a time", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    globalThis.fetch = vi.fn(async (url: any) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      const u = String(url);
      if (u.includes("/audio-url")) {
        const id = u.match(/briefings\/(.+?)\/audio-url/)![1];
        return {
          ok: true,
          json: async () => ({ url: `/api/briefings/${id}/audio?t=tok&exp=999`, expiresAt: 999 }),
        } as any;
      }
      return { ok: true, blob: async () => new Blob([new Uint8Array(64)]) } as any;
    });

    const items = Array.from({ length: 5 }, (_, i) => ({ id: `fi_${i}`, briefing: { id: `br_${i}` } }) as any);
    prefetcher.scheduleFromFeed(items);
    await prefetcher.drainForTesting();

    expect(maxInFlight).toBe(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/prefetcher.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/services/prefetcher.ts` (core)**

```typescript
import type { StorageManager } from "./storage-manager";
import { getNetworkTier, type NetworkTier } from "../lib/network-tier";

export interface PrefetcherOptions {
  /** User opted into prefetching on cellular. */
  cellularEnabled: boolean;
}

interface FeedItemLike {
  id: string;
  briefing?: { id: string } | null;
}

const WIFI_TAKE = 10;
const CELLULAR_TAKE = 2;

export class Prefetcher {
  private manager: StorageManager;
  private opts: PrefetcherOptions;
  private queue: string[] = [];
  private running = false;
  private disposed = false;
  private currentAbort: AbortController | null = null;

  constructor(manager: StorageManager, opts: PrefetcherOptions) {
    this.manager = manager;
    this.opts = opts;
  }

  setCellularEnabled(enabled: boolean) {
    this.opts.cellularEnabled = enabled;
  }

  scheduleFromFeed(items: FeedItemLike[]): void {
    if (this.disposed) return;
    const tier = getNetworkTier();
    const take = this.takeForTier(tier);
    if (take === 0) return;

    const candidates: string[] = [];
    for (const item of items) {
      if (!item.briefing?.id) continue;
      candidates.push(item.briefing.id);
      if (candidates.length >= take) break;
    }

    void this.enqueueFiltered(candidates);
  }

  queueSize(): number {
    return this.queue.length;
  }

  /** For tests: drain the queue to completion. */
  async drainForTesting(): Promise<void> {
    while (this.queue.length > 0 || this.running) {
      await new Promise((r) => setTimeout(r, 1));
    }
  }

  dispose(): void {
    this.disposed = true;
    this.queue = [];
    this.currentAbort?.abort();
    this.currentAbort = null;
  }

  private takeForTier(tier: NetworkTier): number {
    if (tier === "offline") return 0;
    if (tier === "wifi") return WIFI_TAKE;
    if (tier === "cellular") return this.opts.cellularEnabled ? CELLULAR_TAKE : 0;
    return 0;
  }

  private async enqueueFiltered(briefingIds: string[]): Promise<void> {
    for (const id of briefingIds) {
      if (this.queue.includes(id)) continue;
      if (await this.manager.has(id)) continue;
      this.queue.push(id);
    }
    void this.tick();
  }

  private async tick(): Promise<void> {
    if (this.running || this.disposed) return;
    if (this.queue.length === 0) return;
    this.running = true;
    try {
      while (this.queue.length > 0 && !this.disposed) {
        const id = this.queue.shift()!;
        if (await this.manager.has(id)) continue;
        await this.fetchAndStore(id);
      }
    } finally {
      this.running = false;
    }
  }

  private async fetchAndStore(briefingId: string): Promise<void> {
    this.currentAbort = new AbortController();
    try {
      const urlRes = await fetch(`/api/briefings/${briefingId}/audio-url`, {
        credentials: "include",
        signal: this.currentAbort.signal,
      });
      if (!urlRes.ok) return;
      const body = (await urlRes.json()) as { url: string };

      const audioRes = await fetch(body.url, { signal: this.currentAbort.signal });
      if (!audioRes.ok) return;
      const blob = await audioRes.blob();
      await this.manager.store(briefingId, blob);
    } catch {
      // Silent. Next feed event will re-enqueue.
    } finally {
      this.currentAbort = null;
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/prefetcher.test.ts`
Expected: PASS — all 8 tests in this file (`scheduleFromFeed` 6 + `worker loop` 2).

- [ ] **Step 5: Commit**

```bash
git add src/services/prefetcher.ts src/__tests__/prefetcher.test.ts
git commit -m "feat(client): prefetcher core — feed-event scheduling + single-worker loop"
```

---

## Task 9: Prefetcher — `scheduleNextInQueue`, online/offline pause/resume

**Files:**
- Modify: `src/services/prefetcher.ts`
- Modify: `src/__tests__/prefetcher.test.ts`

- [ ] **Step 1: Append failing tests**

Append to `src/__tests__/prefetcher.test.ts`:

```typescript
describe("Prefetcher.scheduleNextInQueue", () => {
  let prefetcher: Prefetcher;
  let manager: StorageManager;

  beforeEach(async () => {
    manager = await makeManager();
    prefetcher = new Prefetcher(manager, { cellularEnabled: true });
    globalThis.fetch = vi.fn(async (url: any) => {
      const u = String(url);
      if (u.includes("/audio-url")) {
        const id = u.match(/briefings\/(.+?)\/audio-url/)![1];
        return {
          ok: true,
          json: async () => ({ url: `/api/briefings/${id}/audio?t=tok&exp=999`, expiresAt: 999 }),
        } as any;
      }
      return { ok: true, blob: async () => new Blob([new Uint8Array(64)]) } as any;
    });
  });

  afterEach(() => {
    prefetcher.dispose();
    vi.clearAllMocks();
  });

  it("enqueues the next N items in a play queue", async () => {
    const queue = Array.from({ length: 5 }, (_, i) => ({ id: `fi_${i}`, briefing: { id: `br_${i}` } }) as any);
    prefetcher.scheduleNextInQueue(queue, 2);
    await prefetcher.drainForTesting();
    expect(await manager.has("br_0")).toBe(true);
    expect(await manager.has("br_1")).toBe(true);
    expect(await manager.has("br_2")).toBe(false);
  });
});

describe("Prefetcher pause/resume", () => {
  let prefetcher: Prefetcher;
  let manager: StorageManager;

  beforeEach(async () => {
    manager = await makeManager();
    prefetcher = new Prefetcher(manager, { cellularEnabled: true });
    globalThis.fetch = vi.fn(async (url: any) => {
      const u = String(url);
      if (u.includes("/audio-url")) {
        const id = u.match(/briefings\/(.+?)\/audio-url/)![1];
        return {
          ok: true,
          json: async () => ({ url: `/api/briefings/${id}/audio?t=tok&exp=999`, expiresAt: 999 }),
        } as any;
      }
      return { ok: true, blob: async () => new Blob([new Uint8Array(64)]) } as any;
    });
  });

  afterEach(() => {
    prefetcher.dispose();
    vi.clearAllMocks();
  });

  it("does not run while paused", async () => {
    prefetcher.pause();
    prefetcher.scheduleFromFeed([{ id: "fi_a", briefing: { id: "br_a" } } as any]);
    // Give the loop a beat to run if it were going to.
    await new Promise((r) => setTimeout(r, 20));
    expect(await manager.has("br_a")).toBe(false);
    expect(prefetcher.queueSize()).toBeGreaterThanOrEqual(1);
  });

  it("resumes processing when resume() is called", async () => {
    prefetcher.pause();
    prefetcher.scheduleFromFeed([{ id: "fi_a", briefing: { id: "br_a" } } as any]);
    prefetcher.resume();
    await prefetcher.drainForTesting();
    expect(await manager.has("br_a")).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/prefetcher.test.ts`
Expected: FAIL — `scheduleNextInQueue`, `pause`, `resume` not defined.

- [ ] **Step 3: Extend the implementation**

In `src/services/prefetcher.ts`, add a `paused` field and methods. Modify the constructor to register `online`/`offline` listeners. Update `tick()` to short-circuit when paused.

```typescript
  private paused = false;
  private onlineHandler = () => this.resume();
  private offlineHandler = () => this.pause();

  constructor(manager: StorageManager, opts: PrefetcherOptions) {
    this.manager = manager;
    this.opts = opts;
    if (typeof window !== "undefined") {
      window.addEventListener("online", this.onlineHandler);
      window.addEventListener("offline", this.offlineHandler);
    }
  }

  pause(): void {
    this.paused = true;
    this.currentAbort?.abort();
  }

  resume(): void {
    this.paused = false;
    void this.tick();
  }

  scheduleNextInQueue(queue: FeedItemLike[], n: number): void {
    if (this.disposed) return;
    if (n <= 0) return;
    const candidates: string[] = [];
    for (const item of queue) {
      if (!item.briefing?.id) continue;
      candidates.push(item.briefing.id);
      if (candidates.length >= n) break;
    }
    void this.enqueueFiltered(candidates);
  }
```

Update `tick()` to short-circuit when paused:

```typescript
  private async tick(): Promise<void> {
    if (this.running || this.disposed || this.paused) return;
    if (this.queue.length === 0) return;
    this.running = true;
    try {
      while (this.queue.length > 0 && !this.disposed && !this.paused) {
        const id = this.queue.shift()!;
        if (await this.manager.has(id)) continue;
        await this.fetchAndStore(id);
      }
    } finally {
      this.running = false;
    }
  }
```

Update `dispose()` to remove listeners:

```typescript
  dispose(): void {
    this.disposed = true;
    this.queue = [];
    this.currentAbort?.abort();
    this.currentAbort = null;
    if (typeof window !== "undefined") {
      window.removeEventListener("online", this.onlineHandler);
      window.removeEventListener("offline", this.offlineHandler);
    }
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/prefetcher.test.ts`
Expected: PASS — all tests including the new ones.

- [ ] **Step 5: Commit**

```bash
git add src/services/prefetcher.ts src/__tests__/prefetcher.test.ts
git commit -m "feat(client): prefetcher scheduleNextInQueue + pause/resume on online/offline"
```

---

## Task 10: Prefetcher — tap-during-prefetch race handling

**Files:**
- Modify: `src/services/prefetcher.ts`
- Modify: `src/__tests__/prefetcher.test.ts`

When the user taps a blipp that's currently being prefetched, the tap path should win: cancel the in-flight prefetch and let the audio context handle the URL fetch (which will also kick off its own background store via the prefetcher).

- [ ] **Step 1: Append failing tests**

Append to `src/__tests__/prefetcher.test.ts`:

```typescript
describe("Prefetcher.cancelInflight", () => {
  let prefetcher: Prefetcher;
  let manager: StorageManager;

  beforeEach(async () => {
    manager = await makeManager();
    prefetcher = new Prefetcher(manager, { cellularEnabled: true });
  });

  afterEach(() => {
    prefetcher.dispose();
    vi.clearAllMocks();
  });

  it("aborts the in-flight fetch when the matching briefingId is canceled", async () => {
    const aborts: AbortSignal[] = [];
    let resolveFirst: ((v: any) => void) | null = null;
    globalThis.fetch = vi.fn((url: any, init: any = {}) => {
      aborts.push(init.signal);
      const u = String(url);
      if (u.includes("/audio-url")) {
        const id = u.match(/briefings\/(.+?)\/audio-url/)![1];
        return Promise.resolve({
          ok: true,
          json: async () => ({ url: `/api/briefings/${id}/audio?t=t&exp=9`, expiresAt: 9 }),
        } as any);
      }
      // Audio bytes — block until canceled.
      return new Promise((resolve, reject) => {
        resolveFirst = resolve;
        init.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
      });
    });

    prefetcher.scheduleFromFeed([{ id: "fi_a", briefing: { id: "br_a" } } as any]);
    // Wait for fetch to start
    await new Promise((r) => setTimeout(r, 10));

    prefetcher.cancelInflight("br_a");
    await prefetcher.drainForTesting();

    expect(await manager.has("br_a")).toBe(false);
    expect(aborts.some((s) => s?.aborted)).toBe(true);
  });

  it("does nothing when canceling a different briefingId", async () => {
    let didFinish = false;
    globalThis.fetch = vi.fn(async (url: any) => {
      const u = String(url);
      if (u.includes("/audio-url")) {
        const id = u.match(/briefings\/(.+?)\/audio-url/)![1];
        return {
          ok: true,
          json: async () => ({ url: `/api/briefings/${id}/audio?t=t&exp=9`, expiresAt: 9 }),
        } as any;
      }
      didFinish = true;
      return { ok: true, blob: async () => new Blob([new Uint8Array(8)]) } as any;
    });

    prefetcher.scheduleFromFeed([{ id: "fi_a", briefing: { id: "br_a" } } as any]);
    prefetcher.cancelInflight("br_other");
    await prefetcher.drainForTesting();

    expect(didFinish).toBe(true);
    expect(await manager.has("br_a")).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/prefetcher.test.ts -t "cancelInflight"`
Expected: FAIL — `cancelInflight` not defined.

- [ ] **Step 3: Implement `cancelInflight`**

In `src/services/prefetcher.ts`, add a field tracking the briefingId currently being fetched, and a `cancelInflight` method:

```typescript
  private currentBriefingId: string | null = null;

  cancelInflight(briefingId: string): void {
    if (this.currentBriefingId === briefingId) {
      this.currentAbort?.abort();
    }
    // Also remove from queue if not yet started.
    const idx = this.queue.indexOf(briefingId);
    if (idx >= 0) this.queue.splice(idx, 1);
  }
```

Update `fetchAndStore` to track the current id:

```typescript
  private async fetchAndStore(briefingId: string): Promise<void> {
    this.currentAbort = new AbortController();
    this.currentBriefingId = briefingId;
    try {
      const urlRes = await fetch(`/api/briefings/${briefingId}/audio-url`, {
        credentials: "include",
        signal: this.currentAbort.signal,
      });
      if (!urlRes.ok) return;
      const body = (await urlRes.json()) as { url: string };

      const audioRes = await fetch(body.url, { signal: this.currentAbort.signal });
      if (!audioRes.ok) return;
      const blob = await audioRes.blob();
      await this.manager.store(briefingId, blob);
    } catch {
      // Silent.
    } finally {
      this.currentAbort = null;
      this.currentBriefingId = null;
    }
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/prefetcher.test.ts`
Expected: PASS — all tests including new `cancelInflight` cases.

- [ ] **Step 5: Commit**

```bash
git add src/services/prefetcher.ts src/__tests__/prefetcher.test.ts
git commit -m "feat(client): prefetcher cancelInflight for tap-during-prefetch race"
```

---

## Task 11: Wire prefetcher into storage-context; hook feed-load call sites

**Files:**
- Modify: `src/contexts/storage-context.tsx`
- Modify: `src/pages/Home.tsx` (and any other feed-load call site — search for them in step 1)

- [ ] **Step 1: Find all feed-load call sites**

Run: `grep -rn "useFetch.*feed\|/api/feed" src/pages src/components src/lib | head`

Note the files that fetch the user's feed. The primary site is likely `src/pages/Home.tsx` or a hook in `src/lib/`.

- [ ] **Step 2: Extend StorageContext to expose the prefetcher**

In `src/contexts/storage-context.tsx`, modify the file to instantiate and expose the prefetcher:

```typescript
import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { StorageManager, StorageUsage, StorageManagerConfig } from '../services/storage-manager';
import { Prefetcher } from '../services/prefetcher';

interface StorageContextValue {
  manager: StorageManager;
  prefetcher: Prefetcher;
  usage: StorageUsage | null;
  refreshUsage: () => Promise<void>;
  clearCache: () => Promise<void>;
  setBudget: (bytes: number) => void;
  cellularEnabled: boolean;
  setCellularEnabled: (enabled: boolean) => void;
  isReady: boolean;
}

const STORAGE_KEY_CELLULAR = "blipp.prefetch.cellular.enabled";

export function StorageProvider({ children, config }: { children: React.ReactNode; config?: StorageManagerConfig }) {
  const managerRef = useRef<StorageManager | null>(null);
  const prefetcherRef = useRef<Prefetcher | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [usage, setUsage] = useState<StorageUsage | null>(null);
  const [cellularEnabled, setCellularEnabledState] = useState<boolean>(() => {
    if (typeof localStorage === "undefined") return false;
    return localStorage.getItem(STORAGE_KEY_CELLULAR) === "true";
  });

  if (!managerRef.current) managerRef.current = new StorageManager(config);
  if (!prefetcherRef.current) {
    prefetcherRef.current = new Prefetcher(managerRef.current, { cellularEnabled });
  }
  const manager = managerRef.current;
  const prefetcher = prefetcherRef.current;

  useEffect(() => {
    let cancelled = false;
    manager.init().then(() => {
      if (!cancelled) {
        setIsReady(true);
        manager.getUsage().then((u) => !cancelled && setUsage(u));
      }
    });
    return () => {
      cancelled = true;
      prefetcher.dispose();
      manager.close();
    };
  }, [manager, prefetcher]);

  const refreshUsage = useCallback(async () => {
    const u = await manager.getUsage();
    setUsage(u);
  }, [manager]);

  const clearCache = useCallback(async () => {
    await manager.clearAll();
    await refreshUsage();
  }, [manager, refreshUsage]);

  const setBudget = useCallback(
    (bytes: number) => {
      manager.setBudget(bytes);
      refreshUsage();
    },
    [manager, refreshUsage],
  );

  const setCellularEnabled = useCallback(
    (enabled: boolean) => {
      setCellularEnabledState(enabled);
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(STORAGE_KEY_CELLULAR, String(enabled));
      }
      prefetcher.setCellularEnabled(enabled);
    },
    [prefetcher],
  );

  return (
    <StorageContext.Provider
      value={{
        manager,
        prefetcher,
        usage,
        refreshUsage,
        clearCache,
        setBudget,
        cellularEnabled,
        setCellularEnabled,
        isReady,
      }}
    >
      {children}
    </StorageContext.Provider>
  );
}

const StorageContext = createContext<StorageContextValue | null>(null);

export function useStorage(): StorageContextValue {
  const ctx = useContext(StorageContext);
  if (!ctx) throw new Error('useStorage must be used within a StorageProvider');
  return ctx;
}

export { StorageContext };
```

- [ ] **Step 3: Hook the feed-load call site**

In `src/pages/Home.tsx` (or wherever the feed list is fetched and put on screen), add a `useEffect` that calls `prefetcher.scheduleFromFeed(items)` whenever the feed array changes. Read both `prefetcher` and the resolved feed items:

```typescript
import { useStorage } from "../contexts/storage-context";
// ...
const { prefetcher } = useStorage();
// after the feed items are loaded into a state variable, e.g. `feedItems`:
useEffect(() => {
  if (!feedItems || feedItems.length === 0) return;
  prefetcher.scheduleFromFeed(feedItems);
  prefetcher.manager?.pruneNotInFeed?.(feedItems.map((i) => i.briefing?.id).filter(Boolean) as string[]);
}, [feedItems, prefetcher]);
```

(`prefetcher.manager` isn't exposed directly — call `manager.pruneNotInFeed` from the context: destructure `manager` alongside `prefetcher`.)

Corrected:

```typescript
const { prefetcher, manager } = useStorage();
useEffect(() => {
  if (!feedItems || feedItems.length === 0) return;
  prefetcher.scheduleFromFeed(feedItems);
  manager.pruneNotInFeed(feedItems.map((i) => i.briefing?.id).filter(Boolean) as string[]).catch(() => {});
}, [feedItems, prefetcher, manager]);
```

- [ ] **Step 4: Verify typecheck and existing tests still pass**

Run: `npm run typecheck`
Expected: PASS.

Run: `npx vitest run src/__tests__/`
Expected: PASS — adjust existing test mocks where `useStorage` is mocked to also return `prefetcher`, `cellularEnabled`, `setCellularEnabled`. Common shape:

```typescript
useStorage: () => ({
  manager: { /* ... */ },
  prefetcher: { scheduleFromFeed: vi.fn(), scheduleNextInQueue: vi.fn(), cancelInflight: vi.fn() },
  usage: null,
  isReady: true,
  refreshUsage: vi.fn(),
  clearCache: vi.fn(),
  setBudget: vi.fn(),
  cellularEnabled: false,
  setCellularEnabled: vi.fn(),
}),
```

- [ ] **Step 5: Commit**

```bash
git add src/contexts/storage-context.tsx src/pages/Home.tsx
git commit -m "feat(client): wire prefetcher into storage-context and feed load"
```

---

## Task 12: Hook prefetcher into audio-context's `canplay` event

**Files:**
- Modify: `src/contexts/audio-context.tsx`

When the currently-playing track fires `canplay`, schedule prefetch of the next 1–2 items in the in-app play queue.

- [ ] **Step 1: Locate the canplay handler**

Open `src/contexts/audio-context.tsx`. Search for `audio.addEventListener("canplay"` or the equivalent React handler `onCanPlay`. Most audio elements in this codebase are imperative (`audioRef.current`).

- [ ] **Step 2: Add the prefetch hook**

In the `AudioProvider`:

```typescript
const { manager: storageManager, prefetcher } = useStorage();
```

Inside the existing canplay handler (or add one if absent):

```typescript
const handleCanPlay = () => {
  // existing logic if any...
  // Top up the prefetch cache for the next two queued items.
  if (queueRef.current && queueRef.current.length > 0) {
    prefetcher.scheduleNextInQueue(queueRef.current, 2);
  }
};
audio.addEventListener("canplay", handleCanPlay);
// remember to remove on cleanup
```

Make sure the `removeEventListener` is mirrored in the cleanup branch where other listeners are torn down.

- [ ] **Step 3: Verify typecheck and run audio-context tests**

Run: `npm run typecheck`
Expected: PASS.

Run: `npx vitest run src/__tests__/feed-item.test.tsx src/__tests__/home-feed.test.tsx`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/contexts/audio-context.tsx
git commit -m "feat(audio): top up prefetch cache when current track fires canplay"
```

---

## Task 13: Settings UI — cellular toggle + signout-clears-cache

**Files:**
- Modify: `src/components/storage-settings.tsx`
- Modify: `src/contexts/storage-context.tsx` (already exposes `cellularEnabled` after Task 11)
- Modify: `src/contexts/audio-context.tsx` or wherever signout is handled — search for Clerk signout

- [ ] **Step 1: Find the signout site**

Run: `grep -rn "signOut\|signOut(" src/ --include="*.tsx" --include="*.ts" | head -10`

Identify the location. Typical pattern: a Clerk hook `useAuth().signOut` invoked from Settings or a profile menu.

- [ ] **Step 2: Add the cellular toggle to StorageSettings**

In `src/components/storage-settings.tsx`, inside the `<section>` with `Storage & Downloads`, add a new sub-section after the budget selector:

```tsx
import { useStorage } from "../contexts/storage-context";
// inside the component, alongside the existing useStorage destructure:
const { cellularEnabled, setCellularEnabled } = useStorage();
```

```tsx
<div className="border-t border-border pt-4 space-y-2">
  <h3 className="text-sm font-medium">Prefetch on cellular</h3>
  <p className="text-xs text-muted-foreground">
    Download upcoming blipps for instant playback even without Wi-Fi.
    May use your data plan.
  </p>
  <label className="flex items-center gap-2 text-sm cursor-pointer">
    <input
      type="checkbox"
      checked={cellularEnabled}
      onChange={(e) => setCellularEnabled(e.target.checked)}
      className="h-4 w-4 rounded border-border"
    />
    Allow prefetch on cellular
  </label>
</div>
```

- [ ] **Step 3: Hook signout to clear the cache**

In the file containing the signout flow (commonly `src/components/account-menu.tsx` or similar — see step 1):

```typescript
import { useStorage } from "../contexts/storage-context";
// ...
const { clearCache } = useStorage();
const handleSignOut = async () => {
  try {
    await clearCache();
  } catch {}
  await signOut();
};
```

- [ ] **Step 4: Verify typecheck and existing tests pass**

Run: `npm run typecheck`
Expected: PASS.

Run: `npx vitest run src/__tests__/settings-page.test.tsx`
Expected: PASS — likely needs the test mock for `useStorage` updated to return `cellularEnabled` and `setCellularEnabled`.

- [ ] **Step 5: Commit**

```bash
git add src/components/storage-settings.tsx src/components/account-menu.tsx
git commit -m "feat(client): cellular prefetch toggle + clear cache on signout"
```

(If the signout hook lives in a different file, adjust the `git add` accordingly.)

---

## Task 14: Manual smoke test pass

**Files:** none (this is verification only)

This task does not modify code. It verifies the end-to-end behavior on staging and on a real iPhone.

- [ ] **Step 1: Deploy current branch to staging**

If using the project's deploy flow:
```bash
git push origin HEAD:main  # or whatever the staging branch is
```

Wait for CI to deploy. Verify the deployed version contains the new `/api/briefings/:id/audio-url` route by hitting it (with an authenticated browser session) at staging.podblipp.com.

- [ ] **Step 2: Run the smoke test plan in the spec**

Open `docs/superpowers/specs/2026-04-24-offline-prefetch-design.md` and run through the "Manual smoke test plan" section:

1. Fresh-install staging app, log in. DevTools → Application → IndexedDB / Cache: prefetched items appear after feed load.
2. Tap a prefetched item: playback starts in <200 ms. No `/api/briefings/:id/audio-url` request, only local blob URL in Network panel.
3. Tap an item not yet prefetched (scroll bottom): one `/audio-url` call, then signed URL streams. Audio starts on first byte.
4. Airplane mode: previously-prefetched items still play instantly. Uncached items show "Failed to load audio."
5. Listen to one blipp; next 1–2 in queue prefetch (Network panel) before the current finishes.
6. Cellular simulation (Network panel → Slow 3G + cellular flag, or actual device on cellular): with toggle off, no prefetch traffic. With toggle on, only 2 items prefetch.
7. Real iPhone Capacitor build: Filesystem writes survive force-quit + relaunch (verify via re-launching offline and confirming cached items still play).
8. Sign out, sign in as different user: previous user's cached blipps gone.
9. Set storage budget to 250 MB, exceed it: eviction order is listened > 24h first, then unlistened oldest-cached.

Check off each item in the design doc as it passes.

- [ ] **Step 3: File any regressions or follow-ups**

If anything fails, open a GitHub issue describing what failed and either fix it in this branch or branch it off as a follow-up. Do not check off Task 14 until all 9 smoke checks pass.

- [ ] **Step 4: Commit nothing; close out the task**

(No code change. The task is complete when all smoke checks have passed.)

---

## After plan completion

1. **Client-wide kill-switch flag** (deferred from this plan; needed before production cutover). The spec specifies a `blipp.prefetch.enabled` localStorage flag that gates the entire client-side change, with environment-driven defaults (true in staging, false in production initially) read from `import.meta.env.MODE`. The implementation checks the flag in two places: (a) `audio-context.tsx` — when off, fall back to today's `fetch → blob → URL.createObjectURL` path; (b) `storage-context.tsx` — when off, do not instantiate the `Prefetcher`. Implement when ready to ship to production. The plan as written ships prefetch always-on, with the server `ENABLE_AUDIO_TOKEN` env var as the sole rollback lever.
2. **SW cleanup pass** (~2 weeks after stable). The audio-context after Task 7 no longer hits `/api/briefings/:id/audio` — that URL is reached only via signed token from Task 4. The `CacheFirst` rule on `/api/briefings/:id/audio` in `src/sw.ts:28-34` becomes dead code (signed URLs have unique query params per request, defeating the cache key) and should be removed. The server route stays for admin tools.
3. **R2 CORS** verification on the bucket before broad rollout — confirm `AllowedOrigins` includes `https://podblipp.com`, `https://staging.podblipp.com`, and `capacitor://localhost`. The HMAC token approach keeps requests on the same origin (no CORS issue for web/PWA), but the Capacitor native app uses the `capacitor://` scheme and may need explicit CORS allowance on the worker for the audio response. Smoke test #2 in Task 14 catches this if it's a problem.

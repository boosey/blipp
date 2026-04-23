import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { voicePresetsRoutes } from "../voice-presets";
import { createMockPrisma } from "../../../../tests/helpers/mocks";
import { ValidationError } from "../../../lib/validation";

const mockUserId = { userId: "user_test123" };
let currentAuth: { userId: string } | null = mockUserId;

vi.mock("@hono/clerk-auth", () => ({
  clerkMiddleware: vi.fn(() => vi.fn((c: any, next: any) => next())),
  getAuth: vi.fn(() => currentAuth),
}));

vi.mock("../../../middleware/auth", () => ({
  clerkMiddleware: vi.fn(() => vi.fn((c: any, next: any) => next())),
  getAuth: vi.fn(() => currentAuth),
}));

vi.mock("../../../lib/audit-log", () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}));

let mockPrisma: ReturnType<typeof createMockPrisma>;

function buildApp() {
  const app = new Hono();
  // Inject prisma + error handler for validation errors
  app.use("/*", async (c, next) => {
    c.set("prisma", mockPrisma as any);
    await next();
  });
  app.route("/", voicePresetsRoutes);
  app.onError((err, c) => {
    if (err instanceof ValidationError) {
      return c.json({ error: err.message, details: err.details }, 400);
    }
    return c.json({ error: err.message }, 500);
  });
  return app;
}

const SYSTEM_PRESET = {
  id: "preset-system",
  name: "Default Coral",
  description: "The default warm voice",
  isSystem: true,
  isActive: true,
  config: { openai: { voice: "coral" }, groq: { voice: "aura-orpheus-en" } },
  createdAt: new Date(),
  updatedAt: new Date(),
  _count: { clips: 5, subscriptions: 2, users: 1 },
};

const CUSTOM_PRESET = {
  id: "preset-custom",
  name: "News Anchor",
  description: "Professional news style",
  isSystem: false,
  isActive: true,
  config: { openai: { voice: "onyx", speed: 1.1 }, groq: { voice: "aura-orpheus-en" } },
  createdAt: new Date(),
  updatedAt: new Date(),
  _count: { clips: 0, subscriptions: 0, users: 0 },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma = createMockPrisma();
  currentAuth = mockUserId;
});

describe("GET /", () => {
  it("returns list of presets", async () => {
    mockPrisma.voicePreset.findMany.mockResolvedValue([SYSTEM_PRESET, CUSTOM_PRESET]);
    mockPrisma.voicePreset.count.mockResolvedValue(2);

    const app = buildApp();
    const res = await app.request("/");
    expect(res.status).toBe(200);

    const body = (await res.json()) as any;
    expect(body.data).toHaveLength(2);
    expect(body.data[0].name).toBe("Default Coral");
    expect(body.data[0].isSystem).toBe(true);
    expect(body.data[0].clipCount).toBe(5);
    expect(body.data[1].name).toBe("News Anchor");
  });
});

describe("POST /", () => {
  it("creates preset with name and config", async () => {
    mockPrisma.voicePreset.create.mockResolvedValue({ ...CUSTOM_PRESET, id: "preset-new" });

    const app = buildApp();
    const res = await app.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "News Anchor",
        description: "Professional news style",
        config: { openai: { voice: "onyx", speed: 1.1 } },
      }),
    });
    expect(res.status).toBe(201);

    const body = (await res.json()) as any;
    expect(body.data.name).toBe("News Anchor");
  });

  it("returns 400 if name is missing", async () => {
    const app = buildApp();
    const res = await app.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ config: { openai: { voice: "nova" } } }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 if config is missing", async () => {
    const app = buildApp();
    const res = await app.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Test" }),
    });
    expect(res.status).toBe(400);
  });
});

describe("PATCH /:id", () => {
  it("updates preset fields", async () => {
    mockPrisma.voicePreset.findUnique.mockResolvedValue(CUSTOM_PRESET);
    mockPrisma.voicePreset.update.mockResolvedValue({ ...CUSTOM_PRESET, name: "Updated Name" });

    const app = buildApp();
    const res = await app.request("/preset-custom", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Updated Name" }),
    });
    expect(res.status).toBe(200);

    const body = (await res.json()) as any;
    expect(body.data.name).toBe("Updated Name");
  });
});

describe("DELETE /:id", () => {
  it("deletes a non-system preset", async () => {
    mockPrisma.voicePreset.findUnique.mockResolvedValue(CUSTOM_PRESET);
    mockPrisma.voicePreset.delete.mockResolvedValue(CUSTOM_PRESET);

    const app = buildApp();
    const res = await app.request("/preset-custom", { method: "DELETE" });
    expect(res.status).toBe(200);

    const body = (await res.json()) as any;
    expect(body.data.deleted).toBe(true);
  });

  it("returns 403 for system preset", async () => {
    mockPrisma.voicePreset.findUnique.mockResolvedValue(SYSTEM_PRESET);

    const app = buildApp();
    const res = await app.request("/preset-system", { method: "DELETE" });
    expect(res.status).toBe(403);

    const body = (await res.json()) as any;
    expect(body.error).toContain("ystem");
  });

  it("returns 404 if preset not found", async () => {
    mockPrisma.voicePreset.findUnique.mockResolvedValue(null);

    const app = buildApp();
    const res = await app.request("/nonexistent", { method: "DELETE" });
    expect(res.status).toBe(404);
  });
});

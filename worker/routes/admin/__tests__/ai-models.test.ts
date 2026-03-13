import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { aiModelsRoutes } from "../ai-models";
import { createMockPrisma } from "../../../../tests/helpers/mocks";

function buildApp(mockPrisma: ReturnType<typeof createMockPrisma>) {
  const app = new Hono();
  app.use("/*", async (c, next) => { c.set("prisma", mockPrisma); await next(); });
  app.route("/", aiModelsRoutes);
  return app;
}

describe("GET /", () => {
  it("returns all models with providers", async () => {
    const mockPrisma = createMockPrisma();
    mockPrisma.aiModel.findMany.mockResolvedValue([
      {
        id: "m1", stage: "stt", modelId: "whisper-1", label: "Whisper v1",
        developer: "openai", isActive: true, createdAt: new Date(),
        providers: [
          { id: "p1", aiModelId: "m1", provider: "openai", providerLabel: "OpenAI",
            pricePerMinute: 0.006, priceInputPerMToken: null, priceOutputPerMToken: null,
            pricePerKChars: null, isDefault: true, isAvailable: true, priceUpdatedAt: null,
            createdAt: new Date(), updatedAt: new Date() },
        ],
      },
    ]);
    const app = buildApp(mockPrisma);
    const res = await app.request("/");
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.data).toHaveLength(1);
    expect(body.data[0].modelId).toBe("whisper-1");
    expect(body.data[0].providers).toHaveLength(1);
  });

  it("filters by stage query param", async () => {
    const mockPrisma = createMockPrisma();
    mockPrisma.aiModel.findMany.mockResolvedValue([]);
    const app = buildApp(mockPrisma);
    const res = await app.request("/?stage=stt");
    expect(res.status).toBe(200);
    expect(mockPrisma.aiModel.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ stage: "stt" }) })
    );
  });
});

describe("POST /", () => {
  it("creates a new model", async () => {
    const mockPrisma = createMockPrisma();
    const created = { id: "m2", stage: "stt", modelId: "nova-x", label: "Nova X",
      developer: "deepgram", isActive: true, createdAt: new Date(), providers: [] };
    mockPrisma.aiModel.create.mockResolvedValue(created);
    const app = buildApp(mockPrisma);
    const res = await app.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage: "stt", modelId: "nova-x", label: "Nova X", developer: "deepgram" }),
    });
    expect(res.status).toBe(201);
    const body = await res.json() as any;
    expect(body.data.modelId).toBe("nova-x");
  });

  it("returns 400 if required fields missing", async () => {
    const mockPrisma = createMockPrisma();
    const app = buildApp(mockPrisma);
    const res = await app.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage: "stt" }),
    });
    expect(res.status).toBe(400);
  });
});

describe("POST /:id/providers", () => {
  it("adds a provider to a model", async () => {
    const mockPrisma = createMockPrisma();
    const created = { id: "p2", aiModelId: "m1", provider: "groq", providerLabel: "Groq",
      pricePerMinute: 0.000667, priceInputPerMToken: null, priceOutputPerMToken: null,
      pricePerKChars: null, isDefault: false, isAvailable: true,
      priceUpdatedAt: null, createdAt: new Date(), updatedAt: new Date() };
    mockPrisma.aiModelProvider.create.mockResolvedValue(created);
    const app = buildApp(mockPrisma);
    const res = await app.request("/m1/providers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "groq", providerLabel: "Groq", pricePerMinute: 0.000667 }),
    });
    expect(res.status).toBe(201);
    const body = await res.json() as any;
    expect(body.data.provider).toBe("groq");
  });
});

describe("PATCH /:id (toggle isActive)", () => {
  it("toggles model active state", async () => {
    const mockPrisma = createMockPrisma();
    mockPrisma.aiModel.update.mockResolvedValue({ id: "m1", isActive: false, providers: [] } as any);
    const app = buildApp(mockPrisma);
    const res = await app.request("/m1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: false }),
    });
    expect(res.status).toBe(200);
  });
});

describe("PATCH /:id/providers/:providerId", () => {
  it("updates provider pricing", async () => {
    const mockPrisma = createMockPrisma();
    mockPrisma.aiModelProvider.update.mockResolvedValue({ id: "p1", pricePerMinute: 0.007 } as any);
    const app = buildApp(mockPrisma);
    const res = await app.request("/m1/providers/p1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pricePerMinute: 0.007 }),
    });
    expect(res.status).toBe(200);
  });
});

describe("DELETE /:id/providers/:providerId", () => {
  it("removes a provider", async () => {
    const mockPrisma = createMockPrisma();
    mockPrisma.aiModelProvider.delete.mockResolvedValue({} as any);
    const app = buildApp(mockPrisma);
    const res = await app.request("/m1/providers/p1", { method: "DELETE" });
    expect(res.status).toBe(200);
  });
});

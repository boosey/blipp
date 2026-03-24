import { Hono } from "hono";
import type { Env } from "../../types";

export const aiModelsRoutes = new Hono<{ Bindings: Env }>();

// GET / — list models with providers, optional ?stage= and ?includeInactive=true filters
aiModelsRoutes.get("/", async (c) => {
  const prisma = c.get("prisma") as any;
  const stage = c.req.query("stage");
  const includeInactive = c.req.query("includeInactive") === "true";
  const data = await prisma.aiModel.findMany({
    where: {
      ...(stage ? { stage } : {}),
      ...(!includeInactive && { isActive: true }),
    },
    include: { providers: { orderBy: { isDefault: "desc" } } },
    orderBy: [{ stage: "asc" }, { label: "asc" }],
  });
  return c.json({ data });
});

// POST / — create a new model
aiModelsRoutes.post("/", async (c) => {
  const prisma = c.get("prisma") as any;
  const body = await c.req.json();
  const { stage, modelId, label, developer, notes } = body;
  if (!stage || !modelId || !label || !developer) {
    return c.json({ error: "stage, modelId, label, and developer are required" }, 400);
  }
  const data = await prisma.aiModel.create({
    data: { stage, modelId, label, developer, notes: notes ?? null },
    include: { providers: true },
  });
  return c.json({ data }, 201);
});

// POST /:id/providers — add a provider to a model
aiModelsRoutes.post("/:id/providers", async (c) => {
  const prisma = c.get("prisma") as any;
  const aiModelId = c.req.param("id");
  const body = await c.req.json();
  const { provider, providerLabel, pricePerMinute, priceInputPerMToken,
          priceOutputPerMToken, pricePerKChars, isDefault, limits } = body;
  if (!provider || !providerLabel) {
    return c.json({ error: "provider and providerLabel are required" }, 400);
  }
  const data = await prisma.aiModelProvider.create({
    data: {
      aiModelId, provider, providerLabel,
      pricePerMinute: pricePerMinute ?? null,
      priceInputPerMToken: priceInputPerMToken ?? null,
      priceOutputPerMToken: priceOutputPerMToken ?? null,
      pricePerKChars: pricePerKChars ?? null,
      isDefault: isDefault ?? false,
      ...(limits !== undefined && { limits }),
    },
  });
  return c.json({ data }, 201);
});

// PATCH /:id — toggle isActive on a model
aiModelsRoutes.patch("/:id", async (c) => {
  const prisma = c.get("prisma") as any;
  const id = c.req.param("id");
  const body = await c.req.json();
  const data = await prisma.aiModel.update({
    where: { id },
    data: {
      ...("isActive" in body && { isActive: body.isActive }),
      ...("notes" in body && { notes: body.notes }),
    },
    include: { providers: true },
  });
  return c.json({ data });
});

// PATCH /:id/providers/:providerId — update pricing or availability
aiModelsRoutes.patch("/:id/providers/:providerId", async (c) => {
  const prisma = c.get("prisma") as any;
  const id = c.req.param("providerId");
  const body = await c.req.json();
  const data = await prisma.aiModelProvider.update({
    where: { id },
    data: {
      ...("providerLabel" in body && { providerLabel: body.providerLabel }),
      ...("pricePerMinute" in body && { pricePerMinute: body.pricePerMinute }),
      ...("priceInputPerMToken" in body && { priceInputPerMToken: body.priceInputPerMToken }),
      ...("priceOutputPerMToken" in body && { priceOutputPerMToken: body.priceOutputPerMToken }),
      ...("pricePerKChars" in body && { pricePerKChars: body.pricePerKChars }),
      ...("isDefault" in body && { isDefault: body.isDefault }),
      ...("isAvailable" in body && { isAvailable: body.isAvailable }),
      ...("limits" in body && { limits: body.limits }),
    },
  });
  return c.json({ data });
});

// DELETE /:id — delete a model and all its providers (cascade)
aiModelsRoutes.delete("/:id", async (c) => {
  const prisma = c.get("prisma") as any;
  const id = c.req.param("id");
  await prisma.aiModel.delete({ where: { id } });
  return c.json({ success: true });
});

// DELETE /:id/providers/:providerId — remove a provider
aiModelsRoutes.delete("/:id/providers/:providerId", async (c) => {
  const prisma = c.get("prisma") as any;
  const modelId = c.req.param("id");
  const id = c.req.param("providerId");
  await prisma.aiModelProvider.delete({ where: { id } });
  const remainingProviders = await prisma.aiModelProvider.count({ where: { aiModelId: modelId } });
  return c.json({ success: true, remainingProviders });
});

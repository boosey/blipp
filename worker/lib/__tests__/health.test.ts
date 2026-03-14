import { describe, it, expect, vi } from "vitest";
import { createMockEnv } from "../../../tests/helpers/mocks";

vi.mock("@prisma/adapter-pg", () => ({ PrismaPg: vi.fn() }));
vi.mock("../../../src/generated/prisma", () => ({ PrismaClient: vi.fn() }));

const mockQueryRaw = vi.fn();
const mockDisconnect = vi.fn();
vi.mock("../db", () => ({
  createPrismaClient: vi.fn(() => ({
    $queryRawUnsafe: mockQueryRaw,
    $disconnect: mockDisconnect,
  })),
}));

const { deepHealthCheck } = await import("../health");

describe("deepHealthCheck", () => {
  it("returns healthy when all components pass", async () => {
    mockQueryRaw.mockResolvedValueOnce([{ "?column?": 1 }]);
    mockDisconnect.mockResolvedValueOnce(undefined);

    const env = createMockEnv();
    (env.R2 as any).head = vi.fn().mockResolvedValue(null);

    const result = await deepHealthCheck(env);
    expect(result.status).toBe("healthy");
    expect(result.components).toHaveLength(3);
  });

  it("returns unhealthy when database is down", async () => {
    mockQueryRaw.mockRejectedValueOnce(new Error("Connection refused"));
    mockDisconnect.mockResolvedValueOnce(undefined);

    const env = createMockEnv();
    (env.R2 as any).head = vi.fn().mockResolvedValue(null);

    const result = await deepHealthCheck(env);
    expect(result.status).toBe("unhealthy");
    const dbComponent = result.components.find((c) => c.name === "database");
    expect(dbComponent?.status).toBe("unhealthy");
  });

  it("checks queue binding existence", async () => {
    mockQueryRaw.mockResolvedValueOnce([{ "?column?": 1 }]);
    mockDisconnect.mockResolvedValueOnce(undefined);

    const env = createMockEnv();
    (env.R2 as any).head = vi.fn().mockResolvedValue(null);

    const result = await deepHealthCheck(env);
    const queueComponent = result.components.find((c) => c.name === "queues");
    expect(queueComponent?.status).toBe("healthy");
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { runJob, CronLogger } from "../runner";

describe("runner", () => {
  const mockPrisma = {
    cronJob: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    cronRun: {
      create: vi.fn(),
      update: vi.fn(),
      findFirst: vi.fn(),
    },
    cronRunLog: {
      create: vi.fn(),
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should skip if job is disabled", async () => {
    mockPrisma.cronJob.findUnique.mockResolvedValue({ enabled: false });
    const execute = vi.fn();

    await runJob({ jobKey: "test", prisma: mockPrisma as any, execute });

    expect(execute).not.toHaveBeenCalled();
  });

  it("should skip if interval has not elapsed", async () => {
    const lastRunAt = new Date(Date.now() - 5 * 60_000); // 5 mins ago
    mockPrisma.cronJob.findUnique.mockResolvedValue({
      enabled: true,
      intervalMinutes: 10,
      lastRunAt,
    });
    const execute = vi.fn();

    await runJob({ jobKey: "test", prisma: mockPrisma as any, execute });

    expect(execute).not.toHaveBeenCalled();
  });

  it("should run if interval has elapsed", async () => {
    const lastRunAt = new Date(Date.now() - 15 * 60_000); // 15 mins ago
    mockPrisma.cronJob.findUnique.mockResolvedValue({
      enabled: true,
      intervalMinutes: 10,
      lastRunAt,
    });
    mockPrisma.cronRun.findFirst.mockResolvedValue(null);
    mockPrisma.cronRun.create.mockResolvedValue({ id: "run-1" });
    const execute = vi.fn().mockResolvedValue({ success: true });

    await runJob({ jobKey: "test", prisma: mockPrisma as any, execute });

    expect(execute).toHaveBeenCalled();
    expect(mockPrisma.cronRun.create).toHaveBeenCalledWith({
      data: { jobKey: "test", status: "IN_PROGRESS" },
    });
    expect(mockPrisma.cronRun.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "run-1" },
      data: expect.objectContaining({ status: "SUCCESS" }),
    }));
  });

  it("should skip if a recent IN_PROGRESS run exists", async () => {
    mockPrisma.cronJob.findUnique.mockResolvedValue({
      enabled: true,
      intervalMinutes: 10,
      lastRunAt: new Date(Date.now() - 15 * 60_000),
    });
    mockPrisma.cronRun.findFirst.mockResolvedValue({
      id: "run-old",
      startedAt: new Date(Date.now() - 5 * 60_000), // 5 mins ago (less than 10 min interval)
    });
    const execute = vi.fn();

    await runJob({ jobKey: "test", prisma: mockPrisma as any, execute });

    expect(execute).not.toHaveBeenCalled();
    expect(mockPrisma.cronRun.update).not.toHaveBeenCalled();
  });

  it("should mark stale IN_PROGRESS run as FAILED and continue", async () => {
    mockPrisma.cronJob.findUnique.mockResolvedValue({
      enabled: true,
      intervalMinutes: 10,
      lastRunAt: new Date(Date.now() - 15 * 60_000),
    });
    mockPrisma.cronRun.findFirst.mockResolvedValue({
      id: "run-stuck",
      startedAt: new Date(Date.now() - 30 * 60_000), // 30 mins ago (more than 10 min interval)
    });
    mockPrisma.cronRun.create.mockResolvedValue({ id: "run-new" });
    const execute = vi.fn().mockResolvedValue({});

    await runJob({ jobKey: "test", prisma: mockPrisma as any, execute });

    expect(mockPrisma.cronRun.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "run-stuck" },
      data: expect.objectContaining({ status: "FAILED" }),
    }));
    expect(execute).toHaveBeenCalled();
  });

  it("should capture execution errors and mark run as FAILED", async () => {
    mockPrisma.cronJob.findUnique.mockResolvedValue({ enabled: true, intervalMinutes: 1 });
    mockPrisma.cronRun.findFirst.mockResolvedValue(null);
    mockPrisma.cronRun.create.mockResolvedValue({ id: "run-err" });
    const execute = vi.fn().mockRejectedValue(new Error("Boom"));

    await expect(runJob({ jobKey: "test", prisma: mockPrisma as any, execute }))
      .rejects.toThrow("Boom");

    expect(mockPrisma.cronRun.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "run-err" },
      data: expect.objectContaining({ status: "FAILED", errorMessage: "Boom" }),
    }));
  });

  it("should create run logs", async () => {
    mockPrisma.cronJob.findUnique.mockResolvedValue({ enabled: true, intervalMinutes: 0 });
    mockPrisma.cronRun.findFirst.mockResolvedValue(null);
    mockPrisma.cronRun.create.mockResolvedValue({ id: "run-log" });
    
    const execute = async (logger: CronLogger) => {
      await logger.info("Hello", { foo: "bar" });
      return { ok: true };
    };

    await runJob({ jobKey: "test", prisma: mockPrisma as any, execute });

    expect(mockPrisma.cronRunLog.create).toHaveBeenCalledWith({
      data: {
        runId: "run-log",
        level: "INFO",
        message: "Hello",
        data: { foo: "bar" },
      },
    });
  });
});

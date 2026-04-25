import { describe, it, expect, vi, beforeEach } from "vitest";
import { runListenOriginalAggregationJob } from "../listen-original-aggregation";

describe("listen-original-aggregation", () => {
  const mockPrisma = {
    listenOriginalEvent: {
      groupBy: vi.fn(),
      updateMany: vi.fn(),
      count: vi.fn(),
    },
    publisherReportBatch: {
      create: vi.fn(),
    },
  };

  const mockLogger = {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should create report batches for unbatched events", async () => {
    // 1. Total events check
    mockPrisma.listenOriginalEvent.count.mockResolvedValueOnce(10);
    
    // 2. Group by publisher
    mockPrisma.listenOriginalEvent.groupBy.mockResolvedValueOnce([
      { publisherId: "pub1", _count: { id: 10 } }
    ]);

    // 3. Counts for the batch (clicks, starts, completes, uniqueUsers)
    mockPrisma.listenOriginalEvent.count
      .mockResolvedValueOnce(2) // clicks
      .mockResolvedValueOnce(5) // starts
      .mockResolvedValueOnce(3); // completes
    
    mockPrisma.listenOriginalEvent.groupBy.mockResolvedValueOnce([
      { userId: "u1" }, { userId: "u2" }
    ]);

    mockPrisma.publisherReportBatch.create.mockResolvedValue({ id: "batch1" });
    mockPrisma.listenOriginalEvent.updateMany.mockResolvedValue({ count: 10 });

    const result = await runListenOriginalAggregationJob(mockPrisma as any, mockLogger as any);

    expect(result.batchesCreated).toBe(1);
    expect(result.eventsProcessed).toBe(10);
    expect(mockPrisma.publisherReportBatch.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        publisherId: "pub1",
        totalClicks: 2,
        totalStarts: 5,
        totalCompletes: 3,
        uniqueUsers: 2,
      }),
    }));
  });

  it("should skip if no unbatched events found", async () => {
    mockPrisma.listenOriginalEvent.count.mockResolvedValue(0);

    const result = await runListenOriginalAggregationJob(mockPrisma as any, mockLogger as any);

    expect(result.batchesCreated).toBe(0);
    expect(mockPrisma.listenOriginalEvent.groupBy).not.toHaveBeenCalled();
  });
});

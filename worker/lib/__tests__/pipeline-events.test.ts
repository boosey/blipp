import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCreate = vi.fn();
const mockPrisma = {
  pipelineEvent: { create: mockCreate },
};

const { writeEvent } = await import("../pipeline-events");

describe("writeEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreate.mockResolvedValue({ id: "evt_1" });
  });

  it("inserts an event with correct fields", async () => {
    await writeEvent(mockPrisma, "step_1", "INFO", "Cache miss");
    expect(mockCreate).toHaveBeenCalledWith({
      data: { stepId: "step_1", level: "INFO", message: "Cache miss", data: undefined },
    });
  });

  it("passes optional data field", async () => {
    await writeEvent(mockPrisma, "step_1", "DEBUG", "Fetched transcript", { bytes: 4532 });
    expect(mockCreate).toHaveBeenCalledWith({
      data: { stepId: "step_1", level: "DEBUG", message: "Fetched transcript", data: { bytes: 4532 } },
    });
  });

  it("swallows errors and logs to console", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockCreate.mockRejectedValue(new Error("DB down"));
    await writeEvent(mockPrisma, "step_1", "INFO", "Should not throw");
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it("does not throw on failure", async () => {
    mockCreate.mockRejectedValue(new Error("DB down"));
    await expect(writeEvent(mockPrisma, "step_1", "INFO", "Test")).resolves.toBeUndefined();
  });
});

import { describe, it, expect, vi } from "vitest";
import { writeAuditLog } from "../audit-log";

describe("writeAuditLog", () => {
  it("creates audit log entry", async () => {
    const mockCreate = vi.fn().mockResolvedValue({ id: "al_1" });
    const prisma = { auditLog: { create: mockCreate } };

    await writeAuditLog(prisma, {
      actorId: "user_1",
      action: "plan.create",
      entityType: "Plan",
      entityId: "plan_1",
      after: { name: "Pro" },
    });

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockCreate).toHaveBeenCalledWith({
      data: {
        actorId: "user_1",
        action: "plan.create",
        entityType: "Plan",
        entityId: "plan_1",
        after: { name: "Pro" },
      },
    });
  });

  it("does not throw when create fails", async () => {
    const mockCreate = vi.fn().mockRejectedValue(new Error("DB down"));
    const prisma = { auditLog: { create: mockCreate } };
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await writeAuditLog(prisma, {
      actorId: "user_1",
      action: "plan.create",
      entityType: "Plan",
      entityId: "plan_1",
    });

    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});

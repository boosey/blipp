import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@sentry/cloudflare", () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

import * as Sentry from "@sentry/cloudflare";
import { captureException, captureMessage } from "../sentry";

describe("sentry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("captureException", () => {
    it("forwards error to Sentry.captureException with extra context", () => {
      const err = new Error("test error");
      const ctx = { method: "GET", path: "/api/test" };

      captureException(err, ctx);

      expect(Sentry.captureException).toHaveBeenCalledWith(err, { extra: ctx });
    });

    it("works without context", () => {
      const err = new Error("no context");

      captureException(err);

      expect(Sentry.captureException).toHaveBeenCalledWith(err, { extra: undefined });
    });
  });

  describe("captureMessage", () => {
    it("forwards message to Sentry.captureMessage with level and extra context", () => {
      const ctx = { userId: "u123" };

      captureMessage("something happened", "warning", ctx);

      expect(Sentry.captureMessage).toHaveBeenCalledWith("something happened", {
        level: "warning",
        extra: ctx,
      });
    });

    it("defaults level to info", () => {
      captureMessage("info message");

      expect(Sentry.captureMessage).toHaveBeenCalledWith("info message", {
        level: "info",
        extra: undefined,
      });
    });

    it("passes error level correctly", () => {
      captureMessage("error message", "error", { detail: "x" });

      expect(Sentry.captureMessage).toHaveBeenCalledWith("error message", {
        level: "error",
        extra: { detail: "x" },
      });
    });
  });
});

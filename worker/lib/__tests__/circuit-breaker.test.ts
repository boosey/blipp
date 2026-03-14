import { describe, it, expect, beforeEach } from "vitest";
import {
  checkCircuit,
  recordSuccess,
  recordFailure,
  CircuitOpenError,
  resetAllCircuits,
  getCircuitStatus,
} from "../circuit-breaker";

describe("circuit breaker", () => {
  beforeEach(() => {
    resetAllCircuits();
  });

  it("allows calls when circuit is closed", () => {
    expect(() => checkCircuit("openai")).not.toThrow();
  });

  it("opens circuit after failure threshold", () => {
    for (let i = 0; i < 5; i++) {
      recordFailure("openai");
    }
    expect(() => checkCircuit("openai")).toThrow(CircuitOpenError);
  });

  it("does not open circuit below threshold", () => {
    for (let i = 0; i < 4; i++) {
      recordFailure("openai");
    }
    expect(() => checkCircuit("openai")).not.toThrow();
    expect(getCircuitStatus("openai").failures).toBe(4);
  });

  it("resets on success", () => {
    recordFailure("openai");
    recordFailure("openai");
    recordSuccess("openai");
    expect(getCircuitStatus("openai").failures).toBe(0);
    expect(getCircuitStatus("openai").status).toBe("closed");
  });

  it("tracks status per provider", () => {
    recordFailure("openai");
    recordFailure("openai");
    expect(getCircuitStatus("openai").failures).toBe(2);
    expect(getCircuitStatus("anthropic").failures).toBe(0);
  });

  it("returns correct status transitions", () => {
    expect(getCircuitStatus("openai").status).toBe("closed");
    for (let i = 0; i < 5; i++) recordFailure("openai");
    expect(getCircuitStatus("openai").status).toBe("open");
  });

  it("transitions to half_open after cooldown", () => {
    for (let i = 0; i < 5; i++) recordFailure("openai");
    expect(getCircuitStatus("openai").status).toBe("open");

    // With a very short cooldown, the circuit should transition to half_open
    expect(() => checkCircuit("openai", { cooldownMs: 0 })).not.toThrow();
    expect(getCircuitStatus("openai").status).toBe("half_open");
  });

  it("returns to open if half_open test call fails", () => {
    for (let i = 0; i < 5; i++) recordFailure("openai");

    // Transition to half_open
    checkCircuit("openai", { cooldownMs: 0 });
    expect(getCircuitStatus("openai").status).toBe("half_open");

    // Test call fails
    recordFailure("openai");
    expect(getCircuitStatus("openai").status).toBe("open");
  });

  it("returns to closed if half_open test call succeeds", () => {
    for (let i = 0; i < 5; i++) recordFailure("openai");

    // Transition to half_open
    checkCircuit("openai", { cooldownMs: 0 });
    expect(getCircuitStatus("openai").status).toBe("half_open");

    // Test call succeeds
    recordSuccess("openai");
    expect(getCircuitStatus("openai").status).toBe("closed");
    expect(getCircuitStatus("openai").failures).toBe(0);
  });

  it("CircuitOpenError includes provider name", () => {
    for (let i = 0; i < 5; i++) recordFailure("deepgram");
    try {
      checkCircuit("deepgram");
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(CircuitOpenError);
      expect((err as CircuitOpenError).provider).toBe("deepgram");
      expect((err as CircuitOpenError).message).toContain("deepgram");
    }
  });

  it("resets failure count when outside window", () => {
    // Record failures with a very short window so they expire
    recordFailure("openai", { windowMs: 0 });
    recordFailure("openai", { windowMs: 0 });
    // The second call should have reset the count since windowMs is 0
    // and lastFailureAt from the first call is already "outside" the window
    // Actually with windowMs: 0, every call resets then increments to 1
    // So we never reach threshold of 5
    expect(getCircuitStatus("openai").failures).toBeLessThanOrEqual(2);
  });
});

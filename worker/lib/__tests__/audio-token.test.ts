import { describe, it, expect, vi } from "vitest";
import { signAudioToken, verifyAudioToken } from "../audio-token";

const env = { AUDIO_TOKEN_SECRET: "test-audio-secret-xyz" };

describe("audio-token: round-trip", () => {
  it("signs and verifies a token", async () => {
    const { token, exp } = await signAudioToken(env, {
      briefingId: "b1",
      userId: "u1",
      ttlSeconds: 300,
    });
    const result = await verifyAudioToken(env, {
      briefingId: "b1",
      userId: "u1",
      token,
      exp,
    });
    expect(result).toBe("ok");
  });

  it("rejects a tampered token", async () => {
    const { token, exp } = await signAudioToken(env, {
      briefingId: "b1",
      userId: "u1",
      ttlSeconds: 300,
    });
    const tampered = token.slice(0, -3) + "AAA";
    const result = await verifyAudioToken(env, {
      briefingId: "b1",
      userId: "u1",
      token: tampered,
      exp,
    });
    expect(result).toBe("invalid");
  });

  it("rejects a token signed with a different secret", async () => {
    const { token, exp } = await signAudioToken(env, {
      briefingId: "b1",
      userId: "u1",
      ttlSeconds: 300,
    });
    const result = await verifyAudioToken(
      { AUDIO_TOKEN_SECRET: "different-secret" },
      { briefingId: "b1", userId: "u1", token, exp }
    );
    expect(result).toBe("invalid");
  });

  it("rejects an expired exp", async () => {
    const past = Math.floor(Date.now() / 1000) - 10;
    const { token } = await signAudioToken(env, {
      briefingId: "b1",
      userId: "u1",
      ttlSeconds: -100,
    });
    const result = await verifyAudioToken(env, {
      briefingId: "b1",
      userId: "u1",
      token,
      exp: past,
    });
    expect(result).toBe("expired");
  });

  it("rejects a token bound to a different briefingId", async () => {
    const { token, exp } = await signAudioToken(env, {
      briefingId: "b1",
      userId: "u1",
      ttlSeconds: 300,
    });
    const result = await verifyAudioToken(env, {
      briefingId: "b2",
      userId: "u1",
      token,
      exp,
    });
    expect(result).toBe("invalid");
  });

  it("rejects a token bound to a different userId", async () => {
    const { token, exp } = await signAudioToken(env, {
      briefingId: "b1",
      userId: "u1",
      ttlSeconds: 300,
    });
    const result = await verifyAudioToken(env, {
      briefingId: "b1",
      userId: "u2",
      token,
      exp,
    });
    expect(result).toBe("invalid");
  });

  it("falls back to derived secret when AUDIO_TOKEN_SECRET unset", async () => {
    const fallbackEnv = { CLERK_WEBHOOK_SECRET: "whsec_test_123" };
    const { token, exp } = await signAudioToken(fallbackEnv, {
      briefingId: "b1",
      userId: "u1",
      ttlSeconds: 300,
    });
    const result = await verifyAudioToken(fallbackEnv, {
      briefingId: "b1",
      userId: "u1",
      token,
      exp,
    });
    expect(result).toBe("ok");
  });
});

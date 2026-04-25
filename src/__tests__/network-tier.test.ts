import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { getNetworkTier } from "../lib/network-tier";

const realNavigator = globalThis.navigator;

function setNavigator(patch: Partial<Navigator> & { connection?: any }) {
  Object.defineProperty(globalThis, "navigator", {
    value: { ...realNavigator, ...patch },
    configurable: true,
  });
}

describe("getNetworkTier", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    Object.defineProperty(globalThis, "navigator", { value: realNavigator, configurable: true });
    vi.useRealTimers();
  });

  it("returns 'offline' when navigator.onLine is false", () => {
    setNavigator({ onLine: false });
    expect(getNetworkTier()).toBe("offline");
  });

  it("returns 'wifi' when connection.type is 'wifi'", () => {
    setNavigator({ onLine: true, connection: { type: "wifi", effectiveType: "4g" } });
    expect(getNetworkTier()).toBe("wifi");
  });

  it("returns 'cellular' when connection.type is 'cellular'", () => {
    setNavigator({ onLine: true, connection: { type: "cellular", effectiveType: "4g" } });
    expect(getNetworkTier()).toBe("cellular");
  });

  it("treats effectiveType '4g' as wifi-tier when connection.type missing", () => {
    setNavigator({ onLine: true, connection: { effectiveType: "4g" } });
    expect(getNetworkTier()).toBe("wifi");
  });

  it("treats effectiveType '3g' as cellular-tier when connection.type missing", () => {
    setNavigator({ onLine: true, connection: { effectiveType: "3g" } });
    expect(getNetworkTier()).toBe("cellular");
  });

  it("falls back to 'cellular' (conservative) when Connection API is unavailable", () => {
    setNavigator({ onLine: true });
    expect(getNetworkTier()).toBe("cellular");
  });
});

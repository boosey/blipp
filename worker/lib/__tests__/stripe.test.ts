import { describe, it, expect, vi } from "vitest";
import { createStripeClient } from "../stripe";
import Stripe from "stripe";

describe("stripe", () => {
  it("should create a stripe client", () => {
    const client = createStripeClient("sk_test_123");
    expect(client).toBeDefined();
    expect(client).toBeInstanceOf(Stripe);
  });
});

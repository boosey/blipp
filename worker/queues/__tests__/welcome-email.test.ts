import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockPrisma, createMockEnv } from "../../../tests/helpers/mocks";

vi.mock("../../lib/db", () => ({
  createPrismaClient: vi.fn(),
}));

vi.mock("../../lib/config", () => ({
  getConfig: vi.fn(),
}));

vi.mock("../../lib/service-key-resolver", () => ({
  resolveApiKey: vi.fn(),
}));

import { createPrismaClient } from "../../lib/db";
import { getConfig } from "../../lib/config";
import { resolveApiKey } from "../../lib/service-key-resolver";
import { handleWelcomeEmail } from "../welcome-email";
import type { WelcomeEmailMessage } from "../../lib/queue-messages";

let mockPrisma: ReturnType<typeof createMockPrisma>;
let mockEnv: ReturnType<typeof createMockEnv>;
let mockCtx: ExecutionContext;
let fetchSpy: ReturnType<typeof vi.spyOn>;

function makeMsg(userId: string) {
  return {
    id: `msg-${userId}`,
    body: { userId } as WelcomeEmailMessage,
    timestamp: new Date(),
    attempts: 1,
    ack: vi.fn(),
    retry: vi.fn(),
  };
}

function makeBatch(messages: ReturnType<typeof makeMsg>[]) {
  return {
    queue: "welcome-email-staging",
    messages,
    ackAll: vi.fn(),
    retryAll: vi.fn(),
  } as unknown as MessageBatch<WelcomeEmailMessage>;
}

beforeEach(() => {
  vi.clearAllMocks();

  mockPrisma = createMockPrisma();
  mockEnv = createMockEnv();
  mockEnv.ZEPTOMAIL_FROM_ADDRESS = "welcome@podblipp.com";
  mockEnv.ZEPTOMAIL_FROM_NAME = "Blipp";
  mockEnv.ZEPTOMAIL_WELCOME_TEMPLATE_KEY = "tmpl_test";
  mockCtx = { waitUntil: vi.fn(), passThroughOnException: vi.fn() } as unknown as ExecutionContext;

  vi.mocked(createPrismaClient).mockReturnValue(mockPrisma as any);
  vi.mocked(getConfig).mockResolvedValue(true);
  vi.mocked(resolveApiKey).mockResolvedValue("test-token");

  fetchSpy = vi.spyOn(globalThis, "fetch");
});

describe("handleWelcomeEmail", () => {
  it("skips when welcomeEmail.enabled is false", async () => {
    vi.mocked(getConfig).mockResolvedValue(false);
    const msg = makeMsg("user1");

    await handleWelcomeEmail(makeBatch([msg]), mockEnv, mockCtx);

    expect(msg.ack).toHaveBeenCalledOnce();
    expect(msg.retry).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("skips users whose welcomeEmailSentAt is already set", async () => {
    const alreadySent = new Date("2026-01-01T00:00:00Z");
    mockPrisma.user.findUnique.mockResolvedValueOnce({
      id: "user1",
      email: "a@example.com",
      name: "Alex",
      welcomeEmailSentAt: alreadySent,
    });
    const msg = makeMsg("user1");

    await handleWelcomeEmail(makeBatch([msg]), mockEnv, mockCtx);

    expect(msg.ack).toHaveBeenCalledOnce();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  it("sends the email and stamps welcomeEmailSentAt on 2xx", async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce({
      id: "user1",
      email: "alex@example.com",
      name: "Alex Boudreaux",
      welcomeEmailSentAt: null,
    });
    fetchSpy.mockResolvedValueOnce(new Response("{}", { status: 201 }));
    const msg = makeMsg("user1");

    await handleWelcomeEmail(makeBatch([msg]), mockEnv, mockCtx);

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://api.zeptomail.com/v1.1/email/template");
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: "Zoho-enczapikey test-token",
    });
    const sent = JSON.parse((init as RequestInit).body as string);
    expect(sent.template_key).toBe("tmpl_test");
    expect(sent.to[0].email_address.address).toBe("alex@example.com");
    expect(sent.merge_info).toMatchObject({
      first_name: "Alex",
      full_name: "Alex Boudreaux",
      email: "alex@example.com",
      app_url: "http://localhost:8787/home",
    });

    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: "user1" },
      data: { welcomeEmailSentAt: expect.any(Date) },
    });
    expect(msg.ack).toHaveBeenCalledOnce();
    expect(msg.retry).not.toHaveBeenCalled();
  });

  it("retries on transient 500 and does not stamp the timestamp", async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce({
      id: "user1",
      email: "alex@example.com",
      name: "Alex",
      welcomeEmailSentAt: null,
    });
    fetchSpy.mockResolvedValueOnce(new Response("upstream error", { status: 500 }));
    const msg = makeMsg("user1");

    await handleWelcomeEmail(makeBatch([msg]), mockEnv, mockCtx);

    expect(msg.retry).toHaveBeenCalledOnce();
    expect(msg.ack).not.toHaveBeenCalled();
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  it("acks (does not retry) on permanent 422", async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce({
      id: "user1",
      email: "alex@example.com",
      name: "Alex",
      welcomeEmailSentAt: null,
    });
    fetchSpy.mockResolvedValueOnce(new Response('{"error":"invalid payload"}', { status: 422 }));
    const msg = makeMsg("user1");

    await handleWelcomeEmail(makeBatch([msg]), mockEnv, mockCtx);

    expect(msg.ack).toHaveBeenCalledOnce();
    expect(msg.retry).not.toHaveBeenCalled();
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });
});

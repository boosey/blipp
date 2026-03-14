import Anthropic from "@anthropic-ai/sdk";
import type { Env } from "../types";
import { AiProviderError } from "./ai-errors";

function parseIntHeader(value: string | null): number | undefined {
  if (!value) return undefined;
  const n = parseInt(value);
  return isNaN(n) ? undefined : n;
}

function parseResetHeader(value: string | null): Date | undefined {
  if (!value) return undefined;
  const n = Number(value);
  if (!isNaN(n)) return new Date(n > 1e12 ? n : n * 1000);
  const d = new Date(value);
  return isNaN(d.getTime()) ? undefined : d;
}

/** Provider-agnostic LLM completion result. */
export interface LlmResult {
  text: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

/** A message in the LLM conversation. */
export interface LlmMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * An LLM provider implementation — one per API vendor.
 * The providerModelId (from DB) tells the implementation which model to request.
 */
export interface LlmProvider {
  name: string;
  provider: string;
  complete(
    messages: LlmMessage[],
    providerModelId: string,
    maxTokens: number,
    env: Env
  ): Promise<LlmResult>;
}

// ---------------------------------------------------------------------------
// Anthropic — Claude models
// ---------------------------------------------------------------------------

const AnthropicProvider: LlmProvider = {
  name: "Anthropic",
  provider: "anthropic",

  async complete(messages, providerModelId, maxTokens, env) {
    const start = Date.now();
    try {
      const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
      const response = await client.messages.create({
        model: providerModelId,
        max_tokens: maxTokens,
        messages,
      });

      const text =
        response.content[0].type === "text" ? response.content[0].text : "";

      return {
        text,
        model: response.model,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      };
    } catch (err) {
      const durationMs = Date.now() - start;
      const status = (err as any)?.status ?? (err as any)?.statusCode;
      const rawBody = (err as any)?.message ?? String(err);

      throw new AiProviderError({
        message: `Anthropic API error${status ? ` ${status}` : ""}: ${rawBody.slice(0, 500)}`,
        provider: "anthropic",
        model: providerModelId,
        httpStatus: typeof status === "number" ? status : undefined,
        rawResponse: rawBody.slice(0, 2048),
        requestDurationMs: durationMs,
      });
    }
  },
};

// ---------------------------------------------------------------------------
// Groq — OpenAI-compatible chat completions API (Llama, Mixtral, etc.)
// ---------------------------------------------------------------------------

const GroqLlmProvider: LlmProvider = {
  name: "Groq",
  provider: "groq",

  async complete(messages, providerModelId, maxTokens, env) {
    const start = Date.now();
    const resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: providerModelId,
        max_tokens: maxTokens,
        messages,
      }),
    });

    if (!resp.ok) {
      const body = await resp.text();
      throw new AiProviderError({
        message: `Groq LLM API error ${resp.status}: ${body.slice(0, 500)}`,
        provider: "groq",
        model: providerModelId,
        httpStatus: resp.status,
        rawResponse: body.slice(0, 2048),
        requestDurationMs: Date.now() - start,
        rateLimitRemaining: parseIntHeader(resp.headers.get("x-ratelimit-remaining-tokens")),
        rateLimitResetAt: parseResetHeader(resp.headers.get("x-ratelimit-reset-tokens")),
      });
    }

    const data = (await resp.json()) as {
      choices: { message: { content: string } }[];
      model: string;
      usage: { prompt_tokens: number; completion_tokens: number };
    };

    return {
      text: data.choices[0]?.message?.content ?? "",
      model: data.model,
      inputTokens: data.usage.prompt_tokens,
      outputTokens: data.usage.completion_tokens,
    };
  },
};

// ---------------------------------------------------------------------------
// Cloudflare Workers AI — @cf/* models via AI binding
// ---------------------------------------------------------------------------

const CloudflareLlmProvider: LlmProvider = {
  name: "Cloudflare Workers AI",
  provider: "cloudflare",

  async complete(messages, providerModelId, maxTokens, env) {
    const start = Date.now();
    try {
      const result = (await env.AI.run(providerModelId as any, {
        messages,
        max_tokens: maxTokens,
      })) as any;

      return {
        text: result?.response ?? result?.result ?? "",
        model: providerModelId,
        inputTokens: result?.usage?.prompt_tokens ?? 0,
        outputTokens: result?.usage?.completion_tokens ?? 0,
      };
    } catch (err) {
      throw new AiProviderError({
        message: `Cloudflare AI error: ${err instanceof Error ? err.message : String(err)}`,
        provider: "cloudflare",
        model: providerModelId,
        requestDurationMs: Date.now() - start,
        rawResponse: err instanceof Error ? err.message : String(err),
      });
    }
  },
};

// ---------------------------------------------------------------------------
// Registry — keyed by provider name
// ---------------------------------------------------------------------------

const PROVIDERS: LlmProvider[] = [AnthropicProvider, GroqLlmProvider, CloudflareLlmProvider];

const providerMap = new Map<string, LlmProvider>(
  PROVIDERS.map((p) => [p.provider, p])
);

/** Look up an LLM provider implementation by provider name. */
export function getLlmProviderImpl(provider: string): LlmProvider {
  const impl = providerMap.get(provider);
  if (!impl) {
    throw new Error(`No LLM implementation for provider: ${provider}`);
  }
  return impl;
}

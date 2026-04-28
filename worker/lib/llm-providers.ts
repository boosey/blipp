import Anthropic from "@anthropic-ai/sdk";
import type { Env } from "../types";
import { AiProviderError } from "./ai-errors";

// Hard wall-clock cap on a single LLM call. Without this, a hung provider
// stalls the worker invocation past its lifetime, the await never returns,
// and the queue handler dies with no exception — leaving locks held and
// fallback chains unused. 5 minutes is well above healthy completion
// (distillation ~30s, narrative ~60s) and below STALE_LOCK_MS (10 min).
export const LLM_TIMEOUT_MS = 5 * 60 * 1000;

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
  /** Tokens written to cache on this request (Anthropic prompt caching). */
  cacheCreationTokens?: number;
  /** Tokens read from cache on this request (Anthropic prompt caching). */
  cacheReadTokens?: number;
}

/** A message in the LLM conversation. */
export interface LlmMessage {
  role: "user" | "assistant";
  content: string;
}

/** Options for LLM completion calls. */
export interface LlmCompletionOptions {
  /** System prompt — used as a separate system message when the provider supports it. */
  system?: string;
  /** Enable prompt caching on the system message (Anthropic only). */
  cacheSystemPrompt?: boolean;
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
    env: Env,
    options?: LlmCompletionOptions,
    apiKeyOverride?: string
  ): Promise<LlmResult>;
}

// ---------------------------------------------------------------------------
// Anthropic — Claude models
// ---------------------------------------------------------------------------

const AnthropicProvider: LlmProvider = {
  name: "Anthropic",
  provider: "anthropic",

  async complete(messages, providerModelId, maxTokens, env, options, apiKeyOverride) {
    const start = Date.now();
    try {
      const client = new Anthropic({ apiKey: apiKeyOverride ?? env.ANTHROPIC_API_KEY });

      // Build system parameter with optional prompt caching
      let system: Anthropic.MessageCreateParams["system"] | undefined;
      if (options?.system) {
        if (options.cacheSystemPrompt) {
          system = [
            {
              type: "text" as const,
              text: options.system,
              cache_control: { type: "ephemeral" as const },
            },
          ];
        } else {
          system = options.system;
        }
      }

      const response = await client.messages.create(
        {
          model: providerModelId,
          max_tokens: maxTokens,
          ...(system ? { system } : {}),
          messages,
        },
        { signal: AbortSignal.timeout(LLM_TIMEOUT_MS) }
      );

      const text =
        response.content[0].type === "text" ? response.content[0].text : "";

      const usage = response.usage as Anthropic.Usage & {
        cache_creation_input_tokens?: number;
        cache_read_input_tokens?: number;
      };

      return {
        text,
        model: response.model,
        inputTokens: usage.input_tokens,
        outputTokens: usage.output_tokens,
        cacheCreationTokens: usage.cache_creation_input_tokens,
        cacheReadTokens: usage.cache_read_input_tokens,
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

  async complete(messages, providerModelId, maxTokens, env, options, apiKeyOverride) {
    const start = Date.now();
    // Groq uses OpenAI-compatible format: system prompt goes as a system role message
    const groqMessages = options?.system
      ? [{ role: "system" as const, content: options.system }, ...messages]
      : messages;
    const resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKeyOverride ?? env.GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: providerModelId,
        max_tokens: maxTokens,
        messages: groqMessages,
      }),
      signal: AbortSignal.timeout(LLM_TIMEOUT_MS),
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

  async complete(messages, providerModelId, maxTokens, env, options, _apiKeyOverride) {
    const start = Date.now();
    // Cloudflare Workers AI: system prompt as a system role message
    const cfMessages = options?.system
      ? [{ role: "system" as const, content: options.system }, ...messages]
      : messages;
    try {
      // env.AI.run does not accept AbortSignal — race against a manual timeout
      // so a hung Workers AI binding can't wedge the worker invocation.
      let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
      const result = (await Promise.race([
        env.AI.run(providerModelId as any, {
          messages: cfMessages,
          max_tokens: maxTokens,
        }),
        new Promise((_, reject) => {
          timeoutHandle = setTimeout(
            () => reject(new Error(`Cloudflare AI call timed out after ${LLM_TIMEOUT_MS}ms`)),
            LLM_TIMEOUT_MS
          );
        }),
      ]).finally(() => {
        if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
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

import Anthropic from "@anthropic-ai/sdk";
import type { Env } from "../types";

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
  },
};

// ---------------------------------------------------------------------------
// Groq — OpenAI-compatible chat completions API (Llama, Mixtral, etc.)
// ---------------------------------------------------------------------------

const GroqLlmProvider: LlmProvider = {
  name: "Groq",
  provider: "groq",

  async complete(messages, providerModelId, maxTokens, env) {
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
      throw new Error(`Groq LLM API error ${resp.status}: ${body}`);
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

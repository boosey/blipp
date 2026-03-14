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
// Registry — keyed by provider name
// ---------------------------------------------------------------------------

const PROVIDERS: LlmProvider[] = [AnthropicProvider];

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

/**
 * Anthropic model pricing in USD micros per token.
 * $1.00 = 1_000_000 micros.
 *
 * Source: https://www.anthropic.com/pricing
 * Last updated: 2025-05
 */

interface ModelPricing {
  inputPerToken: number; // micros per token
  outputPerToken: number;
  cacheReadPerToken: number;
}

// Prices in $/million tokens → convert to micros/token
// $3/M input = 3_000_000 micros / 1_000_000 tokens = 3 micros/token
const pricing: Record<string, ModelPricing> = {
  // Claude 4 Opus
  "claude-opus-4-20250514": { inputPerToken: 15, outputPerToken: 75, cacheReadPerToken: 1.5 },
  "claude-opus-4-0": { inputPerToken: 15, outputPerToken: 75, cacheReadPerToken: 1.5 },

  // Claude 4 Sonnet
  "claude-sonnet-4-20250514": { inputPerToken: 3, outputPerToken: 15, cacheReadPerToken: 0.3 },
  "claude-sonnet-4-0": { inputPerToken: 3, outputPerToken: 15, cacheReadPerToken: 0.3 },

  // Claude 3.5 Sonnet
  "claude-3-5-sonnet-20241022": { inputPerToken: 3, outputPerToken: 15, cacheReadPerToken: 0.3 },
  "claude-3-5-sonnet-20240620": { inputPerToken: 3, outputPerToken: 15, cacheReadPerToken: 0.3 },

  // Claude 3.5 Haiku
  "claude-3-5-haiku-20241022": { inputPerToken: 0.8, outputPerToken: 4, cacheReadPerToken: 0.08 },

  // Claude 3 Opus
  "claude-3-opus-20240229": { inputPerToken: 15, outputPerToken: 75, cacheReadPerToken: 1.5 },

  // Claude 3 Haiku
  "claude-3-haiku-20240307": { inputPerToken: 0.25, outputPerToken: 1.25, cacheReadPerToken: 0.03 },
};

// Default pricing for unknown models — use Sonnet pricing as a safe middle ground
const DEFAULT_PRICING: ModelPricing = { inputPerToken: 3, outputPerToken: 15, cacheReadPerToken: 0.3 };

export function getAnthropicPricing(model: string): ModelPricing {
  return pricing[model] ?? DEFAULT_PRICING;
}

export function computeAnthropicCostMicros(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cachedInputTokens: number
): number {
  const p = getAnthropicPricing(model);
  return Math.round(
    inputTokens * p.inputPerToken +
    outputTokens * p.outputPerToken +
    cachedInputTokens * p.cacheReadPerToken
  );
}

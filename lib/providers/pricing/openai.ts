/**
 * OpenAI model pricing in USD micros per token.
 * $1.00 = 1_000_000 micros.
 *
 * Source: https://openai.com/pricing
 * Last updated: 2025-05
 */

interface ModelPricing {
  inputPerToken: number;
  outputPerToken: number;
  cacheReadPerToken: number;
}

// Prices in $/million tokens → micros/token
const pricing: Record<string, ModelPricing> = {
  // GPT-4o
  "gpt-4o": { inputPerToken: 2.5, outputPerToken: 10, cacheReadPerToken: 1.25 },
  "gpt-4o-2024-11-20": { inputPerToken: 2.5, outputPerToken: 10, cacheReadPerToken: 1.25 },
  "gpt-4o-2024-08-06": { inputPerToken: 2.5, outputPerToken: 10, cacheReadPerToken: 1.25 },

  // GPT-4o mini
  "gpt-4o-mini": { inputPerToken: 0.15, outputPerToken: 0.6, cacheReadPerToken: 0.075 },
  "gpt-4o-mini-2024-07-18": { inputPerToken: 0.15, outputPerToken: 0.6, cacheReadPerToken: 0.075 },

  // GPT-4.1
  "gpt-4.1": { inputPerToken: 2, outputPerToken: 8, cacheReadPerToken: 0.5 },
  "gpt-4.1-mini": { inputPerToken: 0.4, outputPerToken: 1.6, cacheReadPerToken: 0.1 },
  "gpt-4.1-nano": { inputPerToken: 0.1, outputPerToken: 0.4, cacheReadPerToken: 0.025 },

  // o1
  "o1": { inputPerToken: 15, outputPerToken: 60, cacheReadPerToken: 7.5 },
  "o1-2024-12-17": { inputPerToken: 15, outputPerToken: 60, cacheReadPerToken: 7.5 },

  // o1-mini
  "o1-mini": { inputPerToken: 1.1, outputPerToken: 4.4, cacheReadPerToken: 0.55 },

  // o3
  "o3": { inputPerToken: 2, outputPerToken: 8, cacheReadPerToken: 0.5 },

  // o3-mini
  "o3-mini": { inputPerToken: 1.1, outputPerToken: 4.4, cacheReadPerToken: 0.55 },

  // o4-mini
  "o4-mini": { inputPerToken: 1.1, outputPerToken: 4.4, cacheReadPerToken: 0.275 },

  // GPT-4 Turbo
  "gpt-4-turbo": { inputPerToken: 10, outputPerToken: 30, cacheReadPerToken: 10 },
  "gpt-4-turbo-2024-04-09": { inputPerToken: 10, outputPerToken: 30, cacheReadPerToken: 10 },

  // GPT-4
  "gpt-4": { inputPerToken: 30, outputPerToken: 60, cacheReadPerToken: 30 },
};

const DEFAULT_PRICING: ModelPricing = { inputPerToken: 2.5, outputPerToken: 10, cacheReadPerToken: 1.25 };

export function getOpenAIPricing(model: string): ModelPricing {
  return pricing[model] ?? DEFAULT_PRICING;
}

export function computeOpenAICostMicros(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cachedInputTokens: number
): number {
  const p = getOpenAIPricing(model);
  return Math.round(
    inputTokens * p.inputPerToken +
    outputTokens * p.outputPerToken +
    cachedInputTokens * p.cacheReadPerToken
  );
}

/** All current per-model rates as snapshot rows (micros per token). */
export function openaiRateRows(): {
  model: string;
  unit: string;
  ratePerToken: number;
}[] {
  return Object.entries(pricing).flatMap(([model, p]) => [
    { model, unit: "input_tokens", ratePerToken: p.inputPerToken },
    { model, unit: "output_tokens", ratePerToken: p.outputPerToken },
    { model, unit: "cached_input_tokens", ratePerToken: p.cacheReadPerToken },
  ]);
}

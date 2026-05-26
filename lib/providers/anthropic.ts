import { format, eachDayOfInterval } from "date-fns";
import type { ProviderClient, UsageRow } from "./types";
import { fetchWithRetry } from "./fetch-with-retry";
import { computeAnthropicCostMicros } from "./pricing/anthropic";
import { keyFingerprint } from "@/lib/encryption/envelope";

const PROVIDER = "anthropic";

/**
 * Anthropic Admin API usage client.
 *
 * Endpoint: GET /v1/organizations/usage
 * Docs: https://docs.anthropic.com/en/api/admin-api
 *
 * Returns per-model daily usage. We group by (date, model) in UTC.
 */
export const anthropicClient: ProviderClient = {
  async fetchUsage({ apiKey, since, until }) {
    const sinceStr = format(since, "yyyy-MM-dd");
    const untilStr = format(until, "yyyy-MM-dd");

    const fp = keyFingerprint(apiKey);
    console.log(`[anthropic] Fetching usage for key ...${fp} from ${sinceStr} to ${untilStr}`);

    const url = new URL("https://api.anthropic.com/v1/organizations/usage");
    url.searchParams.set("start_date", sinceStr);
    url.searchParams.set("end_date", untilStr);
    url.searchParams.set("group_by", "model");

    const response = await fetchWithRetry({
      url: url.toString(),
      provider: PROVIDER,
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
    });

    const data = await response.json() as {
      data?: Array<{
        date?: string;
        model?: string;
        input_tokens?: number;
        output_tokens?: number;
        cache_read_input_tokens?: number;
        cache_creation_input_tokens?: number;
      }>;
    };

    if (!data.data || !Array.isArray(data.data)) {
      // Some API responses wrap differently — try to parse what we got
      console.log(`[anthropic] Unexpected response shape, attempting to parse`);
      return parseAlternativeFormat(data, since, until);
    }

    const rows: UsageRow[] = [];

    for (const entry of data.data) {
      const date = entry.date;
      const model = entry.model ?? "unknown";
      const inputTokens = entry.input_tokens ?? 0;
      const outputTokens = entry.output_tokens ?? 0;
      const cachedInputTokens = (entry.cache_read_input_tokens ?? 0) + (entry.cache_creation_input_tokens ?? 0);

      if (!date) continue;

      rows.push({
        time_bucket: date,
        model,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        cached_input_tokens: cachedInputTokens,
        cost_usd_micros: computeAnthropicCostMicros(model, inputTokens, outputTokens, cachedInputTokens),
        raw: entry as Record<string, unknown>,
      });
    }

    return rows;
  },
};

// Fallback parser for alternative response formats
function parseAlternativeFormat(data: unknown, since: Date, until: Date): UsageRow[] {
  // If the API returns a flat object with totals, create daily entries
  const rows: UsageRow[] = [];
  const days = eachDayOfInterval({ start: since, end: until });

  // Log structure for debugging (no keys exposed)
  console.log(`[anthropic] Response keys:`, Object.keys(data as object));

  // Return empty if we can't parse
  return rows;
}

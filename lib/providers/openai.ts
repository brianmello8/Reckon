import { format } from "date-fns";
import type { ProviderClient, UsageRow } from "./types";
import { fetchWithRetry } from "./fetch-with-retry";
import { computeOpenAICostMicros } from "./pricing/openai";
import { keyFingerprint } from "@/lib/encryption/envelope";

const PROVIDER = "openai";

/**
 * OpenAI Organization Usage API client.
 *
 * Endpoint: GET /v1/organization/usage
 * Docs: https://platform.openai.com/docs/api-reference/usage
 *
 * The API returns per-bucket usage data. We aggregate into daily rows per model.
 */
export const openaiClient: ProviderClient = {
  async fetchUsage({ apiKey, since, until }) {
    const fp = keyFingerprint(apiKey);
    console.log(`[openai] Fetching usage for key ...${fp} from ${format(since, "yyyy-MM-dd")} to ${format(until, "yyyy-MM-dd")}`);

    // OpenAI usage endpoint uses Unix timestamps
    const startTime = Math.floor(since.getTime() / 1000);
    const endTime = Math.floor(until.getTime() / 1000);

    const allRows: UsageRow[] = [];
    let page: string | null = null;

    do {
      const url = new URL("https://api.openai.com/v1/organization/usage/completions");
      url.searchParams.set("start_time", startTime.toString());
      url.searchParams.set("end_time", endTime.toString());
      url.searchParams.set("group_by", "model");
      url.searchParams.set("bucket_width", "1d");
      if (page) url.searchParams.set("page", page);

      const response = await fetchWithRetry({
        url: url.toString(),
        provider: PROVIDER,
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      });

      const data = await response.json() as {
        data?: Array<{
          start_time?: number;
          end_time?: number;
          results?: Array<{
            model?: string;
            input_tokens?: number;
            output_tokens?: number;
            input_cached_tokens?: number;
          }>;
        }>;
        next_page?: string;
      };

      if (data.data && Array.isArray(data.data)) {
        for (const bucket of data.data) {
          const bucketDate = bucket.start_time
            ? format(new Date(bucket.start_time * 1000), "yyyy-MM-dd")
            : format(since, "yyyy-MM-dd");

          if (!bucket.results) continue;

          for (const result of bucket.results) {
            const model = result.model ?? "unknown";
            const inputTokens = result.input_tokens ?? 0;
            const outputTokens = result.output_tokens ?? 0;
            const cachedInputTokens = result.input_cached_tokens ?? 0;

            allRows.push({
              time_bucket: bucketDate,
              model,
              input_tokens: inputTokens,
              output_tokens: outputTokens,
              cached_input_tokens: cachedInputTokens,
              cost_usd_micros: computeOpenAICostMicros(model, inputTokens, outputTokens, cachedInputTokens),
              raw: result as Record<string, unknown>,
            });
          }
        }
      }

      page = data.next_page ?? null;
    } while (page);

    // Merge rows with same (date, model)
    return mergeRows(allRows);
  },
};

function mergeRows(rows: UsageRow[]): UsageRow[] {
  const map = new Map<string, UsageRow>();

  for (const row of rows) {
    const key = `${row.time_bucket}:${row.model}`;
    const existing = map.get(key);
    if (existing) {
      existing.input_tokens += row.input_tokens;
      existing.output_tokens += row.output_tokens;
      existing.cached_input_tokens += row.cached_input_tokens;
      existing.cost_usd_micros += row.cost_usd_micros;
    } else {
      map.set(key, { ...row });
    }
  }

  return Array.from(map.values());
}

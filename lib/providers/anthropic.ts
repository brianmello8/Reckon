import type { ProviderClient, ProviderIdentityInfo, UsageRow } from "./types";
import { fetchWithRetry } from "./fetch-with-retry";
import { computeAnthropicCostMicros } from "./pricing/anthropic";
import { keyFingerprint } from "@/lib/encryption/envelope";

const PROVIDER = "anthropic";

/**
 * Anthropic Usage & Cost Admin API client.
 *
 * Endpoint: GET /v1/organizations/usage_report/messages
 * Docs: https://docs.anthropic.com/en/api/usage-cost-api
 *
 * One org Admin key reports usage for the whole org, bucketed daily and broken
 * down by api_key_id + model. We attribute each row to its `api_key_id`
 * (external_identity), which is mapped to a developer downstream.
 *
 * NOTE: exact response field names should be confirmed against a live Admin key
 * — parsing here is defensive across the documented variants.
 */
export const anthropicClient: ProviderClient = {
  async fetchUsage({ apiKey, since, until }) {
    const fp = keyFingerprint(apiKey);
    console.log(
      `[anthropic] Fetching usage for key ...${fp} from ${since.toISOString()} to ${until.toISOString()}`
    );

    const rows: UsageRow[] = [];
    let page: string | undefined;

    do {
      const url = new URL(
        "https://api.anthropic.com/v1/organizations/usage_report/messages"
      );
      url.searchParams.set("starting_at", since.toISOString());
      url.searchParams.set("ending_at", until.toISOString());
      url.searchParams.set("bucket_width", "1d");
      url.searchParams.append("group_by[]", "api_key_id");
      url.searchParams.append("group_by[]", "model");
      if (page) url.searchParams.set("page", page);

      const response = await fetchWithRetry({
        url: url.toString(),
        provider: PROVIDER,
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
      });

      const data = (await response.json()) as {
        data?: Array<{
          starting_at?: string;
          ending_at?: string;
          results?: Array<Record<string, unknown>>;
        }>;
        has_more?: boolean;
        next_page?: string | null;
      };

      for (const bucket of data.data ?? []) {
        const date = (bucket.starting_at ?? "").slice(0, 10);
        if (!date) continue;
        for (const r of bucket.results ?? []) {
          const num = (k: string) => Number(r[k] ?? 0) || 0;
          const model = String(r.model ?? "unknown");
          const apiKeyId = String(r.api_key_id ?? "");
          const inputTokens = num("uncached_input_tokens") || num("input_tokens");
          const outputTokens = num("output_tokens");
          const cachedInputTokens =
            num("cache_read_input_tokens") + num("cache_creation_input_tokens");

          rows.push({
            time_bucket: date,
            model,
            external_identity: apiKeyId,
            input_tokens: inputTokens,
            output_tokens: outputTokens,
            cached_input_tokens: cachedInputTokens,
            cost_usd_micros: computeAnthropicCostMicros(
              model,
              inputTokens,
              outputTokens,
              cachedInputTokens
            ),
            raw: r,
          });
        }
      }

      page = data.has_more && data.next_page ? data.next_page : undefined;
    } while (page);

    return rows;
  },

  /**
   * Resolve api_key_id → key name via the Admin API.
   * Endpoint: GET /v1/organizations/api_keys (cursor-paginated via after_id).
   */
  async fetchIdentities({ apiKey }) {
    const identities: ProviderIdentityInfo[] = [];
    let afterId: string | undefined;

    do {
      const url = new URL("https://api.anthropic.com/v1/organizations/api_keys");
      url.searchParams.set("limit", "100");
      if (afterId) url.searchParams.set("after_id", afterId);

      const response = await fetchWithRetry({
        url: url.toString(),
        provider: PROVIDER,
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
      });

      const data = (await response.json()) as {
        data?: Array<{ id?: string; name?: string }>;
        has_more?: boolean;
        last_id?: string | null;
      };

      for (const k of data.data ?? []) {
        if (k.id && k.name) identities.push({ external_id: k.id, label: k.name });
      }

      afterId = data.has_more && data.last_id ? data.last_id : undefined;
    } while (afterId);

    return identities;
  },
};

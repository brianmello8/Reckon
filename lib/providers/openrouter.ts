import { format } from "date-fns";
import type { ProviderClient, UsageRow } from "./types";
import { fetchWithRetry } from "./fetch-with-retry";
import { keyFingerprint } from "@/lib/encryption/envelope";

const PROVIDER = "openrouter";
const BASE = "https://openrouter.ai/api/v1";

/**
 * OpenRouter usage client.
 *
 * One org "Provisioning / Management" key lists all API keys and their daily
 * activity. Each API key (by hash) is one identity → developer. OpenRouter
 * reports spend directly (credits ≈ USD), so no local pricing table is needed,
 * and a single connection covers every model routed through OpenRouter.
 *
 * Endpoints: GET /api/v1/keys (list), GET /api/v1/activity?api_key_hash=… (daily).
 * Auth: `Authorization: Bearer <management key>`.
 *
 * NOTE: exact activity field names should be confirmed against a live
 * management key — parsing here is defensive across the documented variants.
 */
export const openrouterClient: ProviderClient = {
  async fetchUsage({ apiKey, since, until }) {
    const fp = keyFingerprint(apiKey);
    console.log(`[openrouter] Fetching activity for management key ...${fp}`);
    const headers = { Authorization: `Bearer ${apiKey}` };

    // 1) List the org's API keys (for identity labels).
    const keys: Array<{ hash: string; label?: string }> = [];
    let offset = 0;
    for (;;) {
      const listUrl = new URL(`${BASE}/keys`);
      listUrl.searchParams.set("offset", String(offset));
      const res = await fetchWithRetry({
        url: listUrl.toString(),
        provider: PROVIDER,
        headers,
      });
      const data = (await res.json()) as {
        data?: Array<{ hash?: string; name?: string; label?: string }>;
      };
      const batch = data.data ?? [];
      for (const k of batch) {
        if (k.hash) keys.push({ hash: k.hash, label: k.name || k.label });
      }
      if (batch.length === 0) break;
      offset += batch.length;
      if (batch.length < 100) break;
    }

    const sinceStr = format(since, "yyyy-MM-dd");
    const untilStr = format(until, "yyyy-MM-dd");
    const rows: UsageRow[] = [];

    // 2) Per-key daily activity (the endpoint returns the last ~30 UTC days;
    //    we filter to the requested window).
    for (const k of keys) {
      const actUrl = new URL(`${BASE}/activity`);
      actUrl.searchParams.set("api_key_hash", k.hash);
      const res = await fetchWithRetry({
        url: actUrl.toString(),
        provider: PROVIDER,
        headers,
      });
      const data = (await res.json()) as { data?: Array<Record<string, unknown>> };

      for (const r of data.data ?? []) {
        const date = String(r.date ?? "").slice(0, 10);
        if (!date || date < sinceStr || date > untilStr) continue;
        const num = (key: string) => Number(r[key] ?? 0) || 0;
        const model = String(r.model ?? r.model_permaslug ?? "unknown");
        const usageUsd = num("usage"); // OpenRouter credits ≈ USD

        rows.push({
          time_bucket: date,
          model,
          external_identity: k.hash,
          identity_label: k.label,
          input_tokens: num("prompt_tokens"),
          output_tokens: num("completion_tokens"),
          cached_input_tokens: 0,
          cost_usd_micros: Math.round(usageUsd * 1_000_000),
          raw: r,
        });
      }
    }

    return rows;
  },
};

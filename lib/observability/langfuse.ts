import type {
  ObservabilityConnector,
  ObservabilityRun,
  ObservabilityGeneration,
  ObservabilityCredentials,
} from "./types";
import { fetchWithRetry } from "@/lib/providers/fetch-with-retry";

const PROVIDER = "langfuse";

/**
 * Langfuse connector — reads run/trace METADATA ONLY.
 *
 * Mapping: traces -> workflow_runs, observations of type GENERATION -> token
 * records. We request only the public read API and copy a fixed allowlist of
 * metadata fields. We NEVER read trace/observation `input` or `output` (the
 * content fields), even though the API returns them.
 *
 * Auth: HTTP Basic with publicKey:secretKey. Default cloud base_url is
 * https://cloud.langfuse.com; self-hosted instances pass their own.
 *
 * NOTE: exact field names should be confirmed against a live instance — parsing
 * is defensive across documented shapes (mirrors the provider adapters).
 */
function authHeader(creds: ObservabilityCredentials): string {
  const token = Buffer.from(
    `${creds.publicKey ?? ""}:${creds.secretKey ?? ""}`
  ).toString("base64");
  return `Basic ${token}`;
}

function normalizeStatus(level?: string): ObservabilityRun["status"] {
  // Langfuse traces don't carry a run status; infer from observation level if
  // present, else "unknown". We never block on this.
  if (level === "ERROR") return "failed";
  return "unknown";
}

export const langfuseConnector: ObservabilityConnector = {
  async testConnection({ baseUrl, credentials }) {
    const url = new URL("/api/public/traces", baseUrl);
    url.searchParams.set("limit", "1");
    await fetchWithRetry({
      url: url.toString(),
      provider: PROVIDER,
      headers: { Authorization: authHeader(credentials) },
    });
  },

  async listRuns({ baseUrl, credentials, since }) {
    const runs: ObservabilityRun[] = [];
    let page = 1;
    const limit = 100;

    // 1) Pull traces (each becomes a workflow_run).
    for (;;) {
      const url = new URL("/api/public/traces", baseUrl);
      url.searchParams.set("page", String(page));
      url.searchParams.set("limit", String(limit));
      url.searchParams.set("fromTimestamp", since.toISOString());

      const res = await fetchWithRetry({
        url: url.toString(),
        provider: PROVIDER,
        headers: { Authorization: authHeader(credentials) },
      });
      const body = (await res.json()) as {
        data?: Array<Record<string, unknown>>;
        meta?: { totalPages?: number };
      };

      for (const t of body.data ?? []) {
        // METADATA ALLOWLIST — id, name, timestamps, userId. No input/output.
        const id = String(t.id ?? "");
        if (!id) continue;
        runs.push({
          external_run_id: id,
          workflow_name: String(t.name ?? "untitled"),
          started_at: t.timestamp ? String(t.timestamp) : null,
          ended_at: null,
          status: "unknown",
          customer_ref: t.userId ? String(t.userId) : null,
          generations: [],
        });
      }

      const totalPages = body.meta?.totalPages ?? page;
      if (page >= totalPages || (body.data ?? []).length === 0) break;
      page += 1;
    }

    if (runs.length === 0) return runs;

    // 2) Pull GENERATION observations and attach to their trace by traceId.
    const byTrace = new Map<string, ObservabilityRun>(
      runs.map((r) => [r.external_run_id, r])
    );
    let obsPage = 1;
    for (;;) {
      const url = new URL("/api/public/observations", baseUrl);
      url.searchParams.set("page", String(obsPage));
      url.searchParams.set("limit", String(limit));
      url.searchParams.set("type", "GENERATION");
      url.searchParams.set("fromStartTime", since.toISOString());

      const res = await fetchWithRetry({
        url: url.toString(),
        provider: PROVIDER,
        headers: { Authorization: authHeader(credentials) },
      });
      const body = (await res.json()) as {
        data?: Array<Record<string, unknown>>;
        meta?: { totalPages?: number };
      };

      for (const o of body.data ?? []) {
        const traceId = String(o.traceId ?? "");
        const run = byTrace.get(traceId);
        if (!run) continue;
        // METADATA ALLOWLIST — model, usage counts, startTime. No input/output.
        const usage = (o.usage ?? {}) as Record<string, unknown>;
        const gen: ObservabilityGeneration = {
          model: String(o.model ?? "unknown"),
          prompt_tokens:
            Number(usage.promptTokens ?? usage.input ?? 0) || 0,
          completion_tokens:
            Number(usage.completionTokens ?? usage.output ?? 0) || 0,
          timestamp: String(o.startTime ?? run.started_at ?? ""),
        };
        run.generations.push(gen);
        if (o.level === "ERROR") run.status = normalizeStatus("ERROR");
      }

      const totalPages = body.meta?.totalPages ?? obsPage;
      if (obsPage >= totalPages || (body.data ?? []).length === 0) break;
      obsPage += 1;
    }

    return runs;
  },
};

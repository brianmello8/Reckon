import type { ObservabilityConnector, ObservabilityRun } from "./types";
import { fetchWithRetry } from "@/lib/providers/fetch-with-retry";

const PROVIDER = "helicone";

/**
 * Helicone connector — reads request METADATA ONLY.
 *
 * Helicone logs individual requests; we group them into runs by session id
 * (the `Helicone-Session-Id` property), falling back to the request id when a
 * request has no session. Mapping: a session -> workflow_run, each request ->
 * a token record. We request the query API and copy a fixed allowlist of
 * metadata fields (id, session, model, token counts, created_at). We NEVER read
 * request/response bodies, even though the API can return them.
 *
 * Auth: Bearer apiKey. Default base_url https://api.helicone.ai.
 *
 * NOTE: exact field names should be confirmed against a live account — parsing
 * is defensive (mirrors the provider adapters).
 */
function sessionOf(req: Record<string, unknown>): string | null {
  const props = (req.request_properties ?? req.properties ?? {}) as Record<
    string,
    unknown
  >;
  const session =
    props["Helicone-Session-Id"] ??
    props["helicone-session-id"] ??
    props["session_id"];
  return session ? String(session) : null;
}

function customerOf(req: Record<string, unknown>): string | null {
  const props = (req.request_properties ?? req.properties ?? {}) as Record<
    string,
    unknown
  >;
  const user = req.request_user_id ?? props["Helicone-User-Id"] ?? props["user"];
  return user ? String(user) : null;
}

export const heliconeConnector: ObservabilityConnector = {
  async testConnection({ baseUrl, credentials }) {
    const url = new URL("/v1/request/query", baseUrl);
    await fetchWithRetry({
      url: url.toString(),
      provider: PROVIDER,
      method: "POST",
      headers: {
        Authorization: `Bearer ${credentials.apiKey ?? ""}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ filter: "all", limit: 1, offset: 0 }),
    });
  },

  async listRuns({ baseUrl, credentials, since }) {
    const runsBySession = new Map<string, ObservabilityRun>();
    const limit = 250;
    let offset = 0;

    for (;;) {
      const url = new URL("/v1/request/query", baseUrl);
      const res = await fetchWithRetry({
        url: url.toString(),
        provider: PROVIDER,
        method: "POST",
        headers: {
          Authorization: `Bearer ${credentials.apiKey ?? ""}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          filter: {
            request: {
              created_at: { gte: since.toISOString() },
            },
          },
          limit,
          offset,
          sort: { created_at: "asc" },
        }),
      });

      const body = (await res.json()) as {
        data?: Array<Record<string, unknown>>;
      };
      const rows = body.data ?? [];

      for (const req of rows) {
        // METADATA ALLOWLIST — request id, session, model, token counts,
        // created_at, user id. No request/response bodies.
        const reqId = String(req.request_id ?? req.id ?? "");
        if (!reqId) continue;
        const runKey = sessionOf(req) ?? reqId;
        const createdAt = req.request_created_at
          ? String(req.request_created_at)
          : req.created_at
          ? String(req.created_at)
          : null;

        let run = runsBySession.get(runKey);
        if (!run) {
          run = {
            external_run_id: runKey,
            workflow_name: sessionOf(req) ? `session:${runKey}` : "ungrouped",
            started_at: createdAt,
            ended_at: createdAt,
            status: "unknown",
            customer_ref: customerOf(req),
            generations: [],
          };
          runsBySession.set(runKey, run);
        }
        if (createdAt && (!run.ended_at || createdAt > run.ended_at)) {
          run.ended_at = createdAt;
        }

        const model = String(
          req.request_model ?? req.response_model ?? req.model ?? "unknown"
        );
        run.generations.push({
          model,
          prompt_tokens: Number(req.prompt_tokens ?? 0) || 0,
          completion_tokens: Number(req.completion_tokens ?? 0) || 0,
          timestamp: createdAt ?? "",
        });
      }

      if (rows.length < limit) break;
      offset += limit;
    }

    return [...runsBySession.values()];
  },
};

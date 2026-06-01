/**
 * Observability connector contract (Phase 8.3).
 *
 * METADATA ONLY. Adapters must construct these objects from an explicit
 * allowlist of metadata fields — ids, names, timing, model, token counts. They
 * must NEVER read or copy prompt/response/input/output bodies, even if the
 * upstream API returns them. There is intentionally no field on these types
 * that can carry message content.
 */

export interface ObservabilityGeneration {
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  timestamp: string; // ISO 8601 (UTC) — when the generation occurred
}

export interface ObservabilityRun {
  // The customer's own run/trace id. Stable per run; used as workflow_runs.external_run_id.
  external_run_id: string;
  // A label for the run's workflow (Langfuse trace name / Helicone session id).
  // POTENTIALLY customer-controlled free text — treated as a label only.
  workflow_name: string;
  started_at: string | null; // ISO 8601 (UTC)
  ended_at: string | null; // ISO 8601 (UTC)
  status: "running" | "completed" | "failed" | "unknown";
  // The customer's end-customer this run served (Langfuse userId / Helicone
  // user property), for per-customer COGS later. Customer-controlled id.
  customer_ref?: string | null;
  generations: ObservabilityGeneration[];
}

export interface ObservabilityCredentials {
  // Langfuse: { publicKey, secretKey }. Helicone: { apiKey }.
  publicKey?: string;
  secretKey?: string;
  apiKey?: string;
}

export interface ObservabilityConnector {
  /**
   * Pull runs (with their generations) created at/after `since`. Returns
   * metadata only. Implementations page through the provider as needed.
   */
  listRuns(args: {
    baseUrl: string;
    credentials: ObservabilityCredentials;
    since: Date;
  }): Promise<ObservabilityRun[]>;

  /**
   * Lightweight credential/connectivity check for the "Test" action. Throws a
   * ProviderAuthError on bad credentials; resolves on success.
   */
  testConnection(args: {
    baseUrl: string;
    credentials: ObservabilityCredentials;
  }): Promise<void>;
}

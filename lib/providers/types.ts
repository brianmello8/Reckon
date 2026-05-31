export interface UsageRow {
  time_bucket: string; // YYYY-MM-DD UTC
  model: string;
  // Provider-side identity this usage belongs to (Anthropic api_key_id,
  // OpenAI user_id, GitHub Copilot seat login). "" when the provider can't
  // break usage down (org-aggregate fallback).
  external_identity: string;
  // Human-readable label for the identity, if the provider exposes one
  // (key name, user email, login). Used to auto-name/auto-map developers.
  identity_label?: string;
  input_tokens: number;
  output_tokens: number;
  cached_input_tokens: number;
  cost_usd_micros: number;
  raw: Record<string, unknown>;
}

export interface ProviderClient {
  fetchUsage(args: {
    apiKey: string;
    since: Date;
    until: Date;
  }): Promise<UsageRow[]>;
}

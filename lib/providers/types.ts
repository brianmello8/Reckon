export interface UsageRow {
  time_bucket: string; // YYYY-MM-DD UTC
  model: string;
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

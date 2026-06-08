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

// Normalized invoice from a provider billing API (Phase 10.1). All money in
// USD micros. Captured as a draft for human review; never auto-confirmed.
export interface InvoiceLine {
  description: string;
  model?: string | null;
  quantity?: number | null;
  unit?: string | null;
  amount: number; // micros
}
export interface NormalizedInvoice {
  invoiceNumber: string;
  billingPeriodStart: string; // YYYY-MM-DD
  billingPeriodEnd: string; // YYYY-MM-DD
  currency: string;
  subtotal: number;
  creditsApplied: number;
  tax: number;
  total: number;
  dueDate?: string | null;
  paymentTerms?: string | null;
  lineItems: InvoiceLine[];
  raw?: Record<string, unknown>;
}

// Maps a provider-side identity (external_id) to a human-readable label —
// e.g. an Anthropic api_key_id to its key name, or an OpenAI user_id to that
// member's email. Used to auto-name/auto-map developers when the usage API
// itself only reports opaque IDs.
export interface ProviderIdentityInfo {
  external_id: string;
  label: string;
}

export interface ProviderClient {
  fetchUsage(args: {
    apiKey: string;
    since: Date;
    until: Date;
  }): Promise<UsageRow[]>;

  /**
   * Optional: pull provider invoices for a window, where the provider exposes a
   * billing/invoices API. Implemented per-provider that has one; absent on
   * providers without an accessible invoices API.
   */
  fetchInvoices?(args: {
    apiKey: string;
    since: Date;
    until: Date;
  }): Promise<NormalizedInvoice[]>;

  /**
   * Optional: enumerate the provider's identity directory (api keys, org users)
   * to resolve the opaque IDs returned by fetchUsage into human labels.
   * Implemented for providers whose usage API reports only opaque identities
   * (Anthropic api_key_id, OpenAI user_id); absent where fetchUsage already
   * carries a label (e.g. GitHub Copilot seat login). Best-effort: callers must
   * treat failure as non-fatal and proceed without labels.
   */
  fetchIdentities?(args: { apiKey: string }): Promise<ProviderIdentityInfo[]>;
}

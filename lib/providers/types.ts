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
}

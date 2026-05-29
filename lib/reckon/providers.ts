/** Provider + severity color metadata, keyed to the CSS design tokens. */

export type ProviderKey = "anthropic" | "openai" | "github_copilot";

export interface ProviderMeta {
  key: ProviderKey;
  name: string;
  short: string;
  /** CSS var reference for charts/dots */
  color: string;
}

export const PROVIDERS: ProviderMeta[] = [
  { key: "anthropic", name: "Anthropic", short: "ANT", color: "var(--p-anthropic)" },
  { key: "openai", name: "OpenAI", short: "OAI", color: "var(--p-openai)" },
  { key: "github_copilot", name: "GitHub Copilot", short: "COP", color: "var(--p-copilot)" },
];

export const PROVIDER_BY_KEY: Record<string, ProviderMeta> = Object.fromEntries(
  PROVIDERS.map((p) => [p.key, p])
);

export function providerColor(key: string): string {
  return PROVIDER_BY_KEY[key]?.color ?? "var(--ink-3)";
}

export function providerName(key: string): string {
  return PROVIDER_BY_KEY[key]?.name ?? key;
}

export type Severity = "info" | "warn" | "critical";

export const SEVERITY: Record<Severity, { label: string; color: string; bg: string }> = {
  critical: { label: "Critical", color: "var(--sev-crit)", bg: "var(--sev-crit-bg)" },
  warn: { label: "Warning", color: "var(--sev-warn)", bg: "var(--sev-warn-bg)" },
  info: { label: "Info", color: "var(--sev-info)", bg: "var(--sev-info-bg)" },
};

export type KeyStatus = "active" | "errored" | "revoked" | "backfilling";

export const KEY_STATUS: Record<KeyStatus, { label: string; color: string; bg: string }> = {
  active: { label: "Active", color: "var(--pos)", bg: "color-mix(in oklab, var(--pos) 12%, transparent)" },
  errored: { label: "Errored", color: "var(--sev-crit)", bg: "var(--sev-crit-bg)" },
  revoked: { label: "Revoked", color: "var(--ink-3)", bg: "var(--bg-2)" },
  backfilling: { label: "Backfilling", color: "var(--brand-ink)", bg: "var(--brand-soft)" },
};

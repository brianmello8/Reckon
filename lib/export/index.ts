import type { Exporter } from "./types";
import { genericCsvExporter } from "./generic-csv";

/**
 * Exporter registry (Phase 13.1). One pure formatter per target_format, mirroring
 * lib/providers/. Only generic_csv ships in 13.1 — the per-target ERP templates
 * (qbo_iif, netsuite_csv, intacct_csv, xero_csv, spend_splits_csv) are 13.2 and
 * throw until implemented, so a half-built format can't silently emit a bad file.
 */

export type TargetFormat =
  | "generic_csv"
  | "qbo_iif"
  | "netsuite_csv"
  | "intacct_csv"
  | "xero_csv"
  | "spend_splits_csv";

const REGISTRY: Partial<Record<TargetFormat, Exporter>> = {
  generic_csv: genericCsvExporter,
};

export function getExporter(format: TargetFormat): Exporter {
  const e = REGISTRY[format];
  if (!e) throw new Error(`Export format "${format}" is not implemented yet (Phase 13.2).`);
  return e;
}

export function implementedFormats(): TargetFormat[] {
  return Object.keys(REGISTRY) as TargetFormat[];
}

export * from "./types";
export * from "./format";

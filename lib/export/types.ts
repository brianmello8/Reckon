/**
 * Export engine types (Phase 13.1, architecture §9). A formatter is a PURE
 * function from the canonical journal entry to a file the customer imports —
 * deterministic (identical inputs → identical bytes), no credentials, no API.
 */

export type ExportLine = {
  /** Stable line-level external id (org + JE + line) — double-import detectable. */
  lineExternalId: string;
  glCode: string | null;
  glName: string | null;
  costCenterCode: string | null;
  costCenterName: string | null;
  entityCode: string | null;
  projectCode: string | null;
  debitMicros: bigint;
  creditMicros: bigint;
  /** True when a dimension still carries a Reckon code (no real ERP mapping yet). */
  needsMapping: boolean;
};

export type ExportEntry = {
  journalEntryId: string;
  type: string;
  memo: string | null;
  lines: ExportLine[];
};

export type PeriodMeta = {
  periodLabel: string;
  periodStart: string;
  periodEnd: string;
  /** Cutoff basis stamped into the file so the customer sees which month it is. */
  timezone: string;
  boundaryRule: string;
  externalBatchId: string;
};

export type ExportFile = { filename: string; mimetype: string; body: string };

export interface Exporter {
  format(entries: ExportEntry[], periodMeta: PeriodMeta): ExportFile;
}

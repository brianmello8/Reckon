import type { Exporter, ExportEntry, PeriodMeta } from "./types";
import { genericCsvExporter } from "./generic-csv";
import {
  qboIifExporter,
  netsuiteCsvExporter,
  intacctCsvExporter,
  xeroCsvExporter,
  spendSplitsCsvExporter,
} from "./erp";
import { balancedMicros, jeValidator, splitsValidator } from "./validate";

/**
 * Exporter registry (Phase 13.1–13.2). One pure formatter + validator per
 * target_format, mirroring lib/providers/. The validator BLOCKS generation when
 * it returns errors, so a structurally invalid file is never produced.
 */

export type TargetFormat =
  | "generic_csv"
  | "qbo_iif"
  | "netsuite_csv"
  | "intacct_csv"
  | "xero_csv"
  | "spend_splits_csv";

type Validator = (entries: ExportEntry[], meta: PeriodMeta) => string[];
type Registered = { exporter: Exporter; validate: Validator };

const REGISTRY: Record<TargetFormat, Registered> = {
  generic_csv: { exporter: genericCsvExporter, validate: (e) => balancedMicros(e) },
  qbo_iif: { exporter: qboIifExporter, validate: (e) => jeValidator(e) },
  netsuite_csv: { exporter: netsuiteCsvExporter, validate: (e) => jeValidator(e) },
  intacct_csv: { exporter: intacctCsvExporter, validate: (e) => jeValidator(e) },
  xero_csv: { exporter: xeroCsvExporter, validate: (e) => jeValidator(e) },
  spend_splits_csv: { exporter: spendSplitsCsvExporter, validate: (e) => splitsValidator(e) },
};

export function getExporter(format: TargetFormat): Exporter {
  return REGISTRY[format].exporter;
}

/** Returns blocking errors for a format (empty = OK to generate). */
export function validateExport(format: TargetFormat, entries: ExportEntry[], meta: PeriodMeta): string[] {
  return REGISTRY[format].validate(entries, meta);
}

export function implementedFormats(): TargetFormat[] {
  return Object.keys(REGISTRY) as TargetFormat[];
}

export * from "./types";
export * from "./format";

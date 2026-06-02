import type { Exporter, ExportEntry, PeriodMeta, ExportFile } from "./types";
import { microsToDecimal, csvField, sortEntries } from "./format";

/**
 * generic_csv — the reference formatter (Phase 13.1, §9). A flat, one-row-per-
 * line CSV that any spreadsheet/GL tool can read, with a stamped header block
 * recording the batch id and the period's cutoff basis. Deterministic.
 *
 * Amounts are exact dollars (up to 6 dp) so a balanced JE (debits == credits in
 * micros) stays balanced in the file — per-target cents rounding is a 13.2 concern.
 */

const COLUMNS = [
  "batch_external_id",
  "line_external_id",
  "journal_entry_id",
  "entry_type",
  "memo",
  "gl_code",
  "gl_name",
  "cost_center_code",
  "cost_center_name",
  "entity_code",
  "project_code",
  "debit",
  "credit",
  "needs_mapping",
];

export const genericCsvExporter: Exporter = {
  format(entries: ExportEntry[], meta: PeriodMeta): ExportFile {
    const ordered = sortEntries(entries);
    const header = [
      `# Reckon export — ${meta.externalBatchId}`,
      `# Period: ${meta.periodLabel} (${meta.periodStart} … ${meta.periodEnd})`,
      `# Cutoff basis: ${meta.boundaryRule}; reporting timezone ${meta.timezone}`,
      `# Reckon does not post — import this file into your finance system.`,
    ];
    const rows: string[] = [COLUMNS.join(",")];
    for (const e of ordered) {
      for (const l of e.lines) {
        rows.push(
          [
            meta.externalBatchId,
            l.lineExternalId,
            e.journalEntryId,
            e.type,
            e.memo ?? "",
            l.glCode ?? "",
            l.glName ?? "",
            l.costCenterCode ?? "",
            l.costCenterName ?? "",
            l.entityCode ?? "",
            l.projectCode ?? "",
            microsToDecimal(l.debitMicros),
            microsToDecimal(l.creditMicros),
            l.needsMapping ? "yes" : "no",
          ]
            .map(csvField)
            .join(",")
        );
      }
    }
    const body = [...header, ...rows].join("\n") + "\n";
    return {
      filename: `${meta.externalBatchId}.csv`,
      mimetype: "text/csv",
      body,
    };
  },
};

import type { Exporter, ExportEntry, PeriodMeta, ExportFile } from "./types";
import { csvField, sortEntries, roundEntryToCents, centsToDecimal, formatDate } from "./format";
import { distribute } from "@/lib/finance/allocate";

/**
 * Per-target ERP import formatters (Phase 13.2, §5j). Each is a PURE function
 * from the canonical journal entry to that system's documented import-file shape.
 * No credentials, no API. Amounts are rounded to cents with the sub-cent residual
 * absorbed on the largest debit line (roundEntryToCents) so the entry stays
 * balanced — a hard import requirement. Dimension columns carry whatever code the
 * line holds (Reckon's, until 13.3 maps real ERP codes); needs-mapping is flagged
 * in the UI, never as a silent internal label inside the file.
 *
 * NOTE: built to each system's published column contract. Real-import validation
 * against the live tool is a manual step (see §5j) — Reckon can't log into ERPs.
 */

/** Tab-separated field: strip tabs/newlines (IIF is tab-delimited, unquoted). */
function tsv(v: string | null | undefined): string {
  return (v ?? "").replace(/[\t\r\n]+/g, " ");
}
const signed = (debitCents: bigint, creditCents: bigint) => centsToDecimal(debitCents - creditCents);

// ── QuickBooks Desktop IIF (general journal) ────────────────────────────────────
export const qboIifExporter: Exporter = {
  format(entries: ExportEntry[], meta: PeriodMeta): ExportFile {
    const date = formatDate(meta.periodEnd, "mdy");
    const out: string[] = [
      `; Reckon export ${meta.externalBatchId} — ${meta.periodLabel} (${meta.boundaryRule}, tz ${meta.timezone})`,
      "!TRNS\tTRNSTYPE\tDATE\tACCNT\tCLASS\tAMOUNT\tMEMO\tDOCNUM",
      "!SPL\tTRNSTYPE\tDATE\tACCNT\tCLASS\tAMOUNT\tMEMO\tDOCNUM",
      "!ENDTRNS",
    ];
    for (const e of sortEntries(entries)) {
      const lines = roundEntryToCents(e);
      const docnum = e.journalEntryId.slice(0, 8);
      lines.forEach((cl, i) => {
        const acct = cl.line.glName ?? cl.line.glCode ?? "";
        out.push(
          [i === 0 ? "TRNS" : "SPL", "GENERAL JOURNAL", date, tsv(acct), tsv(cl.line.costCenterCode), signed(cl.debitCents, cl.creditCents), tsv(e.memo), docnum].join("\t")
        );
      });
      out.push("ENDTRNS");
    }
    return { filename: `${meta.externalBatchId}-qbo.iif`, mimetype: "text/plain", body: out.join("\n") + "\n" };
  },
};

// ── NetSuite CSV journal import ─────────────────────────────────────────────────
const NETSUITE_COLS = ["External ID", "Date", "Account", "Memo", "Debit", "Credit", "Department", "Class", "Location"];
export const netsuiteCsvExporter: Exporter = {
  format(entries: ExportEntry[], meta: PeriodMeta): ExportFile {
    const date = formatDate(meta.periodEnd, "mdy");
    const rows = [NETSUITE_COLS.join(",")];
    for (const e of sortEntries(entries)) {
      const extId = `${meta.externalBatchId}-${e.journalEntryId.slice(0, 8)}`;
      for (const cl of roundEntryToCents(e)) {
        rows.push(
          [
            extId, date, cl.line.glCode ?? "", e.memo ?? "",
            cl.debitCents > 0n ? centsToDecimal(cl.debitCents) : "",
            cl.creditCents > 0n ? centsToDecimal(cl.creditCents) : "",
            cl.line.costCenterCode ?? "", cl.line.projectCode ?? "", cl.line.entityCode ?? "",
          ].map(csvField).join(",")
        );
      }
    }
    return { filename: `${meta.externalBatchId}-netsuite.csv`, mimetype: "text/csv", body: rows.join("\n") + "\n" };
  },
};

// ── Sage Intacct GL journal CSV ─────────────────────────────────────────────────
const INTACCT_COLS = ["Journal", "Date", "Reference", "Line", "GL Account", "Debit", "Credit", "Memo", "Location", "Department", "Project"];
export const intacctCsvExporter: Exporter = {
  format(entries: ExportEntry[], meta: PeriodMeta): ExportFile {
    const date = formatDate(meta.periodEnd, "mdy");
    const rows = [INTACCT_COLS.join(",")];
    for (const e of sortEntries(entries)) {
      roundEntryToCents(e).forEach((cl, i) => {
        rows.push(
          [
            "GJ", date, meta.externalBatchId, String(i + 1), cl.line.glCode ?? "",
            cl.debitCents > 0n ? centsToDecimal(cl.debitCents) : "",
            cl.creditCents > 0n ? centsToDecimal(cl.creditCents) : "",
            e.memo ?? "", cl.line.entityCode ?? "", cl.line.costCenterCode ?? "", cl.line.projectCode ?? "",
          ].map(csvField).join(",")
        );
      });
    }
    return { filename: `${meta.externalBatchId}-intacct.csv`, mimetype: "text/csv", body: rows.join("\n") + "\n" };
  },
};

// ── Xero manual-journal CSV ─────────────────────────────────────────────────────
const XERO_COLS = [
  "Narration", "Date", "Description", "AccountCode", "TaxRate", "Amount",
  "TrackingName1", "TrackingOption1", "TrackingName2", "TrackingOption2",
];
export const xeroCsvExporter: Exporter = {
  format(entries: ExportEntry[], meta: PeriodMeta): ExportFile {
    const date = formatDate(meta.periodEnd, "dmy");
    const rows = [XERO_COLS.join(",")];
    for (const e of sortEntries(entries)) {
      const narration = e.memo ?? meta.externalBatchId;
      for (const cl of roundEntryToCents(e)) {
        rows.push(
          [
            narration, date, e.memo ?? "", cl.line.glCode ?? "", "No VAT",
            signed(cl.debitCents, cl.creditCents),
            cl.line.costCenterCode ? "Cost Center" : "", cl.line.costCenterCode ?? "",
            cl.line.projectCode ? "Project" : "", cl.line.projectCode ?? "",
          ].map(csvField).join(",")
        );
      }
    }
    return { filename: `${meta.externalBatchId}-xero.csv`, mimetype: "text/csv", body: rows.join("\n") + "\n" };
  },
};

// ── Ramp / Brex coded-split CSV (NOT a journal entry) ───────────────────────────
// Re-codes the period's AI expense (the JE's debit lines) into GL × cost-center
// splits of a single vendor transaction. Credit (accrued-liability) lines are
// excluded — this is a transaction re-code, not a balanced JE.
const SPLITS_COLS = ["Vendor", "Date", "Total Amount", "Split Amount", "Split %", "GL Account", "Cost Center", "Memo"];
export const spendSplitsCsvExporter: Exporter = {
  format(entries: ExportEntry[], meta: PeriodMeta): ExportFile {
    const date = formatDate(meta.periodEnd, "mdy");
    const rows = [SPLITS_COLS.join(",")];
    for (const e of sortEntries(entries)) {
      const debits = roundEntryToCents(e).filter((cl) => cl.debitCents > 0n);
      const totalCents = debits.reduce((a, cl) => a + cl.debitCents, 0n);
      if (totalCents === 0n) continue;
      // Exact-sum percentages (basis points) via largest-remainder.
      const bps = distribute(
        debits.map((cl, i) => ({ key: String(i), weight: Number(cl.debitCents) })),
        10000,
        null
      );
      const vendor = e.memo ?? "AI usage";
      debits.forEach((cl, i) => {
        const b = bps.get(String(i)) ?? 0;
        const pct = `${Math.floor(b / 100)}.${(b % 100).toString().padStart(2, "0")}`;
        rows.push(
          [
            vendor, date, centsToDecimal(totalCents), centsToDecimal(cl.debitCents), pct,
            cl.line.glCode ?? "", cl.line.costCenterCode ?? "", e.memo ?? "",
          ].map(csvField).join(",")
        );
      });
    }
    return { filename: `${meta.externalBatchId}-spend-splits.csv`, mimetype: "text/csv", body: rows.join("\n") + "\n" };
  },
};

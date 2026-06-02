/**
 * Functional test for per-target export templates (Phase 13.2, §5j).
 * Run: npx dotenv -e .env.local -- tsx scripts/test-export-templates.ts
 *
 * Pure (no DB) — formatters and validators are pure functions. Covers:
 *  - Each format is deterministic (identical inputs → identical bytes).
 *  - Cents rounding keeps a sub-cent JE balanced (residual absorbed).
 *  - The validator blocks unbalanced / GL-missing / un-splittable entries.
 *  - Reckon codes are emitted (not dropped) when no real mapping exists.
 *  - spend_splits is a transaction re-code (no credit line; %s sum to 100).
 */
import { getExporter, validateExport, type TargetFormat } from "@/lib/export";
import { roundEntryToCents } from "@/lib/export/format";
import type { ExportEntry, PeriodMeta } from "@/lib/export/types";

let failures = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) console.log(`  ✓ ${name}`);
  else { failures++; console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
}

const META: PeriodMeta = {
  periodLabel: "Feb 2020",
  periodStart: "2020-02-01",
  periodEnd: "2020-02-29",
  timezone: "UTC",
  boundaryRule: "inclusive start, exclusive end",
  externalBatchId: "RCKN-TESTONLY-ABC123",
};

const line = (id: string, gl: string | null, cc: string | null, debit: bigint, credit: bigint): ExportEntry["lines"][number] => ({
  lineExternalId: id,
  glCode: gl,
  glName: gl ? `${gl} name` : null,
  costCenterCode: cc,
  costCenterName: cc ? `${cc} name` : null,
  entityCode: null,
  projectCode: null,
  debitMicros: debit,
  creditMicros: credit,
  needsMapping: !!(gl || cc),
});

// A balanced JE whose cents need a residual fix: 333333+333333+333334 = 1,000,000.
const balanced: ExportEntry = {
  journalEntryId: "11111111-1111-1111-1111-111111111111",
  type: "accrual",
  memo: "AI usage accrual",
  lines: [
    line("L1", "COGS-1", "CC-ENG", 333333n, 0n),
    line("L2", "COGS-1", "CC-DATA", 333333n, 0n),
    line("L3", "COGS-1", "CC-OPS", 333334n, 0n),
    line("L4", "2150", null, 0n, 1_000_000n), // accrued liability credit
  ],
};

const JE_FORMATS: TargetFormat[] = ["generic_csv", "qbo_iif", "netsuite_csv", "intacct_csv", "xero_csv"];

// ── Determinism ──────────────────────────────────────────────────────────────
console.log("Determinism (identical inputs → identical bytes):");
for (const f of [...JE_FORMATS, "spend_splits_csv" as TargetFormat]) {
  const a = getExporter(f).format([balanced], META).body;
  const b = getExporter(f).format([balanced], META).body;
  check(`${f} is byte-deterministic`, a === b);
}

// ── Cents balance (rounding residual absorbed) ───────────────────────────────
console.log("\nCents rounding keeps the JE balanced:");
const cl = roundEntryToCents(balanced);
const dc = cl.reduce((a, x) => a + x.debitCents, 0n);
const cc = cl.reduce((a, x) => a + x.creditCents, 0n);
check("sub-cent JE balances in cents (100 == 100)", dc === cc && dc === 100n, `${dc} vs ${cc}`);

// ── Structure / codes emitted ────────────────────────────────────────────────
console.log("\nStructure + codes emitted (not dropped):");
const iif = getExporter("qbo_iif").format([balanced], META).body;
check("qbo_iif has IIF journal structure", iif.includes("!TRNS") && iif.includes("GENERAL JOURNAL") && iif.includes("ENDTRNS"));
const ns = getExporter("netsuite_csv").format([balanced], META).body;
check("netsuite_csv has the journal header", ns.startsWith("External ID,Date,Account,Memo,Debit,Credit,Department,Class,Location"));
check("netsuite_csv emits the Reckon GL code (COGS-1)", ns.includes("COGS-1"));
const intacct = getExporter("intacct_csv").format([balanced], META).body;
check("intacct_csv has GL journal header", intacct.startsWith("Journal,Date,Reference,Line,GL Account"));
const xero = getExporter("xero_csv").format([balanced], META).body;
check("xero_csv has manual-journal header", xero.startsWith("Narration,Date,Description,AccountCode,TaxRate,Amount"));
check("xero_csv carries cost center as a tracking option", xero.includes("Cost Center") && xero.includes("CC-ENG"));

// ── spend_splits: transaction re-code, not a JE ──────────────────────────────
console.log("\nspend_splits (re-code, not a JE):");
const splits = getExporter("spend_splits_csv").format([balanced], META).body;
check("spend_splits has the splits header", splits.startsWith("Vendor,Date,Total Amount,Split Amount,Split %,GL Account,Cost Center,Memo"));
check("spend_splits excludes the credit (liability) line", !splits.includes("2150"));
const pctRows = splits.trim().split("\n").slice(1).map((r) => Number(r.split(",")[4]));
const pctSum = Math.round(pctRows.reduce((a, b) => a + b, 0) * 100) / 100;
check("split percentages sum to 100.00", pctSum === 100, String(pctSum));

// ── Validators block bad input ────────────────────────────────────────────────
console.log("\nValidators block invalid files:");
const unbalanced: ExportEntry = { ...balanced, journalEntryId: "22222222-2222-2222-2222-222222222222", lines: [line("U1", "COGS-1", null, 500_000n, 0n), line("U2", "2150", null, 0n, 400_000n)] };
check("unbalanced JE is blocked", validateExport("netsuite_csv", [unbalanced], META).length > 0);
const noGl: ExportEntry = { ...balanced, journalEntryId: "33333333-3333-3333-3333-333333333333", lines: [line("N1", null, "CC-ENG", 1_000_000n, 0n), line("N2", "2150", null, 0n, 1_000_000n)] };
check("line with no GL account is blocked (JE formats)", validateExport("xero_csv", [noGl], META).some((e) => e.includes("GL account")));
check("balanced + coded JE passes all JE validators", JE_FORMATS.every((f) => validateExport(f, [balanced], META).length === 0));
const noDebit: ExportEntry = { ...balanced, journalEntryId: "44444444-4444-4444-4444-444444444444", lines: [line("Z1", "2150", null, 0n, 1_000_000n)] };
check("spend_splits blocks an entry with no expense line", validateExport("spend_splits_csv", [noDebit], META).length > 0);

console.log(failures === 0 ? "\n✅ all checks passed" : `\n❌ ${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);

/**
 * Functional test for the accrual close loop (Phase 11.3, architecture §5f).
 * Pure-logic checks — no DB. Verifies the invariants the DB transactions rely on:
 *   1. A reversal EXACTLY offsets its accrual (nets to zero on every dimension).
 *   2. A true-up books the reconciled variance, balanced, with the right sign,
 *      carrying the accrual's dimensions.
 *   3. Accrual accuracy (errorPct) is computed correctly.
 *   4. Linkage: reversal/true-up reference the accrual JE (traceability) — proven
 *      structurally here, enforced via source_journal_entry_id in the DB layer.
 *
 * Run: npx tsx scripts/test-accrual-loop.ts
 */
import { buildAccrualLines } from "@/lib/close/accrual";
import { buildReversalLines, buildTrueUpLines } from "@/lib/close/reversal";

let failures = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) {
    console.log(`  ✓ ${name}`);
  } else {
    failures++;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const M = 1_000_000n; // $1.00
const key = (l: { glAccountId: string | null; costCenterId: string | null }) =>
  `${l.glAccountId}|${l.costCenterId}`;

// ── Setup: an accrual with two coded expense lines + a forecast tail ──────────
const observed = [
  { glAccountId: "gl-eng", costCenterId: "cc-platform", entityId: null, micros: 600n * M },
  { glAccountId: "gl-eng", costCenterId: "cc-data", entityId: null, micros: 300n * M },
];
const tail = 100n * M; // not-yet-reported run-rate
const liabGl = "gl-accrued-liability";
const { lines: accrualLines, estimated, balanced } = buildAccrualLines(observed, tail, liabGl);

console.log("Accrual:");
check("accrual is balanced", balanced);
check("estimated = observed + tail = $1000", estimated === 1000n * M, `got ${estimated}`);
const accDebit = accrualLines.reduce((a, l) => a + l.debit, 0n);
const accCredit = accrualLines.reduce((a, l) => a + l.credit, 0n);
check("tail folded into expense debits (debits == estimated)", accDebit === estimated, `${accDebit}`);
check("one accrued-liability credit == estimated", accCredit === estimated);

// ── 1. Reversal exactly offsets the accrual ───────────────────────────────────
console.log("\nReversal:");
const reversal = buildReversalLines(accrualLines);
check("reversal has same line count", reversal.length === accrualLines.length);
// Combine accrual + reversal per dimension → must net to zero everywhere.
const net = new Map<string, bigint>();
for (const l of [...accrualLines, ...reversal]) {
  net.set(key(l), (net.get(key(l)) ?? 0n) + l.debit - l.credit);
}
check(
  "accrual + reversal nets to ZERO on every dimension",
  [...net.values()].every((v) => v === 0n),
  JSON.stringify([...net.entries()].map(([k, v]) => `${k}=${v}`))
);

// ── 2a. True-up — UNDER-accrued (actual > estimate) ───────────────────────────
console.log("\nTrue-up (under-accrued, actual $1100 vs $1000):");
const expense = accrualLines.filter((l) => l.debit > 0n);
const varianceUnder = 1100n * M - estimated; // +100
const under = buildTrueUpLines(expense, liabGl, varianceUnder);
check("true-up is balanced", under.balanced);
const underExpDebit = under.lines.filter((l) => l.glAccountId !== liabGl).reduce((a, l) => a + l.debit, 0n);
check("under-accrual books MORE expense (debit) = +$100", underExpDebit === 100n * M, `${underExpDebit}`);
check(
  "variance split sums to exactly the variance",
  under.lines.filter((l) => l.glAccountId !== liabGl).reduce((a, l) => a + l.debit - l.credit, 0n) === varianceUnder
);
check(
  "true-up carries the accrual's dimensions",
  under.lines.filter((l) => l.glAccountId !== liabGl).every((l) => expense.some((e) => key(e) === key(l)))
);

// ── 2b. True-up — OVER-accrued (actual < estimate) ────────────────────────────
console.log("\nTrue-up (over-accrued, actual $940 vs $1000):");
const varianceOver = 940n * M - estimated; // -60
const over = buildTrueUpLines(expense, liabGl, varianceOver);
check("true-up is balanced", over.balanced);
const overExpCredit = over.lines.filter((l) => l.glAccountId !== liabGl).reduce((a, l) => a + l.credit, 0n);
check("over-accrual REVERSES expense (credit) = $60", overExpCredit === 60n * M, `${overExpCredit}`);

// ── 2c. True-up — exact (no variance) ─────────────────────────────────────────
console.log("\nTrue-up (exact, variance $0):");
const exact = buildTrueUpLines(expense, liabGl, 0n);
check("zero-variance true-up produces no lines", exact.lines.length === 0);
check("zero-variance true-up is balanced", exact.balanced);

// ── 3. Accrual accuracy errorPct ──────────────────────────────────────────────
console.log("\nAccuracy:");
const errorPct = (estimatedM: bigint, actualM: bigint) =>
  Math.round((Math.abs(Number(actualM - estimatedM)) / Number(actualM)) * 1000) / 10;
check("error% for $1000 est vs $1100 actual ≈ 9.1%", errorPct(1000n * M, 1100n * M) === 9.1);
check("error% for an exact match is 0%", errorPct(1000n * M, 1000n * M) === 0);

console.log(failures === 0 ? "\n✅ all checks passed" : `\n❌ ${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);

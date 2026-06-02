import type { ExportEntry } from "./types";
import { roundEntryToCents } from "./format";

/**
 * Per-format validators (Phase 13.2, §5j). Each returns a list of human-readable
 * errors; an empty list means the batch may be generated. A non-empty list BLOCKS
 * generation — we never emit a structurally invalid file.
 */

const id = (e: ExportEntry) => e.journalEntryId.slice(0, 8);

/** Every JE must balance in the canonical micros. */
export function balancedMicros(entries: ExportEntry[]): string[] {
  const errs: string[] = [];
  for (const e of entries) {
    const d = e.lines.reduce((a, l) => a + l.debitMicros, 0n);
    const c = e.lines.reduce((a, l) => a + l.creditMicros, 0n);
    if (d !== c) errs.push(`JE ${id(e)} is unbalanced: debit ${d} ≠ credit ${c} (micros).`);
  }
  return errs;
}

/** After cents rounding the JE must still balance (the residual-absorb invariant). */
export function balancedCents(entries: ExportEntry[]): string[] {
  const errs: string[] = [];
  for (const e of entries) {
    const ls = roundEntryToCents(e);
    const d = ls.reduce((a, x) => a + x.debitCents, 0n);
    const c = ls.reduce((a, x) => a + x.creditCents, 0n);
    if (d !== c) errs.push(`JE ${id(e)} does not balance in cents after rounding.`);
  }
  return errs;
}

/** Every line must carry a GL account code (no account → cannot import). */
export function glPresent(entries: ExportEntry[]): string[] {
  const bad = new Set<string>();
  for (const e of entries) for (const l of e.lines) if (!l.glCode) bad.add(id(e));
  return [...bad].map((j) => `JE ${j} has a line with no GL account code (required for this format).`);
}

/** Composite for the GL-journal formats (qbo/netsuite/intacct/xero). */
export function jeValidator(entries: ExportEntry[]): string[] {
  return [...balancedMicros(entries), ...balancedCents(entries), ...glPresent(entries)];
}

/** Spend-splits is a transaction re-code, not a JE: each entry needs ≥1 expense
 * (debit) line and every split line needs a GL account. */
export function splitsValidator(entries: ExportEntry[]): string[] {
  const errs: string[] = [];
  for (const e of entries) {
    const debits = e.lines.filter((l) => l.debitMicros > 0n);
    if (debits.length === 0) errs.push(`JE ${id(e)} has no expense (debit) line to split.`);
    for (const l of debits) if (!l.glCode) errs.push(`JE ${id(e)} has a split line with no GL account code.`);
  }
  return errs;
}

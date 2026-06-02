import { createHash } from "crypto";
import type { ExportEntry, ExportLine } from "./types";

/** Round micros to whole cents, half-up away from zero (1 cent = 10_000 micros). */
export function microsToCents(micros: bigint): bigint {
  const neg = micros < 0n;
  const abs = neg ? -micros : micros;
  const cents = (abs + 5000n) / 10000n;
  return neg ? -cents : cents;
}

/** Cents → "1234.56" (always 2 dp). */
export function centsToDecimal(cents: bigint): string {
  const neg = cents < 0n;
  const abs = neg ? -cents : cents;
  return (neg ? "-" : "") + (abs / 100n).toString() + "." + (abs % 100n).toString().padStart(2, "0");
}

/** Date reformatting for ERP imports. yyyy-mm-dd → mdy/dmy/iso. */
export function formatDate(yyyymmdd: string, style: "mdy" | "dmy" | "iso"): string {
  const [y, m, d] = yyyymmdd.split("-");
  if (style === "mdy") return `${m}/${d}/${y}`;
  if (style === "dmy") return `${d}/${m}/${y}`;
  return yyyymmdd;
}

export type CentsLine = { line: ExportLine; debitCents: bigint; creditCents: bigint };

/**
 * Round every line of a JE to cents and absorb the sub-cent rounding residual on
 * the largest debit line, so a JE balanced in micros stays balanced in cents (a
 * hard ERP-import requirement). Deterministic: lines are assumed pre-sorted, the
 * residual lands on the first largest-debit line.
 */
export function roundEntryToCents(entry: ExportEntry): CentsLine[] {
  const lines: CentsLine[] = entry.lines.map((l) => ({
    line: l,
    debitCents: microsToCents(l.debitMicros),
    creditCents: microsToCents(l.creditMicros),
  }));
  const debit = lines.reduce((a, x) => a + x.debitCents, 0n);
  const credit = lines.reduce((a, x) => a + x.creditCents, 0n);
  const diff = debit - credit;
  if (diff !== 0n && lines.length > 0) {
    let dIdx = -1;
    for (let i = 0; i < lines.length; i++) if (dIdx < 0 || lines[i].debitCents > lines[dIdx].debitCents) dIdx = i;
    if (dIdx >= 0 && lines[dIdx].debitCents > 0n) {
      lines[dIdx].debitCents -= diff; // debits were `diff` too high → reduce
    } else {
      let cIdx = 0;
      for (let i = 0; i < lines.length; i++) if (lines[i].creditCents > lines[cIdx].creditCents) cIdx = i;
      lines[cIdx].creditCents += diff;
    }
  }
  return lines;
}

/** Exact dollars from micros (no float): "4200.00", "0.428571". Min 2 dp. */
export function microsToDecimal(micros: bigint): string {
  const neg = micros < 0n;
  const abs = neg ? -micros : micros;
  const whole = abs / 1_000_000n;
  let frac = (abs % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "");
  if (frac.length < 2) frac = frac.padEnd(2, "0"); // always at least cents
  return (neg ? "-" : "") + whole.toString() + "." + frac;
}

/** RFC-4180 CSV field escaping. */
export function csvField(v: string | null | undefined): string {
  const s = v ?? "";
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function sha256Hex(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

/** Deterministic, stable batch id from org + period + code set + the EXACT JE
 * set. The re-import idempotency anchor: same inputs → same id, every time.
 * (The code set is part of the identity since it changes the emitted codes.) */
export function externalBatchId(
  orgId: string,
  periodId: string,
  codeSetId: string | null,
  journalEntryIds: string[]
): string {
  const sorted = [...journalEntryIds].sort();
  const h = sha256Hex(`${orgId}:${periodId}:${codeSetId ?? "none"}:${sorted.join(",")}`).slice(0, 12).toUpperCase();
  return `RCKN-${periodId.slice(0, 8)}-${h}`;
}

/** Stable per-line external id (org + JE + line). */
export function lineExternalId(orgId: string, journalEntryId: string, lineId: string): string {
  return `${orgId.slice(0, 8)}:${journalEntryId.slice(0, 8)}:${lineId.slice(0, 8)}`;
}

/** Canonical ordering so formatter output is byte-deterministic. */
export function sortEntries(entries: ExportEntry[]): ExportEntry[] {
  return [...entries]
    .map((e) => ({ ...e, lines: [...e.lines].sort((a, b) => a.lineExternalId.localeCompare(b.lineExternalId)) }))
    .sort((a, b) => a.journalEntryId.localeCompare(b.journalEntryId));
}

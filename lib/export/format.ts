import { createHash } from "crypto";
import type { ExportEntry } from "./types";

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

/** Deterministic, stable batch id from org + period + the EXACT JE set. The
 * re-import idempotency anchor: same set → same id, regardless of when/how often. */
export function externalBatchId(orgId: string, periodId: string, journalEntryIds: string[]): string {
  const sorted = [...journalEntryIds].sort();
  const h = sha256Hex(`${orgId}:${periodId}:${sorted.join(",")}`).slice(0, 12).toUpperCase();
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

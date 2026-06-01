/**
 * Anomaly detection thresholds. Tune based on customer feedback.
 */

/** Flag spike if daily > mean + SPIKE_STDDEV_MULTIPLIER * stddev */
export const SPIKE_STDDEV_MULTIPLIER = 3;

/** Flag sudden_increase if daily > SUDDEN_INCREASE_MULTIPLIER * trailing 7-day avg */
export const SUDDEN_INCREASE_MULTIPLIER = 3;

/** Don't alert on changes below this absolute dollar amount (micros) */
export const MIN_ABSOLUTE_CHANGE_MICROS = 5_000_000; // $5

/** Minimum days of history required before running detection */
export const MIN_HISTORY_DAYS = 7;

/** Don't re-flag same developer + kind within this window */
export const DEDUP_WINDOW_HOURS = 24;

/** Severity thresholds (multiples of trailing 7-day avg) */
export const SEVERITY_INFO_MAX = 5; // 3-5x = info
export const SEVERITY_WARN_MAX = 10; // 5-10x = warn
// >10x = critical

// --- Workflow cost-per-run detector (Phase 8.6) ---
// Reuses the same thresholding approach (spike: mean + N·stddev; sudden: N×
// baseline) applied to per-run cost instead of per-developer daily spend.

/** Minimum total runs in the baseline window before a workflow can alert. */
export const MIN_WORKFLOW_BASELINE_RUNS = 10;
/** Minimum runs in the recent day before it can alert (kills single-run noise). */
export const MIN_WORKFLOW_RECENT_RUNS = 3;
/** Don't alert on per-run cost changes below this absolute amount (micros). */
export const MIN_WORKFLOW_ABS_CHANGE_MICROS = 1_000_000; // $1 / run

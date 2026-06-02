/**
 * Central registry of all cron schedules.
 * Every cron in the app should reference a constant from here.
 */

export const CRON_HOURLY_INGESTION = "0 * * * *"; // Every hour
export const CRON_DAILY_DIGEST = "*/15 * * * *"; // Every 15 min (checks org local time)
export const CRON_DAILY_RETENTION = "0 3 * * *"; // 03:00 UTC daily
export const CRON_HOURLY_OBSERVABILITY = "30 * * * *"; // Hourly, offset from ingestion
export const CRON_MONTHLY_INVOICES = "0 4 2 * *"; // 04:00 UTC on the 2nd of each month
export const CRON_WEEKLY_COMMITMENTS = "0 5 * * 1"; // 05:00 UTC Mondays
export const CRON_WEEKLY_MARGIN = "0 6 * * 1"; // 06:00 UTC Mondays (after commitments)

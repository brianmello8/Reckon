/**
 * Central registry of all cron schedules.
 * Every cron in the app should reference a constant from here.
 */

export const CRON_HOURLY_INGESTION = "0 * * * *"; // Every hour
export const CRON_DAILY_DIGEST = "*/15 * * * *"; // Every 15 min (checks org local time)
export const CRON_DAILY_RETENTION = "0 3 * * *"; // 03:00 UTC daily

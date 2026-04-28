// =============================================================================
// Cron format: "minute hour day-of-month month day-of-week"
//
//  ┌─────────── minute       (0–59)
//  │ ┌───────── hour         (0–23)
//  │ │ ┌─────── day of month (1–31)
//  │ │ │ ┌───── month        (1–12)
//  │ │ │ │ ┌─── day of week  (0–7, 0 and 7 = Sunday)
//  │ │ │ │ │
//  * * * * *
//
// Special characters:
//   *   — any value ("every")
//   ,   — list of values,   e.g. "1,3,5" = on 1st, 3rd and 5th
//   -   — range,            e.g. "9-17"  = from 9 to 17
//   /   — step,             e.g. "*/15"  = every 15 units
//
// Examples:
//   "0 9 * * *"     — every day at 09:00
//   "0 9 * * 1-5"   — weekdays (Mon–Fri) at 09:00
//   "0 9 * * 0"     — every Sunday at 09:00
//   "*/15 * * * *"  — every 15 minutes
//   "0 */2 * * *"   — every 2 hours (at :00)
//   "0 9,18 * * *"  — at 09:00 and 18:00 every day
//   "0 3 1 * *"     — on the 1st of every month at 03:00
// =============================================================================

export const SCHEDULER_CONFIG = {
  // Morning reminders + Sunday review
  morningReminderCron: "0 9 * * *", // every day at 09:00

  // Check for 1-hour-before reminders
  hourlyCheckCron: "* * * * *", // every minute

  // Weekly report — every Sunday at 20:00
  weeklyReportCron: "0 20 * * 0", // every Sunday at 20:00

  // Cleanup old scheduled tasks
  cleanupCron: "0 3 * * *", // every day at 03:00

  // How many days back to keep scheduled tasks
  cleanupOlderThanDays: 7,
};

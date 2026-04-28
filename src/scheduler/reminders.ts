import cron from "node-cron";
import type { Bot } from "grammy";
import type { BotContext } from "../bot/context.js";
import type { ScheduledTaskRepository } from "../bot/repositories/scheduled-task.repository.js";
import type { TickTickTokenRepository } from "../bot/repositories/ticktick-token.repository.js";
import type { WeeklyReportRepository } from "../bot/repositories/weekly-report.repository.js";
import { generateWeeklyReport } from "../bot/services/weekly-report.service.js";
import { SCHEDULER_CONFIG } from "./config.js";

export function startScheduler(
  bot: Bot<BotContext>,
  scheduledTaskRepo: ScheduledTaskRepository,
  tokenRepo: TickTickTokenRepository,
  reportRepo: WeeklyReportRepository
): void {
  // Every day at 09:00 — morning reminders
  cron.schedule(SCHEDULER_CONFIG.morningReminderCron, async () => {
    const now = new Date();

    const tasks = await scheduledTaskRepo.getPendingMorning(now);
    for (const task of tasks) {
      const timeStr = task.isAllDay
        ? ""
        : ` в ${task.dueDate.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}`;

      await bot.api.sendMessage(
        task.userId,
        `🌅 Напоминание на сегодня:\n\n📝 ${task.title}${timeStr}`
      ).catch(() => {});

      await scheduledTaskRepo.markMorning(task.id);
    }
  });

  // Every minute — 1h before reminders
  cron.schedule(SCHEDULER_CONFIG.hourlyCheckCron, async () => {
    const now = new Date();
    const in60 = new Date(now.getTime() + 60 * 60 * 1000);
    const in61 = new Date(now.getTime() + 61 * 60 * 1000);

    const tasks = await scheduledTaskRepo.getPendingHour(in60, in61);
    for (const task of tasks) {
      const timeStr = task.dueDate.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });

      await bot.api.sendMessage(
        task.userId,
        `⏰ Через час (в ${timeStr}):\n\n📝 ${task.title}`
      ).catch(() => {});

      await scheduledTaskRepo.markHour(task.id);
    }
  });

  // Every Sunday at 20:00 — weekly report
  cron.schedule(SCHEDULER_CONFIG.weeklyReportCron, async () => {
    const tokens = await tokenRepo.findAll();
    for (const token of tokens) {
      try {
        const report = await generateWeeklyReport(token.userId, tokenRepo, reportRepo);
        if (!report) continue;
        await bot.api.sendMessage(token.userId, report).catch(() => {});
      } catch { /* skip */ }
    }
  });

  // Every day at 03:00 — cleanup old tasks
  cron.schedule(SCHEDULER_CONFIG.cleanupCron, async () => {
    const weekAgo = new Date(Date.now() - SCHEDULER_CONFIG.cleanupOlderThanDays * 24 * 60 * 60 * 1000);
    await scheduledTaskRepo.deleteOld(weekAgo);
  });
}

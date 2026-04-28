import { Composer, InlineKeyboard } from "grammy";
import type { BotContext } from "../context.js";
import { generateWeeklyReport } from "../services/weekly-report.service.js";

const composer = new Composer<BotContext>();

composer.command("report", async (ctx) => {
  const reports = await ctx.weeklyReportRepo.findRecent(ctx.from!.id, 5);

  if (reports.length === 0) {
    await ctx.reply("📊 Отчётов пока нет. Первый отчёт появится в воскресенье в 20:00.");
    return;
  }

  const kb = new InlineKeyboard();
  for (const r of reports) {
    const label = r.weekStart.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
    kb.text(`Неделя с ${label} (${r.onTimePercent}% в срок)`, `report:view:${r.id}`).row();
  }
  kb.text("📊 Сгенерировать отчёт за эту неделю", "report:now");

  await ctx.reply("📋 Твои отчёты за последние недели:", { reply_markup: kb });
});

composer.callbackQuery("report:now", async (ctx) => {
  await ctx.answerCallbackQuery();
  const msg = await ctx.reply("⏳ Генерирую отчёт...");

  try {
    const report = await generateWeeklyReport(
      ctx.from.id,
      ctx.ticktickTokenRepo,
      ctx.weeklyReportRepo
    );

    if (!report) {
      await ctx.api.editMessageText(ctx.chat!.id, msg.message_id, "❌ Не удалось получить данные из TickTick.");
      return;
    }

    await ctx.api.editMessageText(ctx.chat!.id, msg.message_id, report);
  } catch (err) {
    ctx.logger.error({ err }, "Failed to generate weekly report");
    await ctx.api.editMessageText(ctx.chat!.id, msg.message_id, "❌ Ошибка при генерации отчёта.");
  }
});

composer.callbackQuery(/^report:view:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const id = parseInt(ctx.match[1]);
  const report = await ctx.weeklyReportRepo.findById(id);

  if (!report) {
    await ctx.reply("❌ Отчёт не найден.");
    return;
  }

  await ctx.reply(report.reportText);
});

export { composer as reportFeature };

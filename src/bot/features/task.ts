import { Composer } from "grammy";
import type { BotContext } from "../context.js";
import { processTask } from "../services/task.service.js";
import { formatTaskResult } from "../helpers/format.js";

const composer = new Composer<BotContext>();

const feature = composer.chatType("private");

feature.on("message:text", async (ctx) => {
  const text = ctx.message.text;

  if (text.startsWith("/")) return;

  const processingMsg = await ctx.reply("⏳ Анализирую задачу...");

  try {
    const result = await processTask(
      text,
      ctx.from.id,
      ctx.ticktickTokenRepo,
      ctx.settingsRepo,
      ctx.logger
    );

    await ctx.api.editMessageText(
      ctx.chat.id,
      processingMsg.message_id,
      formatTaskResult(text, result.analysis, result.projectName),
      { parse_mode: "MarkdownV2" }
    );
  } catch (err) {
    ctx.logger.error({ err }, "Failed to process task");

    if (err instanceof Error && err.message === "NOT_CONNECTED") {
      await ctx.api.editMessageText(
        ctx.chat.id,
        processingMsg.message_id,
        `❌ Сначала подключи TickTick через /connect`
      );
      return;
    }

    await ctx.api.editMessageText(
      ctx.chat.id,
      processingMsg.message_id,
      `❌ Не удалось обработать задачу. Попробуй ещё раз.`
    );
  }
});

export { composer as taskFeature };

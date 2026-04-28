import { Composer } from "grammy";
import type { BotContext } from "../context.js";
import { ADMIN_IDS } from "../../config.js";
import { groqUsage } from "../../stats/groq-usage.js";

const composer = new Composer<BotContext>();

composer.command("admin", async (ctx) => {
  if (!ctx.from || !ADMIN_IDS.includes(ctx.from.id)) {
    await ctx.reply("⛔ Нет доступа.");
    return;
  }

  const s = groqUsage.snapshot();
  const sinceStr = s.since.toLocaleString("ru-RU", {
    day: "numeric", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });

  const audioMin = Math.floor(s.audioSeconds / 60);
  const audioSec = s.audioSeconds % 60;
  const audioStr = audioMin > 0 ? `${audioMin} мин ${audioSec} сек` : `${audioSec} сек`;

  const lines = [
    `📊 Статистика Groq API`,
    ``,
    `🕐 С: ${sinceStr}`,
    ``,
    `🧠 Токены (анализ задач):`,
    `  • Входящие (prompt): ${s.promptTokens.toLocaleString()}`,
    `  • Исходящие (completion): ${s.completionTokens.toLocaleString()}`,
    `  • Итого: ${s.totalTokens.toLocaleString()}`,
    ``,
    `🎙 Аудио (голосовые/кружки):`,
    `  • Итого: ${audioStr}`,
    ``,
    `📋 Лимиты Groq (бесплатный тир):`,
    `  • Токены: 14 400 / мин, ~500 000 / день`,
    `  • Аудио Whisper: 7 200 сек / час (~2 часа в день)`,
  ];

  await ctx.reply(lines.join("\n"));
});

composer.callbackQuery("admin:reset", async (ctx) => {
  if (!ctx.from || !ADMIN_IDS.includes(ctx.from.id)) {
    await ctx.answerCallbackQuery("⛔ Нет доступа.");
    return;
  }
  groqUsage.reset();
  await ctx.answerCallbackQuery("✅ Счётчики сброшены");
  await ctx.editMessageText("✅ Статистика сброшена.");
});

export { composer as adminFeature };

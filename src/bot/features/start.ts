import { Composer } from "grammy";
import type { BotContext } from "../context.js";
import { mainMenuKeyboard } from "../helpers/keyboards.js";

const composer = new Composer<BotContext>();

composer.command("start", async (ctx) => {
  const name = ctx.from?.first_name ?? "друг";
  await ctx.reply(
    `Привет, ${name}! 👋\n\n` +
      `Я помогаю управлять задачами через TickTick.\n\n` +
      `Просто напиши задачу — я проанализирую её и добавлю в нужный список.\n` +
      `Или воспользуйся меню ниже:`,
    { reply_markup: mainMenuKeyboard() }
  );
});

composer.callbackQuery("menu:main", async (ctx) => {
  await ctx.editMessageText(
    `Главное меню — выбери действие:`,
    { reply_markup: mainMenuKeyboard() }
  );
  await ctx.answerCallbackQuery();
});

composer.callbackQuery("help:show", async (ctx) => {
  await ctx.editMessageText(
    `❓ Справка\n\n` +
      `Напиши любую задачу текстом, и я:\n` +
      `1. Определю название задачи\n` +
      `2. Оценю сложность и время\n` +
      `3. Назначу теги и приоритет\n` +
      `4. Добавлю в нужный список TickTick\n\n` +
      `Подсказки прямо в тексте:\n` +
      `• "высокий приоритет" / "низкий приоритет"\n` +
      `• "5 минут" / "30 минут" / "1 час"\n` +
      `• "сложная" / "простая"\n\n` +
      `Или используй Ручной режим для управления задачами вручную.`,
    { reply_markup: mainMenuKeyboard() }
  );
  await ctx.answerCallbackQuery();
});

export { composer as startFeature };

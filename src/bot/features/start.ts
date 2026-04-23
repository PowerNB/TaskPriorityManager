import { Composer } from "grammy";
import type { BotContext } from "../context.js";

const composer = new Composer<BotContext>();

composer.command("start", async (ctx) => {
  const name = ctx.from?.first_name ?? "друг";
  await ctx.reply(
    `Привет, ${name}! 👋\n\n` +
      `Я помогаю управлять задачами через TickTick.\n\n` +
      `*Как пользоваться:*\n` +
      `1. Подключи TickTick через /connect\n` +
      `2. Просто напиши задачу — я её проанализирую и добавлю\n\n` +
      `*Команды:*\n` +
      `/connect — подключить TickTick\n` +
      `/settings — настроить личные и карьерные цели\n` +
      `/help — подробная справка`,
    { parse_mode: "Markdown" }
  );
});

composer.command("help", async (ctx) => {
  await ctx.reply(
    `*Справка*\n\n` +
      `Напиши любую задачу, и я:\n` +
      `1. Добавлю её в TickTick\n` +
      `2. Определю сложность и время выполнения\n` +
      `3. Назначу теги и приоритет\n` +
      `4. Перемещу в нужную папку по времени\n\n` +
      `*Подсказки в тексте задачи:*\n` +
      `• "высокий приоритет" / "низкий приоритет"\n` +
      `• "5 минут" / "30 минут" / "1 час"\n` +
      `• "сложная" / "простая"\n\n` +
      `*Папки:*\n` +
      `• 5 минут\n` +
      `• 30 минут\n` +
      `• 1 час\n` +
      `• Более 2-х часов - проекты\n\n` +
      `*Настройки:*\n` +
      `/connect — подключить TickTick (нужен Client ID и Secret)\n` +
      `/settings — личные и карьерные цели`,
    { parse_mode: "Markdown" }
  );
});

export { composer as startFeature };

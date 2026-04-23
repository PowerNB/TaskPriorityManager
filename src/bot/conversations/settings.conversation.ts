import type { Conversation } from "@grammyjs/conversations";
import type { BotContext } from "../context.js";
import type { SettingsRepository } from "../repositories/settings.repository.js";

type SettingsConversation = Conversation<BotContext, BotContext>;

export function makeSetPersonalGoalsConversation(settingsRepo: SettingsRepository) {
  return async function setPersonalGoalsConversation(
    conversation: SettingsConversation,
    ctx: BotContext
  ): Promise<void> {
    const userId = ctx.from!.id;

    await ctx.reply(
      `📝 Личные цели\n\n` +
        `Опиши свои личные цели (например: похудеть, читать больше книг, учить английский).\n\n` +
        `Это поможет боту правильно расставлять приоритеты задач.\n\n` +
        `Напиши цели или отправь /skip чтобы пропустить:`
    );

    const response = await conversation.waitFor("message:text");
    const text = response.message.text;

    if (text === "/skip") {
      await ctx.reply("Пропущено.");
      return;
    }

    await conversation.external(() => settingsRepo.update(userId, { personalGoals: text }));
    await ctx.reply(`✅ Личные цели сохранены!`);
  };
}

export function makeSetCareerGoalsConversation(settingsRepo: SettingsRepository) {
  return async function setCareerGoalsConversation(
    conversation: SettingsConversation,
    ctx: BotContext
  ): Promise<void> {
    const userId = ctx.from!.id;

    await ctx.reply(
      `💼 Карьерные цели\n\n` +
        `Опиши свои карьерные цели (например: стать тимлидом, выучить TypeScript, запустить стартап).\n\n` +
        `Напиши цели или отправь /skip чтобы пропустить:`
    );

    const response = await conversation.waitFor("message:text");
    const text = response.message.text;

    if (text === "/skip") {
      await ctx.reply("Пропущено.");
      return;
    }

    await conversation.external(() => settingsRepo.update(userId, { careerGoals: text }));
    await ctx.reply(`✅ Карьерные цели сохранены!`);
  };
}

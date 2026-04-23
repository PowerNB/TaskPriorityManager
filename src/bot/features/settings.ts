import { Composer } from "grammy";
import { createConversation } from "@grammyjs/conversations";
import type { BotContext } from "../context.js";
import type { SettingsRepository } from "../repositories/settings.repository.js";
import {
  makeSetPersonalGoalsConversation,
  makeSetCareerGoalsConversation,
} from "../conversations/settings.conversation.js";

export function createSettingsFeature(settingsRepo: SettingsRepository): Composer<BotContext> {
  const composer = new Composer<BotContext>();

  composer.use(
    createConversation<BotContext, BotContext>(
      makeSetPersonalGoalsConversation(settingsRepo),
      "setPersonalGoalsConversation"
    )
  );
  composer.use(
    createConversation<BotContext, BotContext>(
      makeSetCareerGoalsConversation(settingsRepo),
      "setCareerGoalsConversation"
    )
  );

  const feature = composer.chatType("private");

  feature.command("settings", async (ctx) => {
    const settings = await settingsRepo.findByUserId(ctx.from.id);

    const personalGoals = settings?.personalGoals || "не указаны";
    const careerGoals = settings?.careerGoals || "не указаны";

    await ctx.reply(
      `⚙️ Настройки\n\n` +
        `👤 Личные цели:\n${personalGoals}\n\n` +
        `💼 Карьерные цели:\n${careerGoals}\n\n` +
        `Что изменить?\n` +
        `/personal_goals — изменить личные цели\n` +
        `/career_goals — изменить карьерные цели`
    );
  });

  feature.command("personal_goals", async (ctx) => {
    await ctx.conversation.enter("setPersonalGoalsConversation");
  });

  feature.command("career_goals", async (ctx) => {
    await ctx.conversation.enter("setCareerGoalsConversation");
  });

  return composer;
}

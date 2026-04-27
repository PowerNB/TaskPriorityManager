import { Composer } from "grammy";
import { createConversation } from "@grammyjs/conversations";
import type { BotContext } from "../context.js";
import type { SettingsRepository } from "../repositories/settings.repository.js";
import {
  makeSetPersonalGoalsConversation,
  makeSetCareerGoalsConversation,
} from "../conversations/settings.conversation.js";
import { settingsMenuKeyboard, mainMenuKeyboard } from "../helpers/keyboards.js";

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

  async function showSettings(ctx: BotContext, edit = false): Promise<void> {
    const settings = await settingsRepo.findByUserId(ctx.from!.id);
    const personal = settings?.personalGoals || "не указаны";
    const career = settings?.careerGoals || "не указаны";

    const text =
      `⚙️ Настройки\n\n` +
      `👤 Личные цели:\n${personal}\n\n` +
      `💼 Карьерные цели:\n${career}`;

    if (edit) {
      await ctx.editMessageText(text, { reply_markup: settingsMenuKeyboard() });
    } else {
      await ctx.reply(text, { reply_markup: settingsMenuKeyboard() });
    }
  }

  composer.command("settings", async (ctx) => showSettings(ctx, false));

  composer.callbackQuery("settings:menu", async (ctx) => {
    await showSettings(ctx, true);
    await ctx.answerCallbackQuery();
  });

  composer.callbackQuery("settings:personal", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.conversation.enter("setPersonalGoalsConversation");
  });

  composer.callbackQuery("settings:career", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.conversation.enter("setCareerGoalsConversation");
  });

  // Legacy commands
  composer.command("personal_goals", async (ctx) => {
    await ctx.conversation.enter("setPersonalGoalsConversation");
  });
  composer.command("career_goals", async (ctx) => {
    await ctx.conversation.enter("setCareerGoalsConversation");
  });

  return composer;
}

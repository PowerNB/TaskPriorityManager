import { Composer } from "grammy";
import type { BotContext } from "../context.js";
import type { SettingsRepository } from "../repositories/settings.repository.js";
import { settingsMenuKeyboard } from "../helpers/keyboards.js";

export function createSettingsFeature(settingsRepo: SettingsRepository): Composer<BotContext> {
  const composer = new Composer<BotContext>();

  async function showSettings(ctx: BotContext, edit = false): Promise<void> {
    const text = `⚙️ Настройки`;
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

  return composer;
}

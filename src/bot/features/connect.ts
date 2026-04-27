import { Composer } from "grammy";
import { createConversation } from "@grammyjs/conversations";
import type { BotContext } from "../context.js";
import type { TickTickTokenRepository } from "../repositories/ticktick-token.repository.js";
import { makeConnectConversation } from "../conversations/connect.conversation.js";
import { mainMenuKeyboard } from "../helpers/keyboards.js";

export function createConnectFeature(tokenRepo: TickTickTokenRepository): Composer<BotContext> {
  const composer = new Composer<BotContext>();

  const conversationFn = makeConnectConversation(tokenRepo);
  composer.use(
    createConversation<BotContext, BotContext>(conversationFn, "connectTickTickConversation")
  );

  async function enterConnect(ctx: BotContext): Promise<void> {
    const existing = await tokenRepo.findByUserId(ctx.from!.id);
    if (existing && existing.expiresAt > new Date()) {
      await ctx.reply(
        `✅ TickTick уже подключён!\n\nЧтобы переподключить, сначала отключи через кнопку в Настройках.`,
        { reply_markup: mainMenuKeyboard() }
      );
      return;
    }
    await ctx.conversation.enter("connectTickTickConversation");
  }

  composer.command("connect", async (ctx) => enterConnect(ctx));

  composer.callbackQuery("connect:start", async (ctx) => {
    await ctx.answerCallbackQuery();
    await enterConnect(ctx);
  });

  composer.callbackQuery("connect:disconnect", async (ctx) => {
    await tokenRepo.delete(ctx.from.id);
    await ctx.editMessageText(
      `✅ TickTick отключён. Данные приложения удалены.`,
      { reply_markup: mainMenuKeyboard() }
    );
    await ctx.answerCallbackQuery();
  });

  composer.command("disconnect", async (ctx) => {
    await tokenRepo.delete(ctx.from!.id);
    await ctx.reply(`✅ TickTick отключён.`, { reply_markup: mainMenuKeyboard() });
  });

  return composer;
}

import { Composer } from "grammy";
import { createConversation } from "@grammyjs/conversations";
import type { BotContext } from "../context.js";
import type { TickTickTokenRepository } from "../repositories/ticktick-token.repository.js";
import { makeConnectConversation } from "../conversations/connect.conversation.js";

export function createConnectFeature(tokenRepo: TickTickTokenRepository): Composer<BotContext> {
  const composer = new Composer<BotContext>();

  const conversationFn = makeConnectConversation(tokenRepo);
  composer.use(
    createConversation<BotContext, BotContext>(conversationFn, "connectTickTickConversation")
  );

  const feature = composer.chatType("private");

  feature.command("connect", async (ctx) => {
    const existing = await tokenRepo.findByUserId(ctx.from.id);

    if (existing && existing.expiresAt > new Date()) {
      await ctx.reply(
        `✅ TickTick уже подключён!\n\nЧтобы переподключить, отправь /disconnect, затем /connect`
      );
      return;
    }

    await ctx.conversation.enter("connectTickTickConversation");
  });

  feature.command("disconnect", async (ctx) => {
    await tokenRepo.delete(ctx.from.id);
    await ctx.reply("✅ TickTick отключён. Данные приложения удалены.");
  });

  return composer;
}

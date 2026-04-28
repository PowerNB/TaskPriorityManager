import type { NextFunction } from "grammy";
import type { BotContext } from "../context.js";
import { appConfig } from "../../config.js";

export async function authMiddleware(ctx: BotContext, next: NextFunction): Promise<void> {
  if (!ctx.from) {
    await next();
    return;
  }

  // If whitelist group is configured — enforce membership for private chats only
  if (appConfig.WHITELIST_GROUP_ID && ctx.chat?.type === "private") {
    const allowed = await ctx.whitelistRepo.has(ctx.from.id);
    if (!allowed) {
      if (ctx.callbackQuery) await ctx.answerCallbackQuery();
      else if (ctx.message) await ctx.reply("⛔ У тебя нет доступа к этому боту.");
      return;
    }
  }

  try {
    await ctx.userRepo.upsert({
      id: ctx.from.id,
      username: ctx.from.username,
      firstName: ctx.from.first_name,
    });
  } catch (err) {
    ctx.logger.error({ err }, "Failed to upsert user in auth middleware");
  }

  await next();
}

import type { NextFunction } from "grammy";
import type { BotContext } from "../context.js";
import { appConfig } from "../../config.js";

async function isGroupMember(ctx: BotContext, userId: number): Promise<boolean> {
  try {
    const groupId = Number(appConfig.WHITELIST_GROUP_ID);
    const member = await ctx.api.getChatMember(groupId, userId);
    return ["member", "administrator", "creator"].includes(member.status);
  } catch {
    return false;
  }
}

export async function authMiddleware(ctx: BotContext, next: NextFunction): Promise<void> {
  if (!ctx.from) {
    await next();
    return;
  }

  // If whitelist group is configured — enforce membership for private chats only
  if (appConfig.WHITELIST_GROUP_ID && ctx.chat?.type === "private") {
    const allowed = await isGroupMember(ctx, ctx.from.id);
    if (!allowed) {
      ctx.logger.warn({ userId: ctx.from.id, username: ctx.from.username }, "Unauthorized access attempt");
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

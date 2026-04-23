import type { NextFunction } from "grammy";
import type { BotContext } from "../context.js";

export async function authMiddleware(ctx: BotContext, next: NextFunction): Promise<void> {
  if (!ctx.from) {
    await next();
    return;
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

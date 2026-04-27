import type { Conversation } from "@grammyjs/conversations";
import type { BotContext } from "../context.js";
import type { TickTickTokenRepository } from "../repositories/ticktick-token.repository.js";
import { createTickTickClient } from "../../ticktick/client.js";
import { manualMenuKeyboard } from "../helpers/keyboards.js";

type ManualConversation = Conversation<BotContext, BotContext>;

export function makeManualCreateProjectConversation(tokenRepo: TickTickTokenRepository) {
  return async function manualCreateProjectConversation(
    conversation: ManualConversation,
    ctx: BotContext
  ): Promise<void> {
    const userId = ctx.from!.id;

    await ctx.reply(`📁 Создать список\n\nВведи название нового списка:\n\n/cancel — отмена`);

    const nameMsg = await conversation.waitFor("message:text");
    const name = nameMsg.message.text.trim();

    if (name === "/cancel") {
      await ctx.reply("Отменено.", { reply_markup: manualMenuKeyboard() });
      return;
    }

    const result = await conversation.external(async () => {
      try {
        const token = await tokenRepo.findByUserId(userId);
        if (!token) return { ok: false, message: "TickTick не подключён" } as const;
        const client = createTickTickClient(token, userId, tokenRepo);
        const project = await client.createProject(name);
        return { ok: true, project } as const;
      } catch (err) {
        return {
          ok: false,
          message: err instanceof Error ? err.message : String(err),
        } as const;
      }
    });

    if (result.ok) {
      await ctx.reply(`✅ Список "${result.project.name}" создан.`, {
        reply_markup: manualMenuKeyboard(),
      });
    } else {
      await ctx.reply(`❌ Ошибка: ${result.message}`, { reply_markup: manualMenuKeyboard() });
    }
  };
}

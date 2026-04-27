import type { Conversation } from "@grammyjs/conversations";
import type { BotContext } from "../context.js";
import type { TickTickTokenRepository } from "../repositories/ticktick-token.repository.js";
import { createTickTickClient } from "../../ticktick/client.js";
import { manualMenuKeyboard } from "../helpers/keyboards.js";

type ManualConversation = Conversation<BotContext, BotContext>;

interface ConversationArgs {
  projectName?: string;
  taskId?: string;
  projectId?: string;
  editMode?: boolean;
}

export function makeManualCreateConversation(tokenRepo: TickTickTokenRepository) {
  return async function manualCreateConversation(
    conversation: ManualConversation,
    ctx: BotContext,
    args?: ConversationArgs
  ): Promise<void> {
    const userId = ctx.from!.id;
    const editMode = args?.editMode ?? false;
    const taskId = args?.taskId;
    const projectId = args?.projectId;
    const projectName = args?.projectName;

    if (editMode && taskId) {
      await ctx.reply(`✏️ Введи новое название задачи:\n\n/cancel — отмена`);
    } else {
      await ctx.reply(
        `➕ Создать задачу в "${projectName}"\n\nВведи название задачи:\n\n/cancel — отмена`
      );
    }

    const titleMsg = await conversation.waitFor("message:text");
    const title = titleMsg.message.text.trim();

    if (title === "/cancel") {
      await ctx.reply("Отменено.", { reply_markup: manualMenuKeyboard() });
      return;
    }

    const result = await conversation.external(async () => {
      try {
        const token = await tokenRepo.findByUserId(userId);
        if (!token) return { ok: false, message: "TickTick не подключён" } as const;

        const client = createTickTickClient(token, userId, tokenRepo);

        if (editMode && taskId) {
          await client.updateTask(taskId, { title, projectId });
          return { ok: true, action: "edited" } as const;
        } else {
          if (!projectId) return { ok: false, message: "Список не найден" } as const;
          await client.createTask({ title, projectId });
          return { ok: true, action: "created" } as const;
        }
      } catch (err) {
        return {
          ok: false,
          message: err instanceof Error ? err.message : String(err),
        } as const;
      }
    });

    if (result.ok) {
      const msg = result.action === "edited"
        ? `✅ Задача обновлена: "${title}"`
        : `✅ Задача "${title}" добавлена в "${projectName}"`;
      await ctx.reply(msg, { reply_markup: manualMenuKeyboard() });
    } else {
      await ctx.reply(`❌ Ошибка: ${result.message}`, { reply_markup: manualMenuKeyboard() });
    }
  };
}

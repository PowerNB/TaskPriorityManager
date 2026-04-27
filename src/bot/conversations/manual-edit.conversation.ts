import type { Conversation } from "@grammyjs/conversations";
import { InlineKeyboard } from "grammy";
import type { BotContext } from "../context.js";
import type { TickTickTokenRepository } from "../repositories/ticktick-token.repository.js";
import { createTickTickClient } from "../../ticktick/client.js";
import { DURATION_TAGS } from "../../ticktick/projects.js";
import { manualMenuKeyboard } from "../helpers/keyboards.js";

type ManualConversation = Conversation<BotContext, BotContext>;

interface EditArgs {
  taskId: string;
  projectId: string;
  taskTitle: string;
}

const editOptionsKeyboard = () =>
  new InlineKeyboard()
    .text("📝 Название",     "mef:title").row()
    .text("⏱ Временной тег", "mef:duration").row()
    .text("📁 Лист",          "mef:project").row()
    .text("✅ Готово",        "mef:done");

export function makeManualEditConversation(tokenRepo: TickTickTokenRepository) {
  return async function manualEditConversation(
    conversation: ManualConversation,
    ctx: BotContext,
    args?: EditArgs
  ): Promise<void> {
    if (!args) return;
    const { taskId, projectId, taskTitle } = args;
    const userId = ctx.from!.id;

    while (true) {
      await ctx.reply(
        `✏️ Редактирование: "${taskTitle}"\n\nЧто хочешь изменить?`,
        { reply_markup: editOptionsKeyboard() }
      );

      const fieldCtx = await conversation.waitFor("callback_query:data");
      const field = fieldCtx.callbackQuery.data;
      await fieldCtx.answerCallbackQuery();

      if (field === "mef:done") {
        await ctx.reply("Готово.", { reply_markup: manualMenuKeyboard() });
        return;
      }

      if (field === "mef:title") {
        await ctx.reply("Введи новое название:\n\n/cancel — отмена");
        const msg = await conversation.waitFor("message:text");
        const newTitle = msg.message.text.trim();
        if (newTitle === "/cancel") continue;

        await conversation.external(async () => {
          const token = await tokenRepo.findByUserId(userId);
          if (!token) return;
          const client = createTickTickClient(token, userId, tokenRepo);
          await client.updateTask(taskId, { title: newTitle, projectId });
        });
        await ctx.reply(`✅ Название изменено на "${newTitle}"`);

      } else if (field === "mef:duration") {
        const kb = new InlineKeyboard()
          .text("5 минут",  "med:5min").row()
          .text("30 минут", "med:30min").row()
          .text("1 час",    "med:1hour").row()
          .text("2 часа+",  "med:2hours+").row();
        await ctx.reply("Выбери временной тег:", { reply_markup: kb });

        const tagCtx = await conversation.waitFor("callback_query:data");
        const tagData = tagCtx.callbackQuery.data;
        await tagCtx.answerCallbackQuery();
        const duration = tagData.replace("med:", "");

        await conversation.external(async () => {
          const token = await tokenRepo.findByUserId(userId);
          if (!token) return;
          const client = createTickTickClient(token, userId, tokenRepo);
          await client.updateTask(taskId, { projectId, tags: [DURATION_TAGS[duration] ?? duration] });
        });
        await ctx.reply(`✅ Тег изменён`);

      } else if (field === "mef:project") {
        const projects = await conversation.external(async () => {
          const token = await tokenRepo.findByUserId(userId);
          if (!token) return [];
          const client = createTickTickClient(token, userId, tokenRepo);
          return client.getProjects();
        });

        const kb = new InlineKeyboard();
        for (const p of projects) {
          kb.text(p.name, `mep:${p.id}`).row();
        }
        await ctx.reply("Выбери лист:", { reply_markup: kb });

        const projCtx = await conversation.waitFor("callback_query:data");
        const projData = projCtx.callbackQuery.data;
        await projCtx.answerCallbackQuery();
        const newProjectId = projData.replace("mep:", "");

        await conversation.external(async () => {
          const token = await tokenRepo.findByUserId(userId);
          if (!token) return;
          const client = createTickTickClient(token, userId, tokenRepo);
          await client.updateTask(taskId, { projectId: newProjectId });
        });
        await ctx.reply(`✅ Лист изменён`);
      }
    }
  };
}

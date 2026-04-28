import { Composer, InlineKeyboard } from "grammy";
import type { BotContext } from "../context.js";
import { routeTask, executeAction } from "../services/task.service.js";
import { formatTaskResult } from "../helpers/format.js";
import { createTickTickClient } from "../../ticktick/client.js";
import { DURATION_TAGS } from "../../ticktick/projects.js";
import type { TaskIntentAnalysis } from "../types/index.js";
import type { TickTickTask } from "../../ticktick/client.js";
import { transcribeOgg } from "../../voice/transcriber.js";

const composer = new Composer<BotContext>();
const feature = composer.chatType("private");

// Main text handler
feature.on("message:text", async (ctx, next) => {
  // If waiting for a title edit — handle first
  const pending = ctx.session.pendingEditTask;
  if (pending?.field === "title") {
    const text = ctx.message.text.trim();
    if (text.startsWith("/")) return next();

    ctx.session.pendingEditTask = undefined;
    const editing = ctx.session.editingTask;
    if (!editing) return;

    try {
      const token = await ctx.ticktickTokenRepo.findByUserId(ctx.from.id);
      if (!token) { await ctx.reply("TickTick не подключён"); return; }
      const client = createTickTickClient(token, ctx.from.id, ctx.ticktickTokenRepo);
      await client.updateTask(editing.taskId, { title: text, projectId: editing.projectId });
      await ctx.reply(`✅ Название изменено на "${text}"`, { reply_markup: editMenuKeyboard() });
    } catch (err) {
      ctx.logger.error({ err }, "Failed to update title");
      await ctx.reply("❌ Ошибка при изменении названия.");
    }
    return;
  }

  const text = ctx.message.text;
  if (text.startsWith("/")) return next();

  const processingMsg = await ctx.reply("⏳ Анализирую...");

  try {
    const routed = await routeTask(
      text,
      ctx.from.id,
      ctx.ticktickTokenRepo,
      ctx.logger
    );

    if (routed.type === "create") {
      await ctx.api.editMessageText(
        ctx.chat.id,
        processingMsg.message_id,
        formatTaskResult(routed.result.analysis, routed.result.projectName),
        { reply_markup: afterActionKeyboard() }
      );
      return;
    }

    const { result } = routed;

    if (result.status === "done") {
      await ctx.api.editMessageText(ctx.chat.id, processingMsg.message_id, result.message!, { reply_markup: afterActionKeyboard() });
      return;
    }

    if (result.intent === "list") {
      const tasks = result.tasks ?? [];
      if (tasks.length === 0) {
        await ctx.api.editMessageText(ctx.chat.id, processingMsg.message_id, "📋 Задач не найдено.", { reply_markup: afterActionKeyboard() });
        return;
      }
      const byProject = new Map<string, typeof tasks>();
      for (const t of tasks) {
        const key = t.projectName ?? "Без списка";
        if (!byProject.has(key)) byProject.set(key, []);
        byProject.get(key)!.push(t);
      }
      const lines: string[] = ["📋 Твои задачи:\n"];
      for (const [project, ptasks] of byProject) {
        lines.push(`📁 ${project}`);
        for (const t of ptasks) lines.push(`  • ${t.title}`);
        lines.push("");
      }
      const text = lines.join("\n").trim();
      await ctx.api.editMessageText(ctx.chat.id, processingMsg.message_id, text, { reply_markup: afterActionKeyboard() });
      return;
    }

    // found or needs_info — show task list
    const tasks = result.tasks!;
    const kb = new InlineKeyboard();
    for (let i = 0; i < Math.min(tasks.length, 10); i++) {
      const task = tasks[i];
      const label = `${task.title}${task.projectName ? ` [${task.projectName}]` : ""}`.slice(0, 64);
      kb.text(label, `ta:${result.intent}:${i}`).row();
    }
    kb.text("❌ Отмена", "ta:cancel:0");

    // Store tasks list in session
    ctx.session.pendingIntentAnalysis = result.intentAnalysis;
    ctx.session.editingTask = undefined;
    // Store tasks as JSON in session - we'll use index
    ctx.session.pendingTasks = tasks.map((t) => ({ id: t.id!, projectId: t.projectId, title: t.title }));

    const verb = result.intent === "delete" ? "удалить" : result.intent === "complete" ? "завершить" : "редактировать";
    await ctx.api.editMessageText(
      ctx.chat.id,
      processingMsg.message_id,
      `Выбери задачу для действия "${verb}":`,
      { reply_markup: kb }
    );
  } catch (err) {
    ctx.logger.error({ err }, "Failed to process task");
    const msg = err instanceof Error && err.message === "NOT_CONNECTED"
      ? "❌ Сначала подключи TickTick через /connect"
      : "❌ Не удалось обработать задачу. Попробуй ещё раз.";
    await ctx.api.editMessageText(ctx.chat.id, processingMsg.message_id, msg);
  }
});

// Task selected from list
feature.callbackQuery(/^ta:([^:]+):(\d+)$/, async (ctx) => {
  const [, intent, indexStr] = ctx.match;
  await ctx.answerCallbackQuery();

  if (intent === "cancel") {
    await ctx.editMessageText("Отменено.", { reply_markup: afterActionKeyboard() });
    return;
  }

  const tasks = ctx.session.pendingTasks;
  const task = tasks?.[parseInt(indexStr)];
  if (!task) { await ctx.editMessageText("❌ Задача не найдена."); return; }

  try {
    const token = await ctx.ticktickTokenRepo.findByUserId(ctx.from.id);
    if (!token) return;
    const client = createTickTickClient(token, ctx.from.id, ctx.ticktickTokenRepo);
    const intentAnalysis = (ctx.session.pendingIntentAnalysis ?? { intent }) as TaskIntentAnalysis;
    const fullTask: TickTickTask & { projectId: string } = { title: task.title, id: task.id, projectId: task.projectId };

    if (intent === "edit") {
      const hasFields = intentAnalysis.editFields && Object.keys(intentAnalysis.editFields).length > 0;
      if (hasFields) {
        await executeAction(intentAnalysis, fullTask, client);
        await ctx.editMessageText(`✅ Задача "${task.title}" обновлена.`, { reply_markup: afterActionKeyboard() });
      } else {
        ctx.session.editingTask = { taskId: task.id, projectId: task.projectId, taskTitle: task.title };
        await ctx.editMessageText(`✏️ Редактирование: "${task.title}"\n\nЧто хочешь изменить?`, {
          reply_markup: editMenuKeyboard(),
        });
      }
      return;
    }

    await executeAction(intentAnalysis, fullTask, client);
    const verb = intent === "delete" ? "удалена" : "завершена";
    await ctx.editMessageText(`✅ Задача "${task.title}" ${verb}.`, { reply_markup: afterActionKeyboard() });
  } catch (err) {
    ctx.logger.error({ err }, "Failed to execute action");
    await ctx.editMessageText("❌ Ошибка при выполнении действия.");
  }
});

// Edit field selected
feature.callbackQuery(/^tef:(.+)$/, async (ctx) => {
  const field = ctx.match[1];
  const editing = ctx.session.editingTask;
  if (!editing) { await ctx.answerCallbackQuery("Сессия устарела"); return; }

  await ctx.answerCallbackQuery();

  if (field === "done") {
    ctx.session.editingTask = undefined;
    await ctx.editMessageText("✅ Редактирование завершено.", { reply_markup: afterActionKeyboard() });
    return;
  }

  if (field === "title") {
    ctx.session.pendingEditTask = { taskId: editing.taskId, projectId: editing.projectId, field: "title" };
    await ctx.editMessageText("Введи новое название задачи:");
    return;
  }

  if (field === "duration") {
    const kb = new InlineKeyboard()
      .text("5 минут",  "tea:dur:5min").row()
      .text("30 минут", "tea:dur:30min").row()
      .text("1 час",    "tea:dur:1hour").row()
      .text("2 часа+",  "tea:dur:2hours+").row()
      .text("◀️ Назад", "tef:back");
    await ctx.editMessageText("Выбери временной тег:", { reply_markup: kb });
    return;
  }

  if (field === "project") {
    const token = await ctx.ticktickTokenRepo.findByUserId(ctx.from.id);
    if (!token) return;
    const client = createTickTickClient(token, ctx.from.id, ctx.ticktickTokenRepo);
    const projects = await client.getProjects();
    const kb = new InlineKeyboard();
    for (const p of projects) {
      kb.text(p.name, `tea:proj:${p.id}`).row();
    }
    kb.text("◀️ Назад", "tef:back");
    await ctx.editMessageText("Выбери лист:", { reply_markup: kb });
    return;
  }

  if (field === "back") {
    await ctx.editMessageText(
      `✏️ Редактирование: "${editing.taskTitle}"\n\nЧто хочешь изменить?`,
      { reply_markup: editMenuKeyboard() }
    );
  }
});

// Apply edit value
feature.callbackQuery(/^tea:([^:]+):(.+)$/, async (ctx) => {
  const [, type, value] = ctx.match;
  const editing = ctx.session.editingTask;
  if (!editing) { await ctx.answerCallbackQuery("Сессия устарела"); return; }

  try {
    const token = await ctx.ticktickTokenRepo.findByUserId(ctx.from.id);
    if (!token) { await ctx.answerCallbackQuery("TickTick не подключён"); return; }
    const client = createTickTickClient(token, ctx.from.id, ctx.ticktickTokenRepo);

    if (type === "dur") {
      await client.updateTask(editing.taskId, { projectId: editing.projectId, tags: [DURATION_TAGS[value] ?? value] });
    } else if (type === "proj") {
      await client.updateTask(editing.taskId, { projectId: value });
      ctx.session.editingTask = { ...editing, projectId: value };
    }

    await ctx.answerCallbackQuery("✅ Изменено");
    await ctx.editMessageText(
      `✏️ Редактирование: "${editing.taskTitle}"\n\nЧто ещё хочешь изменить?`,
      { reply_markup: editMenuKeyboard() }
    );
  } catch (err) {
    ctx.logger.error({ err }, "Failed to apply edit");
    await ctx.answerCallbackQuery("❌ Ошибка");
  }
});

function editMenuKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("📝 Название",      "tef:title").row()
    .text("⏱ Временной тег",  "tef:duration").row()
    .text("📁 Лист",           "tef:project").row()
    .text("✅ Готово",         "tef:done");
}

function afterActionKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("◀️ Назад", "manual:menu").row()
    .text("🏠 Главное меню", "menu:main");
}

async function processVoice(ctx: BotContext, fileId: string): Promise<void> {
  const processingMsg = await ctx.reply("🎙 Распознаю голосовое...");
  const chatId = ctx.chat!.id;

  let text: string;
  try {
    const file = await ctx.api.getFile(fileId);
    const fileUrl = `https://api.telegram.org/file/bot${ctx.api.token}/${file.file_path}`;
    text = await transcribeOgg(fileUrl);
  } catch (err) {
    ctx.logger.error({ err }, "Voice transcription failed");
    await ctx.api.editMessageText(chatId, processingMsg.message_id, "❌ Не удалось распознать голосовое сообщение.");
    return;
  }

  if (!text) {
    await ctx.api.editMessageText(chatId, processingMsg.message_id, "❌ Не удалось разобрать речь. Попробуй говорить чётче.");
    return;
  }

  await ctx.api.editMessageText(chatId, processingMsg.message_id, `🎙 Распознано: "${text}"\n\n⏳ Анализирую...`);

  try {
    const routed = await routeTask(text, ctx.from!.id, ctx.ticktickTokenRepo, ctx.logger);

    if (routed.type === "create") {
      await ctx.api.editMessageText(
        chatId,
        processingMsg.message_id,
        formatTaskResult(routed.result.analysis, routed.result.projectName),
        { reply_markup: afterActionKeyboard() }
      );
      return;
    }

    const { result } = routed;
    if (result.status === "done") {
      await ctx.api.editMessageText(chatId, processingMsg.message_id, result.message!, { reply_markup: afterActionKeyboard() });
    }
  } catch (err) {
    ctx.logger.error({ err }, "Failed to process voice task");
    const msg = err instanceof Error && err.message === "NOT_CONNECTED"
      ? "❌ Сначала подключи TickTick через /connect"
      : "❌ Не удалось обработать задачу. Попробуй ещё раз.";
    await ctx.api.editMessageText(chatId, processingMsg.message_id, msg);
  }
}

feature.on("message:voice", async (ctx) => {
  await processVoice(ctx, ctx.message.voice.file_id);
});

feature.on("message:video_note", async (ctx) => {
  await processVoice(ctx, ctx.message.video_note.file_id);
});

export { composer as taskFeature };

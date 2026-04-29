import { Composer, InlineKeyboard } from "grammy";
import type { BotContext } from "../context.js";
import { routeTask, executeAction } from "../services/task.service.js";
import { formatTaskResult, formatTaskCard, formatTaskListCard } from "../helpers/format.js";
import { taskCardKeyboard } from "../helpers/keyboards.js";
import { createTickTickClient } from "../../ticktick/client.js";
import { DURATION_TAGS, minutesToDurationBucket } from "../../ticktick/projects.js";
import type { TaskIntentAnalysis } from "../types/index.js";
import type { TickTickTask } from "../../ticktick/client.js";
import { transcribeOgg } from "../../voice/transcriber.js";
import { appConfig } from "../../config.js";
import { localDateToUtcIso } from "../../utils/date.js";
import { minutesToDurationTag } from "../../ticktick/projects.js";
import { refersToLastTask, parseDateText } from "../services/task-analyzer.js";

const composer = new Composer<BotContext>();
const feature = composer.chatType("private");

// Main text handler
feature.on("message:text", async (ctx, next) => {
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
      ctx.logger.info({ userId: ctx.from.id, taskId: editing.taskId, newTitle: text }, "Task title updated");
      const card = await showTaskCard(ctx, editing.taskId, editing.projectId);
      await ctx.reply(card, { reply_markup: editMenuKeyboard() });
    } catch (err) {
      ctx.logger.error({ err }, "Failed to update title");
      await ctx.reply("❌ Ошибка при изменении названия.");
    }
    return;
  }

  if (pending?.field === "datetime") {
    const text = ctx.message.text.trim();
    if (text.startsWith("/")) return next();

    ctx.session.pendingEditTask = undefined;
    const editing = ctx.session.editingTask;
    if (!editing) return;

    try {
      const parsed = await parseDateText(text);
      if (!parsed.dueDate) {
        await ctx.reply("❌ Не удалось распознать дату. Попробуй ещё раз, например: завтра в 15:00");
        ctx.session.pendingEditTask = { taskId: editing.taskId, projectId: editing.projectId, field: "datetime" };
        return;
      }
      const token = await ctx.ticktickTokenRepo.findByUserId(ctx.from.id);
      if (!token) { await ctx.reply("TickTick не подключён"); return; }
      const client = createTickTickClient(token, ctx.from.id, ctx.ticktickTokenRepo);
      const utcDue = localDateToUtcIso(parsed.dueDate);
      await client.updateTask(editing.taskId, {
        projectId: editing.projectId,
        dueDate: utcDue,
        startDate: utcDue,
        isAllDay: parsed.isAllDay ?? false,
        timeZone: appConfig.USER_TIMEZONE,
      });
      ctx.logger.info({ userId: ctx.from.id, taskId: editing.taskId, dueDate: parsed.dueDate }, "Task datetime updated");
      const card = await showTaskCard(ctx, editing.taskId, editing.projectId);
      await ctx.reply(card, { reply_markup: editMenuKeyboard() });
    } catch (err) {
      ctx.logger.error({ err }, "Failed to update datetime");
      await ctx.reply("❌ Ошибка при изменении времени.");
    }
    return;
  }

  const text = ctx.message.text;
  if (text.startsWith("/")) return next();

  ctx.logger.info({ userId: ctx.from.id, text }, "Incoming text message");
  const processingMsg = await ctx.reply("⏳ Анализирую...");

  // If the message refers to the last task by pronoun — act on it directly
  if (refersToLastTask(text) && ctx.session.lastTask) {
    const last = ctx.session.lastTask;
    ctx.logger.info({ userId: ctx.from.id, lastTask: last }, "Pronoun detected — using last task");
    const augmented = `${text} (задача: "${last.title}")`;
    try {
      const routed = await routeTask(augmented, ctx.from.id, ctx.ticktickTokenRepo, ctx.scheduledTaskRepo, ctx.logger, last);
      if (routed.type === "create") {
        ctx.session.lastTask = undefined;
        await ctx.api.editMessageText(ctx.chat.id, processingMsg.message_id, formatTaskResult(routed.result.analysis, routed.result.projectName), { reply_markup: afterActionKeyboard() });
      } else {
        const { result } = routed;
        if (result.status === "done") {
          if (result.intent !== "list") ctx.session.lastTask = undefined;
          await ctx.api.editMessageText(ctx.chat.id, processingMsg.message_id, result.message!, { reply_markup: afterActionKeyboard() });
        } else if (result.status === "needs_info" || result.intent === "edit") {
          ctx.session.editingTask = { taskId: last.id, projectId: last.projectId, taskTitle: last.title };
          await ctx.api.editMessageText(ctx.chat.id, processingMsg.message_id, `✏️ Редактирование: "${last.title}"\n\nЧто хочешь изменить?`, { reply_markup: editMenuKeyboard() });
        }
      }
    } catch (err) {
      ctx.logger.error({ err }, "Failed to process pronoun task");
      await ctx.api.editMessageText(ctx.chat.id, processingMsg.message_id, "❌ Не удалось обработать задачу. Попробуй ещё раз.");
    }
    return;
  }

  try {
    const routed = await routeTask(
      text,
      ctx.from.id,
      ctx.ticktickTokenRepo,
      ctx.scheduledTaskRepo,
      ctx.logger
    );

    if (routed.type === "create") {
      const { analysis } = routed.result;
      ctx.logger.info({ userId: ctx.from.id, title: analysis.taskTitle, project: routed.result.projectName, dueDate: analysis.dueDate }, "Task created");
      ctx.session.lastTask = {
        id: routed.result.createdId ?? "",
        projectId: routed.result.projectId ?? "",
        title: analysis.taskTitle,
      };

      // Mirror task to own storage
      const userId = BigInt(ctx.from.id);
      await ctx.botUserRepo.upsert({ id: userId, username: ctx.from.username }).catch(() => {});
      await ctx.botTaskRepo.create({
        userId,
        title: analysis.taskTitle,
        category: "PERSONAL",
        duration_tag: minutesToDurationTag(analysis.estimatedMinutes ?? 30),
        due_date: analysis.dueDate ? new Date(analysis.dueDate) : undefined,
      }).catch((err) => ctx.logger.warn({ err }, "Failed to mirror task to own storage"));

      await ctx.api.editMessageText(
        ctx.chat.id,
        processingMsg.message_id,
        formatTaskResult(analysis, routed.result.projectName),
        { reply_markup: afterActionKeyboard() }
      );
      return;
    }

    const { result } = routed;

    if (result.status === "done") {
      ctx.logger.info({ userId: ctx.from.id, intent: result.intent }, `Task action completed: ${result.intent}`);
      await ctx.api.editMessageText(ctx.chat.id, processingMsg.message_id, result.message!, { reply_markup: afterActionKeyboard() });
      return;
    }

    if (result.intent === "list") {
      const tasks = result.tasks ?? [];
      ctx.logger.info({ userId: ctx.from.id, count: tasks.length }, "Task list requested");
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

    if (result.intent === "today" || result.intent === "week") {
      const tasks = result.tasks ?? [];
      const isToday = result.intent === "today";
      ctx.logger.info({ userId: ctx.from.id, count: tasks.length }, isToday ? "Today tasks requested" : "Week tasks requested");
      if (tasks.length === 0) {
        await ctx.api.editMessageText(ctx.chat.id, processingMsg.message_id, isToday ? "📅 На сегодня задач нет." : "🗓 На этой неделе задач нет.", { reply_markup: afterActionKeyboard() });
        return;
      }
      const header = isToday
        ? `📅 Задачи на сегодня (${new Date().toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}): ${tasks.length}`
        : `🗓 Задачи на неделю: ${tasks.length}`;
      await ctx.api.editMessageText(ctx.chat.id, processingMsg.message_id, header);
      for (const t of tasks) {
        if (!t.id) continue;
        await ctx.reply(formatTaskListCard(t), { reply_markup: taskCardKeyboard({ id: t.id, projectId: t.projectId }) });
      }
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
    ctx.logger.info({ userId: ctx.from.id }, "Task action cancelled");
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
        ctx.logger.info({ userId: ctx.from.id, taskId: task.id, editFields: intentAnalysis.editFields }, "Task edited");
        ctx.session.lastTask = { id: task.id, projectId: task.projectId, title: intentAnalysis.editFields?.title ?? task.title };
        const finalProjectId = intentAnalysis.editFields?.projectName
          ? (await client.getProjects()).find((p) => p.name === intentAnalysis.editFields!.projectName)?.id ?? task.projectId
          : task.projectId;
        const card = await showTaskCard(ctx, task.id, finalProjectId);
        await ctx.editMessageText(card, { reply_markup: afterActionKeyboard() });
      } else {
        ctx.session.editingTask = { taskId: task.id, projectId: task.projectId, taskTitle: task.title };
        ctx.logger.info({ userId: ctx.from.id, taskId: task.id, title: task.title }, "Edit menu opened");
        await ctx.editMessageText(`✏️ Редактирование: "${task.title}"\n\nЧто хочешь изменить?`, {
          reply_markup: editMenuKeyboard(),
        });
      }
      return;
    }

    await executeAction(intentAnalysis, fullTask, client);
    ctx.logger.info({ userId: ctx.from.id, taskId: task.id, title: task.title, intent }, `Task ${intent}d`);
    ctx.session.lastTask = intent !== "delete" ? { id: task.id, projectId: task.projectId, title: task.title } : undefined;
    const icon = intent === "delete" ? "🗑" : "✅";
    const verb = intent === "delete" ? "удалена" : "завершена";
    await ctx.editMessageText(`${icon} Задача "${task.title}" ${verb}.`, { reply_markup: afterActionKeyboard() });
  } catch (err) {
    ctx.logger.error({ err }, "Failed to execute action");
    await ctx.editMessageText("❌ Ошибка при выполнении действия.");
  }
});

// Task list actions: edit / delete / complete from today/week list
feature.callbackQuery(/^tl:(edit|delete|complete):([^:]+):([^:]*)$/, async (ctx) => {
  const [, action, taskId, projectId] = ctx.match;
  await ctx.answerCallbackQuery();

  if (action === "edit") {
    ctx.session.editingTask = { taskId, projectId, taskTitle: taskId };
    // Fetch actual title
    try {
      const token = await ctx.ticktickTokenRepo.findByUserId(ctx.from.id);
      if (token) {
        const client = createTickTickClient(token, ctx.from.id, ctx.ticktickTokenRepo);
        const data = await client.getProjectTasks(projectId);
        const task = (data.tasks ?? []).find((t) => t.id === taskId);
        if (task) ctx.session.editingTask = { taskId, projectId, taskTitle: task.title };
      }
    } catch { /* use taskId as fallback title */ }

    const title = ctx.session.editingTask?.taskTitle ?? taskId;
    await ctx.editMessageText(`✏️ Редактирование: "${title}"\n\nЧто хочешь изменить?`, {
      reply_markup: editMenuKeyboard(),
    });
    return;
  }

  try {
    const token = await ctx.ticktickTokenRepo.findByUserId(ctx.from.id);
    if (!token) return;
    const client = createTickTickClient(token, ctx.from.id, ctx.ticktickTokenRepo);

    // Fetch title for the confirmation message
    let taskTitle = "";
    try {
      const data = await client.getProjectTasks(projectId);
      taskTitle = (data.tasks ?? []).find((t) => t.id === taskId)?.title ?? "";
    } catch { /* title stays empty */ }

    if (action === "delete") {
      await client.deleteTask(projectId, taskId);
      ctx.logger.info({ userId: ctx.from.id, taskId, projectId }, "Task deleted from list");
      const msg = taskTitle ? `🗑 Задача "${taskTitle}" удалена.` : "🗑 Задача удалена.";
      await ctx.editMessageText(msg, { reply_markup: afterActionKeyboard() });
    } else if (action === "complete") {
      await client.completeTask(taskId, projectId);
      ctx.logger.info({ userId: ctx.from.id, taskId, projectId }, "Task completed from list");
      const msg = taskTitle ? `✅ Задача "${taskTitle}" завершена!` : "✅ Задача завершена!";
      await ctx.editMessageText(msg, { reply_markup: afterActionKeyboard() });
    }
  } catch (err) {
    ctx.logger.error({ err }, "Failed to execute list task action");
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
    const card = await showTaskCard(ctx, editing.taskId, editing.projectId);
    ctx.session.editingTask = undefined;
    await ctx.editMessageText(card, { reply_markup: afterActionKeyboard() });
    return;
  }

  if (field === "title") {
    ctx.session.pendingEditTask = { taskId: editing.taskId, projectId: editing.projectId, field: "title" };
    await ctx.editMessageText("Введи новое название задачи:");
    return;
  }

  if (field === "datetime") {
    ctx.session.pendingEditTask = { taskId: editing.taskId, projectId: editing.projectId, field: "datetime" };
    await ctx.editMessageText("Введи новую дату и время задачи:\nНапример: завтра в 15:00, пятница в 10:00, 5 мая в 18:30");
    return;
  }

  if (field === "duration") {
    const kb = new InlineKeyboard()
      .text("до 5 минут",     "tea:dur:5").row()
      .text("до 30 минут",    "tea:dur:30").row()
      .text("до 1 часа",      "tea:dur:60").row()
      .text("до 2-х часов",   "tea:dur:120").row()
      .text("более 2-х часов","tea:dur:150").row()
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
      const bucket = minutesToDurationBucket(parseInt(value));
      await client.updateTask(editing.taskId, { projectId: editing.projectId, tags: [DURATION_TAGS[bucket]] });
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

async function showTaskCard(ctx: BotContext, taskId: string, projectId: string): Promise<string> {
  try {
    const token = await ctx.ticktickTokenRepo.findByUserId(ctx.from!.id);
    if (!token) return "✅ Задача обновлена.";
    const client = createTickTickClient(token, ctx.from!.id, ctx.ticktickTokenRepo);
    const projects = await client.getProjects();
    const project = projects.find((p) => p.id === projectId);
    const data = await client.getProjectTasks(projectId);
    const task = data.tasks.find((t) => t.id === taskId);
    if (!task) return "✅ Задача обновлена.";
    return formatTaskCard(task, project?.name ?? "Неизвестный список");
  } catch {
    return "✅ Задача обновлена.";
  }
}

function editMenuKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("📝 Название",      "tef:title").row()
    .text("📅 Время задачи",  "tef:datetime").row()
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

  ctx.logger.info({ userId: ctx.from!.id, fileId }, "Voice message received");

  let text: string;
  try {
    const file = await ctx.api.getFile(fileId);
    const fileUrl = `https://api.telegram.org/file/bot${appConfig.BOT_TOKEN}/${file.file_path}`;
    text = await transcribeOgg(fileUrl);
    ctx.logger.info({ userId: ctx.from!.id, transcribed: text }, "Voice transcribed");
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
    const routed = await routeTask(text, ctx.from!.id, ctx.ticktickTokenRepo, ctx.scheduledTaskRepo, ctx.logger);

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

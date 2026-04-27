import { Composer } from "grammy";
import { createConversation } from "@grammyjs/conversations";
import type { BotContext } from "../context.js";
import type { TickTickTokenRepository } from "../repositories/ticktick-token.repository.js";
import { createTickTickClient } from "../../ticktick/client.js";
import {
  manualMenuKeyboard,
  projectsKeyboard,
  tasksKeyboard,
  mainMenuKeyboard,
} from "../helpers/keyboards.js";
import { makeManualCreateConversation } from "../conversations/manual-create.conversation.js";
import { makeManualCreateProjectConversation } from "../conversations/manual-create-project.conversation.js";
import { makeManualEditConversation } from "../conversations/manual-edit.conversation.js";

export function createManualFeature(tokenRepo: TickTickTokenRepository): Composer<BotContext> {
  const composer = new Composer<BotContext>();

  composer.use(
    createConversation<BotContext, BotContext>(
      makeManualCreateConversation(tokenRepo),
      "manualCreateConversation"
    )
  );

  composer.use(
    createConversation<BotContext, BotContext>(
      makeManualCreateProjectConversation(tokenRepo),
      "manualCreateProjectConversation"
    )
  );

  composer.use(
    createConversation<BotContext, BotContext>(
      makeManualEditConversation(tokenRepo),
      "manualEditConversation"
    )
  );

  async function requireClient(ctx: BotContext) {
    const token = await tokenRepo.findByUserId(ctx.from!.id);
    if (!token) {
      await ctx.answerCallbackQuery("Сначала подключи TickTick через кнопку в меню");
      return null;
    }
    return createTickTickClient(token, ctx.from!.id, tokenRepo);
  }

  // Main manual menu
  composer.callbackQuery("manual:menu", async (ctx) => {
    await ctx.editMessageText("✏️ Ручной режим — выбери действие:", {
      reply_markup: manualMenuKeyboard(),
    });
    await ctx.answerCallbackQuery();
  });

  // CREATE PROJECT
  composer.callbackQuery("manual:create-project", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.conversation.enter("manualCreateProjectConversation");
  });

  // CREATE — show real projects
  composer.callbackQuery("manual:create", async (ctx) => {
    const client = await requireClient(ctx);
    if (!client) return;
    const projects = await client.getProjects();
    await ctx.editMessageText("➕ Создать задачу\n\nВыбери список:", {
      reply_markup: projectsKeyboard("create", projects),
    });
    await ctx.answerCallbackQuery();
  });

  // Project selected for CREATE — enter conversation (by id)
  composer.callbackQuery(/^project:create:(.+)$/, async (ctx) => {
    const projectId = ctx.match[1];
    const client = await requireClient(ctx);
    if (!client) return;
    const projects = await client.getProjects();
    const project = projects.find((p) => p.id === projectId);
    await ctx.answerCallbackQuery();
    await ctx.conversation.enter("manualCreateConversation", { projectId, projectName: project?.name });
  });

  // LIST — show real projects
  composer.callbackQuery("manual:list", async (ctx) => {
    const client = await requireClient(ctx);
    if (!client) return;
    const projects = await client.getProjects();
    await ctx.editMessageText("📋 Мои задачи\n\nВыбери список:", {
      reply_markup: projectsKeyboard("list", projects),
    });
    await ctx.answerCallbackQuery();
  });

  // Project selected for LIST
  composer.callbackQuery(/^project:list:(.+)$/, async (ctx) => {
    const projectId = ctx.match[1];
    const client = await requireClient(ctx);
    if (!client) return;

    const projects = await client.getProjects();
    const project = projects.find((p) => p.id === projectId);
    if (!project) {
      await ctx.answerCallbackQuery("Список не найден");
      return;
    }

    const data = await client.getProjectTasks(project.id);
    const tasks = data.tasks ?? [];

    if (tasks.length === 0) {
      await ctx.editMessageText(`📋 Список "${project.name}" пуст.`, {
        reply_markup: projectsKeyboard("list", projects),
      });
    } else {
      const lines = tasks.map((t, i) => `${i + 1}. ${t.title}`).join("\n");
      await ctx.editMessageText(`📋 ${project.name}:\n\n${lines}`, {
        reply_markup: projectsKeyboard("list", projects),
      });
    }
    await ctx.answerCallbackQuery();
  });

  // DELETE — show real projects
  composer.callbackQuery("manual:delete", async (ctx) => {
    const client = await requireClient(ctx);
    if (!client) return;
    const projects = await client.getProjects();
    await ctx.editMessageText("🗑 Удалить задачу\n\nВыбери список:", {
      reply_markup: projectsKeyboard("delete", projects),
    });
    await ctx.answerCallbackQuery();
  });

  // Project selected for DELETE — show tasks
  composer.callbackQuery(/^project:delete:(.+)$/, async (ctx) => {
    const projectId = ctx.match[1];
    const client = await requireClient(ctx);
    if (!client) return;

    const projects = await client.getProjects();
    const project = projects.find((p) => p.id === projectId);
    if (!project) { await ctx.answerCallbackQuery("Список не найден"); return; }

    const data = await client.getProjectTasks(project.id);
    const tasks = data.tasks ?? [];

    if (tasks.length === 0) {
      await ctx.editMessageText(`Список "${project.name}" пуст.`, {
        reply_markup: projectsKeyboard("delete", projects),
      });
    } else {
      await ctx.editMessageText(`🗑 Выбери задачу для удаления из "${project.name}":`, {
        reply_markup: tasksKeyboard(tasks, "delete", project.id),
      });
    }
    await ctx.answerCallbackQuery();
  });

  // Task selected for DELETE
  composer.callbackQuery(/^task:delete:([^:]+):([^:]*)$/, async (ctx) => {
    const [, taskId, projectId] = ctx.match;
    const client = await requireClient(ctx);
    if (!client) return;

    await client.deleteTask(projectId, taskId);
    await ctx.editMessageText(`✅ Задача удалена.`, { reply_markup: manualMenuKeyboard() });
    await ctx.answerCallbackQuery();
  });

  // EDIT — show real projects
  composer.callbackQuery("manual:edit", async (ctx) => {
    const client = await requireClient(ctx);
    if (!client) return;
    const projects = await client.getProjects();
    await ctx.editMessageText("✏️ Редактировать задачу\n\nВыбери список:", {
      reply_markup: projectsKeyboard("edit", projects),
    });
    await ctx.answerCallbackQuery();
  });

  // Project selected for EDIT — show tasks
  composer.callbackQuery(/^project:edit:(.+)$/, async (ctx) => {
    const projectId = ctx.match[1];
    const client = await requireClient(ctx);
    if (!client) return;

    const projects = await client.getProjects();
    const project = projects.find((p) => p.id === projectId);
    if (!project) { await ctx.answerCallbackQuery("Список не найден"); return; }

    const data = await client.getProjectTasks(project.id);
    const tasks = data.tasks ?? [];

    if (tasks.length === 0) {
      await ctx.editMessageText(`Список "${project.name}" пуст.`, {
        reply_markup: projectsKeyboard("edit", projects),
      });
    } else {
      await ctx.editMessageText(`✏️ Выбери задачу для редактирования из "${project.name}":`, {
        reply_markup: tasksKeyboard(tasks, "edit", project.id),
      });
    }
    await ctx.answerCallbackQuery();
  });

  // Task selected for EDIT — enter edit conversation
  composer.callbackQuery(/^task:edit:([^:]+):([^:]*)$/, async (ctx) => {
    const [, taskId, projectId] = ctx.match;
    await ctx.answerCallbackQuery();
    // Get task title for display
    const client = await requireClient(ctx);
    if (!client) return;
    const data = await client.getProjectTasks(projectId);
    const task = (data.tasks ?? []).find((t) => t.id === taskId);
    await ctx.conversation.enter("manualEditConversation", {
      taskId,
      projectId,
      taskTitle: task?.title ?? taskId,
    });
  });

  // COMPLETE — show real projects
  composer.callbackQuery("manual:complete", async (ctx) => {
    const client = await requireClient(ctx);
    if (!client) return;
    const projects = await client.getProjects();
    await ctx.editMessageText("✅ Завершить задачу\n\nВыбери список:", {
      reply_markup: projectsKeyboard("complete", projects),
    });
    await ctx.answerCallbackQuery();
  });

  // Project selected for COMPLETE
  composer.callbackQuery(/^project:complete:(.+)$/, async (ctx) => {
    const projectId = ctx.match[1];
    const client = await requireClient(ctx);
    if (!client) return;

    const projects = await client.getProjects();
    const project = projects.find((p) => p.id === projectId);
    if (!project) { await ctx.answerCallbackQuery("Список не найден"); return; }

    const data = await client.getProjectTasks(project.id);
    const tasks = data.tasks ?? [];

    if (tasks.length === 0) {
      await ctx.editMessageText(`Список "${project.name}" пуст.`, {
        reply_markup: projectsKeyboard("complete", projects),
      });
    } else {
      await ctx.editMessageText(`✅ Выбери задачу для завершения:`, {
        reply_markup: tasksKeyboard(tasks, "complete", project.id),
      });
    }
    await ctx.answerCallbackQuery();
  });

  // Task selected for COMPLETE
  composer.callbackQuery(/^task:complete:([^:]+):([^:]*)$/, async (ctx) => {
    const [, taskId, projectId] = ctx.match;
    const client = await requireClient(ctx);
    if (!client) return;

    await client.updateTask(taskId, { projectId, status: 2 } as never);
    await ctx.editMessageText(`✅ Задача завершена!`, { reply_markup: mainMenuKeyboard() });
    await ctx.answerCallbackQuery();
  });

  return composer;
}

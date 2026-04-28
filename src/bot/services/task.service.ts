import type { Logger } from "pino";
import { appConfig } from "../../config.js";
import { analyzeTask, analyzeIntent, extractUserHints } from "./task-analyzer.js";
import { getTasksToday, getTasksThisWeek } from "./task-list.service.js";
import { createTickTickClient } from "../../ticktick/client.js";
import type { TickTickTask, TickTickChecklistItem } from "../../ticktick/client.js";
import { LISTS, DURATION_TAGS, minutesToDurationBucket } from "../../ticktick/projects.js";
import type { TickTickTokenRepository } from "../repositories/ticktick-token.repository.js";
import type { ScheduledTaskRepository } from "../repositories/scheduled-task.repository.js";
import type { TaskAnalysis, Subtask, TaskIntentAnalysis } from "../types/index.js";

export interface TaskResult {
  analysis: TaskAnalysis;
  projectName: string;
  createdId?: string;
  projectId?: string;
}

export interface ActionResult {
  intent: TaskIntentAnalysis["intent"];
  status: "found" | "done" | "needs_info" | "list";
  tasks?: (TickTickTask & { projectId: string; projectName?: string })[];
  message?: string;
  intentAnalysis?: TaskIntentAnalysis;
}

export async function routeTask(
  taskText: string,
  userId: number,
  tokenRepo: TickTickTokenRepository,
  scheduledTaskRepo: ScheduledTaskRepository,
  logger: Logger,
  forcedTask?: { id: string; projectId: string; title: string }
): Promise<{ type: "create"; result: TaskResult } | { type: "action"; result: ActionResult }> {
  const token = await tokenRepo.findByUserId(userId);
  if (!token) throw new Error("NOT_CONNECTED");

  const intentAnalysis = await analyzeIntent(taskText);
  logger.debug({ intentAnalysis }, "Intent analysis");

  if (intentAnalysis.intent === "create") {
    const result = await processTask(taskText, userId, tokenRepo, scheduledTaskRepo, logger);
    return { type: "create", result };
  }

  const client = createTickTickClient(token, userId, tokenRepo);

  if (intentAnalysis.intent === "today") {
    const tasks = await getTasksToday(userId, tokenRepo);
    return { type: "action", result: { intent: "today", status: "found", tasks, intentAnalysis } };
  }

  if (intentAnalysis.intent === "week") {
    const tasks = await getTasksThisWeek(userId, tokenRepo);
    return { type: "action", result: { intent: "week", status: "found", tasks, intentAnalysis } };
  }

  if (intentAnalysis.intent === "list") {
    const projects = await client.getProjects();
    const projectMap = new Map(projects.map((p) => [p.id, p.name]));
    const query = (intentAnalysis.taskQuery ?? "").toLowerCase();
    const targetProject = query
      ? projects.find((p) => p.name.toLowerCase().includes(query))
      : undefined;

    let tasks: (import("../../ticktick/client.js").TickTickTask & { projectId: string })[] = [];
    if (targetProject) {
      const data = await client.getProjectTasks(targetProject.id);
      tasks = (data.tasks ?? []).map((t) => ({ ...t, projectId: targetProject.id }));
    } else {
      for (const project of projects) {
        try {
          const data = await client.getProjectTasks(project.id);
          tasks.push(...(data.tasks ?? []).map((t) => ({ ...t, projectId: project.id })));
        } catch { /* skip */ }
      }
    }

    const tasksWithNames = tasks.map((t) => ({ ...t, projectName: projectMap.get(t.projectId) }));
    return {
      type: "action",
      result: { intent: "list", status: "found", tasks: tasksWithNames, intentAnalysis },
    };
  }

  // If a forced task is provided (pronoun reference) — skip search and use it directly
  if (forcedTask) {
    const projects = await client.getProjects();
    const projectMap = new Map(projects.map((p) => [p.id, p.name]));
    const tasks = [{ ...forcedTask, projectName: projectMap.get(forcedTask.projectId) }];

    if (intentAnalysis.intent === "edit" && intentAnalysis.needsMoreInfo) {
      return { type: "action", result: { intent: "edit", status: "needs_info", tasks, intentAnalysis } };
    }

    const editHasFields = intentAnalysis.intent === "edit" &&
      intentAnalysis.editFields && Object.keys(intentAnalysis.editFields).length > 0;

    if (intentAnalysis.intent !== "edit" || editHasFields) {
      await executeAction(intentAnalysis, forcedTask, client);
      const verb = intentAnalysis.intent === "delete" ? "удалена"
        : intentAnalysis.intent === "complete" ? "завершена"
        : "обновлена";
      return { type: "action", result: { intent: intentAnalysis.intent, status: "done", message: `✅ Задача "${forcedTask.title}" ${verb}.` } };
    }

    return { type: "action", result: { intent: intentAnalysis.intent, status: "found", tasks, intentAnalysis } };
  }

  const query = intentAnalysis.taskQuery ?? taskText;
  const tasks = await client.searchTasks(query);

  if (tasks.length === 0) {
    return {
      type: "action",
      result: { intent: intentAnalysis.intent, status: "done", message: `❌ Задача не найдена: "${query}"` },
    };
  }

  const projects = await client.getProjects();
  const projectMap = new Map(projects.map((p) => [p.id, p.name]));
  const tasksWithNames = tasks.map((t) => ({ ...t, projectName: projectMap.get(t.projectId) }));

  if (intentAnalysis.intent === "edit" && intentAnalysis.needsMoreInfo) {
    return {
      type: "action",
      result: { intent: "edit", status: "needs_info", tasks: tasksWithNames, intentAnalysis },
    };
  }

  const editHasFields = intentAnalysis.intent === "edit" && !intentAnalysis.needsMoreInfo &&
    intentAnalysis.editFields && Object.keys(intentAnalysis.editFields).length > 0;

  if (tasks.length === 1 && (intentAnalysis.intent !== "edit" || editHasFields)) {
    await executeAction(intentAnalysis, tasks[0], client);
    const verb = intentAnalysis.intent === "delete" ? "удалена"
      : intentAnalysis.intent === "complete" ? "завершена"
      : "обновлена";
    return {
      type: "action",
      result: { intent: intentAnalysis.intent, status: "done", message: `✅ Задача "${tasks[0].title}" ${verb}.` },
    };
  }

  return {
    type: "action",
    result: { intent: intentAnalysis.intent, status: "found", tasks: tasksWithNames, intentAnalysis },
  };
}

export async function executeAction(
  intentAnalysis: TaskIntentAnalysis,
  task: TickTickTask & { projectId: string },
  client: ReturnType<typeof createTickTickClient>
): Promise<void> {
  if (intentAnalysis.intent === "delete") {
    await client.deleteTask(task.projectId, task.id!);
  } else if (intentAnalysis.intent === "complete") {
    await client.completeTask(task.id!, task.projectId);
  } else if (intentAnalysis.intent === "edit") {
    const updates: Partial<TickTickTask> = {};
    if (intentAnalysis.editFields?.title) updates.title = intentAnalysis.editFields.title;
    if (intentAnalysis.editFields?.estimatedMinutes) {
      const bucket = minutesToDurationBucket(intentAnalysis.editFields.estimatedMinutes);
      updates.tags = [DURATION_TAGS[bucket]];
    }
    if (intentAnalysis.editFields?.projectName) {
      const project = await client.getOrCreateProject(intentAnalysis.editFields.projectName);
      updates.projectId = project.id;
    }
    await client.updateTask(task.id!, { ...updates, projectId: task.projectId });
  }
}

export async function processTask(
  taskText: string,
  userId: number,
  tokenRepo: TickTickTokenRepository,
  scheduledTaskRepo: ScheduledTaskRepository,
  logger: Logger
): Promise<TaskResult> {
  const token = await tokenRepo.findByUserId(userId);
  if (!token) throw new Error("NOT_CONNECTED");

  const hints = extractUserHints(taskText);
  const analysis = await analyzeTask(taskText, hints);
  logger.debug({ analysis }, "Task analysis complete");

  const client = createTickTickClient(token, userId, tokenRepo);
  const targetListName = analysis.dueDate ? LISTS.calendar : LISTS.inbox;

  const targetProject = await client.getOrCreateProject(targetListName);

  const items: TickTickChecklistItem[] = analysis.subtasks?.length
    ? buildChecklistItems(analysis.subtasks)
    : [];

  const created = await client.createTask({
    title: analysis.taskTitle,
    projectId: targetProject.id,
    priority: 0,
    tags: analysis.tags,
    ...(items.length > 0 && { items }),
    ...(analysis.dueDate && {
      dueDate: analysis.dueDate,
      startDate: analysis.dueDate,
      isAllDay: analysis.isAllDay ?? false,
      timeZone: appConfig.USER_TIMEZONE,
    }),
  });

  if (analysis.dueDate && created.id) {
    await scheduledTaskRepo.save({
      userId,
      ticktickId: created.id,
      title: analysis.taskTitle,
      dueDate: new Date(analysis.dueDate),
      isAllDay: analysis.isAllDay ?? false,
    }).catch(() => {});
  }

  return { analysis, projectName: targetListName, createdId: created.id, projectId: targetProject.id };
}

function buildChecklistItems(subtasks: Subtask[], depth = 0): TickTickChecklistItem[] {
  const result: TickTickChecklistItem[] = [];
  let order = 0;
  for (const subtask of subtasks) {
    const prefix = depth > 0 ? "  ".repeat(depth) + "↳ " : "";
    result.push({ title: prefix + subtask.title, status: 0, sortOrder: order++ });
    if (subtask.subtasks?.length) {
      result.push(...buildChecklistItems(subtask.subtasks, depth + 1));
    }
  }
  return result;
}

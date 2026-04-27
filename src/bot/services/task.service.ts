import type { Logger } from "pino";
import { analyzeTask, analyzeIntent, extractUserHints } from "./task-analyzer.js";
import { createTickTickClient } from "../../ticktick/client.js";
import type { TickTickTask, TickTickChecklistItem } from "../../ticktick/client.js";
import { LISTS, DURATION_TAGS } from "../../ticktick/projects.js";
import type { TickTickTokenRepository } from "../repositories/ticktick-token.repository.js";
import type { SettingsRepository } from "../repositories/settings.repository.js";
import type { TaskAnalysis, Subtask, TaskIntentAnalysis } from "../types/index.js";

const PRIORITY_MAP: Record<number, number> = { 0: 0, 1: 1, 2: 3, 3: 5 };

export interface TaskResult {
  analysis: TaskAnalysis;
  projectName: string;
}

export interface ActionResult {
  intent: TaskIntentAnalysis["intent"];
  // "found" — нашли задачи, нужно выбрать
  // "done" — выполнено
  // "needs_info" — edit без деталей, нужно спросить
  status: "found" | "done" | "needs_info";
  tasks?: (TickTickTask & { projectId: string; projectName?: string })[];
  message?: string;
  intentAnalysis?: TaskIntentAnalysis;
}

export async function routeTask(
  taskText: string,
  userId: number,
  tokenRepo: TickTickTokenRepository,
  settingsRepo: SettingsRepository,
  logger: Logger
): Promise<{ type: "create"; result: TaskResult } | { type: "action"; result: ActionResult }> {
  const token = await tokenRepo.findByUserId(userId);
  if (!token) throw new Error("NOT_CONNECTED");

  const intentAnalysis = await analyzeIntent(taskText);
  logger.debug({ intentAnalysis }, "Intent analysis");

  if (intentAnalysis.intent === "create") {
    const result = await processTask(taskText, userId, tokenRepo, settingsRepo, logger);
    return { type: "create", result };
  }

  const client = createTickTickClient(token, userId, tokenRepo);
  const query = intentAnalysis.taskQuery ?? taskText;
  const tasks = await client.searchTasks(query);

  if (tasks.length === 0) {
    return {
      type: "action",
      result: { intent: intentAnalysis.intent, status: "done", message: `❌ Задача не найдена: "${query}"` },
    };
  }

  // Attach project names
  const projects = await client.getProjects();
  const projectMap = new Map(projects.map((p) => [p.id, p.name]));
  const tasksWithNames = tasks.map((t) => ({ ...t, projectName: projectMap.get(t.projectId) }));

  if (intentAnalysis.intent === "edit" && intentAnalysis.needsMoreInfo) {
    return {
      type: "action",
      result: { intent: "edit", status: "needs_info", tasks: tasksWithNames, intentAnalysis },
    };
  }

  if (tasks.length === 1 && intentAnalysis.intent !== "edit") {
    // Single match — execute directly for delete/complete
    await executeAction(intentAnalysis, tasks[0], client, settingsRepo, userId);
    const verb = intentAnalysis.intent === "delete" ? "удалена" : "завершена";
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
  client: ReturnType<typeof createTickTickClient>,
  settingsRepo: SettingsRepository,
  userId: number
): Promise<void> {
  if (intentAnalysis.intent === "delete") {
    await client.deleteTask(task.projectId, task.id!);
  } else if (intentAnalysis.intent === "complete") {
    await client.completeTask(task.id!, task.projectId);
  } else if (intentAnalysis.intent === "edit") {
    const updates: Partial<TickTickTask> = {};
    if (intentAnalysis.editFields?.title) updates.title = intentAnalysis.editFields.title;
    if (intentAnalysis.editFields?.duration) {
      updates.tags = [DURATION_TAGS[intentAnalysis.editFields.duration] ?? intentAnalysis.editFields.duration];
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
  settingsRepo: SettingsRepository,
  logger: Logger
): Promise<TaskResult> {
  const token = await tokenRepo.findByUserId(userId);
  if (!token) throw new Error("NOT_CONNECTED");

  const settings = await settingsRepo.findByUserId(userId);
  const personalGoals = settings?.personalGoals ?? "";
  const careerGoals = settings?.careerGoals ?? "";

  const hints = extractUserHints(taskText);
  const analysis = await analyzeTask(taskText, personalGoals, careerGoals, hints);
  logger.debug({ analysis }, "Task analysis complete");

  const client = createTickTickClient(token, userId, tokenRepo);
  const durationTag = DURATION_TAGS[analysis.duration];

  const targetListName =
    analysis.taskType === "calendar" ? LISTS.calendar :
    analysis.taskType === "project"  ? LISTS.project :
    LISTS.simple;

  const targetProject = await client.getOrCreateProject(targetListName);

  const items: TickTickChecklistItem[] = analysis.taskType === "project" && analysis.subtasks?.length
    ? buildChecklistItems(analysis.subtasks)
    : [];

  await client.createTask({
    title: analysis.taskTitle,
    projectId: targetProject.id,
    priority: PRIORITY_MAP[analysis.priority],
    tags: [durationTag],
    ...(items.length > 0 && { items }),
  });

  return { analysis, projectName: targetListName };
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

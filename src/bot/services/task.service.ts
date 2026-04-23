import type { Logger } from "pino";
import { analyzeTask, extractUserHints } from "./task-analyzer.js";
import { createTickTickClient } from "../../ticktick/client.js";
import { DURATION_PROJECTS } from "../../ticktick/projects.js";
import type { TickTickTokenRepository } from "../repositories/ticktick-token.repository.js";
import type { SettingsRepository } from "../repositories/settings.repository.js";
import type { TaskAnalysis } from "../types/index.js";

// TickTick priority mapping: 0=none, 1=low, 3=medium, 5=high
const PRIORITY_MAP: Record<number, number> = { 0: 0, 1: 1, 2: 3, 3: 5 };

export interface TaskResult {
  analysis: TaskAnalysis;
  ticktickTaskId?: string;
  projectName: string;
}

export async function processTask(
  taskText: string,
  userId: number,
  tokenRepo: TickTickTokenRepository,
  settingsRepo: SettingsRepository,
  logger: Logger
): Promise<TaskResult> {
  const token = await tokenRepo.findByUserId(userId);
  if (!token) {
    throw new Error("NOT_CONNECTED");
  }

  const settings = await settingsRepo.findByUserId(userId);
  const personalGoals = settings?.personalGoals ?? "";
  const careerGoals = settings?.careerGoals ?? "";

  const hints = extractUserHints(taskText);
  logger.debug({ hints }, "Extracted user hints");

  const analysis = await analyzeTask(taskText, personalGoals, careerGoals, hints);
  logger.debug({ analysis }, "Task analysis complete");

  const client = createTickTickClient(token, userId, tokenRepo);
  const projectName = DURATION_PROJECTS[analysis.duration];

  const inboxTask = await client.createTask({
    title: taskText,
    priority: PRIORITY_MAP[analysis.priority],
    tags: analysis.tags,
  });

  const targetProject = await client.getOrCreateProject(projectName);

  let ticktickTaskId: string | undefined;
  if (inboxTask.id) {
    const updated = await client.updateTask(inboxTask.id, {
      projectId: targetProject.id,
    });
    ticktickTaskId = updated.id;
  }

  return { analysis, ticktickTaskId, projectName };
}

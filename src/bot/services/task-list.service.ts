import { createTickTickClient } from "../../ticktick/client.js";
import type { TickTickTask } from "../../ticktick/client.js";
import type { TickTickTokenRepository } from "../repositories/ticktick-token.repository.js";

export interface TaskWithProject extends TickTickTask {
  projectId: string;
  projectName: string;
}

function startOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

function endOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(23, 59, 59, 999);
  return r;
}

export async function getTasksForPeriod(
  userId: number,
  tokenRepo: TickTickTokenRepository,
  from: Date,
  to: Date
): Promise<TaskWithProject[]> {
  const token = await tokenRepo.findByUserId(userId);
  if (!token) throw new Error("NOT_CONNECTED");

  const client = createTickTickClient(token, userId, tokenRepo);
  const projects = await client.getProjects();
  const result: TaskWithProject[] = [];

  for (const project of projects) {
    try {
      const data = await client.getProjectTasks(project.id);
      for (const task of data.tasks ?? []) {
        if (!task.dueDate) continue;
        const due = new Date(task.dueDate);
        if (due >= from && due <= to && (task.status ?? 0) !== 2) {
          result.push({ ...task, projectId: project.id, projectName: project.name });
        }
      }
    } catch { /* skip */ }
  }

  result.sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime());
  return result;
}

export async function getTasksToday(userId: number, tokenRepo: TickTickTokenRepository): Promise<TaskWithProject[]> {
  const now = new Date();
  return getTasksForPeriod(userId, tokenRepo, startOfDay(now), endOfDay(now));
}

export async function getTasksThisWeek(userId: number, tokenRepo: TickTickTokenRepository): Promise<TaskWithProject[]> {
  const now = new Date();
  const weekEnd = new Date(now);
  weekEnd.setDate(now.getDate() + (6 - now.getDay() + 1) % 7 || 7);
  return getTasksForPeriod(userId, tokenRepo, startOfDay(now), endOfDay(weekEnd));
}

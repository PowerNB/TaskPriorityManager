import type { TaskAnalysis } from "../types/index.js";
import type { TickTickTask } from "../../ticktick/client.js";
import { DURATION_TAGS, minutesToDurationBucket } from "../../ticktick/projects.js";
import { appConfig } from "../../config.js";

const COMPLEXITY_LABELS: Record<string, string> = {
  low:    "Низкая",
  medium: "Средняя",
  high:   "Высокая",
};

const TYPE_LABELS: Record<string, string> = {
  calendar: "📅 Календарь",
  simple:   "✅ Простая задача",
  project:  "🗂 Проект",
};

// Tag label → human-readable (reverse of DURATION_TAGS)
const TAG_LABELS: Record<string, string> = Object.fromEntries(
  Object.values(DURATION_TAGS).map((tag) => [tag, tag])
);

function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} мин`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h} ч ${m} мин` : `${h} ч`;
}

function formatDueDate(dueDate: string, isAllDay: boolean | undefined): string {
  const tz = appConfig.USER_TIMEZONE;
  const dateStr = new Date(dueDate).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric", timeZone: tz });
  if (isAllDay) return `📅 Дата: ${dateStr}`;
  const timeStr = new Date(dueDate).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: tz });
  return `📅 Дата и время: ${dateStr} в ${timeStr}`;
}

export function formatTaskListCard(task: TickTickTask & { projectName?: string }): string {
  const lines = [`📝 ${task.title}`, ...(task.projectName ? [`📁 ${task.projectName}`] : [])];

  if (task.tags?.length) lines.push(`🏷 ${task.tags[0]}`);

  if (task.dueDate) lines.push(formatDueDate(task.dueDate, task.isAllDay));

  return lines.join("\n");
}

export function formatTaskCard(task: TickTickTask, projectName: string): string {
  const lines = [
    `✅ Задача обновлена!`,
    ``,
    `📝 ${task.title}`,
    ``,
    `📁 Список: ${projectName}`,
  ];

  if (task.tags?.length) {
    const tag = task.tags[0];
    if (TAG_LABELS[tag]) lines.push(`🏷 Тег: ${tag}`);
  }

  if (task.dueDate) lines.push(formatDueDate(task.dueDate, task.isAllDay));

  return lines.join("\n");
}

export function formatTaskResult(analysis: TaskAnalysis, projectName: string): string {
  const minutes = analysis.estimatedMinutes ?? 0;
  const tag = DURATION_TAGS[minutesToDurationBucket(minutes)];

  const lines = [
    `✅ Задача добавлена в TickTick!`,
    ``,
    `📝 ${analysis.taskTitle}`,
    ``,
    `📁 Список: ${projectName}`,
    `🔖 Тип: ${TYPE_LABELS[analysis.taskType] ?? analysis.taskType}`,
    `🧠 Сложность: ${COMPLEXITY_LABELS[analysis.complexity]}`,
    `⏱ Время выполнения: ${formatMinutes(minutes)}`,
    `🏷 Тег: ${tag}`,
  ];

  if (analysis.dueDate) lines.push(formatDueDate(analysis.dueDate, analysis.isAllDay));

  return lines.join("\n");
}

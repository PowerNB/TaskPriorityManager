import type { TaskAnalysis } from "../types/index.js";

const PRIORITY_LABELS: Record<number, string> = {
  0: "Без приоритета",
  1: "Низкий",
  2: "Средний",
  3: "Высокий",
};

const COMPLEXITY_LABELS: Record<string, string> = {
  low: "Низкая",
  medium: "Средняя",
  high: "Высокая",
};

const DURATION_LABELS: Record<string, string> = {
  "5min":    "~5 минут",
  "30min":   "~30 минут",
  "1hour":   "~1 час",
  "2hours+": "Более 2 часов",
};

const TYPE_LABELS: Record<string, string> = {
  calendar: "📅 Календарь",
  simple:   "✅ Простая задача",
  project:  "🗂 Проект",
};

export function formatTaskResult(analysis: TaskAnalysis, projectName: string): string {
  const tags = analysis.tags.map((t) => `#${t}`).join(" ");

  const lines = [
    `✅ Задача добавлена в TickTick!`,
    ``,
    `📝 ${analysis.taskTitle}`,
    ``,
    `📁 Список: ${projectName}`,
    `🔖 Тип: ${TYPE_LABELS[analysis.taskType] ?? analysis.taskType}`,
    `⚡ Приоритет: ${PRIORITY_LABELS[analysis.priority]}`,
    `🧠 Сложность: ${COMPLEXITY_LABELS[analysis.complexity]}`,
    `⏱ Время: ${DURATION_LABELS[analysis.duration] ?? analysis.duration}`,
  ];

  if (analysis.taskType === "project" && analysis.subtasks?.length) {
    lines.push(``, `📋 Подзадачи:`);
    for (const sub of analysis.subtasks) {
      lines.push(`  • ${sub.title}`);
      if (sub.subtasks?.length) {
        for (const subsub of sub.subtasks) {
          lines.push(`    ◦ ${subsub.title}`);
        }
      }
    }
  }

  return lines.join("\n");
}

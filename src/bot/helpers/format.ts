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
  "5min": "~5 минут",
  "30min": "~30 минут",
  "1hour": "~1 час",
  "2hours+": "Более 2 часов",
};

export function formatTaskResult(
  taskText: string,
  analysis: TaskAnalysis,
  projectName: string
): string {
  const tags = analysis.tags.map((t) => `#${t}`).join(" ");

  return [
    `✅ Задача добавлена в TickTick!`,
    ``,
    `📝 *${escapeMarkdown(taskText)}*`,
    ``,
    `📁 Папка: ${escapeMarkdown(projectName)}`,
    `⚡ Приоритет: ${PRIORITY_LABELS[analysis.priority]}`,
    `🧠 Сложность: ${COMPLEXITY_LABELS[analysis.complexity]}`,
    `⏱ Время: ${DURATION_LABELS[analysis.duration]}`,
    `🏷 Теги: ${escapeMarkdown(tags)}`,
  ].join("\n");
}

function escapeMarkdown(text: string): string {
  return text.replace(/[_*[\]()~`>#+=|{}.!-]/g, "\\$&");
}

import { callClaude, parseJson } from "../../claude/client.js";
import type { TaskAnalysis, ParsedUserHints, TaskDuration, Subtask, TaskIntentAnalysis } from "../types/index.js";

const DURATION_HINT_MAP: Record<string, TaskDuration> = {
  "5 мин": "5min",
  "5 минут": "5min",
  "5min": "5min",
  "30 мин": "30min",
  "30 минут": "30min",
  "30min": "30min",
  "1 час": "1hour",
  "1hour": "1hour",
  "2 часа": "2hours+",
  "2 часов": "2hours+",
  "2hours": "2hours+",
  "более 2": "2hours+",
};

const INTENT_KEYWORDS: Record<string, string[]> = {
  delete:   ["удали задачу", "удалить задачу", "удали задач", "убери задачу", "убрать задачу", "сотри задачу", "стереть задачу"],
  complete: ["заверши задачу", "завершить задачу", "выполни задачу", "выполнить задачу", "сделал задачу", "закрой задачу", "задача выполнена", "задача готова"],
  edit:     ["измени", "изменить", "переименуй", "переименовать", "обнови", "обновить", "редактируй", "отредактируй", "поменяй", "поменять"],
  list:     ["покажи задачи", "покажи список", "мои задачи", "список задач", "что у меня", "какие задачи", "все задачи", "задачи в", "задачи из", "покажи все"],
};

export function detectIntent(text: string): "delete" | "complete" | "edit" | "list" | "create" {
  const lower = text.toLowerCase();
  for (const [intent, keywords] of Object.entries(INTENT_KEYWORDS)) {
    if (keywords.some((kw) => lower.includes(kw))) {
      return intent as "delete" | "complete" | "edit" | "list";
    }
  }
  return "create";
}

export async function analyzeIntent(text: string): Promise<TaskIntentAnalysis> {
  const intent = detectIntent(text);
  if (intent === "create") return { intent: "create" };

  const response = await callClaude(
    `User message: "${text}"
Intent: ${intent}

Return ONLY valid JSON:
{
  "taskQuery": "task or list name to search for",
  "editFields": {
    "title": "new title if specified or null",
    "duration": "5min|30min|1hour|2hours+ if specified or null",
    "projectName": "list name if specified or null"
  },
  "needsMoreInfo": false
}

Rules:
- taskQuery: for delete/complete/edit — the task name to find; for list — the list/project name to filter by (omit if showing all tasks)
- editFields: only for intent=edit, otherwise leave as {}
- needsMoreInfo: true if intent=edit and no specific field to change was mentioned
- Omit null fields from the JSON entirely`
  );

  const raw = parseJson<{
    taskQuery?: string;
    editFields?: { title?: string; duration?: string; projectName?: string };
    needsMoreInfo?: boolean;
  }>(response);

  return { intent, ...raw };
}

export function extractUserHints(text: string): ParsedUserHints {
  const lower = text.toLowerCase();
  const hints: ParsedUserHints = {};

  for (const [keyword, duration] of Object.entries(DURATION_HINT_MAP)) {
    if (lower.includes(keyword)) {
      hints.duration = duration;
      break;
    }
  }

  if (lower.includes("простая") || lower.includes("простое") || lower.includes("лёгкая")) {
    hints.complexity = "low";
  } else if (lower.includes("сложная") || lower.includes("сложное") || lower.includes("трудная")) {
    hints.complexity = "high";
  }

  return hints;
}

export async function analyzeTask(
  taskText: string,
  hints: ParsedUserHints
): Promise<TaskAnalysis> {
  const prompt = buildPrompt(taskText, hints);
  const response = await callClaude(prompt);
  const raw = parseJson<{
    taskTitle: string;
    taskType: string;
    complexity: string;
    duration: string;
    estimatedMinutes: number;
    subtasks?: Subtask[];
  }>(response);

  const duration = (hints.duration ?? raw.duration) as TaskDuration;
  const complexity = (hints.complexity ?? raw.complexity) as "low" | "medium" | "high";

  return {
    taskTitle: raw.taskTitle,
    taskType: raw.taskType as TaskAnalysis["taskType"],
    complexity,
    duration,
    priority: 0,
    tags: [],
    estimatedMinutes: raw.estimatedMinutes,
    subtasks: raw.subtasks,
  };
}

function buildPrompt(taskText: string, hints: ParsedUserHints): string {
  const now = new Date();
  const dateStr = now.toLocaleDateString("ru-RU", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  const timeStr = now.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });

  const hintsSection = [
    hints.complexity ? `- Complexity specified by user: ${hints.complexity}` : "",
    hints.duration ? `- Duration specified by user: ${hints.duration}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return `You are a task management assistant. Analyze the user message and return JSON.

CURRENT DATE AND TIME: ${dateStr}, ${timeStr}

USER MESSAGE: ${taskText}

${hintsSection ? `ALREADY DETERMINED FROM MESSAGE (do not change these values):\n${hintsSection}\n` : ""}
Return ONLY valid JSON with no explanations:
{
  "taskTitle": "Short clear task title",
  "taskType": "calendar | simple | project",
  "complexity": "low | medium | high",
  "duration": "5min | 30min | 1hour | 2hours+",
  "estimatedMinutes": 5,
  "subtasks": [
    {
      "title": "Subtask 1",
      "subtasks": [
        { "title": "Sub-subtask 1.1" }
      ]
    }
  ]
}

Rules:
- taskTitle: task essence only, in the SAME LANGUAGE as the user message. If date/time is mentioned — include it in the title. Example for Russian: "Купить хлеб после работы завтра (28 апреля)"
- taskType:
  "calendar" — REQUIRED if text contains: specific date, day of week, words today/tomorrow/evening/morning/on Monday/etc., time of day, in N days/hours, deadline, meeting, call, reminder
  "simple" — simple one-time action WITHOUT time binding (buy, call without date, go without date)
  "project" — requires multiple steps, planning (development, research, creating something)
- complexity: "low" | "medium" | "high"
- duration: "5min" | "30min" | "1hour" | "2hours+"
- estimatedMinutes: number
- subtasks: only for taskType="project". For "calendar" and "simple" — do not include the subtasks field at all`;
}

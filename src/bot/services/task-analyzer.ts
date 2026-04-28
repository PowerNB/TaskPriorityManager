import { callOllama, parseJson } from "../../ollama/client.js";
import { minutesToDurationBucket, DURATION_TAGS } from "../../ticktick/projects.js";
import type { TaskAnalysis, ParsedUserHints, TaskIntentAnalysis } from "../types/index.js";
import { appConfig } from "../../config.js";

// Extracts explicit duration mentions from user text (returns minutes)
const DURATION_HINT_PATTERNS: { pattern: RegExp; minutes: number }[] = [
  { pattern: /(\d+)\s*мин/i,                              minutes: 0 }, // dynamic
  { pattern: /(\d+)\s*час/i,                              minutes: 0 }, // dynamic
  { pattern: /пол\s*часа|полчаса/i,                       minutes: 30 },
  { pattern: /час\b/i,                                    minutes: 60 },
  { pattern: /два\s*часа|2\s*часа/i,                      minutes: 120 },
  { pattern: /более\s*2|больше\s*2|свыше\s*2/i,          minutes: 150 },
];

export function extractUserHints(text: string): ParsedUserHints {
  const lower = text.toLowerCase();
  const hints: ParsedUserHints = {};

  // Try "X минут" or "X часов"
  const minMatch = lower.match(/(\d+)\s*мин/);
  if (minMatch) {
    hints.estimatedMinutes = parseInt(minMatch[1]);
  } else {
    const hourMatch = lower.match(/(\d+(?:[.,]\d+)?)\s*час/);
    if (hourMatch) {
      hints.estimatedMinutes = Math.round(parseFloat(hourMatch[1].replace(",", ".")) * 60);
    } else {
      for (const { pattern, minutes } of DURATION_HINT_PATTERNS) {
        if (minutes > 0 && pattern.test(lower)) {
          hints.estimatedMinutes = minutes;
          break;
        }
      }
    }
  }

  if (lower.includes("простая") || lower.includes("простое") || lower.includes("лёгкая")) {
    hints.complexity = "low";
  } else if (lower.includes("сложная") || lower.includes("сложное") || lower.includes("трудная")) {
    hints.complexity = "high";
  }

  return hints;
}

// today/week must come before list — they are more specific and share keywords like "покажи задачи"
const INTENT_KEYWORDS: Record<string, string[]> = {
  delete:   ["удали задачу", "удалить задачу", "удали задач", "убери задачу", "убрать задачу", "сотри задачу", "стереть задачу"],
  complete: ["заверши задачу", "завершить задачу", "выполни задачу", "выполнить задачу", "сделал задачу", "закрой задачу", "задача выполнена", "задача готова"],
  edit:     ["измени", "изменить", "переименуй", "переименовать", "обнови", "обновить", "редактируй", "отредактируй", "поменяй", "поменять"],
  today:    ["задачи на сегодня", "что на сегодня", "сегодняшние задачи", "задачи сегодня", "покажи сегодня", "что сегодня", "на сегодня"],
  week:     ["задачи на неделю", "что на неделе", "задачи на этой неделе", "недельные задачи", "покажи неделю", "что на этой неделе", "на неделю", "на этой неделе"],
  list:     ["покажи задачи", "покажи список", "мои задачи", "список задач", "что у меня", "какие задачи", "все задачи", "задачи в", "задачи из", "покажи все"],
};

const CONTEXT_PRONOUNS = [
  "эту задачу", "этой задаче", "этой задачи", "эта задача",
  "её", "ее", "у неё", "у нее", "ей", "для неё", "для нее",
  "эту", "данную задачу", "данной задаче", "предыдущую задачу",
  "последнюю задачу", "только что созданную", "только что добавленную",
];

export function refersToLastTask(text: string): boolean {
  const lower = text.toLowerCase();
  return CONTEXT_PRONOUNS.some((p) => lower.includes(p));
}

export function detectIntent(text: string): "delete" | "complete" | "edit" | "list" | "today" | "week" | "create" {
  const lower = text.toLowerCase();
  for (const [intent, keywords] of Object.entries(INTENT_KEYWORDS)) {
    if (keywords.some((kw) => lower.includes(kw))) {
      return intent as "delete" | "complete" | "edit" | "list" | "today" | "week";
    }
  }
  return "create";
}

export async function analyzeIntent(text: string): Promise<TaskIntentAnalysis> {
  const intent = detectIntent(text);
  if (intent === "create") return { intent: "create" };
  if (intent === "today" || intent === "week") return { intent };

  const response = await callOllama(
    `User message: "${text}"
Intent: ${intent}

Return ONLY valid JSON:
{
  "taskQuery": "task or list name to search for",
  "editFields": {
    "title": "new title if specified or null",
    "estimatedMinutes": 30,
    "projectName": "list name if specified or null"
  },
  "needsMoreInfo": false
}

Rules:
- taskQuery: for delete/complete/edit — the task name to find; for list — the list/project name to filter by (omit if showing all tasks)
- editFields: only for intent=edit, otherwise leave as {}
- editFields.estimatedMinutes: number of minutes if user specified a new duration, otherwise omit
- needsMoreInfo: true if intent=edit and no specific field to change was mentioned
- Omit null fields from the JSON entirely`
  );

  const raw = parseJson<{
    taskQuery?: string;
    editFields?: { title?: string; estimatedMinutes?: number; projectName?: string };
    needsMoreInfo?: boolean;
  }>(response);

  return { intent, ...raw };
}

export async function analyzeTask(
  taskText: string,
  hints: ParsedUserHints
): Promise<TaskAnalysis> {
  const prompt = buildPrompt(taskText, hints);
  const response = await callOllama(prompt);
  const raw = parseJson<{
    taskTitle: string;
    complexity: string;
    estimatedMinutes: number;
    dueDate?: string;
    isAllDay?: boolean;
  }>(response);

  const estimatedMinutes = hints.estimatedMinutes ?? raw.estimatedMinutes ?? 30;
  const bucket = minutesToDurationBucket(estimatedMinutes);
  const complexity = (hints.complexity ?? raw.complexity) as "low" | "medium" | "high";

  return {
    taskTitle: raw.taskTitle,
    taskType: raw.dueDate ? "calendar" : "simple",
    complexity,
    duration: bucket,
    priority: 0,
    tags: [DURATION_TAGS[bucket]],
    estimatedMinutes,
    dueDate: raw.dueDate,
    isAllDay: raw.isAllDay,
  };
}

export async function parseDateText(text: string): Promise<{ dueDate?: string; isAllDay?: boolean }> {
  const now = new Date();
  const tz = appConfig.USER_TIMEZONE;
  const dateStr = now.toLocaleDateString("ru-RU", { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: tz });
  const timeStr = now.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: tz });

  const response = await callOllama(
    `Parse the date/time from this message and return ONLY valid JSON.

CURRENT DATE AND TIME: ${dateStr}, ${timeStr}

USER MESSAGE: "${text}"

Return ONLY:
{ "dueDate": "2026-05-01T15:00:00", "isAllDay": false }

Rules:
- dueDate: ISO 8601 datetime without timezone offset
- isAllDay: true if only date mentioned (no time), false if time specified
- If no date/time can be determined, return {}`
  );

  return parseJson<{ dueDate?: string; isAllDay?: boolean }>(response);
}

function buildPrompt(taskText: string, hints: ParsedUserHints): string {
  const now = new Date();
  const tz = appConfig.USER_TIMEZONE;
  const dateStr = now.toLocaleDateString("ru-RU", { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: tz });
  const timeStr = now.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: tz });

  const hintsSection = [
    hints.complexity ? `- Complexity: ${hints.complexity}` : "",
    hints.estimatedMinutes ? `- Estimated duration: ${hints.estimatedMinutes} minutes (user specified — do not change)` : "",
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
  "complexity": "low",
  "estimatedMinutes": 25,
  "dueDate": "2026-04-28T15:00:00",
  "isAllDay": false
}

Rules:
- taskTitle: task essence only, in the SAME LANGUAGE as the user message. Do NOT include date/time in the title.
- complexity: "low" | "medium" | "high"
- estimatedMinutes: realistic estimate in minutes for how long this task will take (any number, e.g. 15, 45, 90)
- dueDate: ISO 8601 datetime without timezone. Set ONLY if the message contains a specific date, day of week, time, or relative reference (today/tomorrow/evening/in N days). If no date/time mentioned — omit entirely.
- isAllDay: true if only a date was mentioned (no specific time), false if time was specified. Omit if dueDate is not set.`;
}

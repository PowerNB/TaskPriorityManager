import { callClaude, parseJson } from "../../claude/client.js";
import type { TaskAnalysis, ParsedUserHints, TaskDuration, TaskPriority, Subtask, TaskIntentAnalysis } from "../types/index.js";

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

const PRIORITY_HINT_MAP: Record<string, TaskPriority> = {
  "высокий": 3,
  "высокая": 3,
  "high": 3,
  "средний": 2,
  "средняя": 2,
  "medium": 2,
  "низкий": 1,
  "низкая": 1,
  "low": 1,
};

const INTENT_KEYWORDS = {
  delete:   ["удали", "удалить", "убери", "убрать", "сотри", "стереть"],
  complete: ["заверши", "завершить", "выполни", "выполнить", "сделал", "готово", "закрой", "закрыть"],
  edit:     ["измени", "изменить", "переименуй", "переименовать", "обнови", "обновить", "редактируй", "отредактируй", "поменяй", "поменять"],
};

export function detectIntent(text: string): "delete" | "complete" | "edit" | "create" {
  const lower = text.toLowerCase();
  for (const [intent, keywords] of Object.entries(INTENT_KEYWORDS)) {
    if (keywords.some((kw) => lower.includes(kw))) {
      return intent as "delete" | "complete" | "edit";
    }
  }
  return "create";
}

export async function analyzeIntent(text: string): Promise<TaskIntentAnalysis> {
  const intent = detectIntent(text);
  if (intent === "create") return { intent: "create" };

  const response = await callClaude(
    `Пользователь написал: "${text}"
Намерение: ${intent}

Верни ТОЛЬКО валидный JSON:
{
  "taskQuery": "название задачи которую нужно найти",
  "editFields": {
    "title": "новое название если указано или null",
    "duration": "5min|30min|1hour|2hours+ если указано или null",
    "projectName": "название листа если указано или null"
  },
  "needsMoreInfo": false
}

Правила:
- taskQuery: извлеки название задачи из сообщения (что нужно найти)
- editFields: только для intent=edit, иначе пусть будет {}
- needsMoreInfo: true если intent=edit и не указано что именно менять
- Все null-поля просто не включай в JSON`
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

  for (const [keyword, priority] of Object.entries(PRIORITY_HINT_MAP)) {
    if (lower.includes(keyword + " приоритет") || lower.includes("приоритет " + keyword)) {
      hints.priority = priority;
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
  personalGoals: string,
  careerGoals: string,
  hints: ParsedUserHints
): Promise<TaskAnalysis> {
  const prompt = buildPrompt(taskText, personalGoals, careerGoals, hints);
  const response = await callClaude(prompt);
  const raw = parseJson<{
    taskTitle: string;
    taskType: string;
    complexity: string;
    duration: string;
    priority: number;
    estimatedMinutes: number;
    subtasks?: Subtask[];
  }>(response);

  const duration = (hints.duration ?? raw.duration) as TaskDuration;
  const priority = (hints.priority ?? raw.priority) as TaskPriority;
  const complexity = (hints.complexity ?? raw.complexity) as "low" | "medium" | "high";

  return {
    taskTitle: raw.taskTitle,
    taskType: raw.taskType as TaskAnalysis["taskType"],
    complexity,
    duration,
    priority,
    tags: [],
    estimatedMinutes: raw.estimatedMinutes,
    subtasks: raw.subtasks,
  };
}

function buildPrompt(
  taskText: string,
  personalGoals: string,
  careerGoals: string,
  hints: ParsedUserHints
): string {
  const goalsSection = [
    personalGoals ? `Личные цели пользователя: ${personalGoals}` : "",
    careerGoals ? `Карьерные цели пользователя: ${careerGoals}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const hintsSection = [
    hints.complexity ? `- Сложность указана пользователем: ${hints.complexity}` : "",
    hints.duration ? `- Время выполнения указано пользователем: ${hints.duration}` : "",
    hints.priority !== undefined ? `- Приоритет указан пользователем: ${hints.priority}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return `Ты — ассистент по управлению задачами. Проанализируй сообщение пользователя и верни JSON.

${goalsSection ? `ЦЕЛИ ПОЛЬЗОВАТЕЛЯ:\n${goalsSection}\n` : ""}
СООБЩЕНИЕ ПОЛЬЗОВАТЕЛЯ: ${taskText}

${hintsSection ? `УЖЕ ОПРЕДЕЛЕНО ИЗ СООБЩЕНИЯ (не меняй эти значения):\n${hintsSection}\n` : ""}

Верни ТОЛЬКО валидный JSON без пояснений:
{
  "taskTitle": "Краткое чёткое название задачи",
  "taskType": "calendar | simple | project",
  "complexity": "low | medium | high",
  "duration": "5min | 30min | 1hour | 2hours+",
  "priority": 0,
  "estimatedMinutes": 5,
  "subtasks": [
    {
      "title": "Подзадача 1",
      "subtasks": [
        { "title": "Подподзадача 1.1" }
      ]
    }
  ]
}

Правила:
- taskTitle: только суть задачи без инструкций
- taskType:
  "calendar" — задача привязана к дате/времени/событию (встреча, звонок, дедлайн, напоминание)
  "simple" — простое одноразовое действие (купить, позвонить, сходить, написать короткое сообщение)
  "project" — требует нескольких шагов, планирования, времени (разработка, исследование, создание чего-то)
- complexity: "low" | "medium" | "high"
- duration: "5min" | "30min" | "1hour" | "2hours+"
- priority: 0=нет, 1=низкий, 2=средний, 3=высокий
- estimatedMinutes: число
- subtasks: только для taskType="project". Разбей на логические шаги. Если шаг сложный — добавь вложенные subtasks. Для "calendar" и "simple" — не указывай поле subtasks совсем`;
}

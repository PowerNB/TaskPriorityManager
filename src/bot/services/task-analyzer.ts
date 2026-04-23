import { callClaude, parseJson } from "../../claude/client.js";
import type { TaskAnalysis, ParsedUserHints, TaskDuration, TaskPriority } from "../types/index.js";

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
    complexity: string;
    duration: string;
    priority: number;
    tags: string[];
    estimatedMinutes: number;
  }>(response);

  const duration = (hints.duration ?? raw.duration) as TaskDuration;
  const priority = (hints.priority ?? raw.priority) as TaskPriority;
  const complexity = (hints.complexity ?? raw.complexity) as "low" | "medium" | "high";

  return {
    complexity,
    duration,
    priority,
    tags: raw.tags,
    estimatedMinutes: raw.estimatedMinutes,
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

  return `Ты — ассистент по управлению задачами. Проанализируй задачу и верни JSON.

${goalsSection ? `ЦЕЛИ ПОЛЬЗОВАТЕЛЯ:\n${goalsSection}\n` : ""}
ЗАДАЧА: ${taskText}

${hintsSection ? `УЖЕ ОПРЕДЕЛЕНО ПОЛЬЗОВАТЕЛЕМ (не меняй эти значения):\n${hintsSection}\n` : ""}

Определи следующее (пропусти то, что уже указано пользователем):
- complexity: сложность ("low" | "medium" | "high")
- duration: время на выполнение ("5min" | "30min" | "1hour" | "2hours+")
- priority: приоритет (0=нет, 1=низкий, 2=средний, 3=высокий). Учитывай цели пользователя — задачи, связанные с его целями, имеют более высокий приоритет
- tags: массив тегов (3-5 штук, на русском, одним словом)
- estimatedMinutes: примерное время в минутах (число)

Верни ТОЛЬКО валидный JSON без пояснений:
{
  "complexity": "medium",
  "duration": "30min",
  "priority": 2,
  "tags": ["работа", "планирование"],
  "estimatedMinutes": 30
}`;
}

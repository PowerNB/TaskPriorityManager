export const LISTS = {
  inbox:    "Входящие",
  calendar: "Календарь",
  simple:   "Простые задачи",
  project:  "Проектные задачи",
} as const;

export type ListKey = keyof typeof LISTS;

export const LIST_COLORS: Record<string, string> = {
  "Входящие":         "#607d8b",
  "Календарь":        "#4caf50",
  "Простые задачи":   "#00bcd4",
  "Проектные задачи": "#9c27b0",
};

export const ALL_LIST_NAMES = Object.values(LISTS);

// New duration tags
export const DURATION_TAGS = {
  "5min":    "до 5 минут",
  "30min":   "до 30 минут",
  "1hour":   "до 1 часа",
  "2hours":  "до 2-х часов",
  "2hours+": "более 2-х часов",
} as const;

export type DurationBucket = keyof typeof DURATION_TAGS;

export function minutesToDurationBucket(minutes: number): DurationBucket {
  if (minutes <= 5)   return "5min";
  if (minutes <= 30)  return "30min";
  if (minutes <= 60)  return "1hour";
  if (minutes <= 120) return "2hours";
  return "2hours+";
}

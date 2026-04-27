export const LISTS = {
  inbox:   "Входящие",
  calendar: "Календарь",
  simple:  "Простые задачи",
  project: "Проектные задачи",
} as const;

export type ListKey = keyof typeof LISTS;

export const LIST_COLORS: Record<string, string> = {
  "Входящие":        "#607d8b", // blue-grey
  "Календарь":       "#4caf50", // green
  "Простые задачи":  "#00bcd4", // cyan
  "Проектные задачи":"#9c27b0", // purple
};

export const ALL_LIST_NAMES = Object.values(LISTS);

export const DURATION_TAGS: Record<string, string> = {
  "5min":    "5-минут",
  "30min":   "30-минут",
  "1hour":   "1-час",
  "2hours+": "2-часа+",
};

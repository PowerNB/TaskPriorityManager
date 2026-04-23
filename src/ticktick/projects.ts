export const DURATION_PROJECTS = {
  "5min": "5 минут",
  "30min": "30 минут",
  "1hour": "1 час",
  "2hours+": "Более 2-х часов - проекты",
} as const;

export type DurationKey = keyof typeof DURATION_PROJECTS;

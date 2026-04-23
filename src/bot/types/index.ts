export type TaskPriority = 0 | 1 | 2 | 3; // 0=none, 1=low, 2=medium, 3=high

export type TaskDuration = "5min" | "30min" | "1hour" | "2hours+";

export interface TaskAnalysis {
  complexity: "low" | "medium" | "high";
  duration: TaskDuration;
  priority: TaskPriority;
  tags: string[];
  estimatedMinutes: number;
}

export interface ParsedUserHints {
  priority?: TaskPriority;
  duration?: TaskDuration;
  complexity?: "low" | "medium" | "high";
}

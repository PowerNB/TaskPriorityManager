export type TaskPriority = 0 | 1 | 2 | 3;

export type TaskIntent = "create" | "delete" | "complete" | "edit" | "list" | "today" | "week";

export interface TaskIntentAnalysis {
  intent: TaskIntent;
  taskQuery?: string;       // название задачи для поиска (delete/complete/edit)
  editFields?: {
    title?: string;
    estimatedMinutes?: number;
    projectName?: string;
  };
  needsMoreInfo?: boolean;  // true если edit без деталей
} // 0=none, 1=low, 2=medium, 3=high

export type TaskDuration = "5min" | "30min" | "1hour" | "2hours" | "2hours+";

export type TaskType = "calendar" | "simple" | "project";

export interface Subtask {
  title: string;
  subtasks?: Subtask[];
}

export interface TaskAnalysis {
  taskTitle: string;
  taskType: TaskType;
  complexity: "low" | "medium" | "high";
  duration: TaskDuration;
  priority: TaskPriority;
  tags: string[];
  estimatedMinutes: number;
  subtasks?: Subtask[];
  dueDate?: string;   // ISO 8601 if calendar task
  isAllDay?: boolean;
}

export interface ParsedUserHints {
  priority?: TaskPriority;
  estimatedMinutes?: number;
  complexity?: "low" | "medium" | "high";
}

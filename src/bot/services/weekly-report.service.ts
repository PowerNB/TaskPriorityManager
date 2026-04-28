import { createTickTickClient } from "../../ticktick/client.js";
import type { TickTickTokenRepository } from "../repositories/ticktick-token.repository.js";
import type { WeeklyReportRepository } from "../repositories/weekly-report.repository.js";

interface TaskEntry {
  title: string;
  dueDate?: string;
  completedAt?: string;
  status: number;
}

function getWeekBounds(ref: Date): { weekStart: Date; weekEnd: Date } {
  const weekEnd = new Date(ref);
  weekEnd.setHours(23, 59, 59, 999);

  const weekStart = new Date(weekEnd);
  weekStart.setDate(weekEnd.getDate() - 6); // Mon–Sun window
  weekStart.setHours(0, 0, 0, 0);

  return { weekStart, weekEnd };
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
}

export async function generateWeeklyReport(
  userId: number,
  tokenRepo: TickTickTokenRepository,
  reportRepo: WeeklyReportRepository,
  now = new Date()
): Promise<string> {
  const token = await tokenRepo.findByUserId(userId);
  if (!token) return "";

  const client = createTickTickClient(token, userId, tokenRepo);
  const { weekStart, weekEnd } = getWeekBounds(now);

  // Fetch all tasks across all projects
  const projects = await client.getProjects();
  const allTasks: (TaskEntry & { projectName: string })[] = [];

  for (const project of projects) {
    try {
      const data = await client.getProjectTasks(project.id);
      for (const t of data.tasks ?? []) {
        allTasks.push({
          title: t.title,
          dueDate: t.dueDate,
          status: t.status ?? 0,
          projectName: project.name,
        });
      }
    } catch { /* skip */ }
  }

  // Planned = tasks with dueDate within the week
  const planned = allTasks.filter((t) => {
    if (!t.dueDate) return false;
    const d = new Date(t.dueDate);
    return d >= weekStart && d <= weekEnd;
  });

  // Completed = status 2
  const completed = planned.filter((t) => (t.status as number) === 2);

  // Overdue = not completed and dueDate has passed
  const overdue = planned.filter((t) => (t.status as number) !== 2 && t.dueDate && new Date(t.dueDate) < now);

  // On-time = completed before their dueDate
  const onTime = completed.filter((t) => t.dueDate && new Date(t.dueDate) >= now);
  const onTimePercent = completed.length > 0 ? Math.round((onTime.length / completed.length) * 100) : 0;

  // Build report text
  const weekLabel = `${formatDate(weekStart)} – ${formatDate(weekEnd)}`;
  const lines: string[] = [
    `📊 Отчёт за неделю: ${weekLabel}`,
    ``,
    `📋 Запланировано: ${planned.length}`,
    `✅ Выполнено: ${completed.length}`,
    `❌ Просрочено: ${overdue.length}`,
    `⏱ Выполнено в срок: ${onTimePercent}%`,
  ];

  if (completed.length > 0) {
    lines.push(``, `✅ Выполненные задачи:`);
    for (const t of completed) {
      const dateStr = t.dueDate ? ` (срок: ${formatDateTime(t.dueDate)})` : "";
      lines.push(`  • ${t.title}${dateStr}`);
    }
  }

  if (overdue.length > 0) {
    lines.push(``, `❌ Невыполненные / просроченные:`);
    for (const t of overdue) {
      const dateStr = t.dueDate ? ` (было: ${formatDateTime(t.dueDate)})` : "";
      lines.push(`  • ${t.title}${dateStr}`);
    }
  }

  const notPlanned = planned.length === 0 && allTasks.length > 0
    ? `\n\n💡 На этой неделе не было задач с дедлайном.`
    : "";

  const reportText = lines.join("\n") + notPlanned;

  await reportRepo.save({
    userId,
    weekStart,
    weekEnd,
    totalPlanned: planned.length,
    totalCompleted: completed.length,
    totalOverdue: overdue.length,
    onTimePercent,
    reportText,
  });

  return reportText;
}

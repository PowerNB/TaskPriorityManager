import type { PrismaClient } from "@prisma/client";

export interface WeeklyReportData {
  userId: number;
  weekStart: Date;
  weekEnd: Date;
  totalPlanned: number;
  totalCompleted: number;
  totalOverdue: number;
  onTimePercent: number;
  reportText: string;
}

export class WeeklyReportRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async save(data: WeeklyReportData): Promise<void> {
    await this.prisma.weeklyReport.upsert({
      where: {
        // upsert by userId + weekStart using a compound unique would be ideal,
        // but SQLite doesn't need migration for this — use findFirst + update pattern
        id: (await this.prisma.weeklyReport.findFirst({
          where: { userId: data.userId, weekStart: data.weekStart },
        }))?.id ?? 0,
      },
      create: data,
      update: { reportText: data.reportText, totalPlanned: data.totalPlanned, totalCompleted: data.totalCompleted, totalOverdue: data.totalOverdue, onTimePercent: data.onTimePercent },
    });
  }

  async findRecent(userId: number, limit = 5): Promise<{ id: number; weekStart: Date; weekEnd: Date; reportText: string; onTimePercent: number }[]> {
    return this.prisma.weeklyReport.findMany({
      where: { userId },
      orderBy: { weekStart: "desc" },
      take: limit,
      select: { id: true, weekStart: true, weekEnd: true, reportText: true, onTimePercent: true },
    });
  }

  async findById(id: number): Promise<{ reportText: string; weekStart: Date } | null> {
    return this.prisma.weeklyReport.findUnique({
      where: { id },
      select: { reportText: true, weekStart: true },
    });
  }
}

import type { PrismaClient } from "@prisma/client";

export class ScheduledTaskRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async save(data: {
    userId: number;
    ticktickId: string;
    title: string;
    dueDate: Date;
    isAllDay: boolean;
  }): Promise<void> {
    const existing = await this.prisma.scheduledTask.findFirst({ where: { ticktickId: data.ticktickId } });
    if (existing) {
      await this.prisma.scheduledTask.update({
        where: { id: existing.id },
        data: { title: data.title, dueDate: data.dueDate, isAllDay: data.isAllDay },
      });
    } else {
      await this.prisma.scheduledTask.create({ data: { ...data, reminded9am: false, remindedHour: false } });
    }
  }

  async getPendingMorning(now: Date): Promise<{ id: number; userId: number; title: string; dueDate: Date; isAllDay: boolean }[]> {
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);

    return this.prisma.scheduledTask.findMany({
      where: {
        dueDate: { gte: startOfDay, lte: endOfDay },
        reminded9am: false,
      },
    });
  }

  async getPendingHour(from: Date, to: Date): Promise<{ id: number; userId: number; title: string; dueDate: Date; isAllDay: boolean }[]> {
    return this.prisma.scheduledTask.findMany({
      where: {
        dueDate: { gte: from, lte: to },
        isAllDay: false,
        remindedHour: false,
      },
    });
  }

  async markMorning(id: number): Promise<void> {
    await this.prisma.scheduledTask.update({ where: { id }, data: { reminded9am: true } });
  }

  async markHour(id: number): Promise<void> {
    await this.prisma.scheduledTask.update({ where: { id }, data: { remindedHour: true } });
  }

  async deleteOld(before: Date): Promise<void> {
    await this.prisma.scheduledTask.deleteMany({ where: { dueDate: { lt: before } } });
  }
}

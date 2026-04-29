import type { PrismaClient, Task, Category, DurationTag, Status } from "@prisma/client";

export interface CreateTaskInput {
  userId: bigint;
  title: string;
  category: Category;
  duration_tag: DurationTag;
  due_date?: Date;
  due_time?: Date;
}

export class BotTaskRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(data: CreateTaskInput): Promise<Task> {
    return this.prisma.task.create({ data });
  }

  async findById(id: string): Promise<Task | null> {
    return this.prisma.task.findUnique({ where: { id } });
  }

  async findActiveByUserId(userId: bigint): Promise<Task[]> {
    return this.prisma.task.findMany({
      where: { userId, status: "ACTIVE" },
      orderBy: { elo_score: "desc" },
    });
  }

  async updateStatus(id: string, status: Status): Promise<Task> {
    const data: Partial<Task> = { status, last_activity_at: new Date() };
    if (status === "DONE") data.completed_at = new Date();
    if (status === "FROZEN") data.frozen_at = new Date();
    if (status === "ARCHIVED") data.archived_at = new Date();
    return this.prisma.task.update({ where: { id }, data });
  }

  async update(id: string, data: Partial<Pick<Task, "title" | "category" | "duration_tag" | "due_date" | "due_time" | "delegated_to" | "delegated_at" | "remind_delegation_at">>): Promise<Task> {
    return this.prisma.task.update({
      where: { id },
      data: { ...data, last_activity_at: new Date() },
    });
  }
}


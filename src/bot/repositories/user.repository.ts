import type { PrismaClient, TelegramUser } from "@prisma/client";

export class UserRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: number): Promise<TelegramUser | null> {
    return this.prisma.telegramUser.findUnique({ where: { id } });
  }

  async upsert(data: { id: number; username?: string; firstName: string }): Promise<TelegramUser> {
    return this.prisma.telegramUser.upsert({
      where: { id: data.id },
      create: {
        id: data.id,
        username: data.username,
        firstName: data.firstName,
        settings: { create: { personalGoals: "", careerGoals: "" } },
      },
      update: {
        username: data.username,
        firstName: data.firstName,
      },
    });
  }
}

import type { PrismaClient, UserSettings } from "@prisma/client";

export class SettingsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByUserId(userId: number): Promise<UserSettings | null> {
    return this.prisma.userSettings.findUnique({ where: { userId } });
  }

  async update(
    userId: number,
    data: Partial<{ personalGoals: string; careerGoals: string }>
  ): Promise<UserSettings> {
    return this.prisma.userSettings.upsert({
      where: { userId },
      create: { userId, personalGoals: "", careerGoals: "", ...data },
      update: data,
    });
  }
}

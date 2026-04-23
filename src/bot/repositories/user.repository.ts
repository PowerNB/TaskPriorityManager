import type { PrismaClient, User } from "@prisma/client";

export class UserRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: number): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async upsert(data: { id: number; username?: string; firstName: string }): Promise<User> {
    return this.prisma.user.upsert({
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

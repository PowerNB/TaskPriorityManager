import type { PrismaClient, User } from "@prisma/client";

export class BotUserRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: bigint): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async upsert(data: { id: bigint; username?: string }): Promise<User> {
    return this.prisma.user.upsert({
      where: { id: data.id },
      create: { id: data.id, username: data.username },
      update: { username: data.username },
    });
  }
}

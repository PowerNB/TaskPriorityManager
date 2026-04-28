import type { PrismaClient, TickTickToken } from "@prisma/client";

export class TickTickTokenRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByUserId(userId: number): Promise<TickTickToken | null> {
    return this.prisma.tickTickToken.findUnique({ where: { userId } });
  }

  async save(data: {
    userId: number;
    clientId: string;
    clientSecret: string;
    accessToken: string;
    refreshToken: string;
    expiresAt: Date;
  }): Promise<TickTickToken> {
    return this.prisma.tickTickToken.upsert({
      where: { userId: data.userId },
      create: data,
      update: {
        clientId: data.clientId,
        clientSecret: data.clientSecret,
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        expiresAt: data.expiresAt,
      },
    });
  }

  async delete(userId: number): Promise<void> {
    await this.prisma.tickTickToken.deleteMany({ where: { userId } });
  }

  async findAll(): Promise<TickTickToken[]> {
    return this.prisma.tickTickToken.findMany();
  }
}

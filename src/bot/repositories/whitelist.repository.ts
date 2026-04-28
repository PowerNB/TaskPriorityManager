import type { PrismaClient } from "@prisma/client";

export class WhitelistRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async has(userId: number): Promise<boolean> {
    const entry = await this.prisma.whitelistEntry.findUnique({ where: { userId } });
    return entry !== null;
  }

  async add(userId: number): Promise<void> {
    await this.prisma.whitelistEntry.upsert({
      where: { userId },
      create: { userId },
      update: {},
    });
  }

  async remove(userId: number): Promise<void> {
    await this.prisma.whitelistEntry.deleteMany({ where: { userId } });
  }

  async count(): Promise<number> {
    return this.prisma.whitelistEntry.count();
  }
}

import type { StorageAdapter } from "grammy";
import type { PrismaClient } from "@prisma/client";

export function createPrismaSessionStorage<T>(prisma: PrismaClient): StorageAdapter<T> {
  return {
    async read(key: string): Promise<T | undefined> {
      const session = await prisma.session.findUnique({ where: { key } });
      if (!session) return undefined;
      return JSON.parse(session.value) as T;
    },
    async write(key: string, value: T): Promise<void> {
      const serialized = JSON.stringify(value);
      await prisma.session.upsert({
        where: { key },
        create: { key, value: serialized },
        update: { value: serialized },
      });
    },
    async delete(key: string): Promise<void> {
      await prisma.session.deleteMany({ where: { key } });
    },
  };
}

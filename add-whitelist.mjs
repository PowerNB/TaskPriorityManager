import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
await p.whitelistEntry.create({ data: { userId: 808980078 } });
console.log("Done");
await p.$disconnect();

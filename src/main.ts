import { PrismaClient } from "@prisma/client";
import { run } from "@grammyjs/runner";
import { appConfig, isDev } from "./config.js";
import { logger } from "./logger.js";
import { createBot } from "./bot/index.js";

async function main(): Promise<void> {
  logger.info("Starting bot...");

  const prisma = new PrismaClient();
  await prisma.$connect();
  logger.info("Database connected");

  const bot = createBot(prisma, logger);

  await bot.api.setMyCommands([
    { command: "start", description: "Начать работу с ботом" },
    { command: "connect", description: "Подключить TickTick" },
    { command: "disconnect", description: "Отключить TickTick" },
    { command: "settings", description: "Настройки целей" },
    { command: "personal_goals", description: "Изменить личные цели" },
    { command: "career_goals", description: "Изменить карьерные цели" },
    { command: "help", description: "Справка" },
  ]);

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, "Shutting down...");
    bot.stop();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));

  if (isDev) {
    logger.info("Running in polling mode (dev)");
    await bot.start({
      onStart: (info) => logger.info(`Bot @${info.username} started`),
    });
  } else {
    logger.info("Running with runner (prod)");
    const runner = run(bot);
    await bot.api.getMe().then((info) => logger.info(`Bot @${info.username} started`));

    process.once("SIGINT", () => runner.stop());
    process.once("SIGTERM", () => runner.stop());
  }
}

main().catch((err) => {
  logger.error({ err }, "Fatal error");
  process.exit(1);
});

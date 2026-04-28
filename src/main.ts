// Force UTF-8 output on Windows
if (process.stdout.isTTY) process.stdout.setEncoding("utf8");
if (process.stderr.isTTY) process.stderr.setEncoding("utf8");

import { PrismaClient } from "@prisma/client";
import { run } from "@grammyjs/runner";
import { isDev } from "./config.js";
import { logger } from "./logger.js";
import { createBot } from "./bot/index.js";
import { initWhisper } from "./voice/transcriber.js";
import { startScheduler } from "./scheduler/reminders.js";

async function main(): Promise<void> {
  logger.info("Starting bot...");

  try {
    initWhisper();
    logger.info("Whisper server initialized");
  } catch (err) {
    logger.warn({ err }, "Whisper not available — voice messages will not work");
  }

  const prisma = new PrismaClient();
  await prisma.$connect();
  logger.info("Database connected");

  const { bot, scheduledTaskRepo, ticktickTokenRepo, weeklyReportRepo } = createBot(prisma, logger);

  await bot.api.setMyCommands([
    { command: "start", description: "Начать работу с ботом" },
    { command: "connect", description: "Подключить TickTick" },
    { command: "disconnect", description: "Отключить TickTick" },
    { command: "settings", description: "Настройки" },
    { command: "help", description: "Справка" },
    { command: "report", description: "Отчёт за неделю" },
    { command: "admin", description: "Статистика Groq API (только для администраторов)" },
  ]);

  startScheduler(bot, scheduledTaskRepo, ticktickTokenRepo, weeklyReportRepo);
  logger.info("Scheduler started");

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

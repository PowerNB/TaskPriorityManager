import { Bot, session } from "grammy";
import { conversations } from "@grammyjs/conversations";
import type { PrismaClient } from "@prisma/client";
import type { Logger } from "pino";
import type { BotContext, SessionData } from "./context.js";
import { appConfig } from "../config.js";
import { UserRepository } from "./repositories/user.repository.js";
import { SettingsRepository } from "./repositories/settings.repository.js";
import { TickTickTokenRepository } from "./repositories/ticktick-token.repository.js";
import { WhitelistRepository } from "./repositories/whitelist.repository.js";
import { ScheduledTaskRepository } from "./repositories/scheduled-task.repository.js";
import { WeeklyReportRepository } from "./repositories/weekly-report.repository.js";
import { BotUserRepository } from "./repositories/bot-user.repository.js";
import { BotTaskRepository } from "./repositories/bot-task.repository.js";
import { authMiddleware } from "./middleware/auth.mw.js";
import { startFeature } from "./features/start.js";
import { createConnectFeature } from "./features/connect.js";
import { createSettingsFeature } from "./features/settings.js";
import { createManualFeature } from "./features/manual.js";
import { taskFeature } from "./features/task.js";
import { adminFeature } from "./features/admin.js";
import { reportFeature } from "./features/report.js";
import { unhandledFeature } from "./features/unhandled.js";
import { createPrismaSessionStorage } from "./helpers/session-storage.js";

export function createBot(prisma: PrismaClient, logger: Logger): { bot: Bot<BotContext>; scheduledTaskRepo: ScheduledTaskRepository; ticktickTokenRepo: TickTickTokenRepository; weeklyReportRepo: WeeklyReportRepository } {
  const bot = new Bot<BotContext>(appConfig.BOT_TOKEN);

  const userRepo = new UserRepository(prisma);
  const settingsRepo = new SettingsRepository(prisma);
  const ticktickTokenRepo = new TickTickTokenRepository(prisma);
  const whitelistRepo = new WhitelistRepository(prisma);
  const scheduledTaskRepo = new ScheduledTaskRepository(prisma);
  const weeklyReportRepo = new WeeklyReportRepository(prisma);
  const botUserRepo = new BotUserRepository(prisma);
  const botTaskRepo = new BotTaskRepository(prisma);

  // Inject dependencies into context
  bot.use(async (ctx, next) => {
    ctx.logger = logger.child({ updateId: ctx.update.update_id });
    ctx.prisma = prisma;
    ctx.userRepo = userRepo;
    ctx.settingsRepo = settingsRepo;
    ctx.ticktickTokenRepo = ticktickTokenRepo;
    ctx.whitelistRepo = whitelistRepo;
    ctx.scheduledTaskRepo = scheduledTaskRepo;
    ctx.weeklyReportRepo = weeklyReportRepo;
    ctx.botUserRepo = botUserRepo;
    ctx.botTaskRepo = botTaskRepo;
    await next();
  });

  // Session
  bot.use(
    session<SessionData, BotContext>({
      initial: (): SessionData => ({}),
      storage: createPrismaSessionStorage<SessionData>(prisma),
    })
  );

  // Conversations plugin
  bot.use(conversations());

  // Auth
  bot.use(authMiddleware);

  // Features — repositories passed directly to avoid closure issues in conversation replay
  bot.use(startFeature);
  bot.use(createConnectFeature(ticktickTokenRepo));
  bot.use(createSettingsFeature(settingsRepo));
  bot.use(createManualFeature(ticktickTokenRepo));
  bot.use(taskFeature);
  bot.use(adminFeature);
  bot.use(reportFeature);
  bot.use(unhandledFeature);

  // Error handler
  bot.catch((err) => {
    const e = err.error;
    if (e instanceof Error && e.message.includes("message is not modified")) {
      return;
    }
    // Log with full error message to help diagnose silent failures
    logger.error(
      { err: e, message: e instanceof Error ? e.message : String(e), update: err.ctx?.update },
      "Unhandled bot error"
    );
  });

  return { bot, scheduledTaskRepo, ticktickTokenRepo, weeklyReportRepo };
}

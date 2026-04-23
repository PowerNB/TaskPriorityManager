import { Context, SessionFlavor } from "grammy";
import { ConversationFlavor } from "@grammyjs/conversations";
import type { Logger } from "pino";
import type { PrismaClient } from "@prisma/client";
import type { UserRepository } from "./repositories/user.repository.js";
import type { SettingsRepository } from "./repositories/settings.repository.js";
import type { TickTickTokenRepository } from "./repositories/ticktick-token.repository.js";

export interface SessionData {
  ticktickOAuthState?: string;
}

export type BotContext = ConversationFlavor<
  Context &
    SessionFlavor<SessionData> & {
      logger: Logger;
      prisma: PrismaClient;
      userRepo: UserRepository;
      settingsRepo: SettingsRepository;
      ticktickTokenRepo: TickTickTokenRepository;
    }
>;

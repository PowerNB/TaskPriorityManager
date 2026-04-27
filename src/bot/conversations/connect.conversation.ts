import type { Conversation } from "@grammyjs/conversations";
import crypto from "crypto";
import type { BotContext } from "../context.js";
import type { TickTickTokenRepository } from "../repositories/ticktick-token.repository.js";
import { buildAuthUrl, exchangeCode, createTickTickClient } from "../../ticktick/client.js";
import { ALL_LIST_NAMES } from "../../ticktick/projects.js";

type ConnectConversation = Conversation<BotContext, BotContext>;

export function makeConnectConversation(tokenRepo: TickTickTokenRepository) {
  return async function connectTickTickConversation(
    conversation: ConnectConversation,
    ctx: BotContext
  ): Promise<void> {
    const userId = ctx.from!.id;

    await ctx.reply(
      `⚠️ После подключения бот автоматически создаст в твоём TickTick 4 списка:\n\n` +
        ALL_LIST_NAMES.map((n: string) => `  • ${n}`).join("\n") +
        `\n\nЕсли они уже есть — ничего не изменится.`
    );

    await ctx.reply(
      `🔑 Шаг 1/3 — Client ID\n\n` +
        `Если ещё не создал приложение в TickTick:\n` +
        `1. Открой https://developer.ticktick.com/manage\n` +
        `2. Нажми New App\n` +
        `3. В поле App Service URL укажи свой Redirect URI\n` +
        `4. Скопируй Client ID и Client Secret\n\n` +
        `Введи Client ID:\n\n` +
        `/cancel — отмена`
    );

    const clientIdMsg = await conversation.waitFor("message:text");
    const clientId = clientIdMsg.message.text.trim();

    if (clientId === "/cancel") {
      await ctx.reply("Отменено.");
      return;
    }

    await ctx.reply(`🔑 Шаг 2/3 — Client Secret\n\nТеперь введи Client Secret из того же приложения:\n\n/cancel — отмена`);

    const clientSecretMsg = await conversation.waitFor("message:text");
    const clientSecret = clientSecretMsg.message.text.trim();

    if (clientSecret === "/cancel") {
      await ctx.reply("Отменено.");
      return;
    }

    const authUrl = await conversation.external(() => {
      const state = crypto.randomBytes(16).toString("hex");
      return buildAuthUrl(clientId, state);
    });

    await ctx.reply(
      `🔗 Шаг 3/3 — Авторизация\n\n` +
        `Перейди по ссылке и нажми "Allow":\n${authUrl}\n\n` +
        `После этого браузер перенаправит тебя на Redirect URI. Скопируй значение параметра code из адресной строки:\n\n` +
        `...?code=СЮДА_СМОТРЕТЬ&state=...\n\n` +
        `Отправь только сам code:\n\n` +
        `/cancel — отмена`
    );

    const codeMsg = await conversation.waitFor("message:text");
    const code = codeMsg.message.text.trim();

    if (code === "/cancel") {
      await ctx.reply("Отменено.");
      return;
    }

    const processingMsg = await ctx.reply("⏳ Подключаю TickTick...");

    const result = await conversation.external(async () => {
      try {
        const tokens = await exchangeCode(code, clientId, clientSecret);
        await tokenRepo.save({ userId, clientId, clientSecret, ...tokens });

        const client = createTickTickClient(
          { ...tokens, clientId, clientSecret },
          userId,
          tokenRepo
        );
        const created = await client.ensureProjectsExist();

        return { ok: true, created } as const;
      } catch (err) {
        return {
          ok: false,
          message: err instanceof Error ? err.message : String(err),
        } as const;
      }
    });

    if (result.ok) {
      const createdNote =
        result.created.length > 0
          ? `\n\nСозданы списки:\n${result.created.map((n) => `  • ${n}`).join("\n")}`
          : `\n\nВсе списки уже существовали.`;

      await ctx.api.editMessageText(
        processingMsg.chat.id,
        processingMsg.message_id,
        `✅ TickTick подключён!${createdNote}\n\nТеперь просто пиши задачу — бот всё разберёт сам.`
      );
    } else {
      await ctx.api.editMessageText(
        processingMsg.chat.id,
        processingMsg.message_id,
        `❌ Не удалось подключить TickTick. Проверь данные и попробуй снова через /connect.\n\nОшибка: ${result.message}`
      );
    }
  };
}

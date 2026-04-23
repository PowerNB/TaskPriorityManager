import type { Conversation } from "@grammyjs/conversations";
import crypto from "crypto";
import type { BotContext } from "../context.js";
import type { TickTickTokenRepository } from "../repositories/ticktick-token.repository.js";
import { buildAuthUrl, exchangeCode } from "../../ticktick/client.js";

type ConnectConversation = Conversation<BotContext, BotContext>;

export function makeConnectConversation(tokenRepo: TickTickTokenRepository) {
  return async function connectTickTickConversation(
    conversation: ConnectConversation,
    ctx: BotContext
  ): Promise<void> {
    const userId = ctx.from!.id;

    await ctx.reply(
      `🔑 Шаг 1/3 — Client ID\n\n` +
        `Введи Client ID от твоего TickTick приложения.\n\n` +
        `Получить его можно на https://developer.ticktick.com\n\n` +
        `Отправь /cancel для отмены:`
    );

    const clientIdMsg = await conversation.waitFor("message:text");
    const clientId = clientIdMsg.message.text.trim();

    if (clientId === "/cancel") {
      await ctx.reply("Отменено.");
      return;
    }

    await ctx.reply(`🔑 Шаг 2/3 — Client Secret\n\nТеперь введи Client Secret:`);

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
        `Перейди по ссылке и разреши доступ:\n${authUrl}\n\n` +
        `После авторизации скопируй параметр code из URL и отправь его сюда.\n\n` +
        `Пример: ...?code=XXXXXXXXXXXX&state=...\n\n` +
        `Отправь только сам код:`
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
        return { ok: true } as const;
      } catch (err) {
        return {
          ok: false,
          message: err instanceof Error ? err.message : String(err),
        } as const;
      }
    });

    if (result.ok) {
      await ctx.api.editMessageText(
        processingMsg.chat.id,
        processingMsg.message_id,
        `✅ TickTick успешно подключён! Теперь ты можешь отправлять задачи.`
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

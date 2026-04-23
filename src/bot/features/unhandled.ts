import { Composer } from "grammy";
import type { BotContext } from "../context.js";

const composer = new Composer<BotContext>();

composer.on("message", async (ctx) => {
  ctx.logger.trace({ type: ctx.message }, "Unhandled message type");
});

export { composer as unhandledFeature };

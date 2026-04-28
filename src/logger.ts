import pino from "pino";
import { appConfig, isDev } from "./config.js";

const streams = pino.multistream([
  {
    level: appConfig.LOG_LEVEL,
    stream: isDev
      ? pino.transport({ target: "pino-pretty", options: { colorize: true } })
      : process.stdout,
  },
  {
    level: "debug",
    stream: pino.destination({ dest: "logs/bot.log", sync: false, mkdir: true }),
  },
]);

export const logger = pino({ level: "debug" }, streams);

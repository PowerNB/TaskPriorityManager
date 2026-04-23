import pino from "pino";
import { appConfig, isDev } from "./config.js";

export const logger = pino({
  level: appConfig.LOG_LEVEL,
  transport: isDev
    ? { target: "pino-pretty", options: { colorize: true } }
    : undefined,
});

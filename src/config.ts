import { config } from "dotenv";
import { z } from "zod";

config();

const schema = z.object({
  BOT_TOKEN: z.string().min(1),
  TICKTICK_REDIRECT_URI: z.string().url(),
  DATABASE_URL: z.string().min(1),
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error"]).default("info"),
  NODE_ENV: z.enum(["development", "production"]).default("development"),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment variables:");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const appConfig = parsed.data;
export const isDev = appConfig.NODE_ENV === "development";
export const isProd = appConfig.NODE_ENV === "production";

import { appConfig } from "../config.js";

/**
 * LLM returns naive datetime strings like "2026-04-28T16:00:00" meaning
 * the time in USER_TIMEZONE. TickTick API interprets the string as-is (UTC)
 * unless we encode the offset explicitly.
 *
 * This function converts a naive local datetime string to an ISO string
 * with UTC offset so TickTick stores the correct absolute time.
 */
export function localDateToUtcIso(naiveDateStr: string): string {
  const tz = appConfig.USER_TIMEZONE;

  // Parse the naive string as if it were in USER_TIMEZONE by finding
  // the UTC offset for that moment in that timezone.
  const [datePart, timePart = "00:00:00"] = naiveDateStr.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute, second = 0] = timePart.split(":").map(Number);

  // Create a reference Date at the naive time interpreted in USER_TIMEZONE
  // by formatting a UTC date and comparing to what the timezone would show.
  // We use Intl to find the UTC offset at that local moment.
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second);
  const localStr = new Date(utcGuess).toLocaleString("sv-SE", { timeZone: tz });
  // sv-SE gives "YYYY-MM-DD HH:MM:SS"
  const [guessDatePart, guessTimePart] = localStr.split(" ");
  const [gy, gm, gd] = guessDatePart.split("-").map(Number);
  const [gh, gmin, gsec] = guessTimePart.split(":").map(Number);

  // Offset = naiveLocal - utcGuessLocal
  const offsetMs =
    Date.UTC(year, month - 1, day, hour, minute, second) -
    Date.UTC(gy, gm - 1, gd, gh, gmin, gsec);

  const utcMs = utcGuess + offsetMs;
  return new Date(utcMs).toISOString().replace(".000Z", "+0000");
}

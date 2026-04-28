import Groq from "groq-sdk";
import { appConfig } from "../config.js";
import { groqUsage } from "../stats/groq-usage.js";

const groq = new Groq({ apiKey: appConfig.GROQ_API_KEY });

const MODEL = "llama-3.1-8b-instant";

const SYSTEM = "You are a task management assistant. Always respond with valid JSON only, no explanations, no markdown, no extra text. Follow the prompt instructions exactly.";

export async function callOllama(prompt: string): Promise<string> {
  const completion = await groq.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: prompt },
    ],
    temperature: 0.1,
  });

  const usage = completion.usage;
  if (usage) {
    groqUsage.addTokens(usage.prompt_tokens, usage.completion_tokens);
  }

  const output = completion.choices[0]?.message?.content?.trim() ?? "";
  if (!output) throw new Error("Groq returned empty response");
  return output;
}

export function parseJson<T>(response: string): T {
  let cleaned = response;
  if (cleaned.includes("```json")) {
    cleaned = cleaned.split("```json")[1].split("```")[0];
  } else if (cleaned.includes("```")) {
    cleaned = cleaned.split("```")[1].split("```")[0];
  }
  return JSON.parse(cleaned.trim()) as T;
}

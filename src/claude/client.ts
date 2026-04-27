import axios from "axios";

const OLLAMA_URL = "http://localhost:11434/api/generate";
const MODEL = "qwen2.5:3b";
const TIMEOUT_MS = 600_000;

const SYSTEM = "You are a task management assistant. Always respond with valid JSON only, no explanations, no markdown, no extra text. Never use Chinese. Follow the prompt instructions exactly.";

export async function callClaude(prompt: string): Promise<string> {
  const response = await axios.post<{ response: string }>(
    OLLAMA_URL,
    { model: MODEL, system: SYSTEM, prompt, stream: false },
    { timeout: TIMEOUT_MS }
  );

  const output = response.data.response.trim();
  if (!output) throw new Error("Ollama returned empty response");
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

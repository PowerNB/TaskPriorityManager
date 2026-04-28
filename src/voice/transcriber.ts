import { createWriteStream } from "fs";
import { mkdir, unlink } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { createReadStream } from "fs";
import axios from "axios";
import Groq from "groq-sdk";
import { appConfig } from "../config.js";
import { groqUsage } from "../stats/groq-usage.js";

const groq = new Groq({ apiKey: appConfig.GROQ_API_KEY });

export function initWhisper(): void {
  // no-op — Groq Whisper is a cloud API, no local init needed
}

export async function transcribeOgg(fileUrl: string): Promise<string> {
  const tmpDir = join(tmpdir(), "tpm-voice");
  await mkdir(tmpDir, { recursive: true });

  const oggPath = join(tmpDir, `${Date.now()}.ogg`);

  try {
    const response = await axios.get<ArrayBuffer>(fileUrl, { responseType: "arraybuffer", timeout: 30_000 });
    await new Promise<void>((resolve, reject) => {
      const writer = createWriteStream(oggPath);
      writer.write(Buffer.from(response.data));
      writer.end();
      writer.on("finish", resolve);
      writer.on("error", reject);
    });

    const transcription = await groq.audio.transcriptions.create({
      file: createReadStream(oggPath),
      model: "whisper-large-v3-turbo",
      language: "ru",
      response_format: "json",
    });

    const audioDurationSec = Math.ceil((response.data as ArrayBuffer).byteLength / 16000);
    groqUsage.addAudio(audioDurationSec);

    return transcription.text?.trim() ?? "";
  } finally {
    unlink(oggPath).catch(() => {});
  }
}

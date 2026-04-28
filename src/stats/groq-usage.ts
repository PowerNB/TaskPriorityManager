export interface GroqUsageSnapshot {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  audioSeconds: number;
  since: Date;
}

class GroqUsageTracker {
  private promptTokens = 0;
  private completionTokens = 0;
  private audioSeconds = 0;
  private since = new Date();

  addTokens(prompt: number, completion: number): void {
    this.promptTokens += prompt;
    this.completionTokens += completion;
  }

  addAudio(seconds: number): void {
    this.audioSeconds += seconds;
  }

  snapshot(): GroqUsageSnapshot {
    return {
      promptTokens: this.promptTokens,
      completionTokens: this.completionTokens,
      totalTokens: this.promptTokens + this.completionTokens,
      audioSeconds: this.audioSeconds,
      since: this.since,
    };
  }

  reset(): void {
    this.promptTokens = 0;
    this.completionTokens = 0;
    this.audioSeconds = 0;
    this.since = new Date();
  }
}

export const groqUsage = new GroqUsageTracker();

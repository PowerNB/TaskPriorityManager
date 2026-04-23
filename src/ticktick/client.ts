import axios, { AxiosInstance } from "axios";
import { appConfig } from "../config.js";
import type { TickTickTokenRepository } from "../bot/repositories/ticktick-token.repository.js";

const BASE_URL = "https://api.ticktick.com/api/v2";
const AUTH_URL = "https://ticktick.com/oauth/authorize";
const TOKEN_URL = "https://ticktick.com/oauth/token";

export interface TickTickProject {
  id: string;
  name: string;
  color?: string;
  kind?: string;
}

export interface TickTickTask {
  id?: string;
  title: string;
  projectId?: string;
  priority?: number; // 0=none, 1=low, 3=medium, 5=high
  tags?: string[];
  content?: string;
}

export function buildAuthUrl(clientId: string, state: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: appConfig.TICKTICK_REDIRECT_URI,
    scope: "tasks:write tasks:read",
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

export async function exchangeCode(
  code: string,
  clientId: string,
  clientSecret: string
): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}> {
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const response = await axios.post(
    TOKEN_URL,
    new URLSearchParams({
      code,
      grant_type: "authorization_code",
      redirect_uri: appConfig.TICKTICK_REDIRECT_URI,
    }),
    {
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
    }
  );

  const data = response.data as { access_token: string; refresh_token?: string; expires_in: number };
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? "",
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
  };
}

export class TickTickClient {
  private http: AxiosInstance;

  constructor(
    private accessToken: string,
    private refreshToken: string,
    private expiresAt: Date,
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly userId: number,
    private readonly tokenRepo: TickTickTokenRepository
  ) {
    this.http = axios.create({ baseURL: BASE_URL });
    this.http.interceptors.request.use(async (cfg) => {
      await this.ensureFreshToken();
      cfg.headers.Authorization = `Bearer ${this.accessToken}`;
      return cfg;
    });
  }

  private async ensureFreshToken(): Promise<void> {
    if (this.expiresAt > new Date(Date.now() + 60_000)) return;

    const credentials = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString("base64");

    const response = await axios.post(
      TOKEN_URL,
      new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: this.refreshToken,
      }),
      {
        headers: {
          Authorization: `Basic ${credentials}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    const data = response.data as { access_token: string; refresh_token: string; expires_in: number };
    this.accessToken = data.access_token;
    this.refreshToken = data.refresh_token;
    this.expiresAt = new Date(Date.now() + data.expires_in * 1000);

    await this.tokenRepo.save({
      userId: this.userId,
      clientId: this.clientId,
      clientSecret: this.clientSecret,
      accessToken: this.accessToken,
      refreshToken: this.refreshToken,
      expiresAt: this.expiresAt,
    });
  }

  async getProjects(): Promise<TickTickProject[]> {
    const response = await this.http.get<TickTickProject[]>("/projects");
    return response.data;
  }

  async createProject(name: string): Promise<TickTickProject> {
    const response = await this.http.post<TickTickProject>("/project", { name, kind: "TASK" });
    return response.data;
  }

  async getOrCreateProject(name: string): Promise<TickTickProject> {
    const projects = await this.getProjects();
    const existing = projects.find((p) => p.name === name);
    if (existing) return existing;
    return this.createProject(name);
  }

  async createTask(task: TickTickTask): Promise<TickTickTask> {
    const response = await this.http.post<TickTickTask>("/task", task);
    return response.data;
  }

  async updateTask(taskId: string, updates: Partial<TickTickTask>): Promise<TickTickTask> {
    const response = await this.http.post<TickTickTask>(`/task/${taskId}`, {
      id: taskId,
      ...updates,
    });
    return response.data;
  }
}

export function createTickTickClient(
  token: {
    accessToken: string;
    refreshToken: string;
    expiresAt: Date;
    clientId: string;
    clientSecret: string;
  },
  userId: number,
  tokenRepo: TickTickTokenRepository
): TickTickClient {
  return new TickTickClient(
    token.accessToken,
    token.refreshToken,
    token.expiresAt,
    token.clientId,
    token.clientSecret,
    userId,
    tokenRepo
  );
}

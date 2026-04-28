import axios, { AxiosInstance } from "axios";
import { appConfig } from "../config.js";
import type { TickTickTokenRepository } from "../bot/repositories/ticktick-token.repository.js";
import { ALL_LIST_NAMES, LIST_COLORS, DURATION_TAGS } from "./projects.js";

const BASE_URL = "https://api.ticktick.com/open/v1";
const AUTH_URL = "https://ticktick.com/oauth/authorize";
const TOKEN_URL = "https://ticktick.com/oauth/token";

export interface TickTickProject {
  id: string;
  name: string;
  color?: string;
  kind?: string;
}

export interface TickTickChecklistItem {
  title: string;
  status: 0 | 1; // 0=unchecked, 1=checked
  sortOrder: number;
}

export interface TickTickTask {
  id?: string;
  title: string;
  projectId?: string;
  priority?: number; // 0=none, 1=low, 3=medium, 5=high
  tags?: string[];
  content?: string;
  items?: TickTickChecklistItem[];
  dueDate?: string;   // ISO 8601: "2026-04-28T15:00:00+0000"
  startDate?: string; // ISO 8601
  isAllDay?: boolean;
  timeZone?: string;
  status?: number;    // 0=active, 2=completed
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
    this.http = axios.create({ baseURL: BASE_URL, timeout: 15_000 });
    this.http.interceptors.request.use(async (cfg) => {
      await this.ensureFreshToken();
      cfg.headers.Authorization = `Bearer ${this.accessToken}`;
      return cfg;
    });
    this.http.interceptors.response.use(
      (res) => res,
      async (err) => {
        const isNetworkError = !err.response && (err.code === "ECONNRESET" || err.code === "ECONNREFUSED" || err.code === "ETIMEDOUT" || err.message?.includes("socket"));
        const config = err.config;
        if (isNetworkError && config && !config._retried) {
          config._retried = true;
          await new Promise((r) => setTimeout(r, 2000));
          return this.http.request(config);
        }
        return Promise.reject(err);
      }
    );
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
    const response = await this.http.get<TickTickProject[]>("/project");
    return response.data;
  }

  async createProject(name: string, color?: string): Promise<TickTickProject> {
    const response = await this.http.post<TickTickProject>("/project", {
      name,
      color,
      kind: "TASK",
    });
    return response.data;
  }

  async getOrCreateProject(name: string): Promise<TickTickProject> {
    const projects = await this.getProjects();
    const existing = projects.find((p) => p.name === name);
    if (existing) return existing;
    return this.createProject(name, LIST_COLORS[name]);
  }

  async ensureProjectsExist(): Promise<string[]> {
    const projects = await this.getProjects();
    const existingNames = new Set(projects.map((p) => p.name));
    const created: string[] = [];

    for (const name of ALL_LIST_NAMES) {
      if (!existingNames.has(name)) {
        await this.createProject(name, LIST_COLORS[name]);
        created.push(name);
      }
    }

    return created;
  }

  async makeSubtask(parentId: string, taskId: string, projectId: string): Promise<void> {
    await axios.post(
      "https://api.ticktick.com/api/v2/batch/taskParent",
      [{ parentId, taskId, projectId }],
      { headers: { Authorization: `Bearer ${this.accessToken}` } }
    );
  }

  durationTag(duration: string): string {
    return (DURATION_TAGS as Record<string, string>)[duration] ?? duration;
  }

  async getProjectTasks(projectId: string): Promise<{ tasks: TickTickTask[] }> {
    const response = await this.http.get<{ tasks: TickTickTask[] }>(`/project/${projectId}/data`);
    return response.data;
  }

  async searchTasks(query: string): Promise<(TickTickTask & { projectId: string })[]> {
    const projects = await this.getProjects();
    const results: (TickTickTask & { projectId: string })[] = [];
    const q = query.toLowerCase();

    for (const project of projects) {
      try {
        const data = await this.getProjectTasks(project.id);
        for (const task of data.tasks ?? []) {
          if (task.title.toLowerCase().includes(q) || q.includes(task.title.toLowerCase())) {
            results.push({ ...task, projectId: project.id });
          }
        }
      } catch {
        // skip inaccessible projects
      }
    }
    return results;
  }

  async completeTask(taskId: string, projectId: string): Promise<void> {
    await this.http.post(`/task/${taskId}`, { id: taskId, projectId, status: 2 });
  }

  async deleteTask(projectId: string, taskId: string): Promise<void> {
    await this.http.delete(`/project/${projectId}/task/${taskId}`);
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

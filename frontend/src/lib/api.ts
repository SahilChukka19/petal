const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export interface DailyUpdate {
  id: string;
  date: string; // YYYY-MM-DD
  what_i_learned: string;
  resources: string[];
  video_url: string | null;
  voice_note_url: string | null;
  created_at: string;
}

export interface Resource {
  id: string;
  title: string;
  url: string;
  category: string | null;
  emoji: string | null;
  notes: string | null;
  created_at: string;
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { ...init, credentials: "include" });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const detail = typeof body?.detail === "string" ? body.detail : null;
    throw new ApiError(res.status, detail ?? (res.status === 429 ? "Too many attempts, try again in a minute." : `Request failed (${res.status})`));
  }
  return res.json();
}

const json = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

/** Local-time YYYY-MM-DD (avoids the UTC shift of toISOString). */
export const toDateStr = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export const getUpdates = () => request<DailyUpdate[]>("/api/updates");

export const saveUpdate = (u: {
  date: string;
  what_i_learned: string;
  resources: string[];
  video_url?: string | null;
  voice_note_url?: string | null;
}) => request<DailyUpdate>("/api/updates", json(u));

export const getResources = () => request<Resource[]>("/api/resources");

export const createResource = (r: {
  title: string;
  url: string;
  category?: string;
  emoji?: string;
}) => request<Resource>("/api/resources", json(r));

export async function uploadMedia(kind: "video" | "audio", blob: Blob): Promise<string> {
  const form = new FormData();
  form.append("kind", kind);
  form.append("file", blob, `${kind}.webm`);
  const { url } = await request<{ url: string }>("/api/upload", { method: "POST", body: form });
  return url;
}

export const login = (username: string, password: string) =>
  request<{ username: string }>("/api/auth/login", json({ username, password }));

export const logout = () => request<{ ok: boolean }>("/api/auth/logout", { method: "POST" });

export const getMe = () => request<{ username: string }>("/api/auth/me");

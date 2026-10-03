import { GoogleAccount, GoogleStats, RunRecord, RunSummary, SessionStatus } from "../../interfaces/api";

// Small typed wrappers around the server API.

async function get<T>(url: string): Promise<T> {
  const response = await fetch(url, { credentials: "include" });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.json();
}

export async function post<T = unknown>(url: string, body: unknown = {}): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.json();
}

export const api = {
  status: () => get<SessionStatus>("/api/status"),
  account: () => get<GoogleAccount>("/api/google_account"),
  stats: (refresh = false) => get<GoogleStats>(`/api/google_stats${refresh ? "?refresh" : ""}`),
  runs: () => get<RunSummary[]>("/api/runs"),
  run: (id: string) => get<RunRecord>(`/api/runs/${encodeURIComponent(id)}`),
  undo: (id: string, indexes?: number[]) => post(`/api/runs/${encodeURIComponent(id)}/undo`, indexes ? { indexes } : {}),
  stopSync: () => post("/api/sync/stop"),
  photoUrl: (runId: string, index: number, kind: "photo" | "previous") =>
    `/api/runs/${encodeURIComponent(runId)}/photos/${index}/${kind}`,
};

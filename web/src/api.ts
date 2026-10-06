import { Contact, ContactInput, ContactLabel, ContactsList, ContactResult, LinkLookup, SyncCounters, TelegramState, CleanupActionSummary, CleanupScan, CleanupSummary, DesktopInfo, DuplicateGroup, GoogleAccount, MergeRequest, GoogleStats, RunRecord, RunSummary, SessionStatus, UpdateCheck } from "../../interfaces/api";

// Small typed wrappers around the server API.

async function get<T>(url: string): Promise<T> {
  const response = await fetch(url, { credentials: "include" });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.json();
}

/** A failed request, with the server's error code when it sent one. */
export class ApiError extends Error {
  /** `detail`: what Google answered, when a change it refused failed. */
  constructor(public status: number, public code?: string, public detail?: string, public body?: Record<string, unknown>) {
    super(`HTTP ${status}${code ? ` ${code}` : ""}`);
  }
}

/** `message`, followed by Google's own explanation when the server passed one on. */
export function withGoogleDetail(message: string, e: unknown): string {
  return e instanceof ApiError && e.detail ? `${message} (Google: ${e.detail})` : message;
}

async function apiError(response: Response): Promise<ApiError> {
  const body = await response.json().catch(() => undefined);
  return new ApiError(response.status, body?.error, typeof body?.detail === "string" ? body.detail : undefined, body ?? undefined);
}

export async function post<T = unknown>(url: string, body: unknown = {}): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw await apiError(response);
  return response.json();
}

async function send<T>(method: string, url: string, body?: BodyInit, type = "application/json"): Promise<T> {
  const response = await fetch(url, { method, credentials: "include", headers: body === undefined ? {} : { "Content-Type": type }, body });
  if (!response.ok) throw await apiError(response);
  return response.json();
}

const contactPath = (id: string) => `/api/contacts/${encodeURIComponent(id.replace(/^people\//, ""))}`;

export const api = {
  status: () => get<SessionStatus>("/api/status"),
  account: () => get<GoogleAccount>("/api/google_account"),
  stats: (refresh = false) => get<GoogleStats>(`/api/google_stats${refresh ? "?refresh" : ""}`),
  runs: () => get<RunSummary[]>("/api/runs"),
  run: (id: string) => get<RunRecord>(`/api/runs/${encodeURIComponent(id)}`),
  undo: (id: string, indexes?: number[]) => post(`/api/runs/${encodeURIComponent(id)}/undo`, indexes ? { indexes } : {}),
  stopSync: () => post("/api/sync/stop"),
  // Desktop app only (Settings).
  desktopInfo: () => get<DesktopInfo>("/api/desktop/info"),
  openFolder: (target: "data" | "config") => post("/api/desktop/open", { target }),
  checkUpdates: () => post<UpdateCheck>("/api/desktop/check_updates"),
  setRememberSignIns: (enabled: boolean) => post("/api/desktop/remember_sign_ins", { enabled }),
  deleteAllData: () => post("/api/desktop/delete_all_data", { confirm: true }),
  googleSignOut: () => post("/api/desktop/google_sign_out"),
  whatsappUnlink: () => post("/api/desktop/whatsapp_unlink"),
  // Clean up (issue #28).
  cleanup: () => get<{ scan: CleanupScan | null }>("/api/cleanup"),
  cleanupSummary: () => get<CleanupSummary>("/api/cleanup/summary"),
  scan: (region?: string) => post<CleanupScan>("/api/cleanup/scan", { region }),
  notDuplicates: (groupId: string) => post<CleanupSummary>("/api/cleanup/ignore", { groupId }),
  merge: (request: MergeRequest) => post<{ actionId: string; summary: CleanupSummary }>("/api/cleanup/merge", request),
  keepNumber: (e164: string, contactId: string) => post<{ actionId: string; summary: CleanupSummary }>("/api/cleanup/keep_number", { e164, contactId }),
  markShared: (e164: string, shared = true) => post<CleanupSummary>("/api/cleanup/mark_shared", { e164, shared }),
  groupFromNumber: (e164: string) => post<{ group: DuplicateGroup; summary: CleanupSummary }>("/api/cleanup/group", { e164 }),
  fixCountryCodes: (items: { contactId: string; value: string }[]) =>
    post<{ actionId: string; fixed: number; summary: CleanupSummary }>("/api/cleanup/fix_country_codes", { items }),
  cleanupActions: () => get<CleanupActionSummary[]>("/api/cleanup/actions"),
  undoCleanup: (id: string) => post(`/api/cleanup/actions/${encodeURIComponent(id)}/undo`),
  // Profile links (issue #51).
  linkLookup: (url: string) => post<LinkLookup>("/api/links/lookup", { url }),
  saveRunLink: (runId: string, index: number, token: string) =>
    post<{ result: ContactResult; counters: SyncCounters }>(`/api/runs/${encodeURIComponent(runId)}/results/${index}/link`, { token }),
  // The Contacts page (issue #55).
  contacts: () => get<ContactsList>("/api/contacts"),
  createContact: (contact: ContactInput) => post<Contact>("/api/contacts", { contact }),
  saveContact: (id: string, contact: ContactInput, updatedAt?: string) => send<Contact>("PUT", contactPath(id), JSON.stringify({ contact, updatedAt })),
  duplicateContact: (id: string) => post<Contact>(`${contactPath(id)}/duplicate`),
  deleteContacts: (contactIds: string[]) => post<{ actionId: string; deleted: string[] }>("/api/contacts/delete", { contactIds }),
  mergeContacts: (contactIds: string[], request: Omit<MergeRequest, "groupId">, updatedAt: Record<string, string | undefined>) =>
    post<{ actionId: string; contact: Contact; deleted: string[] }>("/api/contacts/merge", { contactIds, request, updatedAt }),
  uploadPhoto: (id: string, photo: Blob) => send<Contact>("PUT", `${contactPath(id)}/photo`, photo, photo.type || "image/jpeg"),
  removePhoto: (id: string) => send<Contact>("DELETE", `${contactPath(id)}/photo`),
  photoFromLink: (id: string, token: string) => post<Contact>(`${contactPath(id)}/photo_from_link`, { token }),
  createLabel: (name: string) => post<ContactLabel>("/api/contacts/labels", { name }),
  applyLabel: (contactIds: string[], label: string, add: boolean) => post<{ contacts: Contact[] }>("/api/contacts/labels/apply", { contactIds, label, add }),
  // Telegram sign-in (issue #36).
  telegram: () => get<TelegramState>("/api/telegram"),
  telegramSendCode: (phone: string) => post<TelegramState>("/api/telegram/send_code", { phone }),
  telegramSignIn: (code: string) => post<TelegramState>("/api/telegram/sign_in", { code }),
  telegramPassword: (password: string) => post<TelegramState>("/api/telegram/password", { password }),
  telegramSignOut: () => post<TelegramState>("/api/telegram/sign_out"),
  photoUrl: (runId: string, index: number, kind: "photo" | "previous") =>
    `/api/runs/${encodeURIComponent(runId)}/photos/${index}/${kind}`,
};

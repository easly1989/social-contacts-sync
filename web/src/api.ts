import { Coverage, LinkedNetworks, PinnedProfiles, ProfileBulkState, ProfileLinked, ProfileLinkRequest, ProfileScanState, ProfileSearchState, ProfilesOverview, SocialNetwork, Contact, ContactInput, ContactLabel, ContactsList, ContactResult, LinkLookup,
  LoginSearchResult,
  LoginSearchState, SyncCounters, TelegramState, CleanupActionSummary, CleanupScan, CleanupSummary, DesktopInfo, DuplicateGroup, GoogleAccount, MergeRequest, GoogleStats, RunRecord, RunSummary, SessionStatus, UpdateCheck } from "../../interfaces/api";

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
  installUpdate: () => post("/api/desktop/install_update"),
  setAutoUpdates: (enabled: boolean) => post<DesktopInfo>("/api/desktop/auto_updates", { enabled }),
  setRememberSignIns: (enabled: boolean) => post("/api/desktop/remember_sign_ins", { enabled }),
  restartServer: () => post("/api/desktop/restart"),
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
  /** `linkedin`: whether the desktop app may read LinkedIn with the login (issue #80). */
  linkLookup: (url: string, linkedin: boolean) => post<LinkLookup>("/api/links/lookup", { url, linkedin }),
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
  /** `kept`: a photo the app never replaces (issue #67); otherwise a placeholder. */
  uploadPhoto: (id: string, photo: Blob, kept = false) => send<Contact>("PUT", `${contactPath(id)}/photo${kept ? "?as=kept" : ""}`, photo, photo.type || "image/jpeg"),
  keepPhoto: (id: string, kept: boolean) => send<Contact>("PUT", `${contactPath(id)}/keep_photo`, JSON.stringify({ kept })),
  removePhoto: (id: string) => send<Contact>("DELETE", `${contactPath(id)}/photo`),
  /** The photo stays, but no longer follows its source (issue #78). */
  unpinPhoto: (id: string) => send<Contact>("DELETE", `${contactPath(id)}/pin`),
  photoFromLink: (id: string, token: string) => post<Contact>(`${contactPath(id)}/photo_from_link`, { token }),
  createLabel: (name: string) => post<ContactLabel>("/api/contacts/labels", { name }),
  applyLabel: (contactIds: string[], label: string, add: boolean) => post<{ contacts: Contact[] }>("/api/contacts/labels/apply", { contactIds, label, add }),
  // Find profiles (issue #61).
  profiles: () => get<ProfilesOverview>("/api/profiles"),
  /** Contacts waiting in Sync's To review (issue #81). */
  profilesCount: () => get<{ count: number }>("/api/profiles/count"),
  /** Desktop: pinned profiles each network could read again with the login (issue #80). */
  pinnedProfiles: () => get<PinnedProfiles>("/api/profiles/pinned"),
  linkedNetworks: () => get<LinkedNetworks>("/api/profiles/networks"),
  /** The Dashboard's coverage and next steps (issue #85). */
  coverage: (refresh = false) => get<Coverage>(`/api/profiles/coverage${refresh ? "?refresh" : ""}`),
  /** Desktop: which sites the app is signed in to. */
  socialLogins: () => get<ProfileScanState[]>("/api/profiles/logins"),
  importProfiles: async (network: "instagram" | "linkedin", file: File) =>
    send<{ read: number; added: number }>("POST", `/api/profiles/import?network=${network}&file=${encodeURIComponent(file.name)}`, await file.text(), "text/plain"),
  searchProfiles: (networks: SocialNetwork[]) => post<ProfileSearchState>("/api/profiles/search", { networks }),
  stopProfileSearch: () => post<ProfileSearchState>("/api/profiles/search/stop"),
  linkProfiles: (request: ProfileLinkRequest) => post<{ linked: ProfileLinked[]; photoWanted: boolean; photoSet: boolean }>("/api/profiles/link", request),
  linkProfilesInBulk: (items: ProfileLinkRequest[]) => post<ProfileBulkState>("/api/profiles/link_many", { items }),
  stopBulkLink: () => post<ProfileBulkState>("/api/profiles/link_many/stop"),
  rejectProfiles: (contactId: string, personIds: string[]) => post("/api/profiles/reject", { contactId, personIds }),
  skipProfiles: (contactId: string) => post("/api/profiles/skip", { contactId }),
  keepCurrentPhoto: (contactId: string) => post("/api/profiles/keep", { contactId }),
  /** "No photo" (issue #104): out of To review until the contact's numbers, emails or links change. */
  leaveWithoutPhoto: (contactId: string) => post("/api/profiles/no-photo", { contactId }),
  queuePhotoUrl: (id: string) => `/api/profiles/queue-photo?id=${encodeURIComponent(id)}`,
  /** Desktop: a contact's name searched with the login (issue #104), one card or the selected ones. */
  loginSearch: (contactId: string, network: SocialNetwork) => post<LoginSearchResult>("/api/profiles/login-search", { contactId, network }),
  loginSearchSelected: (contactIds: string[], networks: SocialNetwork[]) => post<LoginSearchState>("/api/profiles/login-search/bulk", { contactIds, networks }),
  stopLoginSearch: () => post<LoginSearchState>("/api/profiles/login-search/stop"),
  profileScan: (action: "login" | "logout" | "start" | "stop", network: SocialNetwork, acceptRisk = false) =>
    post<ProfileScanState | { ok: true }>(`/api/profiles/scan/${action}`, { network, ...(acceptRisk ? { acceptRisk } : {}) }),
  // Telegram sign-in (issue #36).
  telegram: () => get<TelegramState>("/api/telegram"),
  telegramSendCode: (phone: string) => post<TelegramState>("/api/telegram/send_code", { phone }),
  telegramSignIn: (code: string) => post<TelegramState>("/api/telegram/sign_in", { code }),
  telegramPassword: (password: string) => post<TelegramState>("/api/telegram/password", { password }),
  telegramSignOut: () => post<TelegramState>("/api/telegram/sign_out"),
  photoUrl: (runId: string, index: number, kind: "photo" | "previous") =>
    `/api/runs/${encodeURIComponent(runId)}/photos/${index}/${kind}`,
};

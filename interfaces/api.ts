export enum EventType {
  WhatsAppQR = "whatsapp_qr",
  WhatsAppConnecting = "whatsapp_connecting",
  Redirect = "redirect",
  SyncProgress = "sync_progress",
  SyncConfirm = "sync_confirm",
  SyncPhotoConfirm = "sync_photo_confirm",
  WhatsAppError = "whatsapp_error",
}

export interface Event {
  type: EventType;
  data: any;
}

export type SourceId = "whatsapp" | "telegram" | "gravatar";

/** What happened to one contact during a sync. */
export type SyncOutcome = "added" | "replaced" | "kept" | "alreadyHadPhoto" | "noMatch" | "error";

export interface SyncCounters {
  added: number;
  replaced: number;
  kept: number;
  alreadyHadPhoto: number;
  noMatch: number;
  errors: number;
}

export interface SyncProgress {
  progress: number;
  /** Photos written (added + replaced). */
  syncCount: number;
  totalContacts?: number;
  image?: string;
  error?: string;
  isManualSync?: boolean;
  /** Contacts processed so far. */
  checked?: number;
  counters?: SyncCounters;
  /** The latest contact that got a photo, for the "just added" list. */
  latest?: { name?: string; source: SourceId };
  /** Set on the final event of a run. */
  runId?: string;
  /** Final event: the run was stopped before the last contact. */
  cancelled?: boolean;
}

/** A photo a source offers for the contact under review. */
export interface ReviewCandidate {
  photo: string;
  source: SourceId;
  matchedBy: string;
}

/** Payload of EventType.SyncConfirm (review mode). */
export interface ReviewRequest {
  existingPhoto: string | null;
  /** Same as candidates[0].photo, for older clients. */
  newPhoto: string;
  contactName: string | null;
  candidates: ReviewCandidate[];
}

export interface ContactResult {
  contactId: string;
  name?: string;
  outcome: SyncOutcome;
  source?: SourceId;
  matchedBy?: string;
  error?: string;
  /** The photo was put back as it was before this run. */
  undone?: boolean;
  hasPrevious?: boolean;
  hasPhoto?: boolean;
}

export interface RunSummary {
  id: string;
  startedAt: string;
  finishedAt?: string;
  mode: "fill" | "replace" | "review";
  sources: SourceId[];
  totalContacts: number;
  counters: SyncCounters;
  cancelled?: boolean;
  undone?: boolean;
}

export interface RunRecord extends RunSummary {
  results: ContactResult[];
}

export interface SessionStatus {
  whatsappConnected: boolean;
  googleConnected: boolean;
  enforcePayments: boolean;
  purchased: boolean;
  /** Running inside the desktop app. */
  desktop?: boolean;
  /** Google OAuth client ID and secret are set. */
  googleConfigured?: boolean;
  /** A WhatsApp session is starting (QR not scanned yet, or reconnecting). */
  whatsappStarting?: boolean;
  /** The desktop app has a saved WhatsApp link to reconnect with. */
  whatsappSaved?: boolean;
  /** Telegram app credentials are set (built in, config.env or environment). */
  telegramAvailable?: boolean;
  telegramConnected?: boolean;
}

export interface GoogleStats {
  totalContacts: number;
  withPhoto: number;
  updatedAt: string;
}

export interface GoogleAccount {
  email?: string;
  name?: string;
  photoUrl?: string;
  totalContacts?: number;
}

export interface SyncOptions {
  overwrite_photos?: string; // "true" or "false" (since converted to string via query params)
  manual_sync?: string; // "true" or "false" (since converted to string via query params)
  sources?: string; // comma-separated SourceId list in priority order; default "whatsapp"
}

/** Result of the desktop app's latest update check. */
export interface UpdateCheck {
  status: "current" | "available" | "ready" | "error" | "disabled";
  version?: string;
  /** Release page of `version`. */
  url?: string;
  checkedAt: string;
}

/** GET /api/desktop/info (desktop app only), for Settings. */
export interface DesktopInfo {
  version: string;
  packageKind: "windows-installer" | "windows-portable" | "appimage" | "deb" | "macos" | "development";
  dataDir: string;
  configFile: string;
  portable: boolean;
  /** How this package updates: by itself, by notifying, or not at all (development). */
  updates: "auto" | "notify" | "none";
  lastUpdate?: UpdateCheck;
  rememberSignIns: boolean;
  history: { runs: number; bytes: number };
}

// Clean up (issue #28).

/** A Google contact as the clean-up screens show it. */
export interface CleanupContact {
  id: string;
  name?: string;
  phones: { value: string; e164?: string; type?: string }[];
  emails: { value: string; type?: string }[];
  company?: string;
  /** "1990-03-12", or "--03-12" without a year. */
  birthday?: string;
  addresses: { value: string; type?: string }[];
  hasPhoto: boolean;
  photoUrl?: string;
  updatedAt?: string;
}

export type DuplicateReason = "phone" | "email" | "name";

export interface DuplicateGroup {
  id: string;
  /** Most recently edited first: the first one is kept by default. */
  contactIds: string[];
  reasons: DuplicateReason[];
}

/** A number saved on contacts that aren't the same person. */
export interface SharedNumber {
  e164: string;
  contactIds: string[];
}

export interface MissingCountryCode {
  contactId: string;
  value: string;
  /** The number with the scan region's country code, as it will be saved ("+39 333 123 4567"). */
  suggestion?: string;
}

export interface CleanupScan {
  scannedAt: string;
  totalContacts: number;
  region?: string;
  /** Only the contacts that appear in a finding. */
  contacts: Record<string, CleanupContact>;
  duplicates: DuplicateGroup[];
  sharedNumbers: SharedNumber[];
  missingCountryCode: MissingCountryCode[];
  /** Contacts changed since (e.g. a merge was undone): scan again. */
  stale?: boolean;
  /** Numbers the user marked as shared (E.164): skipped by syncs. */
  markedShared?: string[];
}

export interface CleanupSummary {
  scannedAt?: string;
  totalContacts?: number;
  duplicates: number;
  sharedNumbers: number;
  missingCountryCode: number;
}

/** POST /api/cleanup/merge: which contact each value comes from. */
export interface MergeRequest {
  groupId: string;
  keepId: string;
  name?: string;
  /** Contact whose photo to keep, or null for none. */
  photo?: string | null;
  company?: string | null;
  birthday?: string | null;
  /** Contacts whose phones / emails / addresses are combined. */
  phones: string[];
  emails: string[];
  addresses: string[];
}

export interface CleanupActionSummary {
  id: string;
  /** Merge duplicates, keep a shared number on one contact, add country codes. */
  kind: "merge" | "keepNumber" | "countryCodes";
  at: string;
  /** The merged contact's name, the kept number's owner, or the number of fixed numbers. */
  title: string;
  contacts: number;
  /** keepNumber: the number. */
  number?: string;
  undone?: boolean;
  /** Something failed half-way; undo puts back what was changed. */
  incomplete?: boolean;
}

/** GET /api/telegram and the sign-in steps (issue #36). */
export interface TelegramState {
  available: boolean;
  connected: boolean;
  /** Waiting for the login code, or for the two-step verification password. */
  step?: "code" | "password";
  phone?: string;
  name?: string;
}

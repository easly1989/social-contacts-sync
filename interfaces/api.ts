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

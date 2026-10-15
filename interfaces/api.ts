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

export type SourceId = "whatsapp" | "telegram" | "gravatar" | "links";

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
  /** A profile link this run saved on the contact; undo removes it. */
  addedLink?: string;
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
  /** Desktop: the first-run wizard is behind; sign-ins and links happen inside the app. */
  setupDone?: boolean;
  /** Google stopped accepting the saved sign-in (e.g. after 7 days in Testing): sign in again. */
  googleExpired?: boolean;
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
  /** The desktop app has a saved Telegram sign-in, restored at start. */
  telegramSaved?: boolean;
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
  links_best_effort?: string; // "true": profile links also try Instagram, Facebook and LinkedIn
}

/** A profile picture looked up from a link (report and review, issue #51). */
export interface LinkLookup {
  /** Refers to the looked-up photo on the server, to save it. */
  token: string;
  photo: string;
  /** "Instagram", "X"… */
  network: string;
  /** The normalized link, e.g. "https://instagram.com/name". */
  url: string;
}

/** Answer to a review request (EventType.SyncPhotoConfirm). */
export interface ReviewAnswer {
  accept: boolean;
  /** Index in the request's candidates. */
  choice?: number;
  /** Use a photo looked up from a profile link instead (LinkLookup.token). */
  link?: string;
}

/** Result of the desktop app's latest update check. */
export interface UpdateCheck {
  status: "current" | "available" | "downloading" | "ready" | "error" | "disabled";
  version?: string;
  /** Release page of `version`. */
  url?: string;
  /** While downloading, 0–100. */
  progress?: number;
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
  /** "Automatic updates": download as soon as it's out, or only when asked. */
  autoUpdates: boolean;
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
  /** Merge duplicates, keep a shared number on one contact, add country codes, delete contacts. */
  kind: "merge" | "keepNumber" | "countryCodes" | "delete";
  at: string;
  /** The merged contact's name, the kept number's owner, the number of fixed numbers, the deleted contact's name. */
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

/* The Contacts page (issue #55). */

export interface ContactField {
  value: string;
  /** Google's type: "mobile", "work", "home", "profile"…, or a custom label. */
  type?: string;
}

export interface ContactAddress {
  street?: string;
  extended?: string;
  poBox?: string;
  postalCode?: string;
  city?: string;
  region?: string;
  country?: string;
  countryCode?: string;
  type?: string;
}

export interface ContactBirthday {
  year?: number;
  month: number;
  day: number;
}

/** A Google contact, with what the Contacts page shows and edits. */
export interface Contact {
  id: string;
  /** Google's display name. */
  name?: string;
  /** Before the name, e.g. "Dr." or "(Volley)". */
  honorificPrefix?: string;
  givenName?: string;
  middleName?: string;
  familyName?: string;
  /** After the name, e.g. "Jr." or "Volley" in "Alberto Della Costanza, Volley". */
  honorificSuffix?: string;
  company?: string;
  jobTitle?: string;
  phones: ContactField[];
  emails: ContactField[];
  /** Websites, profile links among them. */
  urls: ContactField[];
  addresses: ContactAddress[];
  birthday?: ContactBirthday;
  notes?: string;
  /** Contact groups the user created (labels), by resource name. */
  labels: string[];
  hasPhoto: boolean;
  photoUrl?: string;
  /** The photo was uploaded by hand: a sync replaces it when a source has one. */
  placeholder?: boolean;
  /** The photo is kept: the app never replaces it (issue #67). */
  photoKept?: boolean;
  updatedAt?: string;
}

/** What the editor sends for a new or changed contact. */
export type ContactInput = Omit<Contact, "id" | "name" | "hasPhoto" | "photoUrl" | "placeholder" | "photoKept" | "updatedAt">;

export interface ContactLabel {
  id: string;
  name: string;
}

/** GET /api/contacts */
export interface ContactsList {
  contacts: Contact[];
  labels: ContactLabel[];
}

/* Find profiles (issue #61). */

export type SocialNetwork = "instagram" | "linkedin" | "facebook" | "bluesky" | "mastodon" | "github";

/** Someone found on a social network: a profile that may belong to one of the contacts. */
export interface SocialPerson {
  /** `network:handle`, stable across imports and scans. */
  id: string;
  network: SocialNetwork;
  url: string;
  handle?: string;
  name?: string;
  photoUrl?: string;
  /** Where it came from: the user's data export, a public search, or a scan with their login. */
  source: "export" | "search" | "scan";
  relation?: "follower" | "following" | "friend" | "connection";
  /** E.g. the company of a LinkedIn connection. */
  detail?: string;
}

export interface ProfileCandidate {
  person: SocialPerson;
  /** 0–1: how well the name matches. */
  score: number;
  reason: "sameName" | "similarName" | "handleMatchesName";
}

export interface ProfileSuggestion {
  contactId: string;
  name: string;
  photoUrl?: string;
  hasPhoto: boolean;
  placeholder?: boolean;
  photoKept?: boolean;
  detail?: string;
  candidates: ProfileCandidate[];
}

export interface ProfileLinked {
  contactId: string;
  name: string;
  person: SocialPerson;
  at: string;
  photoSet: boolean;
  undone?: boolean;
}

export interface ProfileSourceState {
  network: SocialNetwork;
  /** People known from this network, by source. */
  people: number;
  imported?: string;
  scanned?: string;
  /** When the public search last ran on this network. */
  searched?: string;
}

export interface ProfileSearchState {
  running: boolean;
  networks: SocialNetwork[];
  checked: number;
  total: number;
  found: Partial<Record<SocialNetwork, number>>;
  error?: string;
}

export interface ProfileScanState {
  network: SocialNetwork;
  loggedIn: boolean;
  account?: string;
  running?: boolean;
  read?: number;
  /** Why the last scan stopped early (a block, a sign-in page…). */
  stopped?: string;
  finishedAt?: string;
}

/** One contact to link in bulk: the profiles ticked on its card, and the one whose photo to use. */
export interface ProfileLinkRequest {
  contactId: string;
  personIds: string[];
  photoFrom?: string;
  /** The other profiles shown on the card: not this contact. */
  rejectIds?: string[];
  name?: string;
}

/** Linking in bulk (issue #65): runs in the background at Google's pace. */
export interface ProfileBulkState {
  running: boolean;
  done: number;
  total: number;
  /** Contacts and profiles linked so far. */
  contacts: number;
  profiles: number;
  failed: { contactId: string; name: string; error: string }[];
  stopped?: boolean;
}

/** GET /api/profiles */
export interface ProfilesOverview {
  sources: ProfileSourceState[];
  search: ProfileSearchState;
  /** Desktop only: the login scan. */
  scans?: ProfileScanState[];
  suggestions: ProfileSuggestion[];
  linked: ProfileLinked[];
  bulk?: ProfileBulkState;
}

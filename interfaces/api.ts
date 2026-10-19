export enum EventType {
  WhatsAppQR = "whatsapp_qr",
  WhatsAppConnecting = "whatsapp_connecting",
  Redirect = "redirect",
  SyncProgress = "sync_progress",
  WhatsAppError = "whatsapp_error",
}

export interface Event {
  type: EventType;
  data: any;
}

export type SourceId = "whatsapp" | "telegram" | "gravatar" | "links";

/** What happened to one contact during a sync. "kept": runs from before issue #82 (a photo kept in review). "linked": a review session linked profiles without a photo (issue #84). */
export type SyncOutcome = "added" | "replaced" | "linked" | "kept" | "queued" | "alreadyHadPhoto" | "noMatch" | "error";

export interface SyncCounters {
  added: number;
  replaced: number;
  kept: number;
  /** Sent to Sync's To review (issue #82); absent in older runs. */
  queued?: number;
  /** Review sessions: contacts that only got profiles linked (issue #84). */
  linked?: number;
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
  /** Profiles read again first (desktop, with the login), then photos from every source (issue #82). */
  phase?: "profiles" | "photos";
  /** Phase "profiles": per network, profiles read so far, how many to read, and why it stopped. */
  reads?: Partial<Record<"instagram" | "facebook" | "linkedin", { read: number; total: number; stopped?: string; answer?: string }>>;
  /** Contacts processed so far. */
  checked?: number;
  counters?: SyncCounters;
  /** The latest contact that got a photo, for the "just added" list; `pinned`: updated from the source it follows. */
  latest?: { name?: string; source: SourceId; network?: string; pinned?: boolean };
  /** Set on the final event of a run. */
  runId?: string;
  /** Final event: the run was stopped before the last contact. */
  cancelled?: boolean;
}

/** What a sync does (issue #82), in place of the old modes. */
export interface RunOptions {
  /** Contacts without a photo (or with a placeholder) take the pinned source's photo, or the first source's. */
  fillMissing: boolean;
  /** A pinned source with a new photo is applied. */
  updatePinned: boolean;
  /** Contacts with a photo and a different one somewhere go to To review; nothing changes. */
  lookDifferent: boolean;
  /** Nothing is applied: every contact with a photo to pick goes to To review. */
  decideAll: boolean;
}

/** A photo waiting in Sync's To review (issue #82). */
export interface QueuePhoto {
  /** `photo:<hash>`: what a confirm sends as `photoFrom`. */
  id: string;
  source: SourceId;
  /** The phone number, email or profile ("instagram.com/name") it came from. */
  matchedBy: string;
  /** For a profile link, its network: "Instagram", "X"… */
  network?: string;
  readAt: string;
  /** Its size, when known (issue #104). */
  width?: number;
  height?: number;
  /** Smaller than 200 px, offered because the contact has no photo. */
  small?: boolean;
}

/** A contact's photos waiting in To review: "photo" to pick one, "changed" when a pinned photo was changed outside the app. */
export interface QueueEntry {
  kind: "photo" | "changed";
  photos: QueuePhoto[];
  /** "changed": the source the photo was pinned to. */
  pinned?: { source: SourceId; network?: string; matchedBy?: string };
  addedAt: string;
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
  /** Review sessions (issue #84): the profiles a decision linked; `added` when it saved the link on the contact, which undo removes. */
  profiles?: { url: string; network: string; added?: boolean }[];
  /** The source the photo followed before (none: null); undo puts it back. Absent in runs before issue #84. */
  previousPin?: PhotoPin | null;
  /** Review entries: when the decision was made. */
  at?: string;
}

export interface RunSummary {
  id: string;
  startedAt: string;
  finishedAt?: string;
  /** "sync": a run with options (issue #82); "session": decisions made in To review (issue #84); the others are older runs. */
  mode: "fill" | "replace" | "review" | "sync" | "session";
  options?: RunOptions;
  sources: SourceId[];
  totalContacts: number;
  counters: SyncCounters;
  cancelled?: boolean;
  undone?: boolean;
}

export interface RunRecord extends RunSummary {
  results: ContactResult[];
  /** Desktop: pinned profiles read again with the user's login, per network (issue #79). */
  profileReads?: Partial<Record<"instagram" | "facebook" | "linkedin", ProfileReadsReport>>;
}

export interface ProfileReadsReport {
  read: number;
  /** Left for the next sync: over the cap, or after the network stopped. */
  waiting: number;
  /** Why the network stopped: "limited", "signin", "notSignedIn" (no login in the app), "busy" (a login scan was running) or "error:…". */
  stopped?: string;
  /** The site's own answer when it stopped, e.g. "HTTP 429: Please wait a few minutes before you try again." */
  answer?: string;
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

/** The query of /api/init_sync: strings, "true" or "false" for the options (issue #82). */
export interface SyncOptions {
  fill_missing?: string;
  update_pinned?: string;
  look_different?: string;
  decide_all?: string;
  reads_cap?: string; // desktop: profiles read with the login per network and sync
  sources?: string; // comma-separated SourceId list in priority order; default "whatsapp"
  link_networks?: string; // profile link networks turned on in Sync › Sources, comma-separated (issue #83)
  linkedin_rereads?: string; // "false": the desktop app doesn't read pinned LinkedIn profiles with the login (issue #80)
}

/** Desktop: pinned profiles each network could read again with the login (issue #80). */
export type PinnedProfiles = Partial<Record<"instagram" | "facebook" | "linkedin", number>>;

/** A profile picture looked up from a link (report and review, issue #51). */
/** Sync › Sources (issue #83): contacts with profile links, and per network its profiles and the oldest read with the login. */
export interface LinkedNetworks {
  contacts: number;
  profiles: number;
  networks: Partial<Record<string, { profiles: number; oldestRead?: string }>>;
}

/** The Dashboard (issue #85): the address book in three parts and what to do next, from stored state. */
export interface Coverage {
  total: number;
  withPhoto: number;
  /** Without a photo, but one is ready: a linked or pinned profile whose photo is known, or a photo waiting in To review. */
  ready: number;
  /** Where the ready photos come from. */
  readySources: SourceId[];
  /** Without a photo and without any of those. */
  noSource: number;
  /** Contacts waiting in To review, apart from photos changed outside the app, and how many of them have no photo. */
  toReview: number;
  toReviewWithoutPhoto: number;
  /** Photos changed outside the app, waiting in To review. */
  changed: number;
  /** When the public search last ran. */
  lastSearch?: string;
  /** Profiles linked on contacts, and on how many contacts. */
  linkedProfiles: number;
  linkedContacts: number;
  /** Contacts whose number WhatsApp knows, while it's connected. */
  whatsapp?: number;
}

export interface LinkLookup {
  /** Refers to the looked-up photo on the server, to save it. */
  token: string;
  photo: string;
  /** "Instagram", "X"… */
  network: string;
  /** The normalized link, e.g. "https://instagram.com/name". */
  url: string;
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
  /** Where the photo comes from, when it follows a source (issue #78). */
  photoFrom?: Pick<PhotoPin, "source" | "network" | "matchedBy" | "suspended">;
  updatedAt?: string;
}

/**
 * A photo pinned to the source it was picked from (issue #78): syncs take
 * that source first and apply its new photo when it changes.
 */
export interface PhotoPin {
  source: SourceId;
  /** For a profile link, the profile in short form ("instagram.com/name"), as in reports. */
  matchedBy?: string;
  /** For a profile link, its network: "Instagram", "X"… */
  network?: string;
  /** A hash of the photo last applied from the source; absent for a pin brought over from an earlier link. */
  hash?: string;
  /** Google's address for that photo, without its size: a different one means it was changed outside the app. */
  photoKey?: string;
  /** When the source was last read. */
  readAt: string;
  /** The photo was changed outside the app: the pin waits, and the photo is left alone. */
  suspended?: boolean;
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
  /** Where it came from: the user's data export, a public search, a scan with their login, or a search of a contact's name with it (issue #104). */
  source: "export" | "search" | "scan" | "loginSearch";
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
  /** Profiles already on the contact, read with a photo: photo candidates too (issue #81). */
  linked?: SocialPerson[];
  /** Photos a sync sent to To review (issue #82). */
  queue?: QueueEntry;
  /** The source the contact's photo comes from, while it is the one the app applied (issue #104). */
  currentFrom?: { source: SourceId; network?: string };
}

/** Searching contacts' names with the login, for the selected cards in To review (issue #104). */
export interface LoginSearchState {
  running: boolean;
  networks: SocialNetwork[];
  /** Searches done and to do: one per contact and network. */
  done: number;
  total: number;
  /** People found, and how many of them became suggestions. */
  found: number;
  suggested: number;
  /** "<reason>:<network>" when a site said no; that network was left out for the rest. */
  stopped?: string[];
}

/** POST /api/profiles/login-search: one card, one network. */
export interface LoginSearchResult {
  found: number;
  suggested: number;
  /** Why the site said no: "notSignedIn", "signin", "limited", "busy" or "error:…". */
  stopped?: string;
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
  /** A photo looked up from a profile link on the card (LinkLookup.token): applied, and its link saved. */
  link?: string;
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
  /** Desktop only: searching the selected cards' names with the login (issue #104). */
  loginSearch?: LoginSearchState;
}

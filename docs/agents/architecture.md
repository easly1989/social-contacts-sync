# Architecture and CI detail

Moved verbatim from CLAUDE.md. Read when touching sync, the desktop/server split, server areas or the web pages, or when you need the CI job list.

## One server, two modes

`server/main.ts` mounts every router from `server/routes/` under
`ROUTE_PREFIX` (default `/api`) and serves the built SPA from `WEB_ROOT`, so API, WebSocket and
pages share one origin (required for the session cookie and Google OAuth). `startServer()` is
exported; the file only listens on its own when run directly.

- **Web/server mode:** multi-user, in-memory sessions, Google credentials from env.
- **Desktop mode** (`SCS_DESKTOP=1`, `server/src/desktop.ts`): single user — every request shares
  `desktopSessionId`; a `crossSiteGuard` protects `/api`; sign-ins are restored at start-up.
  The server runs in an Electron **utility process** (`desktop/src/server-process.ts`) bound to
  `127.0.0.1` on a free port. The Electron main process (`desktop/src/main.ts`) owns `config.env`,
  the data folder, updates, the browser for WhatsApp Web and social scans; the server asks it for
  these via `askDesktop()` over `parentPort` (tests emulate this with `SCS_DESKTOP_IPC=1`).

## Sync pipeline

`server/src/sync.ts` (`initSync`) picks the requested `PhotoSource`s
(`server/src/sources/` — whatsapp, telegram, gravatar, links; interface in `sources/types.ts`) in
the user's priority order, reads pinned social profiles first (`profiles/rereads.ts`), and hands
them to `syncEngine.ts` (`runSync` with `RunOptions`): what is safe is applied, the rest goes to
the To review queue (`profiles/queue.ts`). Progress travels over the `/api/ws` WebSocket as
`interfaces/api.ts` `EventType`s. Google writes go through `gapi.ts` behind a rate limiter (~40
photo updates/min) with `googleRetry.ts`. Every run is saved by `runs.ts` with before/after photos
so `undo.ts` can revert a whole run or one contact; decisions made in To review are saved the same
way as Review entries (`recordDecision`), and undo also puts back their links and photo pin.

## Other server areas

`cleanup/` (duplicate scan, field-by-field merge, backups for undo),
`profiles/` (To review and its suggestions: data-export imports, public searches, matching, the
`profiles.json` store, the review queue, login rereads, the History migration),
`contactLinks.ts` / `linkLookups.ts` (profile-link pictures), `secretStore.ts` (AES-256-GCM token
storage keyed by an OS-keychain-protected key).

## Web pages and API

**Web.** Pages in `web/src/pages/` (setup wizard, public pages) and `web/src/pages/app/`
(Dashboard, Sync with its To review / Sources / Run tabs, RunReport, Contacts, Cleanup, History, Settings). API
calls in `src/api.ts`, WebSocket in `src/services/ws.ts`.

## CI

CI (`.github/workflows/ci.yml`) runs: server build + tests, web build + e2e, a smoke test of the
built server (`.github/scripts/smoke-test.sh`), a Docker build, desktop tests + packaged-app launch,
and shellcheck on `.github/scripts/`. E2e screenshots are kept as workflow artifacts.

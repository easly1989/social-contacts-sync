# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Social Contacts Sync fills Google Contacts with profile photos from WhatsApp, Telegram, Gravatar
and social profile links, and cleans up duplicates. It is a fork of
[guyzyl/whatsapp-contact-sync](https://github.com/guyzyl/whatsapp-contact-sync) and ships two ways
from the same code: a self-hosted web server (Node/Docker) and an Electron desktop app.

## Layout

Three independent npm packages (no root workspace — run `npm ci` in each), plus a shared type file:

- `server/` — Express 5 + `express-ws` backend (TypeScript, CommonJS). Entry `server/main.ts`.
- `web/` — Vue 3 + Vite + Tailwind 4/daisyUI SPA. vue-i18n with `src/locales/en.ts` and `it.ts`.
- `desktop/` — Electron shell that embeds the built server and web app.
- `interfaces/api.ts` — the API contract (WebSocket `EventType`s, `SourceId`, request/response
  types) imported by server, web and the web e2e fake backend. Change it there, not per package.

## Commands

```bash
# server (port 8080; needs server/.env with GOOGLE_CLIENT_ID/SECRET, optional TELEGRAM_API_ID/HASH)
cd server && npm run dev          # nodemon + ts-node
cd server && npm run build        # tsc -> server/build
cd server && npm test             # node:test over src/**/*.test.ts
node --require ts-node/register/transpile-only --test src/sync.test.ts   # one server test file (from server/)

# web (port 4000; Vite proxies /api and /api/ws to :8080)
cd web && npm run dev
cd web && npm run build           # vue-tsc --noEmit + vite build — this is the type-check
cd web && npm run test:e2e        # Playwright; run `npx playwright install chromium` once
npx playwright test e2e/contacts.spec.ts -g "name"                      # one e2e test (from web/)
cd web && npm run typecheck:e2e

# desktop
cd desktop && npm run dev         # builds server + web + desktop, stages, launches Electron
cd desktop && npm test            # tsc then node --test build/*.test.js
cd desktop && npm run pack        # unpacked build in desktop/dist
cd desktop && npm run test:e2e    # launches the packaged app (Linux: xvfb-run)
```

TypeScript quirk: server and web alias `typescript` to `@typescript/typescript6` (ts-node and
vue-tsc need the JS compiler API) and `@typescript/native` to TypeScript 7 for `tsc`. Desktop uses
plain TypeScript 5. Set `PUPPETEER_SKIP_DOWNLOAD=true` for installs that don't drive WhatsApp.

CI (`.github/workflows/ci.yml`) runs: server build + tests, web build + e2e, a smoke test of the
built server (`.github/scripts/smoke-test.sh`), a Docker build, desktop tests + packaged-app launch,
and shellcheck on `.github/scripts/`. E2e screenshots are kept as workflow artifacts;
images for issues and PRs go on the `pr-assets` branch.

## Architecture

**One server, two modes.** `server/main.ts` mounts every router from `server/routes/` under
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

**Desktop packaging.** `desktop/scripts/stage.mjs` assembles `desktop/app/` from
`desktop/build`, `server/build` and `web/dist` plus the server's production `node_modules`, then
electron-builder packages that folder. Server code changes reach the desktop app only through
this staging step.

**Sync pipeline.** `server/src/sync.ts` (`initSync`) picks the requested `PhotoSource`s
(`server/src/sources/` — whatsapp, telegram, gravatar, links; interface in `sources/types.ts`) in
the user's priority order, reads pinned social profiles first (`profiles/rereads.ts`), and hands
them to `syncEngine.ts` (`runSync` with `RunOptions`): what is safe is applied, the rest goes to
the To review queue (`profiles/queue.ts`). Progress travels over the `/api/ws` WebSocket as
`interfaces/api.ts` `EventType`s. Google writes go through `gapi.ts` behind a rate limiter (~40
photo updates/min) with `googleRetry.ts`. Every run is saved by `runs.ts` with before/after photos
so `undo.ts` can revert a whole run or one contact; decisions made in To review are saved the same
way as Review entries (`recordDecision`), and undo also puts back their links and photo pin.

**Photo protection rules** that every writer must respect: `contacts/placeholders.ts` (photos
uploaded by hand — a sync may replace them) and `contacts/keptPhotos.ts` (kept photos — never
replaced by a sync or from To review), and `contacts/photoPins.ts` (the source a photo follows).

**Other server areas:** `cleanup/` (duplicate scan, field-by-field merge, backups for undo),
`profiles/` (To review and its suggestions: data-export imports, public searches, matching, the
`profiles.json` store, the review queue, login rereads, the History migration),
`contactLinks.ts` / `linkLookups.ts` (profile-link pictures), `secretStore.ts` (AES-256-GCM token
storage keyed by an OS-keychain-protected key).

**Web.** Pages in `web/src/pages/` (setup wizard, public pages) and `web/src/pages/app/`
(Dashboard, Sync with its To review / Sources / Run tabs, RunReport, Contacts, Cleanup, History, Settings). API
calls in `src/api.ts`, WebSocket in `src/services/ws.ts`. All user-facing strings go through
vue-i18n — add every new key to both `en.ts` and `it.ts`.

**Web e2e tests need no backend:** `web/e2e/backend.ts` (`FakeBackend`) answers `/api/*` and mocks
the WebSocket inside the browser. New endpoints or events need matching support there.

## Upstream fork

`.github/workflows/upstream-sync.yml` merges upstream monthly into the `upstream-sync` branch and
opens a PR — merge those with a **merge commit**, never squash or rebase. Release builds come from
`v*` tags (`.github/workflows/release.yml`); a `-` in the tag marks a pre-release.

## Agent skills

### Issue tracker

GitHub Issues on `easly1989/social-contacts-sync`, via `gh`. See `docs/agents/issue-tracker.md`.

### Domain docs

Single-context: `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

### Token tools

CBM: call `index_repository` once, then `search_graph` / `trace_path` before reading files.

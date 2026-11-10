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

CI job list: `docs/agents/architecture.md` (read it when changing CI). E2e screenshots are kept as
workflow artifacts; images for issues and PRs go on the `pr-assets` branch.

## Architecture

Read `docs/agents/architecture.md` before changing the sync pipeline, the desktop/server split, the
server areas (`cleanup/`, `profiles/`, `secretStore.ts`) or the web page layout. Server: API,
WebSocket and SPA share one origin (session cookie, Google OAuth); web/server mode is multi-user,
desktop mode (`SCS_DESKTOP=1`) is single user in an Electron utility process with `crossSiteGuard`
on `/api`.

**Desktop packaging.** `desktop/scripts/stage.mjs` assembles `desktop/app/` from
`desktop/build`, `server/build` and `web/dist` plus the server's production `node_modules`, then
electron-builder packages that folder. Server code changes reach the desktop app only through
this staging step.

**Photo protection rules** that every writer must respect: `server/src/contacts/placeholders.ts` (photos
uploaded by hand — a sync may replace them) and `server/src/contacts/keptPhotos.ts` (kept photos — never
replaced by a sync or from To review), and `server/src/contacts/photoPins.ts` (the source a photo
follows).

**Web.** All user-facing strings go through vue-i18n — add every new key to both `en.ts` and `it.ts`.

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

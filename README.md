# Social Contacts Sync

<p align="center">
    <img src="web/public/logo.png" alt="logo" width="150"/>
</p>

<p align="center">
    <a href="https://www.buymeacoffee.com/guyzyl">
        <img
            src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png"
            alt="Buy Me A Coffee"
            width="220px"
        />
    </a>
</p>

> Social Contacts Sync is a fork of
> [WhatsApp Contact Sync](https://github.com/guyzyl/whatsapp-contact-sync) by
> Guy Zylberberg, extended towards more sources and a desktop app. All credit
> for the original project goes to its author.

A simple web app for syncing the profile pictures from WhatsApp to Google Contacts.\
The app matches contacts based on their phone numbers, and utilizes
[whatsapp-web.js](https://github.com/pedroslopez/whatsapp-web.js) and [Google People API](https://developers.google.com/people) to update the profile picture in Google Contacts.

## Demo

<p align="center">
    <img src="https://user-images.githubusercontent.com/3015856/214192748-1681d9be-201a-4ffc-b8da-79857718b7eb.gif" width="600"/>
</p>

## Why Was This Developed?

Whenever someone used to call me or I looked them up in my contacts, they all apear as colorful circles with a single letter in it.\
The annoying part is that every single person I know has a WhatsApp account which has a profile picture. They are both based on the same phone number but the picture is only available in one of them.\
In order to fix this grievence I developed this app which allows anyone to sync their contacts photos from WhatsApp to Google Contacts.

## How To Use

The app is extremley easy to use (and self explantory):

1. Go to [whasync.com](https://whasync.com/)
2. Press "Get Started"
3. Scan the QR code with WhatsApp to authorize it
4. Connect you Google account
5. Choose you sync options
6. That's it :)

The whole process is very simple and automated, so you don't need to worry about anything else.\
Setting up should take less then a minute, and syncing should take about 1 second per photo (due to Google's API rate limitiations of 60 requests per user per minute)

## How to Run Locally

In order for the backend to function, it requires an OAuth 2.0 client ID and secret.\
Since (for obvious reasons) this is a private app, you will need to create one for your own.\
You can see instructions on how to do that [here](https://developers.google.com/workspace/guides/create-credentials).\
Once you do that, create the file `server/.env`, and set the following environment variables:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`

You also need to add the following **Authorized Redirect URI** to your OAuth 2.0 client in the [Google Cloud Console](https://console.cloud.google.com) based on how you are running the app:

EXAMPLES:
- Local dev: `http://localhost:8080/api/google_callback`
- Docker (port 80): `http://localhost/api/google_callback`
- Production: `https://<your-domain>/api/google_callback`

Once that's done, you can go ahead and run the app:

```bash
# Run backend
cd server
npm install
npm run dev

# Run web app
cd web
npm install
npm run dev
```

The server build uses TypeScript 7. Both packages also install Microsoft's
`@typescript/typescript6` compatibility package under the `typescript` alias
because `ts-node` and `vue-tsc` still require the JavaScript compiler API.
The `@typescript/native` alias provides TypeScript 7's `tsc` executable.

## Tests

Every pull request runs the [CI workflow](.github/workflows/ci.yml): server
build and unit tests, web type-check and build, a smoke test of the built
server, a Docker build and browser end-to-end tests. The end-to-end tests mock
the backend inside the browser, so they need no WhatsApp or Google account; the
screenshots they take are posted on the pull request.

```bash
cd server && npm test             # unit tests
cd web && npm run build && npm run test:e2e   # end-to-end (Playwright)
```

Run `npx playwright install chromium` once before the first end-to-end run.

## Keeping the Fork in Sync

This repository is a fork of [guyzyl/whatsapp-contact-sync](https://github.com/guyzyl/whatsapp-contact-sync).
The [`Upstream sync`](.github/workflows/upstream-sync.yml) workflow checks the
original repository on the 1st of every month (or when started by hand from the
Actions tab):

- new upstream commits are merged into the `upstream-sync` branch and offered as
  a pull request labelled `upstream-sync` — merge it with **Create a merge
  commit**, never squash or rebase;
- if the merge conflicts, an issue labelled `upstream-conflict` lists the files
  and the commands to resolve it; it closes itself after the next clean sync.

The workflow needs a fine-grained personal access token stored as the
`UPSTREAM_SYNC_TOKEN` repository secret, limited to this repository with
read & write access to Contents, Pull requests, Issues and Workflows (pull
requests opened with the default `GITHUB_TOKEN` would not run CI).

## Build Docker Images

There are 3 different `Dockerfile`s for this app:

- [`Dockerfile`](Dockerfile) - This is an image containing both the backend and the web app
- [`Dockerfile`](web/Dockerfile) - An image containing only the web app
- [`Dockerfile`](server/Dockerfile) - An image containing only the backend

In order to build and run the complete app, you need to run the following commands:

```bash
docker build -t social-contacts-sync .
docker run --rm -it -p 80:10000 --env-file server/.env social-contacts-sync
```

## Deploy on Render

The GitHub Actions workflow publishes the full application to GitHub Container
Registry after every successful push to `main`. Make the resulting package
public in GitHub's package settings, then configure a Render **Web Service**
from the image:

- Image: `ghcr.io/easly1989/social-contacts-sync:latest`
- Health check path: `/api/`
- `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`: your Google OAuth values
- `SESSION_SECRET`: a long, random secret
- `ENFORCE_PAYMENTS=false`

Render provides `PORT` automatically; do not override it. Add
`https://whasync-latest.onrender.com/api/google_callback` as an authorized
redirect URI in the Google Cloud OAuth client.

This service runs the frontend, API and WebSocket in one container. A service
that sleeps or is restarted ends an in-progress WhatsApp sync, so use an
always-on host for long synchronizations.

In order to build the seperate images for the backend and frontend, execute the following commands from the projects main directory:

```bash
docker build -t social-contacts-sync-backend --env-file server/.env -f server/Dockerfile .
docker build -t social-contacts-sync-web -f web/Dockerfile .
```

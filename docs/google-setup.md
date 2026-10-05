# Create your Google credentials

Social Contacts Sync updates your contacts through Google's People API with
**your own** OAuth client, so your data only travels between your computer
and Google. Creating the client is free and takes about five minutes, once.

The desktop app's setup wizard walks you through the same steps and opens
each page for you.

## 1. Create a Google Cloud project

1. Open the [new project page](https://console.cloud.google.com/projectcreate)
   and sign in with any Google account.
2. Give the project a name (for example *Contacts photos*) and press **Create**.
3. Make sure the new project is selected in the project picker at the top.

## 2. Enable the People API

1. Open the [People API page](https://console.cloud.google.com/apis/library/people.googleapis.com).
2. Press **Enable**.

## 3. Set up the consent screen

1. Open [Google Auth Platform → Branding](https://console.cloud.google.com/auth/branding)
   and press **Get started** if asked.
2. App name: anything, for example *Social Contacts Sync*; support email: yours.
3. Audience: **External**. Contact information: your email. Accept the policy and **Create**.
4. **Required:** under [Audience](https://console.cloud.google.com/auth/audience),
   in **Test users**, press **Add users** and add your own Google account (the
   one whose contacts you want to update). Without it Google blocks the
   sign-in with *Access blocked*.
5. Optional, still under Audience: press **Publish app** and confirm.

   Apps left in *Testing* are signed out every 7 days. Publishing does not
   make anything public: only accounts that sign in to *your* copy of the app
   ever use it. Google may show "Google hasn't verified this app" when you
   sign in; that is expected for a personal project. Choose **Advanced →
   Go to (your app)**.

## 4. Create an OAuth client

1. Open [Clients → Create client](https://console.cloud.google.com/auth/clients/create).
2. Application type: **Desktop app**. Name: anything.
3. Press **Create**, then **Download JSON** in the dialog.

## 5. Give the credentials to the app

- **Desktop app:** drop the downloaded `client_secret_….json` on the setup
  wizard, or paste the client ID and client secret. The app checks them with
  Google and saves them to `config.env`.
- **By hand / self-hosted:** put the values in `config.env` (desktop) or
  `server/.env` (server):

  ```env
  GOOGLE_CLIENT_ID=1234567890-abc.apps.googleusercontent.com
  GOOGLE_CLIENT_SECRET=GOCSPX-…
  ```

  A self-hosted server reached through a browser needs a client of type
  **Web application** instead, with `https://<your-host>/api/google_callback`
  as an authorized redirect URI (see the README).

## Troubleshooting

| Message | Fix |
|---|---|
| *This client is a "Web application"* | Create a client of type **Desktop app** (step 4). |
| *Google didn't accept these credentials* | Copy the ID and secret again, or download a fresh JSON. |
| *Access blocked: … has not completed the Google verification process* | Add your account as a test user (step 3.4) or publish the app (step 3.5). |
| Signed out every week | The app is still in *Testing*: publish it (step 3.5). |

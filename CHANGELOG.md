# Changelog

What changed in each release of Social Contacts Sync. The packages are on the
[releases page](https://github.com/easly1989/social-contacts-sync/releases).

## 1.3.2 — 2026-10-15

### Added

- **Kept photos.** Keep a contact's photo and the app never replaces it: no
  sync, in any mode, and no Find profiles. Links to WhatsApp and to social
  profiles still work for that contact. Set it from the contact editor, a
  row's menu on the Contacts page, or when uploading photos ("Placeholders" or
  "Kept photos"); a filter lists them. ([#67](https://github.com/easly1989/social-contacts-sync/issues/67))
- **Several profiles per contact.** Find profiles links Instagram, LinkedIn,
  Facebook and the others to the same contact at once, and you pick which
  profile's photo to use, if any. A contact that already has a real photo
  keeps it unless you pick one. ([#65](https://github.com/easly1989/social-contacts-sync/issues/65))
- **Review as a list, link in bulk.** *To review* shows every suggestion, one
  card per contact; select contacts and link them in one go, in the background
  at Google's pace, with progress and Stop. *One at a time* stays as a view,
  with its keyboard shortcuts.
- **When each source was last read.** Find profiles' Sources say when each
  export was imported, each network searched and each login scan run. What's
  read is kept in the data folder between sessions.

### Changed

- **Toasts** appear bottom right, in a card. Confirmations leave after two
  seconds; errors stay until closed, with their detail and *Copy error*.
- **Sources** in Find profiles are full-width rows instead of three columns,
  and a scan that stopped shows why, with the site's own answer to copy.

### Fixed

- The Facebook login scan stopped at once: it now waits for Facebook's redirect
  to the friends page, and the sites see a plain Chrome browser.
- Instagram profile photos didn't show: they now come through the app, and an
  expired address is read again from the profile.

## 1.3.1 — 2026-10-15

### Added

- **Update progress.** Settings and the sidebar show the download of a new
  version. Closing the app with an update ready asks: *Update and close* (with
  the installer's progress window, and optionally opening the app again),
  *Close without updating*, or *Cancel*. When it's installed, a small window
  offers to open the app. Settings can also *Update and restart*.
  ([#63](https://github.com/easly1989/social-contacts-sync/issues/63))
- **Automatic updates** setting: on, a new version downloads as soon as it's
  out; off, only after *Check for updates*.

## 1.3.0 — 2026-10-15

### Added

- **Find profiles.** Suggests your contacts' social profiles from your own
  Instagram and LinkedIn data exports, a public search by name on Bluesky,
  Mastodon and GitHub, and, experimental, a slow scan of your own followers,
  friends and connections with your Instagram, Facebook or LinkedIn login
  (against those sites' terms). ([#61](https://github.com/easly1989/social-contacts-sync/issues/61))
- **Sign in to Google again inside the app** when Google ends the sign-in, for
  example after 7 days in "Testing", or after signing out.
  ([#59](https://github.com/easly1989/social-contacts-sync/issues/59))

### Changed

- The setup wizard opens only on the first run; signing out and in again stays
  in the app. WhatsApp can be linked from Settings.

## 1.2.1 — 2026-10-07

### Added

- Every part of a contact's name is editable: prefix, middle name and suffix,
  such as "Volley" after the comma. ([#57](https://github.com/easly1989/social-contacts-sync/issues/57))
- A double click opens a contact; photos show larger on hover everywhere.

## 1.2.0 — 2026-10-06

### Added

- **Contacts page.** Every Google contact in one list: edit every field (work,
  birthday, addresses, notes, labels), add, duplicate, delete with undo, merge
  and label them, add profile links, and upload photos by hand, one at a time
  or many at once, matched by file name or number. A photo uploaded by hand is
  a placeholder that the next sync replaces with a real one.
  ([#55](https://github.com/easly1989/social-contacts-sync/issues/55))

### Fixed

- Contacts that kept their Google photo were reported as "No photo found".
- Google's temporary errors (5xx) are retried, and reported in one line.
- WhatsApp finds more contacts by their number.
  ([#53](https://github.com/easly1989/social-contacts-sync/issues/53))

## 1.1.0 — 2026-10-06

### Added

- **Profile links** as a photo source: the X, Telegram, YouTube, Bluesky,
  Mastodon and GitHub profiles saved on a contact give it their public picture,
  with no sign-in; Instagram, Facebook and LinkedIn optionally. Add a link from
  a sync report's "No photo found" list or while reviewing.
  ([#51](https://github.com/easly1989/social-contacts-sync/issues/51))

## 1.0.0 — 2026-10-06

The first stable release of the desktop app for Windows, Linux and macOS.

- Photos from WhatsApp and Telegram (by phone number) and Gravatar (by email),
  in the order you choose.
- Fill in missing photos, replace them all, or review each one.
- A report for every sync, with undo for one contact or the whole run, and CSV
  export.
- Clean up: duplicate contacts merged field by field, numbers shared by
  different people, and numbers without a country code; every change backed up
  and undoable.
- A setup wizard for your own Google project; sign-ins kept encrypted with the
  system keychain; automatic updates for the Windows installer and the AppImage.
- English and Italian; light, dark or system theme.

The `0.1.0-beta` releases before it were the betas of 1.0.0.

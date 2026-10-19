# Changelog

What changed in each release of Social Contacts Sync. The packages are on the
[releases page](https://github.com/easly1989/social-contacts-sync/releases).

## 1.4.3 — 2026-10-19

### Added

- **Sync is a step-by-step wizard.**
  ([#107](https://github.com/easly1989/social-contacts-sync/issues/107))
  - The steps are *Sources*, *Profiles*, *Sync*, *Photos*, *To search* and
    *Summary*.
  - Every step except Sources can be skipped.
  - Each step shows how many contacts wait in it.
  - Sync opens on Sources, or on the sync itself while one is running.
  - On a phone, the steps fold into a menu.
- **Profiles before photos.** Profiles links the profiles found for each
  contact. Photos then offers their pictures, marked *linked now*, next to the
  photos the sync found.
- **To search.** The contacts where no source found anything get their own
  step. From there you can search their name with your login, look up a profile
  link, upload a photo, or leave them without one.
- **Summary.** It shows what the sync did and what didn't finish, each with its
  fix: run again with only that source, sign in and read again, or open the
  report and undo.

### Changed

- **One list of sources.** WhatsApp, Gravatar, Telegram and each profile
  network share a single priority order.
  - Each row shows its real state, such as *Connected*, *Signed in* or
    *Session closed*.
  - Each row has its own fix: *Connect*, *Sign in* or *Sign in again*.
  - A network with no linked profiles waits behind *Show all* and isn't sent
    to the sync.
- **Desktop: sign-ins are watched live.** A site that closes the app's session
  shows at once, with no need to restart.
- **A sync is never stopped by one source.**
  - A source that fails to start, or fails three times in a row, is left out.
    The sync goes on and says so where it happens, with *Reconnect*.
  - When a site signs the app out during the profile reads, its row offers
    *Sign in again*, which resumes the reads in the same sync, or *Skip*.
  - A network without a sign-in isn't read, and Sync offers the sign-in before
    starting.
- The sync shows two options; *Look for different photos* and *I decide every
  contact* are under *Advanced*.

### Fixed

- A failed sync can always be left: *Stop* goes away and *Back* starts again.
  Before, *Stop* did nothing and no new sync could start.
- The photo copies kept for undo are saved at full size. They used to be
  100 px.
- Signing in to Google also asks for the basic profile, so the account summary
  no longer fails with *403*.

## 1.4.2 — 2026-10-19

### Added

- **To review lists the contacts without a photo.** Each one gets a card, even
  when nothing was found yet, with a place to find their profile. *No photo*
  hides a card for good, unless the contact's phones, emails or links change;
  *Skip* hides it until the next sync.
  ([#104](https://github.com/easly1989/social-contacts-sync/issues/104))
- **Filters and search in To review.** No photo, Different photo, Profiles to
  link, Changed outside the app, or All, each with its count, and a search by
  name. *Select all* selects what the filter shows.
- **Desktop: search a contact's name with your login.** From a card, or for up
  to 25 selected cards, on Instagram, Facebook and LinkedIn, five results per
  site. Nothing is searched until you start it, and the first time the app
  explains the risk, as for the login scans.
- **Where the current photo comes from.** The contact's photo shows its source,
  such as *Current · from WhatsApp*, and keeping it is the default choice.

### Changed

- **Only photos worth it.** For a contact that already has a photo, To review
  offers nothing smaller than 200×200 and nothing that looks the same as the
  current photo. A contact without a photo is offered smaller photos too,
  marked *small*. Facebook and Instagram photos are offered only when read with
  your login.
- **Real logos.** Every source and network shows its own logo and colour.
- Telegram is no longer listed among the profile networks; the networks without
  profiles are behind *Show all*.
- Contact photos are shown sharper.

### Fixed

- Facebook photos read with the login were blurred: the reader picked the cover
  or a blurred copy of the picture. The old Facebook reads are dropped and read
  again by the next sync.

## 1.4.1 — 2026-10-18

### Fixed

- Pinned Instagram profiles are read even when Instagram's API says no.
  ([#100](https://github.com/easly1989/social-contacts-sync/pull/100))
- A stuck sync can always be stopped, and the desktop app can restart its
  server. ([#101](https://github.com/easly1989/social-contacts-sync/pull/101))
- To review: photos grow on hover again, and each profile is offered once.
  ([#102](https://github.com/easly1989/social-contacts-sync/pull/102))
- To review no longer suggests a profile that is already on another contact.
  ([#103](https://github.com/easly1989/social-contacts-sync/pull/103))

## 1.4.0 — 2026-10-18

### Added

- **One Sync page.** Find profiles and Sync photos are now one page with three
  tabs: *To review*, *Sources* and *Run*. The old addresses lead to the right
  tab, and the Sync item in the sidebar shows how many contacts wait in To
  review. ([#81](https://github.com/easly1989/social-contacts-sync/issues/81))
- **To review, kept between sessions.** One card per contact. Tick the
  profiles that are really them, and pick one photo among every source:
  WhatsApp, Telegram, Gravatar and each profile on its own, suggested or already
  linked. Confirming links the profiles and applies the photo in one step. The
  queue survives restarts, and you can work through it while a sync runs.
  ([#77](https://github.com/easly1989/social-contacts-sync/issues/77),
  [#81](https://github.com/easly1989/social-contacts-sync/issues/81))
- **A sync that applies what is safe.**
  ([#82](https://github.com/easly1989/social-contacts-sync/issues/82))
  - *Run* fills in missing photos and updates the photos that follow a source.
  - Everything else waits in To review: a different photo for a contact that
    already has one, or a photo changed outside the app.
  - *I decide every contact* applies nothing and sends every photo found to To
    review.
  - Progress shows each phase, with counters for applied, to review, no photo
    found and errors.
- **Photos follow their source.** A photo picked from a source keeps following
  it, so later syncs update it when that profile's picture changes. A photo
  changed by hand in Google is never overwritten: it waits in To review, where
  you keep it or go back to the source's photo. The contact editor shows where
  a photo comes from, and lets you unpin it.
  ([#78](https://github.com/easly1989/social-contacts-sync/issues/78))
- **Desktop: pinned profiles read again with your login.**
  - Before the photos, a sync reads the pinned Instagram and Facebook profiles
    one by one with your login, oldest first.
  - It stops reading a network when that network asks to slow down, and the
    report says how many profiles were read.
  - LinkedIn can be read the same way, behind a setting and a first-time
    notice: LinkedIn may record each read as a profile visit.
  - Looking up an Instagram, Facebook or LinkedIn link uses the login too.
  - ([#79](https://github.com/easly1989/social-contacts-sync/issues/79),
    [#80](https://github.com/easly1989/social-contacts-sync/issues/80))
- **Linked profiles per network.** Sources lists the profiles linked on your
  contacts for each network. It shows how many there are and when the oldest
  was read, and each network has its own switch.
  ([#83](https://github.com/easly1989/social-contacts-sync/issues/83))
- **Reviews in History.**
  ([#84](https://github.com/easly1989/social-contacts-sync/issues/84))
  - The decisions made in To review are saved as *Review* entries, next to the
    syncs.
  - Undo for one contact, or a whole entry, puts back the photo, the profile
    links and the source the photo followed.
  - A *Linked profiles* filter lists each profile linked from To review, with
    its own Undo.
- **A Dashboard that says what to do next.**
  ([#85](https://github.com/easly1989/social-contacts-sync/issues/85))
  - Coverage in three parts: with a photo, without one but with a photo ready,
    and without any source.
  - *Next steps*, in order of impact, each with its action.
  - Real numbers for the sources: the contacts on WhatsApp and the linked
    profiles.

### Changed

- The *Fill in missing*, *Replace all* and *Review each* modes are replaced by
  the Run tab's options. Past runs keep their reports and undo.
- The *Profile links* best-effort switch in Settings is replaced by the
  per-network switches in Sync › Sources.
- To review and the Sync badge are faster on large address books.
- The review photos are smaller, two per row on a phone, and the run report's
  table fits a phone screen.

### Removed

- Find profiles' *Linked* tab: its links are in History, under *Linked
  profiles*.

## 1.3.3 — 2026-10-15

### Fixed

- Facebook friends read by the login scan came in without their photo: a
  friend's picture and name are two links to the same profile, and they're now
  read together. Scan Facebook again to fill in the photos of friends already
  read. ([#71](https://github.com/easly1989/social-contacts-sync/issues/71))

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

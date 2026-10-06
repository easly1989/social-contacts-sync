// Profile links source (issue after #26): settings, the report's "add a link" and review.
import { icon, face, initials, sourceMark, sourceBadge, shell, pageHeader, card, page, people, sources } from "./kit.mjs";

sources.links = { name: "Profile links", color: "#F97316", icon: "link" };

const stable = ["X", "Telegram", "YouTube", "Bluesky", "Mastodon", "GitHub"];
const bestEffort = ["Instagram", "Facebook", "LinkedIn"];
const chip = (n, ok = true) => `<span class="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border border-base-300 ${ok ? "" : "text-base-content/60"}">${icon(ok ? "check" : "flask-conical", `size-3 ${ok ? "text-success" : ""}`)}${n}</span>`;

function settingsNav(active) {
  return `<nav class="w-52 space-y-1 text-sm">${[["General", "settings"], ["Google account", "key-round"], ["Sources", "link"], ["Data & privacy", "hard-drive"], ["Updates", "package"], ["About", "info"]]
    .map(([l, ic]) => `<a class="flex items-center gap-2.5 px-3 py-2 rounded-lg ${l === active ? "bg-base-100 border border-base-300 font-semibold" : "text-base-content/70"}">${icon(ic, "size-4")}${l}</a>`).join("")}</nav>`;
}

const row = (id, detail, right) => `<div class="flex items-center gap-3 py-4 border-b border-base-300">
  ${sourceMark(id, "size-9")}<div class="flex-1"><div class="text-sm font-semibold">${sources[id].name}</div><div class="text-xs text-base-content/60">${detail}</div></div>${right}</div>`;

const settingsBody = () => shell("settings", `
  ${pageHeader("Settings")}
  <div class="px-8 pb-8 flex gap-6">
    ${settingsNav("Sources")}
    <div class="flex-1">
      ${card(`<div class="px-6 py-2">
        ${row("whatsapp", "Matches by phone number", `<span class="badge badge-sm badge-soft badge-success">Connected</span>`)}
        ${row("telegram", "Matches by phone number", `<span class="badge badge-sm badge-soft badge-success">Connected</span>`)}
        ${row("gravatar", "Matches by email · No sign-in", `<span class="badge badge-sm badge-soft badge-success">Ready</span>`)}
        <div class="py-4">
          <div class="flex items-center gap-3">
            ${sourceMark("links", "size-9")}
            <div class="flex-1"><div class="text-sm font-semibold">Profile links <span class="badge badge-xs badge-primary badge-soft ml-1">New</span></div><div class="text-xs text-base-content/60">Uses the profile links saved on your Google contacts · No sign-in</div></div>
            <span class="badge badge-sm badge-soft badge-success">Ready</span>
          </div>
          <div class="ml-12 mt-3 space-y-3">
            <div class="flex flex-wrap gap-1.5">${stable.map((n) => chip(n)).join("")}</div>
            <label class="flex items-start gap-3 rounded-xl border border-base-300 p-3">
              <input type="checkbox" class="toggle toggle-sm toggle-primary mt-0.5"/>
              <span class="flex-1">
                <span class="text-sm font-medium flex items-center gap-2">Also try Instagram, Facebook and LinkedIn <span class="badge badge-xs badge-warning badge-soft">Unofficial</span></span>
                <span class="block text-xs text-base-content/60 mt-1">Their public profile picture is read the way a link preview is, never with your account. These sites often ask to sign in after a few profiles, so some contacts may be skipped, and their terms don't allow automated access: use it for your own address book, at a slow pace.</span>
                <span class="flex flex-wrap gap-1.5 mt-2">${bestEffort.map((n) => chip(n, false)).join("")}</span>
              </span>
            </label>
            <p class="text-xs text-base-content/50 flex gap-1.5">${icon("info", "size-3.5 shrink-0 mt-px")}Add a link to a contact in Google Contacts, or from a sync report's “No photo found” list.</p>
          </div>
        </div>
      </div>`)}
    </div>
  </div>`);

export const settingsLinks = page(settingsBody());
export const settingsLinksDark = page(settingsBody(), { theme: "scs-dark" });

// Sync report, "No photo found": add a profile link to a contact.
export const reportAddLink = page(shell("sync", `
  ${pageHeader("Sync report", "", `<button class="btn btn-sm btn-ghost">${icon("arrow-left", "size-4")}History</button>`)}
  <div class="px-8 pb-8">
    ${card(`<div class="px-6 pt-4 pb-2">
      <div role="tablist" class="tabs tabs-border">
        <a class="tab">Changed (128)</a><a class="tab tab-active">No photo found (472)</a><a class="tab">Errors (6)</a><a class="tab">All</a>
        <div class="flex-1"></div><label class="input input-sm w-56 self-center">${icon("search", "size-4 opacity-50")}<input placeholder="Search contacts"/></label>
      </div>
      <p class="text-xs text-base-content/60 mt-3 flex gap-1.5">${icon("link", "size-3.5 mt-px")}Know where one of them is online? Add their profile link: it's saved on the contact and its photo is used.</p>
      <table class="table table-sm mt-2">
        <thead><tr><th>Contact</th><th>Phone / email</th><th></th></tr></thead>
        <tbody>
          <tr><td><div class="flex items-center gap-3">${initials("Davide Gallo", "size-8", "text-xs")}<span class="font-medium">Davide Gallo</span></div></td><td class="text-base-content/60">+39 338 •••• 412</td>
            <td class="text-right"><button class="btn btn-xs btn-ghost">${icon("link", "size-3.5")}Add profile link</button></td></tr>
          <tr class="bg-base-200/60"><td colspan="3">
            <div class="flex items-center gap-3">${initials("Elena Conti", "size-8", "text-xs")}<span class="font-medium w-40">Elena Conti</span>
              <label class="input input-sm flex-1">${icon("link", "size-4 opacity-50")}<input value="https://www.instagram.com/elena.conti.ph/"/></label>
              <button class="btn btn-sm btn-ghost">Cancel</button>
            </div>
            <div class="ml-11 mt-3 flex items-center gap-4 rounded-xl border border-base-300 bg-base-100 p-3">
              ${initials("Elena Conti", "size-12", "text-base")}${icon("arrow-right", "size-4 text-base-content/40")}${face("Elena Conti", "size-12")}
              <div class="flex-1"><div class="text-sm font-medium">Found on Instagram</div><div class="text-xs text-base-content/60">The link is added to the contact in Google, and this photo replaces the letter.</div></div>
              <button class="btn btn-sm btn-primary">${icon("check", "size-4")}Save link and photo</button>
            </div>
          </td></tr>
          ${people.slice(12, 16).map((n, i) => `<tr><td><div class="flex items-center gap-3">${initials(n, "size-8", "text-xs")}<span class="font-medium">${n}</span></div></td><td class="text-base-content/60">${i === 1 ? n.split(" ")[0].toLowerCase() + "@example.com" : "+39 34" + i + " •••• " + (210 + i * 17)}</td>
            <td class="text-right"><button class="btn btn-xs btn-ghost">${icon("link", "size-3.5")}Add profile link</button></td></tr>`).join("")}
        </tbody>
      </table>
    </div>`)}
  </div>`));

// Review: none of the photos is right, look one up from a link.
export const reviewLink = page(shell("sync", `
  ${pageHeader("Review photos", "Contact 37 of 312 with a new photo · 24 accepted, 12 kept", `<button class="btn btn-sm btn-ghost text-error">${icon("square", "size-4")}Stop</button>`)}
  <div class="px-8 pb-8 flex-1 flex flex-col">
    <progress class="progress progress-primary w-full h-1.5" value="12" max="100"></progress>
    ${card(`<div class="p-8">
      <div class="flex items-center gap-4">
        <div class="flex-1"><div class="text-xl font-bold">Francesco Greco</div><div class="text-sm text-base-content/60">+39 335 210 4471 · francesco.greco@example.com</div></div>
        <span class="badge badge-soft">Has a photo in Google</span>
      </div>
      <div class="mt-8 grid grid-cols-[1fr_auto_2fr] gap-8 items-center">
        <div class="text-center">
          <div class="text-xs font-semibold uppercase tracking-wide text-base-content/50 mb-3">Current</div>
          <div class="inline-block p-1.5 rounded-full border-2 border-base-300">${face("Francesco old", "size-32")}</div>
          <div class="mt-4"><button class="btn btn-sm">Keep current <kbd class="kbd kbd-xs">←</kbd></button></div>
        </div>
        <div class="text-base-content/30">${icon("arrow-right", "size-8")}</div>
        <div>
          <div class="text-xs font-semibold uppercase tracking-wide text-base-content/50 mb-3 text-center">Found in your sources</div>
          <div class="flex justify-center gap-6">
            <div class="text-center"><div class="inline-block p-1.5 rounded-full border-2 border-base-300">${face("Francesco wa", "size-32")}</div><div class="mt-2">${sourceBadge("whatsapp")}</div></div>
            <div class="text-center"><div class="inline-block p-1.5 rounded-full border-[3px] border-primary relative">${face("Francesco Greco", "size-32")}<span class="absolute -top-1 -right-1 size-7 rounded-full bg-primary text-primary-content grid place-items-center">${icon("check", "size-4")}</span></div><div class="mt-2">${sourceBadge("links")}</div><div class="text-[11px] text-base-content/50 mt-1">instagram.com/fra.greco</div></div>
          </div>
          <div class="mt-4 text-center"><button class="btn btn-sm btn-primary">Use selected photo <kbd class="kbd kbd-xs">Enter</kbd></button></div>
        </div>
      </div>
      <div class="mt-8 pt-5 border-t border-base-300 flex items-center gap-3">
        <span class="text-sm text-base-content/70 flex items-center gap-1.5">${icon("link", "size-4")}None of these? Look up a profile link</span>
        <label class="input input-sm flex-1">${icon("link", "size-4 opacity-50")}<input value="https://www.instagram.com/fra.greco/"/></label>
        <button class="btn btn-sm">Find photo</button>
      </div>
      <p class="mt-2 text-xs text-base-content/50">If you use it, the link is also saved on the contact for next time.</p>
    </div>`, "mt-5")}
  </div>`));

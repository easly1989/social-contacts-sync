// Find profiles (after v1.2): match contacts with social profiles from the
// user's own data exports, a public search by name, and (experimental, opt-in)
// a scan of the user's own followers and connections with their login.
import { icon, face, initials, logo, pageHeader, card, page } from "./kit.mjs";

const nav = [
  ["dashboard", "Dashboard", "layout-dashboard"],
  ["contacts", "Contacts", "contact-round"],
  ["profiles", "Find profiles", "user-round-search"],
  ["sync", "Sync photos", "refresh-cw"],
  ["cleanup", "Clean up", "sparkles"],
  ["history", "History", "history"],
  ["settings", "Settings", "settings"],
];

function shell(active, content) {
  const items = nav
    .map(([id, label, ic]) => `<a class="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium ${id === active ? "bg-primary/10 text-primary" : "text-base-content/70"}">
      ${icon(ic, "size-[18px]")}<span class="flex-1">${label}</span>${id === "profiles" ? `<span class="badge badge-xs badge-primary badge-soft">New</span>` : ""}</a>`)
    .join("");
  return `<div class="flex h-screen bg-base-200 text-base-content">
    <aside class="w-60 bg-base-100 border-r border-base-300 flex flex-col p-4 gap-1">
      <div class="flex items-center gap-2.5 px-2 pb-5 pt-1">${logo("size-8")}<div class="font-bold text-[15px] leading-tight">Social Contacts<br/>Sync</div></div>
      ${items}
      <div class="flex-1"></div>
      <a class="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-base-content/70">${icon("hand-heart", "size-[18px] text-secondary")}Support the project</a>
      <div class="px-3 pt-3 mt-2 border-t border-base-300 text-xs text-base-content/50 flex justify-between"><span>v1.3.0</span><span class="flex items-center gap-1">${icon("circle-check", "size-3.5 text-success")}Up to date</span></div>
    </aside>
    <main class="flex-1 overflow-auto flex flex-col">${content}</main>
  </div>`;
}

const networks = {
  instagram: ["Instagram", "#E1306C"],
  linkedin: ["LinkedIn", "#0A66C2"],
  facebook: ["Facebook", "#1877F2"],
  bluesky: ["Bluesky", "#1185FE"],
  mastodon: ["Mastodon", "#6364FF"],
  github: ["GitHub", "#24292F"],
};
const mark = (n, cls = "size-8") => `<span class="${cls} rounded-lg grid place-items-center text-white text-xs font-bold shrink-0" style="background:${networks[n][1]}">${networks[n][0][0]}</span>`;
const badge = (n) => `<span class="inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-px rounded-full" style="background:${networks[n][1]}1f;color:${networks[n][1]}">${networks[n][0]}</span>`;

const tabs = (active) => `<div role="tablist" class="tabs tabs-border px-8">
  ${[["review", "To review (148)"], ["sources", "Sources"], ["linked", "Linked (63)"]].map(([k, l]) => `<a class="tab ${k === active ? "tab-active" : ""}">${l}</a>`).join("")}</div>`;

const header = (active) => `${pageHeader("Find profiles", "Suggests social profiles for your contacts. Nothing is saved until you confirm it.")}${tabs(active)}`;

// 1. Sources: exports, public search, login (experimental).
const sourcesBody = shell("profiles", `
  ${header("sources")}
  <div class="px-8 py-6 grid grid-cols-3 gap-5 items-start">
    ${card(`<div class="p-5 space-y-4">
      <div class="flex items-center gap-2 font-semibold">${icon("file-up", "size-5 text-primary")}From your data exports</div>
      <p class="text-xs text-base-content/60">The official “Download your data” of each site. No login here, no risk for your account.</p>
      <div class="space-y-3">
        <div class="flex items-center gap-3">${mark("instagram")}<div class="flex-1 text-sm"><div class="font-medium">Instagram</div><div class="text-xs text-base-content/60">followers_1.json · following.json</div></div><span class="badge badge-sm badge-soft badge-success">1,204 people</span></div>
        <div class="flex items-center gap-3">${mark("linkedin")}<div class="flex-1 text-sm"><div class="font-medium">LinkedIn</div><div class="text-xs text-base-content/60">Connections.csv</div></div><button class="btn btn-xs">${icon("file-up", "size-3.5")}Choose file</button></div>
      </div>
      <p class="text-xs text-base-content/50 flex gap-1.5">${icon("info", "size-3.5 shrink-0 mt-px")}Instagram: Accounts Center → Your information → Download your information, format JSON. LinkedIn: Settings → Data privacy → Get a copy of your data → Connections.</p>
    </div>`)}
    ${card(`<div class="p-5 space-y-4">
      <div class="flex items-center gap-2 font-semibold">${icon("scan-search", "size-5 text-primary")}Public search by name</div>
      <p class="text-xs text-base-content/60">Sites with an open search. Names are matched exactly; people with the same name are shown side by side for you to pick.</p>
      ${["bluesky", "mastodon", "github"].map((n, i) => `<label class="flex items-center gap-3">${mark(n)}<span class="flex-1 text-sm font-medium">${networks[n][0]}</span><input type="checkbox" class="toggle toggle-sm toggle-primary" ${i < 2 ? "checked" : ""}/></label>`).join("")}
      <div>
        <div class="flex justify-between text-xs text-base-content/60"><span>Searching… 312 of 781 contacts</span><span>Bluesky 9 · Mastodon 3</span></div>
        <progress class="progress progress-primary w-full h-1.5 mt-1" value="40" max="100"></progress>
      </div>
      <div class="flex gap-2"><button class="btn btn-sm">${icon("square", "size-4")}Stop</button></div>
    </div>`)}
    ${card(`<div class="p-5 space-y-4">
      <div class="flex items-center gap-2 font-semibold">${icon("log-in", "size-5 text-warning")}With your login <span class="badge badge-xs badge-warning badge-soft">Experimental</span></div>
      <p class="text-xs text-base-content/60">Reads your own followers, friends and connections with names and photos, through your session. You log in on the site's own page, in an app window.</p>
      <div class="rounded-xl border border-warning/40 bg-warning/10 p-3 text-xs flex gap-2">${icon("shield-alert", "size-4 text-warning shrink-0")}<span>Against these sites' terms: they may ask you to verify, limit or <b>suspend your account</b>. Slow on purpose (a page every few seconds). Use it on your own accounts, at your own risk.</span></div>
      ${[["instagram", "Logged in as easly1989", "Scan followers"], ["facebook", "Not logged in", "Log in"], ["linkedin", "Not logged in", "Log in"]]
        .map(([n, s, b], i) => `<div class="flex items-center gap-3">${mark(n)}<div class="flex-1 text-sm"><div class="font-medium">${networks[n][0]}</div><div class="text-xs text-base-content/60">${s}</div></div><button class="btn btn-xs ${i === 0 ? "btn-warning btn-soft" : ""}">${b}</button></div>`).join("")}
    </div>`)}
  </div>`);

export const profilesSources = page(sourcesBody);

// 2. Review: one contact at a time, with the profiles that may be theirs.
const candidate = (seed, name, handle, n, why, selected = false) => `<label class="flex items-center gap-4 rounded-xl border-2 ${selected ? "border-primary bg-primary/5" : "border-base-300"} p-3">
  <input type="radio" name="c" class="radio radio-sm radio-primary" ${selected ? "checked" : ""}/>
  ${face(seed, "size-14")}
  <div class="flex-1 min-w-0"><div class="font-semibold">${name}</div><div class="text-xs text-base-content/60">${handle}</div><div class="mt-1 flex flex-wrap gap-1.5">${badge(n)}<span class="text-[11px] text-base-content/60">${why}</span></div></div>
  <a class="btn btn-ghost btn-xs">${icon("external-link", "size-3.5")}Open</a></label>`;

export const profilesReview = page(shell("profiles", `
  ${header("review")}
  <div class="px-8 py-6 flex-1 flex flex-col gap-4">
    <div class="flex items-center gap-3 text-sm text-base-content/60"><span>Contact 12 of 148</span><progress class="progress progress-primary w-48 h-1.5" value="8" max="100"></progress><span class="flex-1"></span>
      <label class="select select-sm w-48"><select><option>All sources</option></select></label></div>
    ${card(`<div class="p-6">
      <div class="flex items-center gap-4">
        ${initials("Davide Gallo", "size-16", "text-xl")}
        <div class="flex-1"><div class="text-xl font-bold">Davide Gallo</div><div class="text-sm text-base-content/60">+39 338 555 0412 · davide.gallo@example.com · No photo</div></div>
      </div>
      <div class="mt-6 text-xs font-semibold uppercase tracking-wide text-base-content/50">Could be</div>
      <div class="mt-2 grid grid-cols-2 gap-3">
        ${candidate("Davide Gallo", "Davide Gallo", "@davide.gallo", "instagram", "Follows you · same name", true)}
        ${candidate("Davide Gallo li", "Davide Gallo", "linkedin.com/in/davidegallo", "linkedin", "Connection · Gallo Ceramiche")}
        ${candidate("Davide G bsky", "Davide Gallo", "@dgallo.bsky.social", "bluesky", "Public search · same name")}
        ${candidate("Davide Gallo2", "Davide Galloni", "@davegalloni", "instagram", "You follow · similar name")}
      </div>
      <div class="mt-6 pt-5 border-t border-base-300 flex flex-wrap items-center gap-3">
        <label class="flex items-center gap-2 text-sm"><input type="checkbox" class="checkbox checkbox-sm checkbox-primary" checked/>Also use its photo (the contact has none)</label>
        <span class="flex-1"></span>
        <button class="btn btn-sm btn-ghost">Skip <kbd class="kbd kbd-xs">S</kbd></button>
        <button class="btn btn-sm btn-ghost">None of these <kbd class="kbd kbd-xs">N</kbd></button>
        <button class="btn btn-sm btn-primary">${icon("link", "size-4")}Link profile <kbd class="kbd kbd-xs">Enter</kbd></button>
      </div>
      <p class="mt-2 text-xs text-base-content/50">More than one is right? Link one, then the others stay here for the same contact.</p>
    </div>`)}
  </div>`));

// 3. Turning the login scan on.
export const profilesRisk = page(shell("profiles", `
  <div class="relative flex-1 overflow-hidden">
    <div class="absolute inset-0 opacity-40 pointer-events-none">${header("sources")}</div>
    <div class="absolute inset-0 bg-base-content/20 grid place-items-center">
      <div class="w-[34rem] rounded-box bg-base-100 border border-base-300 shadow-xl p-6">
        <div class="flex items-center gap-3">${mark("instagram", "size-10")}<div class="flex-1 text-lg font-semibold">Scan your Instagram followers?</div></div>
        <ul class="mt-4 space-y-2 text-sm text-base-content/80 list-disc pl-5">
          <li>The app reads the people who follow you and whom you follow, with their name and photo, through your logged-in session.</li>
          <li>Instagram doesn't allow automated access: it may ask you to verify it's you, limit your account for a while or <b>suspend it</b>.</li>
          <li>To lower the risk the app goes slowly, a page of 50 people every few seconds, and stops at the first warning.</li>
          <li>Nothing is posted, followed or changed on Instagram. What's read stays on this computer.</li>
        </ul>
        <label class="mt-4 flex items-start gap-2 text-sm"><input type="checkbox" class="checkbox checkbox-sm checkbox-warning mt-0.5" checked/>I understand the risk to my Instagram account.</label>
        <div class="mt-6 flex justify-end gap-2"><button class="btn btn-sm btn-ghost">Cancel</button><button class="btn btn-sm btn-warning">Scan followers</button></div>
      </div>
    </div>
  </div>`));

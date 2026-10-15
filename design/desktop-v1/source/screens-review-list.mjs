// v1.3.1 feedback: every suggestion in one list with bulk linking, toasts on
// the right (gone after 2 s; errors stay, with Copy), and the scan's error
// detail.
import { icon, face, logo, pageHeader, card, page } from "./kit.mjs";

const nav = [
  ["dashboard", "Dashboard", "layout-dashboard"],
  ["contacts", "Contacts", "contact-round"],
  ["profiles", "Find profiles", "user-round-search"],
  ["sync", "Sync photos", "refresh-cw"],
  ["cleanup", "Clean up", "sparkles"],
  ["history", "History", "history"],
  ["settings", "Settings", "settings"],
];

function shell(active, content, overlay = "") {
  const items = nav
    .map(([id, label, ic]) => `<a class="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium ${id === active ? "bg-primary/10 text-primary" : "text-base-content/70"}">${icon(ic, "size-[18px]")}<span class="flex-1">${label}</span></a>`)
    .join("");
  return `<div class="relative flex h-screen bg-base-200 text-base-content">
    <aside class="w-60 bg-base-100 border-r border-base-300 flex flex-col p-4 gap-1 shrink-0">
      <div class="flex items-center gap-2.5 px-2 pb-5 pt-1">${logo("size-8")}<div class="font-bold text-[15px] leading-tight">Social Contacts<br/>Sync</div></div>
      ${items}
      <div class="flex-1"></div>
      <a class="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-base-content/70">${icon("hand-heart", "size-[18px] text-secondary")}Support the project</a>
      <div class="px-3 pt-3 mt-2 border-t border-base-300 text-xs text-base-content/50 flex justify-between"><span>v1.3.1</span><span class="flex items-center gap-1">${icon("circle-check", "size-3.5 text-success")}Up to date</span></div>
    </aside>
    <main class="flex-1 overflow-hidden flex flex-col">${content}</main>
    ${overlay}
  </div>`;
}

const networks = { linkedin: ["LinkedIn", "#0A66C2"], instagram: ["Instagram", "#E1306C"], facebook: ["Facebook", "#1877F2"], bluesky: ["Bluesky", "#1185FE"], mastodon: ["Mastodon", "#6364FF"] };
const mark = (n, cls = "size-8") => `<span class="${cls} rounded-lg grid place-items-center text-white text-xs font-bold shrink-0" style="background:${networks[n][1]}">${networks[n][0][0]}</span>`;
const badge = (n) => `<span class="inline-flex items-center text-[11px] font-medium px-1.5 py-px rounded-full" style="background:${networks[n][1]}1f;color:${networks[n][1]}">${networks[n][0]}</span>`;
const avatar = (name, cls = "size-11") => `<span class="${cls} rounded-full bg-primary text-primary-content grid place-items-center font-semibold shrink-0">${name[0]}</span>`;

const tabs = `<div role="tablist" class="tabs tabs-border px-8">${[["To review (209)", true], ["Sources"], ["Linked (2)"]].map(([l, on]) => `<a class="tab ${on ? "tab-active" : ""}">${l}</a>`).join("")}</div>`;
const header = `${pageHeader("Find profiles", "Suggests social profiles for your contacts. Nothing is saved until you confirm it.")}${tabs}`;

function candidate(c, on, photo) {
  return `<div class="rounded-xl border-2 p-2.5 ${on ? "border-primary bg-primary/5" : "border-base-300"}">
    <label class="flex items-center gap-3">
      <input type="checkbox" class="checkbox checkbox-primary checkbox-sm" ${on ? "checked" : ""}/>
      ${face(c.name + c.handle, "size-11")}
      <div class="min-w-0 flex-1"><div class="truncate text-sm font-semibold">${c.name}</div><div class="truncate text-xs text-base-content/60">${c.handle}</div>
        <div class="mt-1 flex flex-wrap items-center gap-1.5">${badge(c.network)}<span class="text-[11px] text-base-content/60 truncate">${c.why}</span></div></div>
      <a class="btn btn-ghost btn-xs btn-square">${icon("external-link", "size-3.5")}</a>
    </label>
    ${on ? `<label class="mt-2 ml-8 flex items-center gap-2 text-xs ${photo ? "text-primary font-medium" : "text-base-content/60"}"><input type="radio" class="radio radio-primary radio-xs" ${photo ? "checked" : ""}/>Use this photo</label>` : ""}
  </div>`;
}

const rows = [
  { name: "Carlo Ferretti", detail: "340 624 8137 · No photo", checked: true, cands: [
    { name: "Carlo Ferretti", handle: "linkedin.com/in/carlo-ferretti-017b57a1", network: "linkedin", why: "Connection · same name", on: true, photo: true },
    { name: "Carlo Ferretti", handle: "@carlo.ferretti", network: "instagram", why: "Follows you · same name", on: true },
    { name: "Carlo Ferretti", handle: "facebook.com/carlo.ferretti.75", network: "facebook", why: "Friend · same name", on: true } ] },
  { name: "Giulia Marchetti", detail: "347 112 9020 · Has a photo", checked: true, cands: [
    { name: "Giulia Marchetti", handle: "@giulia.marchetti", network: "instagram", why: "Follows you · same name", on: true },
    { name: "Giulia Marchetti", handle: "linkedin.com/in/giuliamarchetti", network: "linkedin", why: "Connection · same name", on: false } ] },
  { name: "Davide Gallo", detail: "333 845 1102 · Placeholder", checked: false, cands: [
    { name: "Davide Gallo", handle: "@davidegallo89", network: "instagram", why: "You follow · name in the username", on: true, photo: true } ] },
];

const listRow = (r) => {
  const n = r.cands.filter((c) => c.on).length;
  return `<section class="bg-base-100 border ${r.checked ? "border-primary/50" : "border-base-300"} rounded-box p-4">
  <div class="flex items-center gap-3">
    <input type="checkbox" class="checkbox checkbox-primary checkbox-sm" ${r.checked ? "checked" : ""}/>
    ${avatar(r.name, "size-10")}<div class="min-w-0 flex-1"><div class="font-semibold">${r.name}</div><div class="text-xs text-base-content/60">${r.detail}</div></div>
    <button class="btn btn-ghost btn-xs">Skip</button><button class="btn btn-ghost btn-xs">None of these</button>
    <button class="btn btn-primary btn-xs">${icon("link", "size-3.5")}Link ${n} ${n === 1 ? "profile" : "profiles"}</button>
  </div>
  <div class="mt-3 ml-8 grid grid-cols-3 gap-2">${r.cands.map((c) => candidate(c, c.on, c.photo)).join("")}</div>
  ${r.detail.includes("Has a photo") ? `<p class="mt-2 ml-8 text-xs text-base-content/50">Has a photo of its own: tick “Use this photo” on a profile to replace it.</p>` : ""}
</section>`;
};

function toolbar(progress) {
  return `<div class="px-8 pt-4"><div class="bg-base-100 border border-base-300 rounded-box px-4 py-2.5 flex items-center gap-3 shadow-sm">
    <label class="flex items-center gap-2 text-sm font-medium"><input type="checkbox" class="checkbox checkbox-primary checkbox-sm"/>Select all</label>
    <span class="text-sm text-base-content/60">2 of 209 contacts</span>
    <span class="flex-1"></span>
    ${progress
      ? `<div class="w-72"><div class="text-xs text-base-content/60">Linking 1 of 2 contacts (4 profiles)…</div><progress class="progress progress-primary h-1.5 w-full" value="50" max="100"></progress></div><button class="btn btn-sm">${icon("square", "size-4")}Stop</button>`
      : `<button class="btn btn-ghost btn-sm">None of these</button>
         <button class="btn btn-primary btn-sm">${icon("link", "size-4")}Link 4 profiles to 2 contacts</button>
         <span class="w-px h-6 bg-base-300"></span>
         <div class="join"><button class="btn btn-sm join-item btn-active" title="List">${icon("list", "size-4")}</button><button class="btn btn-sm join-item" title="One at a time">${icon("square-stack", "size-4")}</button></div>`}
  </div></div>`;
}

const listBody = (progress, overlay) =>
  shell("profiles", `${header}${toolbar(progress)}
    <div class="px-8 py-4 space-y-3 overflow-hidden">${rows.map(listRow).join("")}</div>`, overlay);

// Toasts: bottom right, in a card. Success leaves after 2 s; errors stay.
const toastOk = (text) => `<div class="w-96 bg-base-100 border border-base-300 shadow-xl rounded-box p-3 flex items-start gap-3">
  ${icon("circle-check", "size-5 text-success mt-0.5")}<div class="flex-1 text-sm">${text}</div><button class="btn btn-ghost btn-xs btn-square">${icon("x", "size-4")}</button>
  <div class="absolute"></div></div>`;
const toastError = (text, detail) => `<div class="w-96 bg-base-100 border border-error/40 shadow-xl rounded-box p-3 flex items-start gap-3">
  ${icon("circle-alert", "size-5 text-error mt-0.5")}<div class="flex-1 min-w-0"><div class="text-sm font-medium">${text}</div>
  <div class="mt-1.5 rounded-lg bg-base-200 px-2 py-1.5 font-mono text-[11px] text-base-content/70 break-words">${detail}</div>
  <div class="mt-2 flex gap-2"><button class="btn btn-xs">${icon("copy", "size-3.5")}Copy error</button></div></div>
  <button class="btn btn-ghost btn-xs btn-square">${icon("x", "size-4")}</button></div>`;

export const profilesList = page(listBody(false, `<div class="absolute bottom-6 right-6 space-y-2">${toastOk("Linked to Beatrice Visconti.")}</div>`));
export const profilesListBulk = page(
  listBody(
    true,
    `<div class="absolute bottom-6 right-6 space-y-2">${toastError("1 of 3 contacts couldn't be linked: Giulia Marchetti.", "Google had a temporary problem (503) and nothing was changed. Try again later.")}</div>`
  )
);

// Sources: full-width sections, one row per network, with when it was last read.
const srcRow = (n, title, status, right, extra = "") => `<div class="py-3.5 border-b border-base-300 last:border-0">
  <div class="flex items-center gap-4">${mark(n, "size-9")}
    <div class="flex-1 min-w-0"><div class="text-sm font-semibold">${title}</div><div class="text-xs text-base-content/60">${status}</div></div>
    <div class="flex items-center gap-2 shrink-0">${right}</div></div>${extra}</div>`;
const section = (ic, color, title, lead, body, badgeHtml = "") => card(`<div class="px-6 pt-5 pb-2">
  <div class="flex items-center gap-2 font-semibold">${icon(ic, `size-5 ${color}`)}${title}${badgeHtml}</div>
  <p class="text-xs text-base-content/60 mt-1">${lead}</p>
  <div class="mt-2">${body}</div></div>`);

export const scanError = page(
  shell("profiles", `${header.replace("tab-active", "").replace('<a class="tab ">Sources', '<a class="tab tab-active">Sources')}
  <div class="px-8 py-6 max-w-4xl space-y-5 overflow-hidden">
    ${section("file-up", "text-primary", "From your data exports", "The official “Download your data” of each site. No login here, no risk for your account. Kept in the app's data folder: importing again only adds who's new.",
      srcRow("instagram", "Instagram", "1,204 people · imported 12 Oct, 21:14 · followers_1.json, following.json", `<button class="btn btn-sm">${icon("file-up", "size-4")}Import again</button>`) +
      srcRow("linkedin", "LinkedIn", "Not imported yet · Connections.csv", `<button class="btn btn-sm">${icon("file-up", "size-4")}Choose file</button>`))}
    ${section("scan-search", "text-primary", "Public search by name", "Sites with an open search. A new search only looks for contacts not searched yet.",
      srcRow("bluesky", "Bluesky", "9 found · searched 14 Oct, 18:02 (781 contacts)", `<input type="checkbox" class="toggle toggle-sm toggle-primary" checked/>`) +
      srcRow("mastodon", "Mastodon", "Not searched yet", `<input type="checkbox" class="toggle toggle-sm toggle-primary" checked/>`) +
      `<div class="py-3"><button class="btn btn-primary btn-sm">${icon("scan-search", "size-4")}Search</button></div>`)}
    ${section("log-in", "text-warning", "With your login", "Reads your own followers, friends and connections, with names and photos, through your session. Against these sites' terms: use it at your own risk.",
      srcRow("instagram", "Instagram", "Logged in · 486 people · scanned 15 Oct, 09:40", `<button class="btn btn-sm btn-warning btn-soft">Scan followers</button><button class="btn btn-ghost btn-sm">Log out</button>`) +
      srcRow("facebook", "Facebook", "Logged in · 0 people · scanned 15 Oct, 09:52", `<button class="btn btn-sm btn-warning btn-soft">Scan friends</button><button class="btn btn-ghost btn-sm">Log out</button>`,
        `<div class="ml-13 mt-2 rounded-xl border border-warning/40 bg-warning/10 p-3" style="margin-left:3.25rem">
          <div class="text-sm text-warning font-medium flex items-center gap-2">${icon("triangle-alert", "size-4")}Stopped: the site's page wasn't what the app expected.</div>
          <div class="mt-2 flex items-center gap-2"><code class="flex-1 rounded bg-base-100 px-2 py-1 text-xs text-base-content/70">ERR_ABORTED (-3) loading 'https://www.facebook.com/me/friends'</code><button class="btn btn-xs">${icon("copy", "size-3.5")}Copy</button></div></div>`) +
      srcRow("linkedin", "LinkedIn", "Logged in · 512 people · scanned 15 Oct, 10:05", `<button class="btn btn-sm btn-warning btn-soft">Scan connections</button><button class="btn btn-ghost btn-sm">Log out</button>`),
      ` <span class="badge badge-xs badge-warning badge-soft">Experimental</span>`)}
  </div>`)
);
export const sizes = { scanError: [1280, 1180], profilesList: [1280, 900], profilesListBulk: [1280, 900] };

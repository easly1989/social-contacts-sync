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

const networks = { linkedin: ["LinkedIn", "#0A66C2"], instagram: ["Instagram", "#E1306C"], facebook: ["Facebook", "#1877F2"], bluesky: ["Bluesky", "#1185FE"] };
const mark = (n, cls = "size-8") => `<span class="${cls} rounded-lg grid place-items-center text-white text-xs font-bold shrink-0" style="background:${networks[n][1]}">${networks[n][0][0]}</span>`;
const badge = (n) => `<span class="inline-flex items-center text-[11px] font-medium px-1.5 py-px rounded-full" style="background:${networks[n][1]}1f;color:${networks[n][1]}">${networks[n][0]}</span>`;
const avatar = (name, cls = "size-11") => `<span class="${cls} rounded-full bg-primary text-primary-content grid place-items-center font-semibold shrink-0">${name[0]}</span>`;

const tabs = `<div role="tablist" class="tabs tabs-border px-8">${[["To review (209)", true], ["Sources"], ["Linked (2)"]].map(([l, on]) => `<a class="tab ${on ? "tab-active" : ""}">${l}</a>`).join("")}</div>`;
const header = `${pageHeader("Find profiles", "Suggests social profiles for your contacts. Nothing is saved until you confirm it.")}${tabs}`;

function candidate(c, chosen) {
  return `<label class="flex items-center gap-3 rounded-xl border-2 p-2.5 ${chosen ? "border-primary bg-primary/5" : "border-base-300"}">
    <input type="radio" class="radio radio-primary radio-xs" ${chosen ? "checked" : ""}/>
    ${face(c.name + c.handle, "size-11")}
    <div class="min-w-0 flex-1"><div class="truncate text-sm font-semibold">${c.name}</div><div class="truncate text-xs text-base-content/60">${c.handle}</div>
      <div class="mt-1 flex flex-wrap items-center gap-1.5">${badge(c.network)}<span class="text-[11px] text-base-content/60">${c.why}</span></div></div>
    <a class="btn btn-ghost btn-xs">${icon("external-link", "size-3.5")}</a>
  </label>`;
}

const rows = [
  { name: "Carlo Ferretti", detail: "340 624 8137 · No photo", checked: true, cands: [{ name: "Carlo Ferretti", handle: "linkedin.com/in/carlo-ferretti-017b57a1", network: "linkedin", why: "Connection · same name · Regional Sales Manager" }] },
  { name: "Giulia Marchetti", detail: "347 112 9020 · No photo", checked: true, cands: [{ name: "Giulia Marchetti", handle: "@giulia.marchetti", network: "instagram", why: "Follows you · same name" }, { name: "Giulia Marchetti", handle: "linkedin.com/in/giuliamarchetti", network: "linkedin", why: "Connection · same name · Architect" }] },
  { name: "Davide Gallo", detail: "333 845 1102 · Placeholder", checked: false, cands: [{ name: "Davide Gallo", handle: "@davidegallo89", network: "instagram", why: "You follow · name in the username" }] },
  { name: "Sara Conti", detail: "sara.conti@example.com · No photo", checked: true, cands: [{ name: "Sara Conti", handle: "@saraconti.bsky.social", network: "bluesky", why: "Public search · same name" }] },
];

const listRow = (r) => `<section class="bg-base-100 border ${r.checked ? "border-primary/50" : "border-base-300"} rounded-box p-4 flex gap-4 items-start">
  <input type="checkbox" class="checkbox checkbox-primary checkbox-sm mt-3" ${r.checked ? "checked" : ""}/>
  <div class="w-52 shrink-0 flex items-center gap-3 pt-1">${avatar(r.name)}<div class="min-w-0"><div class="font-semibold truncate">${r.name}</div><div class="text-xs text-base-content/60 truncate">${r.detail}</div></div></div>
  <div class="flex-1 grid gap-2 ${r.cands.length > 1 ? "grid-cols-2" : "grid-cols-1 max-w-md"}">${r.cands.map((c, i) => candidate(c, i === 0)).join("")}</div>
  <div class="flex flex-col gap-1 shrink-0">
    <button class="btn btn-primary btn-xs">${icon("link", "size-3.5")}Link</button>
    <button class="btn btn-ghost btn-xs">Skip</button>
    <button class="btn btn-ghost btn-xs">None of these</button>
  </div>
</section>`;

function toolbar(progress) {
  return `<div class="px-8 pt-4"><div class="bg-base-100 border border-base-300 rounded-box px-4 py-3 flex flex-wrap items-center gap-3 shadow-sm">
    <label class="flex items-center gap-2 text-sm font-medium"><input type="checkbox" class="checkbox checkbox-primary checkbox-sm" style="--chkbg:currentColor"/>Select all (209)</label>
    <span class="text-sm text-base-content/60">3 selected</span>
    <label class="flex items-center gap-2 text-sm ml-2"><input type="checkbox" class="checkbox checkbox-sm checkbox-primary" checked/>Also use their photos <span class="text-base-content/50">(only for contacts without one)</span></label>
    <span class="flex-1"></span>
    ${progress
      ? `<div class="w-64"><div class="flex justify-between text-xs text-base-content/60"><span>Linking 2 of 3…</span></div><progress class="progress progress-primary h-1.5 w-full" value="66" max="100"></progress></div><button class="btn btn-sm">${icon("square", "size-4")}Stop</button>`
      : `<div class="join"><button class="btn btn-sm join-item btn-active">${icon("list", "size-4")}List</button><button class="btn btn-sm join-item">${icon("square-stack", "size-4")}One at a time</button></div>
         <button class="btn btn-ghost btn-sm">None of these</button>
         <button class="btn btn-primary btn-sm">${icon("link", "size-4")}Link 3 selected</button>`}
  </div></div>`;
}

const listBody = (progress, overlay) =>
  shell("profiles", `${header}${toolbar(progress)}
    <div class="px-8 py-4 space-y-3 overflow-hidden">${rows.map(listRow).join("")}
      <div class="text-center"><button class="btn btn-ghost btn-sm">Show 20 more</button></div>
    </div>`, overlay);

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

// Sources: when each was last read, and the scan's error detail to copy.
const when = (t) => `<div class="text-[11px] text-base-content/50">${t}</div>`;
export const scanError = page(
  shell("profiles", `${header.replace("tab-active", "").replace('<a class="tab ">Sources', '<a class="tab tab-active">Sources')}
  <div class="px-8 py-6 grid grid-cols-3 gap-5 items-start">
    ${card(`<div class="p-5 space-y-4">
      <div class="flex items-center gap-2 font-semibold">${icon("file-up", "size-5 text-primary")}From your data exports</div>
      <div class="flex items-center gap-3">${mark("instagram")}<div class="flex-1 text-sm min-w-0"><div class="font-medium">Instagram <span class="badge badge-xs badge-soft badge-success ml-1">1,204 people</span></div>${when("Last imported 12 Oct, 21:14")}</div><button class="btn btn-xs">Choose file</button></div>
      <div class="flex items-center gap-3">${mark("linkedin")}<div class="flex-1 text-sm"><div class="font-medium">LinkedIn</div>${when("Not imported yet")}</div><button class="btn btn-xs">Choose file</button></div>
      <p class="text-xs text-base-content/50">Kept in the app's data folder: closing the app doesn't lose them, and importing again only adds who's new.</p>
    </div>`)}
    ${card(`<div class="p-5 space-y-4">
      <div class="flex items-center gap-2 font-semibold">${icon("scan-search", "size-5 text-primary")}Public search by name</div>
      ${["bluesky"].map((n) => `<label class="flex items-center gap-3">${mark(n)}<span class="flex-1 text-sm font-medium">Bluesky${when("Last searched 14 Oct, 18:02 · 781 contacts")}</span><input type="checkbox" class="toggle toggle-sm toggle-primary" checked/></label>`).join("")}
      <p class="text-xs text-base-content/50">A new search only looks for contacts not searched yet.</p>
      <button class="btn btn-primary btn-sm">${icon("scan-search", "size-4")}Search</button>
    </div>`)}
    ${card(`<div class="p-5 space-y-4">
    <div class="flex items-center gap-2 font-semibold">${icon("log-in", "size-5 text-warning")}With your login <span class="badge badge-xs badge-warning badge-soft">Experimental</span></div>
    ${[["instagram", "Logged in · 486 people read", "Scan followers", "Last scanned 15 Oct, 09:40"], ["facebook", "Logged in · 0 people read", "Scan friends", "Last scanned 15 Oct, 09:52"], ["linkedin", "Logged in · 512 people read", "Scan connections", "Last scanned 15 Oct, 10:05"]]
      .map(([n, s, b, w]) => `<div class="flex flex-wrap items-center gap-3">${mark(n)}<div class="flex-1 text-sm min-w-[8rem]"><div class="font-medium">${networks[n][0]}</div><div class="text-xs text-base-content/60">${s}</div>${when(w)}
      </div><button class="btn btn-xs btn-warning btn-soft">${b}</button>
      ${n === "facebook" ? `<div class="w-full pl-11"><div class="text-xs text-warning">Stopped: the site's page wasn't what the app expected.</div>
        <div class="mt-1.5 flex items-start gap-2"><code class="flex-1 rounded bg-base-200 px-2 py-1 text-[11px] text-base-content/70 break-all">ERR_ABORTED (-3) loading 'https://www.facebook.com/me/friends'</code><button class="btn btn-ghost btn-xs">${icon("copy", "size-3.5")}Copy</button></div></div>` : ""}
      </div>`).join("")}
  </div>`)}
  </div>`)
);

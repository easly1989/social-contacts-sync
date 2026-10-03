import { icon, face, initials, sourceMark, sourceBadge, googleMark, shell, pageHeader, card, page, people, sources } from "./kit.mjs";

function ring(pct, size = 112) {
  const r = 46, c = 2 * Math.PI * r;
  return `<svg viewBox="0 0 100 100" width="${size}" height="${size}" class="-rotate-90">
    <circle cx="50" cy="50" r="${r}" fill="none" stroke="currentColor" stroke-width="8" class="text-base-300"/>
    <circle cx="50" cy="50" r="${r}" fill="none" stroke="currentColor" stroke-width="8" stroke-linecap="round" class="text-primary" stroke-dasharray="${(pct / 100) * c} ${c}"/>
  </svg>`;
}

function stat(label, value, tone = "", ic = "") {
  return `<div class="bg-base-100 border border-base-300 rounded-box px-5 py-4">
    <div class="text-xs font-medium text-base-content/60 flex items-center gap-1.5">${ic ? icon(ic, `size-3.5 ${tone}`) : ""}${label}</div>
    <div class="text-2xl font-bold mt-1 tabular-nums">${value}</div>
  </div>`;
}

function sourceRow(id, status, detail, on = true) {
  return `<div class="flex items-center gap-3 py-3 ${id !== "gravatar" ? "border-b border-base-300" : ""}">
    ${sourceMark(id, "size-9")}
    <div class="flex-1"><div class="font-semibold text-sm">${sources[id].name}</div><div class="text-xs text-base-content/60">${detail}</div></div>
    ${on ? `<span class="badge badge-sm badge-soft badge-success">${status}</span>` : `<button class="btn btn-xs">${status}</button>`}
  </div>`;
}

const dashboardBody = (theme) => shell("dashboard", `
  ${pageHeader("Dashboard", "Everything at a glance.", `<button class="btn btn-ghost btn-sm">${icon("refresh-cw", "size-4")}Refresh</button>`)}
  <div class="px-8 pb-8 grid grid-cols-3 gap-5 overflow-hidden">
    ${card(`<div class="p-6 flex items-center gap-6">
      <div class="relative grid place-items-center">${ring(62)}<div class="absolute text-center"><div class="text-2xl font-bold">62%</div><div class="text-[11px] text-base-content/60 -mt-0.5">with photo</div></div></div>
      <div class="flex-1">
        <div class="flex items-center gap-2 text-sm text-base-content/60">${googleMark("size-6 rounded-md")}Google Contacts · carlo@example.com</div>
        <div class="mt-2 flex items-baseline gap-2"><span class="text-3xl font-bold tabular-nums">774</span><span class="text-sm text-base-content/60">of 1,248 contacts have a photo</span></div>
        <div class="text-sm mt-1 text-success flex items-center gap-1.5">${icon("image-plus", "size-4")}Last sync added 128 photos · 2 days ago</div>
      </div>
      <div class="flex flex-col gap-2">
        <button class="btn btn-primary">${icon("refresh-cw", "size-4")}Sync photos</button>
        <button class="btn btn-ghost btn-sm">Sync settings</button>
      </div>
    </div>`, "col-span-2")}
    ${card(`<div class="p-6 h-full flex flex-col">
      <div class="flex items-center gap-2">${icon("sparkles", "size-5 text-secondary")}<span class="font-semibold">Clean up</span></div>
      <div class="text-sm text-base-content/70 mt-2">The last scan found:</div>
      <ul class="mt-2 text-sm space-y-1.5">
        <li class="flex justify-between"><span>Possible duplicates</span><b>23</b></li>
        <li class="flex justify-between"><span>Shared phone numbers</span><b>9</b></li>
        <li class="flex justify-between"><span>Numbers without country code</span><b>41</b></li>
      </ul>
      <div class="flex-1"></div>
      <button class="btn btn-sm btn-secondary btn-outline mt-4">Review ${icon("arrow-right", "size-4")}</button>
    </div>`)}
    ${card(`<div class="px-6 pt-5 pb-2">
      <div class="flex items-center"><span class="font-semibold flex-1">Sources</span><a class="text-xs link link-hover text-base-content/60">Manage</a></div>
      ${sourceRow("whatsapp", "Connected", "412 photos found last sync")}
      ${sourceRow("telegram", "Connect", "Not connected", false)}
      ${sourceRow("gravatar", "On", "37 photos found last sync")}
    </div>`)}
    ${card(`<div class="px-6 pt-5 pb-3">
      <div class="flex items-center"><span class="font-semibold flex-1">Recent activity</span><a class="text-xs link link-hover text-base-content/60">See all</a></div>
      <ul class="mt-2 divide-y divide-base-300 text-sm">
        ${[["refresh-cw", "Photo sync", "128 photos added · 18 min", "2 days ago", "text-primary"], ["git-merge", "Merged 2 contacts", "Marco Rossi", "2 days ago", "text-secondary"], ["refresh-cw", "Photo sync", "Review: 12 accepted, 3 kept", "last week", "text-primary"], ["download", "Backup created", "contacts-2026-09-24.vcf", "last week", "text-base-content/60"]]
          .map(([ic, t, d, w, c]) => `<li class="flex items-center gap-3 py-2.5"><span class="size-8 rounded-lg bg-base-200 grid place-items-center ${c}">${icon(ic, "size-4")}</span><div class="flex-1"><div class="font-medium">${t}</div><div class="text-xs text-base-content/60">${d}</div></div><span class="text-xs text-base-content/50">${w}</span></li>`).join("")}
      </ul>
    </div>`, "col-span-2")}
    ${card(`<div class="p-6 flex items-center gap-5">
      <div class="flex -space-x-3">${people.slice(0, 7).map((n) => `<div class="ring-2 ring-base-100 rounded-full">${face(n, "size-10")}</div>`).join("")}</div>
      <div class="flex-1 text-sm"><div class="font-semibold">Recently added photos</div><div class="text-base-content/60">Giulia, Marco, Sofia and 125 others got a face last time.</div></div>
      <button class="btn btn-sm btn-ghost">Open report ${icon("arrow-right", "size-4")}</button>
    </div>`, "col-span-3")}
  </div>`, { badge: 23 });

export const dashboard = page(dashboardBody());
export const dashboardDark = page(dashboardBody(), { theme: "scs-dark" });

function radioCard(title, desc, checked, extra = "") {
  return `<label class="flex gap-3 px-4 py-3 rounded-xl border ${checked ? "border-primary bg-primary/5" : "border-base-300"} cursor-pointer">
    <input type="radio" name="mode" class="radio radio-primary radio-sm mt-0.5" ${checked ? "checked" : ""}/>
    <div class="flex-1"><div class="font-semibold text-sm flex items-center gap-2">${title}${extra}</div><div class="text-sm text-base-content/60 mt-0.5">${desc}</div></div>
  </label>`;
}

export const syncSetup = page(shell("sync", `
  ${pageHeader("Sync photos", "Find profile photos for your Google contacts.")}
  <div class="px-8 pb-8 grid grid-cols-[1fr_320px] gap-5">
    <div class="space-y-5">
      ${card(`<div class="p-6">
        <div class="font-semibold">1. Sources</div><div class="text-sm text-base-content/60 mt-0.5">When several sources have a photo, the first one in the list wins. Drag to reorder.</div>
        <div class="mt-4 space-y-2">
          ${[["whatsapp", "Connected · +39 347 •••• 507", true, true], ["gravatar", "Matches by email address", true, true], ["telegram", "Not connected", false, false]]
            .map(([id, d, on, conn], i) => `<div class="flex items-center gap-3 p-3 rounded-xl border border-base-300 ${conn ? "" : "opacity-60"}">
              ${icon("grip-vertical", "size-4 text-base-content/40")}<span class="text-xs font-semibold text-base-content/50 w-4">${i + 1}</span>
              ${sourceMark(id, "size-8", "size-4")}
              <div class="flex-1"><div class="text-sm font-semibold">${sources[id].name}</div><div class="text-xs text-base-content/60">${d}</div></div>
              ${conn ? `<input type="checkbox" class="toggle toggle-primary toggle-sm" ${on ? "checked" : ""}/>` : `<button class="btn btn-xs">Connect</button>`}
            </div>`).join("")}
        </div>
      </div>`)}
      ${card(`<div class="p-6">
        <div class="font-semibold">2. What should change?</div>
        <div class="mt-4 space-y-2">
          ${radioCard("Fill in missing photos", "Only contacts that have no photo yet.", true, `<span class="badge badge-xs badge-primary badge-soft">Recommended</span>`)}
          ${radioCard("Replace all photos", "Use the source photo even if the contact already has one.", false)}
          ${radioCard("Review each photo", "Compare and decide for every contact, one by one.", false)}
        </div>
        <details class="mt-4 text-sm"><summary class="cursor-pointer text-base-content/70 font-medium">Advanced</summary>
          <div class="mt-3 flex items-center gap-3"><span class="flex-1 text-base-content/70">Country for numbers saved without a prefix</span><select class="select select-sm w-56"><option>🇮🇹 Italy (from your WhatsApp number)</option></select></div>
        </details>
      </div>`)}
    </div>
    <div class="space-y-5">
      ${card(`<div class="p-6">
        <div class="font-semibold">Summary</div>
        <dl class="mt-4 space-y-3 text-sm">
          <div class="flex justify-between"><dt class="text-base-content/60">Contacts in Google</dt><dd class="font-semibold tabular-nums">1,248</dd></div>
          <div class="flex justify-between"><dt class="text-base-content/60">Without a photo</dt><dd class="font-semibold tabular-nums">474</dd></div>
          <div class="flex justify-between"><dt class="text-base-content/60">Sources</dt><dd class="flex gap-1">${sourceBadge("whatsapp")}${sourceBadge("gravatar")}</dd></div>
          <div class="flex justify-between"><dt class="text-base-content/60">Estimated time</dt><dd class="font-semibold">up to 12 min</dd></div>
        </dl>
        <div class="mt-4 text-xs text-base-content/60 bg-base-200 rounded-lg p-3 flex gap-2">${icon("shield-check", "size-4 text-success")}<span>A backup of every photo that changes is kept, so you can undo this sync.</span></div>
        <button class="btn btn-primary w-full mt-5">${icon("refresh-cw", "size-4")}Start sync</button>
      </div>`)}
      <div class="text-xs text-base-content/50 px-1 flex gap-2">${icon("info", "size-4 shrink-0")}Google allows about 40 photo updates per minute, so large address books take a while. You can keep working; the app must stay open.</div>
    </div>
  </div>`, { badge: 23 }));

const progressBody = () => shell("sync", `
  ${pageHeader("Syncing photos…", "Started 6 min ago · about 5 min left", `<button class="btn btn-sm">${icon("pause", "size-4")}Pause</button><button class="btn btn-sm btn-ghost text-error">${icon("square", "size-4")}Stop</button>`)}
  <div class="px-8 pb-8 space-y-5">
    ${card(`<div class="p-6">
      <div class="flex items-end justify-between text-sm"><span class="font-semibold">Checked 612 of 1,248 contacts</span><span class="text-base-content/60 tabular-nums">49%</span></div>
      <progress class="progress progress-primary w-full mt-3 h-2.5" value="49" max="100"></progress>
      <div class="mt-3 text-xs text-base-content/60 flex items-center gap-2"><span class="loading loading-spinner loading-xs text-primary"></span>Looking up <b class="text-base-content/80">Elena Conti</b> on WhatsApp…</div>
    </div>`)}
    <div class="grid grid-cols-4 gap-4">
      ${stat("Photos added", "71", "text-success", "image-plus")}${stat("Already had a photo", "302", "", "image")}${stat("No photo found", "236", "", "search")}${stat("Errors", "3", "text-error", "circle-alert")}
    </div>
    ${card(`<div class="p-6">
      <div class="flex items-center"><span class="font-semibold flex-1">Just added</span><span class="text-xs text-base-content/50">newest first</span></div>
      <div class="mt-4 grid grid-cols-4 gap-3">
        ${people.slice(0, 12).map((n, i) => `<div class="flex items-center gap-3 p-2.5 rounded-xl bg-base-200/60">${face(n, "size-10")}<div class="min-w-0"><div class="text-sm font-medium truncate">${n}</div>${sourceBadge(i % 5 === 3 ? "gravatar" : "whatsapp")}</div></div>`).join("")}
      </div>
    </div>`)}
  </div>`);

export const syncProgress = page(progressBody());
export const syncProgressDark = page(progressBody(), { theme: "scs-dark" });

export const syncReview = page(shell("sync", `
  ${pageHeader("Review photos", "Contact 37 of 312 with a new photo · 24 accepted, 12 kept", `<button class="btn btn-sm btn-ghost">Accept all remaining</button><button class="btn btn-sm btn-ghost text-error">${icon("square", "size-4")}Stop</button>`)}
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
          <div class="inline-block p-1.5 rounded-full border-2 border-base-300">${face("Francesco old", "size-36")}</div>
          <div class="mt-4"><button class="btn btn-sm">Keep current <kbd class="kbd kbd-xs">←</kbd></button></div>
        </div>
        <div class="text-base-content/30">${icon("arrow-right", "size-8")}</div>
        <div>
          <div class="text-xs font-semibold uppercase tracking-wide text-base-content/50 mb-3 text-center">Found in your sources</div>
          <div class="flex justify-center gap-6">
            <div class="text-center"><div class="inline-block p-1.5 rounded-full border-[3px] border-primary relative">${face("Francesco Greco", "size-36")}<span class="absolute -top-1 -right-1 size-7 rounded-full bg-primary text-primary-content grid place-items-center">${icon("check", "size-4")}</span></div><div class="mt-2">${sourceBadge("whatsapp")}</div></div>
            <div class="text-center"><div class="inline-block p-1.5 rounded-full border-2 border-base-300">${face("Francesco grav", "size-36")}</div><div class="mt-2">${sourceBadge("gravatar")}</div></div>
          </div>
          <div class="mt-4 text-center"><button class="btn btn-sm btn-primary">Use selected photo <kbd class="kbd kbd-xs">Enter</kbd></button></div>
        </div>
      </div>
    </div>`, "mt-5")}
    <div class="mt-4 flex items-center justify-center gap-5 text-xs text-base-content/50">
      <span class="flex items-center gap-1.5">${icon("keyboard", "size-4")}Shortcuts:</span>
      <span><kbd class="kbd kbd-xs">←</kbd> keep</span><span><kbd class="kbd kbd-xs">Enter</kbd> use selected</span><span><kbd class="kbd kbd-xs">1</kbd>–<kbd class="kbd kbd-xs">3</kbd> pick photo</span><span><kbd class="kbd kbd-xs">S</kbd> skip</span>
    </div>
    ${card(`<div class="px-6 py-4 flex items-center gap-4">
      <span class="text-sm font-semibold">Up next</span>
      <div class="flex gap-3 flex-1">${people.slice(10, 17).map((n) => `<div class="flex items-center gap-2 pr-3 rounded-full bg-base-200/70">${initials(n, "size-8", "text-xs")}<span class="text-xs font-medium">${n.split(" ")[0]}</span></div>`).join("")}</div>
      <span class="text-xs text-base-content/50">+269 more</span>
    </div>`, "mt-5")}
  </div>`));

export const syncReport = page(shell("sync", `
  <div class="px-8 pt-7">
    <div class="rounded-box bg-gradient-to-r from-success/15 to-primary/10 border border-success/30 p-6 flex items-center gap-5">
      <span class="size-12 rounded-full bg-success text-success-content grid place-items-center">${icon("check", "size-6")}</span>
      <div class="flex-1"><div class="text-xl font-bold">128 photos added</div><div class="text-sm text-base-content/70">Sync finished in 18 min · 1,248 contacts checked · today at 15:42</div></div>
      <button class="btn btn-sm">${icon("undo-2", "size-4")}Undo this sync</button>
      <button class="btn btn-sm btn-ghost">${icon("file-down", "size-4")}Export CSV</button>
    </div>
  </div>
  <div class="px-8 pt-5 grid grid-cols-4 gap-4">
    ${stat("Photos added", "128", "text-success", "image-plus")}${stat("Already had a photo", "642", "", "image")}${stat("No photo found", "472", "", "search")}${stat("Errors", "6", "text-error", "circle-alert")}
  </div>
  <div class="px-8 py-5 flex-1 overflow-hidden">
    ${card(`<div class="px-6 pt-4">
      <div role="tablist" class="tabs tabs-border">
        <a class="tab tab-active">Added (128)</a><a class="tab">No photo found (472)</a><a class="tab">Errors (6)</a><a class="tab">All</a>
        <div class="flex-1"></div><label class="input input-sm w-56 self-center">${icon("search", "size-4 opacity-50")}<input placeholder="Search contacts"/></label>
      </div>
      <table class="table table-sm mt-2">
        <thead><tr><th>Contact</th><th>Matched by</th><th>Source</th><th>Before → after</th><th></th></tr></thead>
        <tbody>${people.slice(4, 9).map((n, i) => `<tr>
          <td><div class="flex items-center gap-3">${face(n, "size-8")}<span class="font-medium">${n}</span></div></td>
          <td class="text-base-content/60">${i === 2 ? "email · " + n.split(" ")[0].toLowerCase() + "@example.com" : "+39 3" + (30 + i) + " •••• " + (100 + i * 37)}</td>
          <td>${sourceBadge(i === 2 ? "gravatar" : "whatsapp")}</td>
          <td><div class="flex items-center gap-2">${initials(n, "size-7", "text-xs")}${icon("arrow-right", "size-3.5 text-base-content/40")}${face(n, "size-7")}</div></td>
          <td class="text-right"><button class="btn btn-xs btn-ghost">${icon("undo-2", "size-3.5")}Undo</button></td></tr>`).join("")}</tbody>
      </table>
    </div>`)}
  </div>`));

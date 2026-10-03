import { icon, face, initials, sourceMark, sourceBadge, googleMark, logo, shell, pageHeader, card, page, people, sources } from "./kit.mjs";

export const sizes = { mobileDashboard: [390, 844] };

const groups = [
  ["Marco Rossi", "Marco R.", "Same phone number", true],
  ["Giulia Bianchi", "Giulia Bianchi (work)", "Same email", false],
  ["Luca Romano", "Luca Romano", "Same name", false],
  ["Elena Conti", "Elena", "Same phone number", false],
  ["Andrea Rizzo", "Andrea Rizzo", "Same name and email", false],
  ["Sara Bruno", "Sara B.", "Similar name, same phone", false],
];

function fieldRow(label, a, b, pick, union = false) {
  const cell = (v, on) => `<td class="${on ? "bg-primary/5" : ""}"><label class="flex items-start gap-2">${union ? `<input type="checkbox" class="checkbox checkbox-xs checkbox-primary mt-0.5" ${on ? "checked" : ""}/>` : `<input type="radio" class="radio radio-xs radio-primary mt-0.5" ${on ? "checked" : ""}/>`}<span>${v}</span></label></td>`;
  return `<tr><th class="text-xs font-medium text-base-content/60 w-28 align-top">${label}</th>${cell(a, pick === 0 || pick === 2)}${cell(b, pick === 1 || pick === 2)}</tr>`;
}

const cleanupBody = () => shell("cleanup", `
  ${pageHeader("Clean up contacts", "Scanned 1,248 contacts 2 min ago.", `<button class="btn btn-sm btn-ghost">${icon("refresh-cw", "size-4")}Scan again</button>`)}
  <div class="px-8">
    <div role="tablist" class="tabs tabs-box w-fit bg-base-100 border border-base-300">
      <a class="tab tab-active">${icon("copy", "size-4 mr-1.5")}Duplicates <span class="badge badge-xs ml-2">23</span></a>
      <a class="tab">${icon("phone", "size-4 mr-1.5")}Shared numbers <span class="badge badge-xs ml-2">9</span></a>
      <a class="tab">${icon("globe", "size-4 mr-1.5")}Missing country code <span class="badge badge-xs ml-2">41</span></a>
    </div>
  </div>
  <div class="px-8 py-5 grid grid-cols-[300px_1fr] gap-5 flex-1 min-h-0">
    ${card(`<ul class="p-2 space-y-1">${groups.map(([a, b, why, on], i) => `
      <li class="flex items-center gap-3 p-2.5 rounded-lg ${on ? "bg-primary/10" : ""}">
        <div class="flex -space-x-2">${i % 2 ? initials(a, "size-8 ring-2 ring-base-100", "text-xs") : face(a, "size-8 ring-2 ring-base-100")}${initials(b, "size-8 ring-2 ring-base-100", "text-xs")}</div>
        <div class="min-w-0 flex-1"><div class="text-sm font-medium truncate">${a}</div><div class="text-xs text-base-content/60">${why}</div></div>
        ${on ? icon("chevron-right", "size-4 text-primary") : ""}
      </li>`).join("")}
      <li class="text-center text-xs text-base-content/50 py-2">+17 more</li></ul>`, "overflow-hidden")}
    ${card(`<div class="p-6 flex flex-col h-full">
      <div class="flex items-center gap-3">
        <div class="flex-1"><div class="font-semibold text-lg">Marco Rossi</div><div class="text-sm text-base-content/60">2 contacts share <b>+39 333 812 5517</b>. Pick what to keep; the rest is combined.</div></div>
        <span class="badge badge-soft badge-warning">Likely duplicate</span>
      </div>
      <table class="table table-sm mt-4">
        <thead><tr><th></th><th><div class="flex items-center gap-2">${face("Marco Rossi", "size-8")}<span>Contact A · edited 3 days ago</span></div></th><th><div class="flex items-center gap-2">${initials("Marco R.", "size-8", "text-xs")}<span>Contact B · edited 2019</span></div></th></tr></thead>
        <tbody>
          ${fieldRow("Name", "Marco Rossi", "Marco R.", 0)}
          ${fieldRow("Photo", "WhatsApp photo", "—", 0)}
          ${fieldRow("Phones", "+39 333 812 5517 (mobile)", "+39 333 812 5517<br/>+39 02 4455 6677 (work)", 2, true)}
          ${fieldRow("Emails", "marco.rossi@example.com", "m.rossi@studio.example", 2, true)}
          ${fieldRow("Company", "—", "Studio Rossi", 1)}
          ${fieldRow("Birthday", "12 March", "—", 0)}
        </tbody>
      </table>
      <div class="flex-1"></div>
      <div class="mt-4 pt-4 border-t border-base-300 flex items-center gap-3">
        <div class="text-xs text-base-content/60 flex items-center gap-1.5 flex-1">${icon("shield-check", "size-4 text-success")}Both contacts are saved to a backup before merging.</div>
        <button class="btn btn-sm btn-ghost">Not duplicates</button>
        <button class="btn btn-sm btn-ghost">Skip</button>
        <button class="btn btn-sm btn-secondary">${icon("git-merge", "size-4")}Merge into one</button>
      </div>
    </div>`)}
  </div>`, { badge: 23 });

export const cleanup = page(cleanupBody());
export const cleanupDark = page(cleanupBody(), { theme: "scs-dark" });

export const cleanupShared = page(shell("cleanup", `
  ${pageHeader("Clean up contacts", "Scanned 1,248 contacts 2 min ago.", `<button class="btn btn-sm btn-ghost">${icon("refresh-cw", "size-4")}Scan again</button>`)}
  <div class="px-8">
    <div role="tablist" class="tabs tabs-box w-fit bg-base-100 border border-base-300">
      <a class="tab">${icon("copy", "size-4 mr-1.5")}Duplicates <span class="badge badge-xs ml-2">23</span></a>
      <a class="tab tab-active">${icon("phone", "size-4 mr-1.5")}Shared numbers <span class="badge badge-xs ml-2">9</span></a>
      <a class="tab">${icon("globe", "size-4 mr-1.5")}Missing country code <span class="badge badge-xs ml-2">41</span></a>
    </div>
  </div>
  <div class="px-8 py-5 space-y-3">
    <p class="text-sm text-base-content/60">The same number is saved on different contacts, so a photo could end up on the wrong person. Tell us who the number belongs to.</p>
    ${[["+39 340 221 6527", ["Mamma", "Maria Esposito"], "Same person? Merge them, or keep the number on one."], ["+39 02 8899 1100", ["Studio Bianchi", "Giulia Bianchi", "Paolo Bianchi"], "Looks like a shared landline: photos are skipped for it."], ["+39 328 309 7537", ["Luca", "Luca Romano"], "Same person? Merge them, or keep the number on one."]]
      .map(([num, names, hint], i) => card(`<div class="p-5 flex items-center gap-5">
        <div class="w-48"><div class="font-semibold tabular-nums">${num}</div><div class="text-xs text-base-content/60 mt-0.5">${names.length} contacts</div></div>
        <div class="flex gap-2 flex-1 flex-wrap">${names.map((n, j) => `<label class="flex items-center gap-2 pl-1.5 pr-3 py-1.5 rounded-full border ${j === 1 && i !== 1 ? "border-primary bg-primary/5" : "border-base-300"}">${j === 1 && i === 0 ? face(n, "size-7") : initials(n, "size-7", "text-xs")}<span class="text-sm font-medium">${n}</span></label>`).join("")}</div>
        <div class="text-xs text-base-content/60 w-56">${hint}</div>
        <div class="flex gap-2">${i === 1 ? `<button class="btn btn-sm">Mark as shared</button>` : `<button class="btn btn-sm">Keep on selected</button><button class="btn btn-sm btn-secondary btn-outline">${icon("git-merge", "size-4")}Merge</button>`}</div>
      </div>`)).join("")}
  </div>`, { badge: 23 }));

export const history = page(shell("history", `
  ${pageHeader("History", "Every sync and clean-up, with its report and undo.", `<button class="btn btn-sm btn-ghost">${icon("folder-open", "size-4")}Open backups folder</button>`)}
  <div class="px-8 pb-8">
    ${card(`<table class="table">
      <thead><tr><th>When</th><th>What</th><th>Sources</th><th>Result</th><th>Duration</th><th></th></tr></thead>
      <tbody>
        ${[["Today, 15:42", "Photo sync", "Fill in missing", ["whatsapp", "gravatar"], "<b class='text-success'>128 added</b> · 6 errors", "18 min"],
           ["Today, 15:10", "Clean up", "Merged 2 contacts", [], "Marco Rossi", "—"],
           ["24 Sep, 21:03", "Photo sync", "Review each", ["whatsapp"], "<b class='text-success'>12 accepted</b> · 3 kept", "9 min"],
           ["24 Sep, 20:51", "Backup", "Before first sync", [], "1,248 contacts · contacts-2026-09-24.vcf", "—"],
           ["2 Sep, 18:20", "Photo sync", "Fill in missing", ["whatsapp"], "<b class='text-success'>301 added</b> · undone", "41 min"]]
          .map(([w, t, m, src, r, d], i) => `<tr class="${i === 4 ? "opacity-60" : ""}">
            <td class="whitespace-nowrap text-base-content/70">${w}</td>
            <td><div class="flex items-center gap-3"><span class="size-8 rounded-lg bg-base-200 grid place-items-center ${t === "Clean up" ? "text-secondary" : t === "Backup" ? "text-base-content/60" : "text-primary"}">${icon(t === "Clean up" ? "git-merge" : t === "Backup" ? "download" : "refresh-cw", "size-4")}</span><div><div class="font-medium">${t}</div><div class="text-xs text-base-content/60">${m}</div></div></div></td>
            <td><div class="flex gap-1">${src.map((s) => sourceBadge(s)).join("") || "<span class='text-base-content/40'>—</span>"}</div></td>
            <td>${r}</td><td class="text-base-content/70">${d}</td>
            <td class="text-right whitespace-nowrap">${t === "Backup" ? `<button class="btn btn-xs btn-ghost">${icon("download", "size-3.5")}Restore…</button>` : `<button class="btn btn-xs btn-ghost">Report</button>${i < 3 ? `<button class="btn btn-xs btn-ghost">${icon("undo-2", "size-3.5")}Undo</button>` : ""}`}</td></tr>`).join("")}
      </tbody></table>`)}
  </div>`));

function settingsNav(active) {
  return `<nav class="w-52 space-y-1 text-sm">${[["General", "settings"], ["Google account", "key-round"], ["Sources", "link"], ["Data & privacy", "hard-drive"], ["Updates", "package"], ["About", "info"]]
    .map(([l, ic]) => `<a class="flex items-center gap-2.5 px-3 py-2 rounded-lg ${l === active ? "bg-base-100 border border-base-300 font-semibold" : "text-base-content/70"}">${icon(ic, "size-4")}${l}</a>`).join("")}</nav>`;
}

function settingRow(title, desc, control) {
  return `<div class="flex items-center gap-6 py-4 border-b border-base-300 last:border-0"><div class="flex-1"><div class="text-sm font-medium">${title}</div><div class="text-xs text-base-content/60 mt-0.5">${desc}</div></div>${control}</div>`;
}

export const settings = page(shell("settings", `
  ${pageHeader("Settings")}
  <div class="px-8 pb-8 flex gap-6">
    ${settingsNav("General")}
    <div class="flex-1 space-y-5">
      ${card(`<div class="px-6 py-2">
        ${settingRow("Language", "Follows your system language until you pick one.", `<select class="select select-sm w-44"><option>English</option><option>Italiano</option></select>`)}
        ${settingRow("Theme", "Light, dark or the same as your system.", `<div class="join"><button class="btn btn-sm join-item">Light</button><button class="btn btn-sm join-item">Dark</button><button class="btn btn-sm join-item btn-active">System</button></div>`)}
        ${settingRow("Remember sign-ins", "Keep WhatsApp, Telegram and Google signed in between launches (stored encrypted).", `<input type="checkbox" class="toggle toggle-primary" checked/>`)}
      </div>`)}
      <div class="text-xs font-semibold uppercase tracking-wide text-base-content/50 px-1">Data &amp; privacy</div>
      ${card(`<div class="px-6 py-2">
        ${settingRow("Data folder", "<span class='font-mono'>D:\\Apps\\SocialContactsSync\\data</span> · portable mode: settings live next to the app.", `<button class="btn btn-sm">${icon("folder-open", "size-4")}Open</button>`)}
        ${settingRow("Settings file", "<span class='font-mono'>config.env</span> — Google credentials and preferences, editable by hand.", `<button class="btn btn-sm btn-ghost">Show</button>`)}
        ${settingRow("Backups", "Kept for 90 days · 4 backups, 3.2 MB.", `<button class="btn btn-sm btn-ghost">Manage</button>`)}
        ${settingRow("Delete all local data", "Signs out everywhere and removes settings, history and backups from this computer. Google contacts are not touched.", `<button class="btn btn-sm btn-error btn-outline">${icon("trash-2", "size-4")}Delete…</button>`)}
      </div>`)}
    </div>
  </div>`));

const donate = [
  ["Buy me a coffee", "coffee", "#FFDD00", "#1f1f1f"],
  ["PayPal", "heart", "#00457C", "#fff"],
  ["Stripe", "heart", "#635BFF", "#fff"],
  ["Liberapay", "heart", "#F6C915", "#1f1f1f"],
  ["GitHub Sponsors", "heart", "#EA4AAA", "#fff"],
];

export const about = page(shell("settings", `
  ${pageHeader("Settings")}
  <div class="px-8 pb-8 flex gap-6">
    ${settingsNav("About")}
    <div class="flex-1 space-y-5">
      ${card(`<div class="p-6 flex items-center gap-5">
        ${logo("size-16")}
        <div class="flex-1"><div class="text-xl font-bold">Social Contacts Sync</div><div class="text-sm text-base-content/60">Version 1.0.0 · Windows portable · <a class="link">What's new</a></div></div>
        <button class="btn btn-sm">${icon("refresh-cw", "size-4")}Check for updates</button>
      </div>`)}
      <div class="grid grid-cols-2 gap-5">
        ${card(`<div class="p-6">
          <div class="font-semibold">Made by</div>
          <div class="mt-3 flex items-center gap-3">${face("Carlo maint", "size-11")}<div><div class="font-medium">Carlo Ruggiero</div><a class="text-sm link link-primary">easly1989.github.io</a></div></div>
          <div class="mt-5 font-semibold">Built on</div>
          <div class="mt-2 text-sm text-base-content/70"><a class="link">WhatsApp Contact Sync</a> by <b>Guy Zylberberg</b>, the original project this app grew from. Thank you!</div>
          <a class="btn btn-sm btn-ghost mt-3 -ml-2">${icon("coffee", "size-4")}Support the original author</a>
        </div>`)}
        ${card(`<div class="p-6">
          <div class="font-semibold flex items-center gap-2">${icon("hand-heart", "size-5 text-secondary")}Support this project</div>
          <p class="text-sm text-base-content/60 mt-1">Social Contacts Sync is free. If it saved you an evening of copying photos, consider a small donation.</p>
          <div class="mt-4 grid grid-cols-2 gap-2">${donate.map(([n, ic, bg, fg]) => `<a class="btn btn-sm border-0 justify-start" style="background:${bg};color:${fg}">${icon(ic, "size-4")}${n}</a>`).join("")}</div>
        </div>`)}
      </div>
      <div class="text-xs text-base-content/50 px-1">Licensed under the original project's licence (Apache 2.0 with Commons Clause): free to use, not for sale. · <a class="link">Open-source licences</a> · <a class="link">Privacy</a></div>
    </div>
  </div>`));

export const mobileDashboard = page(`<div class="min-h-screen bg-base-200 flex flex-col">
  <header class="bg-base-100 border-b border-base-300 px-4 h-14 flex items-center gap-2.5">${logo("size-7")}<span class="font-bold flex-1">Social Contacts Sync</span>${icon("settings", "size-5 text-base-content/70")}</header>
  <div class="p-4 space-y-4 flex-1">
    ${card(`<div class="p-5">
      <div class="flex items-center gap-2 text-xs text-base-content/60">${googleMark("size-5 rounded-md")}carlo@example.com</div>
      <div class="mt-3 flex items-baseline gap-2"><span class="text-3xl font-bold">62%</span><span class="text-sm text-base-content/60">of 1,248 contacts have a photo</span></div>
      <progress class="progress progress-primary w-full mt-3" value="62" max="100"></progress>
      <button class="btn btn-primary w-full mt-4">${icon("refresh-cw", "size-4")}Sync photos</button>
    </div>`)}
    ${card(`<div class="p-5"><div class="flex items-center gap-2">${icon("sparkles", "size-5 text-secondary")}<span class="font-semibold flex-1">Clean up</span><span class="badge badge-secondary badge-sm">23</span></div><div class="text-sm text-base-content/60 mt-1">Possible duplicates and shared numbers to review.</div></div>`)}
    ${card(`<div class="p-5 space-y-3"><div class="font-semibold">Sources</div>
      ${[["whatsapp", "Connected"], ["telegram", "Connect"], ["gravatar", "On"]].map(([id, st]) => `<div class="flex items-center gap-3">${sourceMark(id, "size-8", "size-4")}<span class="flex-1 text-sm font-medium">${sources[id].name}</span>${st === "Connect" ? `<button class="btn btn-xs">Connect</button>` : `<span class="badge badge-sm badge-soft badge-success">${st}</span>`}</div>`).join("")}
    </div>`)}
  </div>
  <nav class="bg-base-100 border-t border-base-300 grid grid-cols-4 text-[11px] font-medium">${[["layout-dashboard", "Home", true], ["refresh-cw", "Sync"], ["sparkles", "Clean up"], ["history", "History"]].map(([ic, l, on]) => `<a class="flex flex-col items-center gap-1 py-2.5 ${on ? "text-primary" : "text-base-content/60"}">${icon(ic, "size-5")}${l}</a>`).join("")}</nav>
</div>`);

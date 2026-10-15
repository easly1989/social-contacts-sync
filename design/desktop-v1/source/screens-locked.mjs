// A kept photo (after v1.3.1): a contact's photo the app never replaces —
// not a sync, not Find profiles — while links to WhatsApp and to social
// profiles still work for that contact.
import { icon, face, initials, logo, pageHeader, card, page } from "./kit.mjs";

export const sizes = { lockedEditor: [1280, 820], lockedProfiles: [1280, 640] };

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
    .map(([id, label, ic]) => `<a class="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium ${id === active ? "bg-primary/10 text-primary" : "text-base-content/70"}">${icon(ic, "size-[18px]")}<span class="flex-1">${label}</span></a>`)
    .join("");
  return `<div class="flex h-screen bg-base-200 text-base-content">
    <aside class="w-60 bg-base-100 border-r border-base-300 flex flex-col p-4 gap-1 shrink-0">
      <div class="flex items-center gap-2.5 px-2 pb-5 pt-1">${logo("size-8")}<div class="font-bold text-[15px] leading-tight">Social Contacts<br/>Sync</div></div>
      ${items}<div class="flex-1"></div>
      <div class="px-3 pt-3 mt-2 border-t border-base-300 text-xs text-base-content/50 flex justify-between"><span>v1.3.2</span><span class="flex items-center gap-1">${icon("circle-check", "size-3.5 text-success")}Up to date</span></div>
    </aside>
    <main class="flex-1 overflow-hidden flex flex-col">${content}</main>
  </div>`;
}

const keptBadge = `<span class="badge badge-xs badge-info badge-soft gap-1">${icon("lock", "size-3")}Kept</span>`;
const placeholderBadge = `<span class="badge badge-xs badge-warning badge-soft">Placeholder</span>`;

// 1. The editor: "Keep this photo".
export const lockedEditor = page(shell("contacts", `
  <div class="relative flex-1 overflow-hidden">
    <div class="absolute inset-0 opacity-40 pointer-events-none">${pageHeader("Contacts", "Your Google contacts. Changes are saved to Google right away.")}</div>
    <div class="absolute inset-0 bg-base-content/20"></div>
    <aside class="absolute right-0 top-0 bottom-0 w-[32rem] bg-base-100 border-l border-base-300 shadow-xl flex flex-col">
      <header class="flex items-center gap-3 px-6 py-4 border-b border-base-300"><div class="flex-1 font-semibold">Edit contact</div><button class="btn btn-sm btn-ghost btn-square">${icon("x", "size-4")}</button></header>
      <div class="px-6 py-5 space-y-5">
        <div class="flex items-start gap-4">
          <div class="relative">${face("Nonna Rosa", "size-20")}<span class="absolute -bottom-1 left-1/2 -translate-x-1/2">${keptBadge}</span></div>
          <div class="flex-1 space-y-3">
            <div class="flex flex-wrap gap-2"><button class="btn btn-sm">${icon("upload", "size-4")}Upload photo</button><button class="btn btn-sm btn-ghost">${icon("trash-2", "size-4")}Remove</button></div>
            <label class="flex items-start gap-3 rounded-xl border border-info/40 bg-info/5 p-3">
              <input type="checkbox" class="toggle toggle-sm toggle-info mt-0.5" checked/>
              <span class="flex-1"><span class="block text-sm font-medium">Keep this photo</span>
              <span class="block text-xs text-base-content/60 mt-0.5">Syncs and Find profiles never replace it. WhatsApp, Telegram and profile links still work for this contact.</span></span>
            </label>
          </div>
        </div>
        <div class="text-xs font-semibold uppercase tracking-wide text-base-content/50">Name</div>
        <div class="grid grid-cols-2 gap-2"><input class="input input-sm" value="Rosa"/><input class="input input-sm" value="Bianchi"/></div>
        <div class="text-xs font-semibold uppercase tracking-wide text-base-content/50">Profile links</div>
        <label class="input input-sm w-full">${icon("link", "size-4 opacity-50")}<input value="https://www.facebook.com/rosa.bianchi.52"/></label>
      </div>
    </aside>
  </div>`));

// 2. The list: the badge, a filter, and the row menu.
const row = (name, photo, detail, badge, menu = false) => `<tr>
  <td><input type="checkbox" class="checkbox checkbox-sm"/></td>
  <td><div class="flex items-center gap-3">${photo === "none" ? initials(name, "size-9") : face(name, "size-9")}<div><div class="font-medium flex items-center gap-2">${name}${badge}</div><div class="text-xs text-base-content/60">${detail}</div></div></div></td>
  <td class="text-right relative">${menu ? `<div class="absolute right-2 top-10 z-10 w-56 rounded-box border border-base-300 bg-base-100 shadow-xl p-1 text-left text-sm">
      <a class="flex items-center gap-2 px-3 py-2 rounded-lg">${icon("pencil", "size-4")}Edit</a>
      <a class="flex items-center gap-2 px-3 py-2 rounded-lg bg-base-200">${icon("lock", "size-4")}Keep this photo</a>
      <a class="flex items-center gap-2 px-3 py-2 rounded-lg">${icon("copy", "size-4")}Duplicate</a>
      <a class="flex items-center gap-2 px-3 py-2 rounded-lg text-error">${icon("trash-2", "size-4")}Delete</a></div>` : ""}<button class="btn btn-ghost btn-xs btn-square">${icon("ellipsis-vertical", "size-4")}</button></td></tr>`;

export const lockedList = page(shell("contacts", `
  ${pageHeader("Contacts", "Your Google contacts. Changes are saved to Google right away.")}
  <div class="px-8 flex items-center gap-2">
    ${[["All", "1,248", false], ["Without a photo", "474", false], ["Placeholders", "12", false], ["Kept photos", "3", true]].map(([l, n, on]) => `<a class="btn btn-sm ${on ? "btn-primary btn-soft" : "btn-ghost"}">${l} <span class="opacity-60">${n}</span></a>`).join("")}
  </div>
  <div class="px-8 py-4">${card(`<table class="table"><tbody>
    ${row("Nonna Rosa", "face", "+39 0471 •••• 12 · facebook.com/rosa.bianchi.52", keptBadge)}
    ${row("Papà", "face", "+39 335 •••• 980", keptBadge)}
    ${row("Elena Conti", "face", "+39 347 •••• 200", placeholderBadge, true)}
    ${row("Marco Rossi", "face", "+39 340 •••• 118", "")}
  </tbody></table>`)}</div>`));

// 3. Uploading photos: as a placeholder, or kept.
export const lockedUpload = page(shell("contacts", `
  <div class="relative flex-1 overflow-hidden">
    <div class="absolute inset-0 opacity-40 pointer-events-none">${pageHeader("Contacts")}</div>
    <div class="absolute inset-0 bg-base-content/20 grid place-items-center">
      <div class="w-[46rem] rounded-box bg-base-100 border border-base-300 shadow-xl p-6 space-y-4">
        <div class="text-lg font-semibold">Upload photos</div>
        <div class="rounded-xl border-2 border-dashed border-base-300 p-4 text-sm text-base-content/60 flex items-center gap-3">${icon("cloud-upload", "size-6")}<span class="flex-1">3 photos matched to contacts by name or number.</span></div>
        <div class="text-xs font-semibold uppercase tracking-wide text-base-content/50">Upload them as</div>
        <div class="grid grid-cols-2 gap-3">
          <label class="rounded-xl border-2 border-base-300 p-3 flex gap-3"><input type="radio" name="as" class="radio radio-sm radio-primary mt-0.5"/>
            <span><span class="block text-sm font-medium flex items-center gap-2">Placeholders ${placeholderBadge}</span><span class="block text-xs text-base-content/60 mt-1">Replaced as soon as a sync finds a real photo.</span></span></label>
          <label class="rounded-xl border-2 border-primary bg-primary/5 p-3 flex gap-3"><input type="radio" name="as" class="radio radio-sm radio-primary mt-0.5" checked/>
            <span><span class="block text-sm font-medium flex items-center gap-2">Kept photos ${keptBadge}</span><span class="block text-xs text-base-content/60 mt-1">Never replaced by the app. Links to WhatsApp and profiles still work.</span></span></label>
        </div>
        <div class="flex justify-end gap-2"><button class="btn btn-sm btn-ghost">Cancel</button><button class="btn btn-sm btn-primary">${icon("upload", "size-4")}Upload 3 photos</button></div>
      </div>
    </div>
  </div>`));

// 4. Find profiles: a kept photo is only linked.
export const lockedProfiles = page(shell("profiles", `
  ${pageHeader("Find profiles", "Suggests social profiles for your contacts. Nothing is saved until you confirm it.")}
  <div class="px-8">${card(`<div class="p-4">
    <div class="flex items-center gap-3"><input type="checkbox" class="checkbox checkbox-sm checkbox-primary"/>${face("Nonna Rosa", "size-10")}
      <div class="flex-1"><div class="font-semibold flex items-center gap-2">Rosa Bianchi ${keptBadge}</div><div class="text-xs text-base-content/60">+39 0471 •••• 12</div></div>
      <button class="btn btn-ghost btn-xs">Skip</button><button class="btn btn-ghost btn-xs">None of these</button><button class="btn btn-primary btn-xs">${icon("link", "size-3.5")}Link 2 profiles</button></div>
    <div class="mt-3 pl-8 grid grid-cols-3 gap-2">
      ${[["Rosa Bianchi", "facebook.com/rosa.bianchi.52", "Facebook", "#1877F2", "Friend · same name"], ["Rosa Bianchi", "@rosabianchi", "Instagram", "#E1306C", "Follows you · same name"]]
        .map(([n, h, net, c, why]) => `<div class="rounded-xl border-2 border-primary bg-primary/5 p-2.5 flex items-center gap-3"><input type="checkbox" class="checkbox checkbox-sm checkbox-primary" checked/>${face(n + h, "size-11")}
          <div class="min-w-0 flex-1"><div class="text-sm font-semibold">${n}</div><div class="text-xs text-base-content/60 truncate">${h}</div><div class="mt-1 flex items-center gap-1.5"><span class="text-[11px] font-medium px-1.5 rounded-full" style="background:${c}1f;color:${c}">${net}</span><span class="text-[11px] text-base-content/60">${why}</span></div></div></div>`).join("")}
    </div>
    <p class="mt-2 pl-8 text-xs text-base-content/60 flex items-center gap-1.5">${icon("lock", "size-3.5")}This contact's photo is kept: only the links are added.</p>
  </div>`)}</div>`));

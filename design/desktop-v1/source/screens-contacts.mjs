// Contacts page (after v1.1.0): every Google contact, with the ones still
// without a photo one click away; edit, add, delete, duplicate, merge, and a
// placeholder photo the sync replaces as soon as a source finds a real one.
import { icon, face, initials, logo, pageHeader, card, page, people } from "./kit.mjs";

const nav = [
  ["dashboard", "Dashboard", "layout-dashboard"],
  ["contacts", "Contacts", "contact-round"],
  ["sync", "Sync photos", "refresh-cw"],
  ["cleanup", "Clean up", "sparkles"],
  ["history", "History", "history"],
  ["settings", "Settings", "settings"],
];

function shell(active, content) {
  const items = nav
    .map(([id, label, ic]) => `<a class="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium ${id === active ? "bg-primary/10 text-primary" : "text-base-content/70"}">
      ${icon(ic, "size-[18px]")}<span class="flex-1">${label}</span>${id === "contacts" ? `<span class="badge badge-xs badge-primary badge-soft">New</span>` : ""}</a>`)
    .join("");
  return `<div class="flex h-screen bg-base-200 text-base-content">
    <aside class="w-60 bg-base-100 border-r border-base-300 flex flex-col p-4 gap-1">
      <div class="flex items-center gap-2.5 px-2 pb-5 pt-1">${logo("size-8")}<div class="font-bold text-[15px] leading-tight">Social Contacts<br/>Sync</div></div>
      ${items}
      <div class="flex-1"></div>
      <a class="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-base-content/70">${icon("hand-heart", "size-[18px] text-secondary")}Support the project</a>
      <div class="px-3 pt-3 mt-2 border-t border-base-300 text-xs text-base-content/50 flex justify-between"><span>v1.2.0</span><span class="flex items-center gap-1">${icon("circle-check", "size-3.5 text-success")}Up to date</span></div>
    </aside>
    <main class="flex-1 overflow-hidden flex flex-col">${content}</main>
  </div>`;
}

const linkChip = (text) => `<span class="inline-flex items-center gap-1 rounded-full border border-base-300 px-1.5 py-px text-[11px] text-base-content/70">${icon("link", "size-3")}${text}</span>`;
const placeholderBadge = `<span class="badge badge-xs badge-warning badge-soft" title="Replaced by the next sync that finds a photo">Placeholder</span>`;

// [name, photo: "face" | "none" | "placeholder", detail, links, selected]
const rows = [
  ["Davide Gallo", "none", "+39 338 •••• 412", [], false],
  ["Elena Conti", "placeholder", "+39 347 •••• 200", ["instagram"], false],
  ["Francesco Greco", "none", "+39 335 •••• 471 · francesco.greco@example.com", [], true],
  ["Francesco G.", "none", "+39 335 •••• 471", [], true],
  ["Giulia Bianchi", "face", "giulia.bianchi@example.com", ["x.com", "github"], false],
  ["Lorenzo Giordano", "none", "+39 340 •••• 227", [], false],
  ["Marco Rossi", "face", "+39 333 •••• 517", ["linkedin"], false],
  ["Martina Marino", "none", "martina@marino.example", ["t.me"], false],
  ["Matteo De Luca", "face", "+39 328 •••• 309", [], false],
];

const avatar = (name, kind) => (kind === "face" ? face(name, "size-9") : initials(name, "size-9", "text-xs"));

const listBody = ({ filter = "none", selection = true } = {}) => shell("contacts", `
  ${pageHeader("Contacts", "Your Google contacts. Changes are saved to Google right away.", `<button class="btn btn-sm btn-primary">${icon("user-plus", "size-4")}New contact</button>`)}
  <div class="px-8 pb-8 flex-1 flex flex-col gap-4 overflow-hidden">
    <div class="grid grid-cols-3 gap-4">
      ${[["users-round", "All contacts", "844", "all"], ["image-off", "Without a photo", "212", "none"], ["image-up", "With a placeholder photo", "18", "placeholder"]]
        .map(([ic, label, n, key]) => `<button class="text-left rounded-box border ${filter === key ? "border-primary bg-primary/5" : "border-base-300 bg-base-100"} p-4">
          <div class="flex items-center gap-2 text-sm text-base-content/70">${icon(ic, "size-4")}${label}</div><div class="text-2xl font-bold mt-1">${n}</div></button>`).join("")}
    </div>
    ${card(`<div class="px-5 pt-4">
      <div class="flex items-center gap-3">
        <label class="input input-sm w-72">${icon("search", "size-4 opacity-50")}<input placeholder="Search name, number, email or link"/></label>
        <div class="flex-1"></div>
        ${selection ? `<div class="flex items-center gap-2 rounded-lg bg-primary/10 px-3 py-1 text-sm"><span class="font-medium text-primary">2 selected</span>
          <button class="btn btn-xs btn-primary">${icon("merge", "size-3.5")}Merge</button>
          <button class="btn btn-xs btn-ghost">${icon("trash-2", "size-3.5")}Delete</button>
          <button class="btn btn-xs btn-ghost btn-square">${icon("x", "size-3.5")}</button></div>` : ""}
      </div>
      <table class="table table-sm mt-3">
        <thead><tr><th class="w-8"><input type="checkbox" class="checkbox checkbox-xs"/></th><th>Contact</th><th>Phone / email</th><th>Profile links</th><th></th></tr></thead>
        <tbody>
          ${rows
            .filter((r) => filter === "all" || (filter === "none" ? r[1] !== "face" : r[1] === "placeholder"))
            .map(([name, kind, detail, links, sel]) => `<tr class="${sel && selection ? "bg-primary/5" : ""}">
              <td><input type="checkbox" class="checkbox checkbox-xs" ${sel && selection ? "checked" : ""}/></td>
              <td><div class="flex items-center gap-3">${avatar(name, kind)}<div><div class="font-medium">${name}</div>${kind === "placeholder" ? placeholderBadge : kind === "none" ? `<div class="text-[11px] text-base-content/50">No photo</div>` : ""}</div></div></td>
              <td class="text-base-content/60">${detail}</td>
              <td><div class="flex flex-wrap gap-1">${links.map(linkChip).join("") || `<span class="text-base-content/40">—</span>`}</div></td>
              <td class="text-right whitespace-nowrap">
                ${kind !== "face" ? `<button class="btn btn-xs btn-ghost">${icon("image-up", "size-3.5")}Add photo</button>` : ""}
                <button class="btn btn-xs btn-ghost btn-square">${icon("ellipsis-vertical", "size-3.5")}</button>
              </td></tr>`).join("")}
        </tbody>
      </table>
      <div class="flex items-center justify-between py-3 text-xs text-base-content/50"><span>Showing 6 of 212</span><span>Sorted by name</span></div>
    </div>`, "flex-1 overflow-hidden")}
  </div>`);

export const contactsList = page(listBody());
export const contactsListDark = page(listBody({ selection: false }), { theme: "scs-dark" });

// Edit drawer over the list: photo, name, numbers, emails, profile links.
const field = (label, value, ic) => `<div class="flex items-center gap-2"><label class="input input-sm flex-1">${icon(ic, "size-4 opacity-50")}<input value="${value}"/></label>
  <select class="select select-sm w-28"><option>${label}</option></select><button class="btn btn-sm btn-ghost btn-square">${icon("x", "size-4")}</button></div>`;

const editBody = shell("contacts", `
  <div class="relative flex-1 overflow-hidden">
    <div class="absolute inset-0 opacity-40 pointer-events-none">${pageHeader("Contacts", "Your Google contacts. Changes are saved to Google right away.")}</div>
    <div class="absolute inset-0 bg-base-content/20"></div>
    <aside class="absolute right-0 top-0 bottom-0 w-[30rem] bg-base-100 border-l border-base-300 shadow-xl flex flex-col">
      <header class="flex items-center gap-3 px-6 py-4 border-b border-base-300">
        <div class="flex-1 font-semibold">Edit contact</div>
        <button class="btn btn-sm btn-ghost">${icon("copy", "size-4")}Duplicate</button>
        <button class="btn btn-sm btn-ghost text-error">${icon("trash-2", "size-4")}Delete</button>
        <button class="btn btn-sm btn-ghost btn-square">${icon("x", "size-4")}</button>
      </header>
      <div class="flex-1 overflow-hidden px-6 py-5 space-y-5">
        <div class="flex items-center gap-4">
          <div class="relative">${face("Davide upload", "size-20")}<span class="absolute -bottom-1 left-1/2 -translate-x-1/2">${placeholderBadge}</span></div>
          <div class="flex-1 space-y-2">
            <div class="flex flex-wrap gap-2">
              <button class="btn btn-sm">${icon("upload", "size-4")}Upload photo</button>
              <button class="btn btn-sm btn-ghost">${icon("trash-2", "size-4")}Remove</button>
            </div>
            <p class="text-xs text-base-content/60">A photo you upload is a placeholder: the next sync replaces it as soon as WhatsApp, Telegram, Gravatar or a profile link has a real one, even in “only contacts without a photo” mode.</p>
          </div>
        </div>
        <div><div class="text-xs font-semibold uppercase tracking-wide text-base-content/50 mb-2">Name</div>
          <div class="grid grid-cols-2 gap-2"><input class="input input-sm" value="Davide"/><input class="input input-sm" value="Gallo"/></div></div>
        <div><div class="text-xs font-semibold uppercase tracking-wide text-base-content/50 mb-2">Phone numbers</div>
          <div class="space-y-2">${field("Mobile", "+39 338 555 0412", "phone")}</div>
          <button class="btn btn-xs btn-ghost mt-1">${icon("plus", "size-3.5")}Add number</button></div>
        <div><div class="text-xs font-semibold uppercase tracking-wide text-base-content/50 mb-2">Emails</div>
          <button class="btn btn-xs btn-ghost">${icon("plus", "size-3.5")}Add email</button></div>
        <div><div class="text-xs font-semibold uppercase tracking-wide text-base-content/50 mb-2">Profile links</div>
          <div class="space-y-2">
            <div class="flex items-center gap-2"><label class="input input-sm flex-1">${icon("link", "size-4 opacity-50")}<input value="https://www.instagram.com/davide.gallo/"/></label>
              <button class="btn btn-sm">Find photo</button><button class="btn btn-sm btn-ghost btn-square">${icon("x", "size-4")}</button></div>
            <div class="flex items-center gap-3 rounded-xl border border-base-300 p-3">
              ${face("Davide upload", "size-10")}${icon("arrow-right", "size-4 text-base-content/40")}${face("Davide Gallo", "size-10")}
              <div class="flex-1 text-sm"><div class="font-medium">Found on Instagram</div><div class="text-xs text-base-content/60">Use it instead of the placeholder?</div></div>
              <button class="btn btn-xs btn-primary">${icon("check", "size-3.5")}Use this photo</button>
            </div>
          </div>
          <button class="btn btn-xs btn-ghost mt-1">${icon("plus", "size-3.5")}Add link</button></div>
      </div>
      <footer class="flex items-center gap-2 px-6 py-4 border-t border-base-300">
        <span class="text-xs text-base-content/50 flex-1">Changes go to Google when you press Save.</span>
        <button class="btn btn-sm btn-ghost">Cancel</button><button class="btn btn-sm btn-primary">${icon("check", "size-4")}Save</button>
      </footer>
    </aside>
  </div>`);

export const contactEdit = page(editBody);

// Merge from the selection: the same preview Clean up uses.
export const contactsMerge = page(shell("contacts", `
  <div class="relative flex-1 overflow-hidden">
    <div class="absolute inset-0 opacity-40 pointer-events-none">${pageHeader("Contacts")}</div>
    <div class="absolute inset-0 bg-base-content/20 grid place-items-center">
      <div class="w-[40rem] rounded-box bg-base-100 border border-base-300 shadow-xl p-6">
        <div class="flex items-center gap-3"><div class="flex-1 text-lg font-semibold">Merge 2 contacts</div><button class="btn btn-sm btn-ghost btn-square">${icon("x", "size-4")}</button></div>
        <p class="text-sm text-base-content/60 mt-1">The same merge as Clean up: every number, email and link is kept, and it can be undone from History.</p>
        <div class="mt-5 grid grid-cols-[1fr_auto_1fr] items-center gap-4">
          <div class="space-y-2">
            ${["Francesco Greco", "Francesco G."].map((n, i) => `<label class="flex items-center gap-3 rounded-xl border ${i === 0 ? "border-primary bg-primary/5" : "border-base-300"} p-3">
              <input type="radio" class="radio radio-xs radio-primary" ${i === 0 ? "checked" : ""}/>${initials(n, "size-9", "text-xs")}
              <div class="text-sm"><div class="font-medium">${n}</div><div class="text-xs text-base-content/60">${i === 0 ? "+39 335 •••• 471 · francesco.greco@example.com" : "+39 335 •••• 471 · instagram.com/fra.greco"}</div></div></label>`).join("")}
          </div>
          ${icon("arrow-right", "size-5 text-base-content/40")}
          <div class="rounded-xl border border-base-300 p-4">
            <div class="flex items-center gap-3">${initials("Francesco Greco", "size-10", "text-sm")}<div class="font-semibold">Francesco Greco</div></div>
            <ul class="mt-3 space-y-1.5 text-xs text-base-content/70">
              <li class="flex items-center gap-2">${icon("phone", "size-3.5")}+39 335 •••• 471</li>
              <li class="flex items-center gap-2">${icon("mail", "size-3.5")}francesco.greco@example.com</li>
              <li class="flex items-center gap-2">${icon("link", "size-3.5")}instagram.com/fra.greco</li>
            </ul>
          </div>
        </div>
        <div class="mt-6 flex justify-end gap-2"><button class="btn btn-sm btn-ghost">Cancel</button><button class="btn btn-sm btn-primary">${icon("merge", "size-4")}Merge</button></div>
      </div>
    </div>
  </div>`));

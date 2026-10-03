// Shared building blocks for the Social Contacts Sync mockups.
import { readFileSync } from "fs";

const iconCache = {};
export function icon(name, cls = "size-5") {
  if (!iconCache[name]) {
    const raw = readFileSync(new URL(`./node_modules/lucide-static/icons/${name}.svg`, import.meta.url), "utf8");
    iconCache[name] = raw.replace(/<!--.*?-->\s*/s, "");
  }
  return iconCache[name]
    .replace(/class="[^"]*"/, `class="${cls} shrink-0"`)
    .replace(/\swidth="24"/, "")
    .replace(/\sheight="24"/, "");
}

// Deterministic pseudo-random generator so every render is identical.
export function rng(seed) {
  let s = 0;
  for (const c of String(seed)) s = (s * 31 + c.charCodeAt(0)) >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const skins = ["#f6d7c3", "#eac0a2", "#d9a27e", "#b97b56", "#8d5a3b", "#5e3a26"];
const hairs = ["#2b1b12", "#4a2f1d", "#7a4a26", "#c58b4a", "#e2c27a", "#9a9aa3", "#1c1c22", "#a8442a"];
const bgs = ["#e0e7ff", "#fce7f3", "#dcfce7", "#fef3c7", "#e0f2fe", "#ede9fe", "#ffe4e6", "#ccfbf1", "#f1f5f9", "#fae8ff"];
const shirts = ["#6366f1", "#ec4899", "#14b8a6", "#f59e0b", "#0ea5e9", "#8b5cf6", "#ef4444", "#22c55e", "#334155"];

/** A friendly, clearly synthetic portrait (no real people in mockups). */
export function face(seed, cls = "size-10") {
  const r = rng(seed);
  const pick = (a) => a[Math.floor(r() * a.length)];
  const bg = pick(bgs), skin = pick(skins), hair = pick(hairs), shirt = pick(shirts);
  const style = Math.floor(r() * 4);
  const hairShape = [
    `<path d="M20 27c0-9 5-14 12-14s12 5 12 14c-3-4-7-6-12-6s-9 2-12 6z" fill="${hair}"/>`,
    `<path d="M18 30c0-11 6-17 14-17s14 6 14 17v12c-2-2-3-5-3-9-2-5-6-8-11-8s-9 3-11 8c0 4-1 7-3 9z" fill="${hair}"/>`,
    `<circle cx="32" cy="12" r="6" fill="${hair}"/><path d="M20 27c0-9 5-14 12-14s12 5 12 14c-3-4-7-6-12-6s-9 2-12 6z" fill="${hair}"/>`,
    `<path d="M21 25c1-7 5-11 11-11s10 4 11 11c-4-2-7-3-11-3s-7 1-11 3z" fill="${hair}"/>`,
  ][style];
  const glasses = r() > 0.75
    ? `<g fill="none" stroke="#1f2937" stroke-width="1.4"><circle cx="27.5" cy="30" r="3.6"/><circle cx="36.5" cy="30" r="3.6"/><path d="M31 30h2"/></g>`
    : "";
  return `<svg viewBox="0 0 64 64" class="${cls} rounded-full shrink-0" aria-hidden="true">
    <rect width="64" height="64" fill="${bg}"/>
    <path d="M10 64c2-12 11-18 22-18s20 6 22 18z" fill="${shirt}"/>
    <rect x="28" y="38" width="8" height="9" rx="3" fill="${skin}"/>
    <ellipse cx="32" cy="29" rx="11" ry="12.5" fill="${skin}"/>
    ${hairShape}
    <circle cx="27.5" cy="30" r="1.3" fill="#1f2937"/><circle cx="36.5" cy="30" r="1.3" fill="#1f2937"/>
    <path d="M28.5 35.5c2 1.6 5 1.6 7 0" stroke="#9a3412" stroke-width="1.3" fill="none" stroke-linecap="round"/>
    ${glasses}
  </svg>`;
}

/** Initials placeholder, i.e. what Google shows for a contact without a photo. */
export function initials(name, cls = "size-10", text = "text-sm") {
  const r = rng(name);
  const colors = ["bg-orange-500", "bg-sky-600", "bg-emerald-600", "bg-rose-500", "bg-violet-600", "bg-amber-600", "bg-teal-600"];
  const c = colors[Math.floor(r() * colors.length)];
  const letters = name.split(" ").map((p) => p[0]).slice(0, 1).join("");
  return `<div class="${cls} ${c} rounded-full grid place-items-center text-white font-semibold ${text} shrink-0">${letters}</div>`;
}

export const sources = {
  whatsapp: { name: "WhatsApp", color: "#25D366", icon: "phone" },
  telegram: { name: "Telegram", color: "#2AABEE", icon: "send" },
  gravatar: { name: "Gravatar", color: "#1E6FD9", icon: "at-sign" },
};

export function sourceMark(id, cls = "size-9", iconCls = "size-5") {
  const s = sources[id];
  return `<div class="${cls} rounded-xl grid place-items-center text-white shrink-0" style="background:${s.color}">${icon(s.icon, iconCls)}</div>`;
}

export function sourceBadge(id) {
  const s = sources[id];
  return `<span class="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full" style="background:${s.color}1f;color:${s.color === "#25D366" ? "#1d9e55" : s.color}">${icon(s.icon, "size-3")}${s.name}</span>`;
}

export function googleMark(cls = "size-9") {
  return `<div class="${cls} rounded-xl grid place-items-center bg-base-100 border border-base-300 shrink-0">
    <svg viewBox="0 0 48 48" class="size-5"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.6 5.4 2.6 13.2l7.8 6c1.9-5.6 7.2-9.7 13.6-9.7z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4 7.1-10 7.1-17.5z"/><path fill="#FBBC05" d="M10.4 28.8c-.5-1.4-.8-3-.8-4.8s.3-3.3.8-4.8l-7.8-6C1 16.4 0 20.1 0 24s1 7.6 2.6 10.8l7.8-6z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.8 2.3-8.4 2.3-6.4 0-11.7-4.1-13.6-9.7l-7.8 6C6.6 42.6 14.6 48 24 48z"/></svg>
  </div>`;
}

/** The app logo: a contact card whose face is being filled in. */
export function logo(cls = "size-9") {
  return `<svg viewBox="0 0 40 40" class="${cls} shrink-0" aria-label="Social Contacts Sync">
    <defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6d5dfc"/><stop offset="1" stop-color="#ec4899"/></linearGradient></defs>
    <rect width="40" height="40" rx="11" fill="url(#lg)"/>
    <circle cx="20" cy="16" r="6" fill="#fff"/>
    <path d="M9.5 31c1.4-5.2 5.6-8 10.5-8s9.1 2.8 10.5 8" fill="#fff"/>
    <circle cx="30" cy="10" r="5" fill="#fff"/>
    <path d="M27.8 10.2l1.6 1.6 3-3.2" stroke="#6d5dfc" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}

/** A QR-looking pattern (not decodable). */
export function fakeQr(seed, size = 200) {
  const r = rng(seed);
  const n = 29, cell = size / n;
  let rects = "";
  const finder = (x, y) =>
    `<rect x="${x * cell}" y="${y * cell}" width="${7 * cell}" height="${7 * cell}" fill="#111"/>` +
    `<rect x="${(x + 1) * cell}" y="${(y + 1) * cell}" width="${5 * cell}" height="${5 * cell}" fill="#fff"/>` +
    `<rect x="${(x + 2) * cell}" y="${(y + 2) * cell}" width="${3 * cell}" height="${3 * cell}" fill="#111"/>`;
  const inFinder = (x, y) => (x < 8 && y < 8) || (x > n - 9 && y < 8) || (x < 8 && y > n - 9);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++)
      if (!inFinder(x, y) && r() > 0.52) rects += `<rect x="${x * cell}" y="${y * cell}" width="${cell + 0.3}" height="${cell + 0.3}" fill="#111"/>`;
  return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" class="bg-white">${rects}${finder(0, 0)}${finder(n - 7, 0)}${finder(0, n - 7)}</svg>`;
}

export const people = [
  "Giulia Bianchi", "Marco Rossi", "Sofia Esposito", "Luca Romano", "Chiara Colombo", "Alessandro Ricci",
  "Martina Marino", "Francesco Greco", "Sara Bruno", "Davide Gallo", "Elena Conti", "Matteo De Luca",
  "Anna Costa", "Lorenzo Giordano", "Valentina Mancini", "Andrea Rizzo", "Federica Lombardi", "Simone Moretti",
  "Noah Fischer", "Emma Wilson", "Lucas Martin", "Mia Schneider", "Hugo Lefèvre", "Zoe Clark",
];

const nav = [
  ["dashboard", "Dashboard", "layout-dashboard"],
  ["sync", "Sync photos", "refresh-cw"],
  ["cleanup", "Clean up", "sparkles"],
  ["history", "History", "history"],
  ["settings", "Settings", "settings"],
];

/** Desktop shell: sidebar navigation + content area. */
export function shell(active, content, { badge } = {}) {
  const items = nav
    .map(([id, label, ic]) => {
      const on = id === active;
      return `<a class="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium ${on ? "bg-primary/10 text-primary" : "text-base-content/70 hover:bg-base-200"}">
        ${icon(ic, "size-[18px]")}<span class="flex-1">${label}</span>
        ${id === "cleanup" && badge ? `<span class="badge badge-sm badge-secondary font-semibold">${badge}</span>` : ""}
      </a>`;
    })
    .join("");
  return `<div class="flex h-screen bg-base-200 text-base-content">
    <aside class="w-60 bg-base-100 border-r border-base-300 flex flex-col p-4 gap-1">
      <div class="flex items-center gap-2.5 px-2 pb-5 pt-1">${logo("size-8")}<div class="font-bold text-[15px] leading-tight">Social Contacts<br/>Sync</div></div>
      ${items}
      <div class="flex-1"></div>
      <a class="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-base-content/70">${icon("hand-heart", "size-[18px] text-secondary")}Support the project</a>
      <div class="px-3 pt-3 mt-2 border-t border-base-300 text-xs text-base-content/50 flex justify-between"><span>v1.0.0</span><span class="flex items-center gap-1">${icon("circle-check", "size-3.5 text-success")}Up to date</span></div>
    </aside>
    <main class="flex-1 overflow-hidden flex flex-col">${content}</main>
  </div>`;
}

export function pageHeader(title, subtitle = "", actions = "") {
  return `<header class="px-8 pt-7 pb-5 flex items-end gap-4">
    <div class="flex-1"><h1 class="text-2xl font-bold tracking-tight">${title}</h1>${subtitle ? `<p class="text-sm text-base-content/60 mt-1">${subtitle}</p>` : ""}</div>
    ${actions}
  </header>`;
}

export function card(inner, cls = "") {
  return `<section class="bg-base-100 border border-base-300 rounded-box ${cls}">${inner}</section>`;
}

export function page(body, { theme = "scs-light", title = "Social Contacts Sync" } = {}) {
  return `<!doctype html><html lang="en" data-theme="${theme}"><head><meta charset="utf-8"><title>${title}</title>
  <link rel="stylesheet" href="app.css"></head><body class="antialiased">${body}</body></html>`;
}

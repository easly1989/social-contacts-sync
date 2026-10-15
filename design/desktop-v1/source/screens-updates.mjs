// Updates with feedback (after v1.3): the download's progress in the app,
// a choice when closing the app with an update ready, the installer's own
// progress window, and a small window when the update is done.
import { icon, logo, shell, pageHeader, card, page } from "./kit.mjs";

export const sizes = { updateInstall: [1280, 560] };

function settingsNav(active) {
  return `<nav class="w-52 space-y-1 text-sm">${[["General", "settings"], ["Google account", "key-round"], ["Sources", "link"], ["Data & privacy", "hard-drive"], ["Updates", "package"], ["About", "info"]]
    .map(([l, ic]) => `<a class="flex items-center gap-2.5 px-3 py-2 rounded-lg ${l === active ? "bg-base-100 border border-base-300 font-semibold" : "text-base-content/70"}">${icon(ic, "size-4")}${l}</a>`).join("")}</nav>`;
}

// The sidebar's footer line, replaced in the kit's shell.
const withFooter = (html, footer) =>
  html.replace(/<span>v1\.0\.0<\/span><span class="flex items-center gap-1">.*?Up to date<\/span>/s, `<span>v1.3.0</span>${footer}`);

function updatesPage(status, footer) {
  return withFooter(
    shell("settings", `
  ${pageHeader("Settings")}
  <div class="px-8 pb-8 flex gap-6">
    ${settingsNav("Updates")}
    <div class="flex-1 space-y-5">
      ${card(`<div class="px-6 py-2">
        <div class="flex items-center gap-6 py-4 border-b border-base-300">
          <div class="flex-1"><div class="text-sm font-medium">Version 1.3.0</div><div class="text-xs text-base-content/60 mt-0.5">Windows installer · Updates download by themselves</div></div>
          <button class="btn btn-sm" disabled>${icon("refresh-cw", "size-4")}Check for updates</button>
        </div>
        <div class="py-5 space-y-3">${status}
          <a class="link link-hover inline-block text-sm text-base-content/60">All releases</a>
        </div>
      </div>`)}
    </div>
  </div>`),
    footer
  );
}

// 1. Downloading: progress in Settings and in the sidebar.
export const updatesDownloading = page(
  updatesPage(
    `<div class="flex flex-wrap items-center gap-2 text-sm">${icon("download", "size-4 text-primary")}<span class="font-medium">Downloading version 1.3.1… 46%</span><a class="link link-primary">Release notes</a></div>
     <progress class="progress progress-primary w-full max-w-md h-1.5" value="46" max="100"></progress>
     <p class="text-xs text-base-content/60">You can keep working. When it's done, it's installed when you close the app.</p>`,
    `<span class="flex items-center gap-1 font-medium text-primary">${icon("download", "size-3.5")}1.3.1 · 46%</span>`
  )
);

// 2. Ready: install now, or when closing.
export const updatesReady = page(
  updatesPage(
    `<div class="flex flex-wrap items-center gap-2 text-sm">${icon("circle-arrow-up", "size-4 text-primary")}<span class="font-medium">Version 1.3.1 is ready to install</span><a class="link link-primary">Release notes</a></div>
     <p class="text-xs text-base-content/60">It's installed when you close the app, or now: the app closes, installs it and opens again.</p>
     <button class="btn btn-primary btn-sm">${icon("rotate-cw", "size-4")}Update and restart</button>`,
    `<span class="flex items-center gap-1 font-medium text-primary">${icon("circle-arrow-up", "size-3.5")}1.3.1 ready</span>`
  )
);

// A Windows message box (Electron's dialog.showMessageBox).
function messageBox({ title = "Social Contacts Sync", main, detail, checkbox, buttons, width = "w-[30rem]" }) {
  return `<div class="${width} rounded-lg overflow-hidden shadow-2xl border border-black/20 bg-white text-[13px] text-[#1b1b1b]" style="font-family:'Segoe UI',Inter,system-ui,sans-serif">
    <div class="h-8 flex items-center gap-2 px-3 bg-white border-b border-black/5">${logo("size-4")}<span class="flex-1 text-xs">${title}</span>${icon("x", "size-4 text-black/60")}</div>
    <div class="px-5 pt-4 pb-5 flex gap-3">
      <div class="size-8 rounded-full bg-[#0067c0] text-white grid place-items-center shrink-0">${icon("info", "size-5")}</div>
      <div class="flex-1"><div class="text-[15px] text-[#003e92] leading-snug">${main}</div><div class="mt-2 text-black/80 leading-relaxed">${detail}</div></div>
    </div>
    <div class="bg-[#f3f3f3] border-t border-black/10 px-5 py-3 flex items-center gap-2">
      ${checkbox ? `<label class="flex items-center gap-2 flex-1"><span class="size-4 rounded-[3px] border border-black/50 bg-white"></span>${checkbox}</label>` : `<span class="flex-1"></span>`}
      ${buttons.map((b, i) => `<span class="px-4 py-1 rounded border ${i === 0 ? "border-[#0067c0] bg-[#0067c0] text-white" : "border-black/20 bg-white"}">${b}</span>`).join("")}
    </div>
  </div>`;
}

const appBehind = shell("dashboard", `${pageHeader("Dashboard", "Your contacts at a glance.")}<div class="px-8 grid grid-cols-3 gap-5">${[1, 2, 3].map(() => card(`<div class="h-32"></div>`)).join("")}</div><div class="px-8 pt-5">${card(`<div class="h-64"></div>`)}</div>`);

// 3. Closing the app with an update ready.
export const updateClose = page(`<div class="relative h-screen">${appBehind}
  <div class="absolute inset-0 bg-black/30 grid place-items-center">
    ${messageBox({
      main: "Version 1.3.1 is ready to install",
      detail: "Installing takes about a minute; a small window shows how it's going. If you close without updating, it's offered again next time.",
      checkbox: "Open the app again when it's done",
      buttons: ["Update and close", "Close without updating", "Cancel"],
      width: "w-[40rem]",
    })}
  </div></div>`);

// 4. The installer's own progress window, then the window when it's done.
const desktop = (inner) => `<div class="h-screen grid place-items-center" style="background:linear-gradient(135deg,#9db8d9,#c9d6ea 55%,#e7d9e8)">${inner}</div>`;
const installer = `<div class="w-[26rem] rounded-lg overflow-hidden shadow-2xl border border-black/20 bg-white text-[13px] text-[#1b1b1b]" style="font-family:'Segoe UI',Inter,system-ui,sans-serif">
  <div class="h-8 flex items-center gap-2 px-3 border-b border-black/5">${logo("size-4")}<span class="flex-1 text-xs">Social Contacts Sync Setup</span></div>
  <div class="p-5 flex gap-4 items-center">${logo("size-12")}<div class="flex-1"><div>Installing, please wait…</div><div class="mt-3 h-4 rounded-sm border border-black/20 bg-[#e6e6e6] overflow-hidden"><div class="h-full bg-[#06b025]" style="width:62%"></div></div></div></div>
</div>`;

export const updateInstall = page(`<div class="grid grid-cols-2 h-screen">
  ${desktop(`<div class="text-center space-y-4">${installer}<div class="text-sm text-black/60">While it installs (the installer's own window)</div></div>`)}
  ${desktop(`<div class="text-center space-y-4">${messageBox({
    main: "Social Contacts Sync 1.3.1 is installed",
    detail: "Open the app now?",
    buttons: ["Open the app", "Close"],
    width: "w-[26rem] text-left",
  })}<div class="text-sm text-black/60">When it's done, unless “Open the app again” was ticked</div></div>`)}
</div>`);

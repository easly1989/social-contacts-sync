import { icon, logo, googleMark, sourceMark, fakeQr, face, page } from "./kit.mjs";

const steps = ["Welcome", "Google project", "Sign in", "Sources"];

function stepper(current) {
  return `<ol class="flex items-center gap-2 text-sm">${steps
    .map((s, i) => {
      const done = i < current, on = i === current;
      const dot = done
        ? `<span class="size-6 rounded-full bg-primary text-primary-content grid place-items-center">${icon("check", "size-3.5")}</span>`
        : `<span class="size-6 rounded-full grid place-items-center text-xs font-semibold ${on ? "bg-primary text-primary-content" : "bg-base-300 text-base-content/60"}">${i + 1}</span>`;
      const line = i < steps.length - 1 ? `<span class="w-10 h-px ${done ? "bg-primary" : "bg-base-300"}"></span>` : "";
      return `<li class="flex items-center gap-2 ${on ? "font-semibold" : done ? "text-base-content/80" : "text-base-content/50"}">${dot}${s}${line}</li>`;
    })
    .join("")}</ol>`;
}

function frame(current, inner, footer) {
  return `<div class="min-h-screen bg-base-200 flex flex-col">
    <header class="flex items-center justify-between px-8 py-4">
      <div class="flex items-center gap-2.5">${logo("size-8")}<span class="font-bold">Social Contacts Sync</span></div>
      ${stepper(current)}
      <div class="flex items-center gap-1 text-sm text-base-content/70">${icon("languages", "size-4")} English ${icon("chevron-right", "size-3.5 rotate-90")}</div>
    </header>
    <div class="flex-1 grid place-items-center px-8 pb-8">
      <div class="w-full max-w-[960px] bg-base-100 border border-base-300 rounded-box shadow-sm">
        <div class="px-10 py-8">${inner}</div>
        <div class="px-10 py-5 border-t border-base-300 flex items-center gap-3">${footer}</div>
      </div>
    </div>
  </div>`;
}

export const welcome = page(frame(0, `
  <div class="grid grid-cols-[1.1fr_1fr] gap-12 items-center">
    <div>
      <div class="badge badge-soft badge-primary mb-4">First-time setup · about 5 minutes</div>
      <h1 class="text-4xl font-bold tracking-tight leading-tight">Give every contact<br/>a face.</h1>
      <p class="mt-4 text-base-content/70 text-[15px] leading-relaxed">Social Contacts Sync finds your contacts' profile photos on WhatsApp, Telegram and Gravatar and adds them to Google Contacts, then helps you tidy up duplicates.</p>
      <ul class="mt-7 space-y-4 text-sm">
        <li class="flex gap-3">${icon("lock", "size-5 text-primary mt-0.5")}<div><div class="font-semibold">Private by design</div><div class="text-base-content/60">Runs on your computer with your own Google credentials. Nothing goes through our servers.</div></div></li>
        <li class="flex gap-3">${icon("shield-check", "size-5 text-primary mt-0.5")}<div><div class="font-semibold">Nothing changes without a backup</div><div class="text-base-content/60">Review photos one by one if you like, and undo any sync.</div></div></li>
        <li class="flex gap-3">${icon("sparkles", "size-5 text-primary mt-0.5")}<div><div class="font-semibold">A tidier address book</div><div class="text-base-content/60">Spot duplicates and ambiguous numbers and fix them in a click.</div></div></li>
      </ul>
    </div>
    <div class="rounded-box bg-gradient-to-br from-primary/10 via-base-200 to-secondary/10 border border-base-300 p-6 flex flex-col gap-2.5">
      ${[["Giulia Bianchi","+39 347 120 4507"],["Marco Rossi","+39 333 812 5517"],["Sofia Esposito","+39 340 221 6527"],["Luca Romano","+39 328 309 7537"],["Chiara Colombo","+39 349 418 8547"]].map(([n, num], i) => `
        <div class="flex items-center gap-3 bg-base-100 rounded-xl border border-base-300 px-4 py-2.5 shadow-sm">
          ${i < 3 ? face(n, "size-9") : `<div class="size-9 rounded-full bg-base-300 grid place-items-center text-base-content/50 text-sm font-semibold">${n[0]}</div>`}
          <div class="flex-1 min-w-0"><div class="text-sm font-semibold">${n}</div><div class="text-xs text-base-content/50 whitespace-nowrap">${num}</div></div>
          ${i < 3 ? `<span class="text-xs font-medium text-success flex items-center gap-1 whitespace-nowrap">${icon("circle-check", "size-3.5")}Photo added</span>` : `<span class="text-xs text-base-content/40">Waiting…</span>`}
        </div>`).join("")}
    </div>
  </div>`,
  `<div class="text-xs text-base-content/50 flex-1">Based on <a class="link">WhatsApp Contact Sync</a> by Guy Zylberberg</div>
   <button class="btn btn-primary">Get started ${icon("arrow-right", "size-4")}</button>`));

const guideSteps = [
  ["Create a Google Cloud project", "Any name works, e.g. “Contacts photos”.", "Open Cloud Console", true],
  ["Enable the People API", "This is the API that reads and updates contacts.", "Open API page", true],
  ["Set up the consent screen", "Choose <b>External</b>, add your own email as test user, then press <b>Publish app</b> so you stay signed in (test apps are logged out every 7 days).", "Open consent screen", false],
  ["Create an OAuth client ID", "Application type: <b>Desktop app</b>. Then press <b>Download JSON</b>.", "Open credentials", false],
];

export const google = page(frame(1, `
  <div class="grid grid-cols-[1fr_300px] gap-10">
    <div>
      <h1 class="text-2xl font-bold tracking-tight">Connect your own Google project</h1>
      <p class="mt-2 text-sm text-base-content/70 leading-relaxed">Google requires every app that edits contacts to have its own credentials. Creating yours is free, takes a few minutes and means your data only travels between your computer and Google.</p>
      <ol class="mt-5 space-y-2">
        ${guideSteps.map(([t, d, cta, done], i) => {
          const current = i === 2;
          const mark = done
            ? `<span class="size-6 rounded-full bg-success text-success-content grid place-items-center">${icon("check", "size-3.5")}</span>`
            : `<span class="size-6 rounded-full ${current ? "bg-primary text-primary-content" : "bg-base-300"} grid place-items-center text-xs font-semibold">${i + 1}</span>`;
          if (!current)
            return `<li class="flex items-center gap-3 px-4 py-2.5 rounded-xl border border-base-300 ${done ? "text-base-content/60" : ""}">${mark}<span class="flex-1 text-sm font-medium">${t}</span>${done ? `<span class="text-xs text-success font-medium">Done</span>` : `<span class="text-xs text-base-content/40">${icon("chevron-right", "size-4")}</span>`}</li>`;
          return `<li class="px-4 py-4 rounded-xl border border-primary/40 bg-primary/5">
            <div class="flex items-center gap-3">${mark}<span class="flex-1 text-sm font-semibold">${t}</span><button class="btn btn-sm btn-primary">${cta} ${icon("external-link", "size-3.5")}</button></div>
            <p class="text-sm text-base-content/70 mt-2 ml-9 leading-snug">${d}</p>
            <div class="ml-9 mt-3 flex gap-2"><button class="btn btn-xs">I've done this</button><a class="btn btn-xs btn-ghost">Show me how</a></div>
          </li>`;
        }).join("")}
      </ol>
    </div>
    <div class="flex flex-col gap-4">
      <div class="h-56 rounded-box border-2 border-dashed border-primary/40 bg-primary/5 grid place-items-center text-center p-5">
        <div>
          <div class="size-11 rounded-full bg-primary/15 text-primary grid place-items-center mx-auto">${icon("upload", "size-5")}</div>
          <div class="font-semibold mt-3 text-sm">Drop the downloaded JSON here</div>
          <div class="text-xs text-base-content/60 mt-1 break-all">client_secret_….googleusercontent.com.json</div>
          <button class="btn btn-sm btn-outline btn-primary mt-3">Browse…</button>
        </div>
      </div>
      <div class="text-sm">
        <div class="text-base-content/60 text-xs flex items-center gap-2"><span class="flex-1 h-px bg-base-300"></span>or paste the values<span class="flex-1 h-px bg-base-300"></span></div>
        <label class="block mt-3 text-xs font-medium text-base-content/70">Client ID</label>
        <input class="input input-sm w-full mt-1" placeholder="1234-abc.apps.googleusercontent.com"/>
        <label class="block mt-3 text-xs font-medium text-base-content/70">Client secret</label>
        <input class="input input-sm w-full mt-1" type="password" placeholder="GOCSPX-…"/>
      </div>
    </div>
  </div>`,
  `<button class="btn btn-ghost">${icon("arrow-left", "size-4")} Back</button>
   <a class="link text-sm text-base-content/60 ml-2 flex items-center gap-1">${icon("circle-help", "size-4")}Full guide with screenshots</a>
   <div class="flex-1"></div>
   <span class="text-sm text-base-content/50 mr-2">Waiting for credentials</span>
   <button class="btn btn-primary btn-disabled">Continue ${icon("arrow-right", "size-4")}</button>`));

export const signin = page(frame(2, `
  <div class="max-w-lg mx-auto text-center py-4">
    ${googleMark("size-16 mx-auto rounded-2xl")}
    <h1 class="text-2xl font-bold tracking-tight mt-6">Sign in to Google Contacts</h1>
    <p class="mt-2 text-sm text-base-content/70">Your browser opens Google's sign-in page. Choose the account whose contacts you want to update and allow access to contacts.</p>
    <div class="mt-8 rounded-box border border-success/30 bg-success/5 p-5 flex items-center gap-4 text-left">
      ${face("Carlo", "size-12")}
      <div class="flex-1"><div class="font-semibold">Connected as carlo@example.com</div><div class="text-sm text-base-content/60">1,248 contacts · 774 with a photo</div></div>
      ${icon("circle-check", "size-6 text-success")}
    </div>
    <p class="mt-4 text-xs text-base-content/50">Credentials ✓ verified · The sign-in stays saved on this computer, encrypted.</p>
  </div>`,
  `<button class="btn btn-ghost">${icon("arrow-left", "size-4")} Back</button>
   <button class="btn btn-ghost btn-sm text-base-content/60">Use another account</button>
   <div class="flex-1"></div>
   <button class="btn btn-primary">Continue ${icon("arrow-right", "size-4")}</button>`));

export const signinWaiting = page(frame(2, `
  <div class="max-w-lg mx-auto text-center py-4">
    ${googleMark("size-16 mx-auto rounded-2xl")}
    <h1 class="text-2xl font-bold tracking-tight mt-6">Sign in to Google Contacts</h1>
    <p class="mt-2 text-sm text-base-content/70">Your browser opens Google's sign-in page. Choose the account whose contacts you want to update and allow access to contacts.</p>
    <div class="mt-8 rounded-box border border-base-300 p-6">
      <span class="loading loading-dots loading-md text-primary"></span>
      <div class="font-semibold mt-2">Waiting for you to finish in the browser…</div>
      <div class="text-sm text-base-content/60 mt-1">Seeing “Google hasn't verified this app”? That's expected for your own project: choose <b>Advanced → Go to (your project)</b>.</div>
      <div class="mt-4 flex justify-center gap-2"><button class="btn btn-sm">Open the page again</button><button class="btn btn-sm btn-ghost">Cancel</button></div>
    </div>
  </div>`,
  `<button class="btn btn-ghost">${icon("arrow-left", "size-4")} Back</button><div class="flex-1"></div>
   <button class="btn btn-primary btn-disabled">Continue ${icon("arrow-right", "size-4")}</button>`));

export const sourcesStep = page(frame(3, `
  <h1 class="text-2xl font-bold tracking-tight">Where should photos come from?</h1>
  <p class="mt-2 text-sm text-base-content/70">Connect at least one source. You can change this any time in Settings.</p>
  <div class="mt-6 grid grid-cols-3 gap-4">
    <div class="rounded-box border-2 border-primary/50 p-5 flex flex-col">
      <div class="flex items-center gap-3">${sourceMark("whatsapp")}<div class="flex-1"><div class="font-semibold">WhatsApp</div><div class="text-xs text-base-content/60">Matched by phone number</div></div></div>
      <div class="mt-4 self-center p-2 rounded-xl border border-base-300 bg-white">${fakeQr("wa", 168)}</div>
      <ol class="mt-4 text-xs text-base-content/70 space-y-1 list-decimal list-inside">
        <li>Open WhatsApp on your phone</li><li>Settings → Linked devices → Link a device</li><li>Point the phone at this code</li>
      </ol>
    </div>
    <div class="rounded-box border border-base-300 p-5 flex flex-col">
      <div class="flex items-center gap-3">${sourceMark("telegram")}<div class="flex-1"><div class="font-semibold">Telegram</div><div class="text-xs text-base-content/60">Matched by phone number</div></div></div>
      <div class="mt-5 text-sm text-base-content/70">Sign in with the phone number of your Telegram account. Telegram sends you a login code.</div>
      <label class="mt-4 text-xs font-medium text-base-content/70">Phone number</label>
      <div class="join mt-1"><select class="select select-sm join-item w-24"><option>🇮🇹 +39</option></select><input class="input input-sm join-item flex-1" placeholder="333 123 4567"/></div>
      <div class="flex-1"></div>
      <button class="btn btn-sm mt-4">${icon("send", "size-4")}Send code</button>
    </div>
    <div class="rounded-box border border-success/40 bg-success/5 p-5 flex flex-col">
      <div class="flex items-center gap-3">${sourceMark("gravatar")}<div class="flex-1"><div class="font-semibold">Gravatar</div><div class="text-xs text-base-content/60">Matched by email address</div></div>
        <input type="checkbox" class="toggle toggle-success toggle-sm" checked/></div>
      <div class="mt-5 text-sm text-base-content/70">Public profile pictures linked to your contacts' email addresses. No sign-in needed.</div>
      <div class="flex-1"></div>
      <div class="mt-4 text-sm font-medium text-success flex items-center gap-1.5">${icon("circle-check", "size-4")}Ready</div>
    </div>
  </div>
  <div class="mt-5 text-xs text-base-content/50 flex items-center gap-1.5">${icon("info", "size-3.5")}Instagram, Facebook and X aren't available: they offer no official way to read your contacts' photos.</div>`,
  `<button class="btn btn-ghost">${icon("arrow-left", "size-4")} Back</button><div class="flex-1"></div>
   <span class="text-sm text-base-content/60 mr-2">1 source ready</span>
   <button class="btn btn-primary">Finish setup ${icon("check", "size-4")}</button>`));

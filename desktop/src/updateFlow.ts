import fs from "fs";

/*
  What the user sees around installing an update (issue #63): the choice
  when closing the app with an update ready, and the small window once the
  update is installed. The app is closed while the installer runs, so the
  choice is written to a file the new version reads when it starts.
*/

export type UpdateLanguage = "en" | "it";

export function updateLanguage(lang: string | undefined): UpdateLanguage {
  return lang?.toLowerCase().startsWith("it") ? "it" : "en";
}

const texts = {
  en: {
    readyTitle: "Version {version} is ready to install",
    readyDetail: "Installing takes about a minute; a small window shows how it's going. If you close without updating, it's offered again next time.",
    reopen: "Open the app again when it's done",
    updateAndClose: "Update and close",
    closeWithout: "Close without updating",
    cancel: "Cancel",
    installedTitle: "{product} {version} is installed",
    installedDetail: "Open the app now?",
    open: "Open the app",
    close: "Close",
    downloadedTitle: "{product} {version} is ready",
    downloadedBody: "It's installed when you close the app, or from Settings › Updates.",
  },
  it: {
    readyTitle: "La versione {version} è pronta da installare",
    readyDetail: "L'installazione richiede circa un minuto; una piccola finestra ne mostra l'avanzamento. Se chiudi senza aggiornare, ti verrà riproposta la prossima volta.",
    reopen: "Riapri l'app al termine",
    updateAndClose: "Aggiorna e chiudi",
    closeWithout: "Chiudi senza aggiornare",
    cancel: "Annulla",
    installedTitle: "{product} {version} è installato",
    installedDetail: "Vuoi aprire l'app adesso?",
    open: "Apri l'app",
    close: "Chiudi",
    downloadedTitle: "{product} {version} è pronto",
    downloadedBody: "Viene installato quando chiudi l'app, oppure da Impostazioni › Aggiornamenti.",
  },
};

export type UpdateText = keyof (typeof texts)["en"];

export function updateText(lang: UpdateLanguage, key: UpdateText, values: Record<string, string> = {}): string {
  return texts[lang][key].replace(/\{(\w+)\}/g, (all, name: string) => values[name] ?? all);
}

/** Written just before the installer starts, read by the version it installs. */
export interface PendingUpdate {
  version: string;
  reopen: boolean;
  lang: UpdateLanguage;
}

export function writePendingUpdate(file: string, pending: PendingUpdate): void {
  fs.writeFileSync(file, JSON.stringify(pending));
}

/** Reads and removes the file: it's about this one start only. */
export function takePendingUpdate(file: string): PendingUpdate | undefined {
  let raw: string;
  try {
    raw = fs.readFileSync(file, "utf8");
  } catch {
    return undefined;
  }
  fs.rmSync(file, { force: true });
  try {
    const value = JSON.parse(raw) as Partial<PendingUpdate>;
    if (typeof value.version !== "string") return undefined;
    return { version: value.version, reopen: value.reopen === true, lang: updateLanguage(value.lang) };
  } catch {
    return undefined;
  }
}

/**
 * How this start goes after an update: straight into the app, or first the
 * "is installed" window. A version that isn't the one being installed means
 * the update didn't happen, and the app opens as usual.
 */
export function afterUpdate(pending: PendingUpdate | undefined, currentVersion: string): "open" | "ask" {
  if (!pending || pending.reopen || pending.version !== currentVersion) return "open";
  return "ask";
}

/** The close dialog's buttons, in order; the answer is the clicked index. */
export const closeChoices = ["update", "close", "cancel"] as const;
export type CloseChoice = (typeof closeChoices)[number];

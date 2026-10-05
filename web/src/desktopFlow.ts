import { SessionStatus } from "../../interfaces/api";

/*
  The desktop app's first-run flow (mockups 1.1–1.4 in issue #8):
  Google project → sign in → sources → the app. The web flow keeps its
  own order (WhatsApp first) in main.ts.
*/

export const setupPaths = ["/setup/google", "/setup/signin", "/setup/sources"];

/** The first setup step that still needs doing. */
export function nextDesktopStep(status: SessionStatus): string {
  if (!status.googleConfigured) return "/setup/google";
  if (!status.googleConnected) return "/setup/signin";
  // Saved links count: they reconnect by themselves a few seconds after start.
  if (!status.whatsappConnected && !status.whatsappSaved && !status.telegramConnected && !status.telegramSaved) return "/setup/sources";
  return "/app";
}

/** Where the desktop app opens: the app once set up, otherwise the welcome page. */
export function desktopStart(status: SessionStatus): string {
  return status.desktop && nextDesktopStep(status) === "/app" ? "/app" : "/";
}

/** Where to send a desktop user who asked for `path`, or undefined to allow it. */
export function desktopRedirect(path: string, status: SessionStatus): string | undefined {
  if (path === "/" || path === "/privacy") return undefined;
  if (!status.googleConfigured) return path === "/setup/google" ? undefined : "/setup/google";
  // The web flow's entry points lead into the wizard instead; returning
  // users with everything connected go straight to the options.
  if (["/contribute", "/whatsapp"].includes(path)) return nextDesktopStep(status);
  // WhatsApp's "linked" redirect: stay on the sources step to finish setup.
  if (path === "/gauth") {
    const next = nextDesktopStep(status);
    return next === "/app" ? "/setup/sources" : next;
  }
  if (path === "/setup/sources" && !status.googleConnected) return "/setup/signin";
  // The app needs Google; WhatsApp is one source among others.
  if (path.startsWith("/app") && !status.googleConnected) return nextDesktopStep(status);
  return undefined;
}

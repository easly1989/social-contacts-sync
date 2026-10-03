import { App } from "vue";
import { Router } from "vue-router";
import { createGtag, event } from "vue-gtag";

// Analytics are off unless a Google Analytics tag is configured at build time
// (VITE_GA_TAG_ID), so self-hosted and desktop builds send nothing.
const tagId = import.meta.env.VITE_GA_TAG_ID as string | undefined;

export function installAnalytics(app: App, router: Router): void {
  if (tagId) app.use(createGtag({ tagId, pageTracker: { router } }));
}

export function track(name: string, params: Record<string, unknown> = {}): void {
  if (tagId) event(name, { method: "Google", ...params });
}

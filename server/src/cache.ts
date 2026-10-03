import { LRUCache } from "lru-cache";

import { desktopMode } from "./desktop";

// The desktop app's single session must not expire while the app runs.
export let sessionCache: LRUCache<string, object> = new LRUCache({
  max: 4096,
  ttl: desktopMode ? 0 : 60 * 60 * 1000,
});

export function getFromCache(id: string, key: string): any {
  return sessionCache.get(`${id}-${key}`);
}

export function setInCache(id: string, key: string, value: any): void {
  sessionCache.set(`${id}-${key}`, value);
}

export function deleteFromCache(id: string, key: string): void {
  sessionCache.delete(`${id}-${key}`);
}

import { ContactResult, PhotoPin, RunRecord } from "../../interfaces/api";
import { Base64 } from "./types";

export interface UndoTarget {
  setPhoto(contactId: string, photo: Base64): Promise<void>;
  deletePhoto(contactId: string): Promise<void>;
  /** Removes a profile link the run saved on the contact. */
  removeLink?(contactId: string, url: string): Promise<void>;
  /** After a photo is put back: the source it followed before (null: none; undefined: not recorded, before issue #84). */
  restorePin?(contactId: string, pin: PhotoPin | null | undefined): void;
  /** One entry was undone. */
  afterUndo?(result: ContactResult): void;
}

const undoable = (r: ContactResult) => r.outcome === "added" || r.outcome === "replaced" || r.outcome === "linked";

/**
 * Puts contacts back as they were before `run`: photos it added are removed,
 * photos it replaced are restored with the source they followed, profile
 * links it saved are removed. Returns how many entries were undone.
 * `indexes` limits it to some results; entries already undone are skipped.
 */
export async function undoRun(
  run: RunRecord,
  previousPhoto: (index: number) => Base64 | undefined,
  target: UndoTarget,
  options: { indexes?: number[]; beforeWrite?: () => Promise<void>; onUndone?: () => void } = {}
): Promise<number> {
  let undone = 0;
  const indexes = options.indexes ?? run.results.map((_, i) => i);
  for (const index of indexes) {
    const result = run.results[index];
    if (!result || result.undone || !undoable(result)) continue;
    const previous = result.outcome === "replaced" ? previousPhoto(index) : undefined;
    if (result.outcome === "replaced" && !previous) continue; // nothing to restore
    if (result.outcome !== "linked") {
      await options.beforeWrite?.();
      if (previous) await target.setPhoto(result.contactId, previous);
      else await target.deletePhoto(result.contactId);
      // A pin on the source that sent this photo would bring it back at the next sync (issue #78).
      const pin = result.previousPin;
      target.restorePin?.(result.contactId, pin && pin.source === result.source && pin.matchedBy === result.matchedBy ? null : pin);
    }
    for (const url of [result.addedLink, ...(result.profiles ?? []).filter((p) => p.added).map((p) => p.url)]) if (url) await target.removeLink?.(result.contactId, url);
    result.undone = true;
    target.afterUndo?.(result);
    undone++;
    options.onUndone?.();
  }
  if (run.results.every((r) => r.undone || !undoable(r))) run.undone = true;
  return undone;
}

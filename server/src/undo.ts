import { RunRecord } from "../../interfaces/api";
import { Base64 } from "./types";

export interface UndoTarget {
  setPhoto(contactId: string, photo: Base64): Promise<void>;
  deletePhoto(contactId: string): Promise<void>;
  /** Removes a profile link the run saved on the contact. */
  removeLink?(contactId: string, url: string): Promise<void>;
}

/**
 * Puts contacts back as they were before `run`: photos it added are removed,
 * photos it replaced are restored. Returns how many entries were undone.
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
    if (!result || result.undone || (result.outcome !== "added" && result.outcome !== "replaced")) continue;
    const previous = result.outcome === "replaced" ? previousPhoto(index) : undefined;
    if (result.outcome === "replaced" && !previous) continue; // nothing to restore
    await options.beforeWrite?.();
    if (previous) await target.setPhoto(result.contactId, previous);
    else await target.deletePhoto(result.contactId);
    if (result.addedLink) await target.removeLink?.(result.contactId, result.addedLink);
    result.undone = true;
    undone++;
    options.onUndone?.();
  }
  if (run.results.every((r) => r.undone || (r.outcome !== "added" && r.outcome !== "replaced"))) run.undone = true;
  return undone;
}

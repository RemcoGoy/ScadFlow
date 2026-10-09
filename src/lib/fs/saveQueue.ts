import { workspace } from "@/lib/fs/workspace";
import { useScadStore } from "@/store/scadStore";

// Debounced writes of editor/customizer content to OPFS, shared by every component
// so a render can always flush pending edits first.

const SAVE_DELAY_MS = 500;

const pending = new Map<string, string>();
// Last content known to be on disk (or queued for it), per path
const lastSaved = new Map<string, string>();
let timer: ReturnType<typeof setTimeout> | undefined;
let chain: Promise<void> = Promise.resolve();

/** Record content that was just read from disk, so it isn't written back unchanged. */
export function markSaved(path: string, code: string) {
  lastSaved.set(path, code);
}

export function queueSave(path: string, code: string) {
  if (lastSaved.get(path) === code) return;
  lastSaved.set(path, code);
  pending.set(path, code);
  clearTimeout(timer);
  timer = setTimeout(flushSaves, SAVE_DELAY_MS);
}

/** Write all pending edits now. Resolves once they (and earlier writes) are on disk. */
export function flushSaves(): Promise<void> {
  clearTimeout(timer);
  const writes = [...pending];
  pending.clear();
  if (writes.length > 0) {
    // Chain writes so two saves never write the same file concurrently
    chain = chain.then(async () => {
      for (const [path, code] of writes) {
        try {
          await workspace.writeFile(path, code);
        } catch (e) {
          console.error(`Failed to save file ${path}:`, e);
        }
      }
      useScadStore.getState().bumpFsVersion();
    });
  }
  return chain;
}

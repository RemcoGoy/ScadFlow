import { opfs } from "@/lib/fs/opfs";
import { flushSaves, markSaved } from "@/lib/fs/saveQueue";
import { useScadStore, type FileItem } from "@/store/scadStore";

// Two-way sync between the OPFS workspace and a folder on disk (Chromium only).
// Every workspace change is mirrored to disk right away (see workspace.ts), and disk
// changes made by other programs are pulled in whenever the app regains focus.

// OPFS top-level entries that belong to the app rather than the user's project
export const INTERNAL_NAMES = new Set(["libraries", "tmp", "locale", "lost+found"]);

type Entry = { kind: "file"; lastModified: number; size: number } | { kind: "dir" };

let rootHandle: FileSystemDirectoryHandle | null = null;
let connected = false;
// Disk lastModified per path as of the last sync (-1 for directories), to tell
// changes made on disk apart from changes made in the app
const snapshot = new Map<string, number>();
// Serialize all disk operations
let chain: Promise<unknown> = Promise.resolve();

function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const next = chain.then(fn, fn);
  chain = next.catch(() => undefined);
  return next;
}

function logError(message: string, err: unknown) {
  console.error(message, err);
  useScadStore
    .getState()
    .addLog(`${message}: ${err instanceof Error ? err.message : String(err)}`, "error");
}

// ---- IndexedDB persistence of the directory handle ----

function idb<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open("scadflow", 1);
    open.onupgradeneeded = () => open.result.createObjectStore("handles");
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction("handles", mode);
      const req = fn(tx.objectStore("handles"));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      tx.oncomplete = () => db.close();
    };
  });
}

const HANDLE_KEY = "linkedFolder";

// ---- Disk helpers ----

const splitPath = (path: string) => path.split("/").filter(Boolean);

async function diskDir(path: string, create = false): Promise<FileSystemDirectoryHandle> {
  let dir = rootHandle!;
  for (const part of splitPath(path)) {
    dir = await dir.getDirectoryHandle(part, { create });
  }
  return dir;
}

async function diskParentAndName(path: string, create = false) {
  const parts = splitPath(path);
  const name = parts.pop()!;
  return { parent: await diskDir(parts.join("/"), create), name };
}

async function writeDiskFile(path: string, content: string | ArrayBuffer | Uint8Array | Blob) {
  const { parent, name } = await diskParentAndName(path, true);
  const fileHandle = await parent.getFileHandle(name, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(content as any);
  await writable.close();
  snapshot.set(path, (await fileHandle.getFile()).lastModified);
}

async function removeDiskEntry(path: string) {
  try {
    const { parent, name } = await diskParentAndName(path);
    await parent.removeEntry(name, { recursive: true });
  } catch (err: any) {
    if (err?.name !== "NotFoundError") throw err;
  }
  for (const known of [...snapshot.keys()]) {
    if (known === path || known.startsWith(`${path}/`)) snapshot.delete(known);
  }
}

// Copy an OPFS file or directory tree to the same path on disk
async function pushToDisk(path: string) {
  const parentPath = path.split("/").slice(0, -1).join("/") || "/";
  const name = splitPath(path).pop();
  const siblings = await opfs.readdirTree(parentPath);
  const node = siblings.find((n) => n.name === name);
  if (!node) return;

  const push = async (n: FileItem) => {
    if (n.isDir) {
      await diskDir(n.path, true);
      snapshot.set(n.path, -1);
      for (const child of n.children ?? []) await push(child);
    } else {
      await writeDiskFile(n.path, await opfs.readFileBuffer(n.path));
    }
  };
  await push(node);
}

async function walkDisk(): Promise<Map<string, Entry>> {
  const entries = new Map<string, Entry>();
  const walk = async (dir: FileSystemDirectoryHandle, base: string) => {
    // @ts-expect-error (values() exists on FileSystemDirectoryHandle in modern browsers)
    for await (const entry of dir.values()) {
      if (entry.name.startsWith(".")) continue; // skip .git and other hidden files
      const path = `${base}/${entry.name}`;
      if (entry.kind === "directory") {
        entries.set(path, { kind: "dir" });
        await walk(entry as FileSystemDirectoryHandle, path);
      } else {
        const file = await (entry as FileSystemFileHandle).getFile();
        entries.set(path, { kind: "file", lastModified: file.lastModified, size: file.size });
      }
    }
  };
  await walk(rootHandle!, "");
  return entries;
}

async function walkWorkspace(): Promise<Map<string, Entry>> {
  const entries = new Map<string, Entry>();
  const walk = (nodes: FileItem[], topLevel: boolean) => {
    for (const node of nodes) {
      if (node.name.startsWith(".") || (topLevel && INTERNAL_NAMES.has(node.name))) continue;
      if (node.isDir) {
        entries.set(node.path, { kind: "dir" });
        walk(node.children ?? [], false);
      } else {
        entries.set(node.path, {
          kind: "file",
          lastModified: node.lastModified ?? 0,
          size: node.size ?? 0,
        });
      }
    }
  };
  walk(await opfs.readdirTree("/"), true);
  return entries;
}

async function sameContent(path: string): Promise<boolean> {
  const { parent, name } = await diskParentAndName(path);
  const diskBytes = new Uint8Array(
    await (await (await parent.getFileHandle(name)).getFile()).arrayBuffer(),
  );
  const localBytes = new Uint8Array(await opfs.readFileBuffer(path));
  return diskBytes.length === localBytes.length && diskBytes.every((b, i) => b === localBytes[i]);
}

async function pullFromDisk(path: string) {
  const { parent, name } = await diskParentAndName(path);
  const file = await (await parent.getFileHandle(name)).getFile();
  await opfs.writeFile(path, await file.arrayBuffer());
}

// ---- Reconciliation ----

/**
 * Bring the workspace and the folder in line.
 * - "replace": the workspace becomes an exact copy of the folder (when first linking).
 * - "merge": changes on either side since the last sync are applied to the other side.
 *   Paths without a snapshot (e.g. after a reload) keep whichever version is newer.
 */
async function reconcile(mode: "replace" | "merge") {
  const disk = await walkDisk();
  const local = await walkWorkspace();
  const changedLocally = new Set<string>(); // workspace paths overwritten or removed
  let pulled = 0;
  let pushed = 0;
  let removed = 0;

  if (mode === "replace") {
    for (const [path, entry] of local) {
      if (disk.has(path)) continue;
      // Children of an already removed folder fail harmlessly
      if (entry.kind === "dir") await opfs.rmdir(path).catch(() => undefined);
      else await opfs.unlink(path).catch(() => undefined);
      changedLocally.add(path);
    }
    for (const [path, entry] of disk) {
      if (entry.kind === "dir") await opfs.mkdir(path);
      else await pullFromDisk(path);
      changedLocally.add(path);
    }
  } else {
    for (const path of new Set([...disk.keys(), ...local.keys()])) {
      const d = disk.get(path);
      const l = local.get(path);
      const known = snapshot.get(path);

      if (d && l) {
        if (d.kind === "dir" || l.kind === "dir") continue;
        if (known !== undefined) {
          // Workspace edits are mirrored immediately, so only disk can be newer here
          if (d.lastModified !== known) {
            await pullFromDisk(path);
            changedLocally.add(path);
            pulled++;
          }
        } else if (!(d.size === l.size && (await sameContent(path)))) {
          if (d.lastModified >= l.lastModified) {
            await pullFromDisk(path);
            changedLocally.add(path);
            pulled++;
          } else {
            await pushToDisk(path);
            pushed++;
          }
        }
      } else if (d) {
        // New on disk
        if (d.kind === "dir") await opfs.mkdir(path);
        else await pullFromDisk(path);
        changedLocally.add(path);
        pulled++;
      } else if (l) {
        if (known !== undefined) {
          // Deleted on disk since the last sync
          if (l.kind === "dir") await opfs.rmdir(path).catch(() => undefined);
          else await opfs.unlink(path).catch(() => undefined);
          changedLocally.add(path);
          removed++;
        } else {
          // Created in the app while the folder wasn't connected
          await pushToDisk(path);
          pushed++;
        }
      }
    }
  }

  // Record the disk state we are now in sync with
  snapshot.clear();
  for (const [path, entry] of await walkDisk()) {
    snapshot.set(path, entry.kind === "file" ? entry.lastModified : -1);
  }

  if (mode === "merge" && pulled + pushed + removed > 0) {
    useScadStore
      .getState()
      .addLog(
        `Synced with folder "${rootHandle!.name}": ${pulled} pulled, ${pushed} pushed, ${removed} removed`,
        "info",
      );
  }
  return changedLocally;
}

// Update the editor and tabs after the workspace was changed underneath them
async function applyLocalChanges(changed: Set<string>) {
  const state = useScadStore.getState();
  for (const path of state.openFiles) {
    if (changed.has(path) && !(await opfs.exists(path))) state.closeFile(path);
  }
  const { codeFilePath, loadFile } = useScadStore.getState();
  if (codeFilePath && changed.has(codeFilePath) && (await opfs.exists(codeFilePath))) {
    const content = await opfs.readFile(codeFilePath);
    markSaved(codeFilePath, content);
    loadFile(codeFilePath, content);
  }
  window.dispatchEvent(new Event("fs-update"));
}

async function syncNow(mode: "replace" | "merge" = "merge") {
  if (!connected || !rootHandle) return;
  await flushSaves();
  try {
    const changed = await enqueue(() => reconcile(mode));
    await applyLocalChanges(changed);
  } catch (err) {
    logError(`Failed to sync with folder "${rootHandle.name}"`, err);
  }
}

let watching = false;
function watchForDiskChanges() {
  if (watching) return;
  watching = true;
  const onFocus = () => {
    if (document.visibilityState === "visible") syncNow();
  };
  window.addEventListener("focus", onFocus);
  document.addEventListener("visibilitychange", onFocus);
}

function setConnected(handle: FileSystemDirectoryHandle, isConnected: boolean) {
  rootHandle = handle;
  connected = isConnected;
  useScadStore.getState().setLinkedFolder({ name: handle.name, connected: isConnected });
  if (isConnected) watchForDiskChanges();
}

// Pick a main file that exists after the workspace was replaced
async function ensureMainFile() {
  const state = useScadStore.getState();
  if (await opfs.exists(state.mainFilePath)) return;
  const scadFiles = [...(await walkWorkspace())]
    .filter(([path, e]) => e.kind === "file" && path.endsWith(".scad"))
    .map(([path]) => path)
    .sort((a, b) => a.split("/").length - b.split("/").length || a.localeCompare(b));
  const main = scadFiles.find((p) => p.endsWith("/main.scad")) ?? scadFiles[0];
  if (main) {
    state.setMainFilePath(main);
    state.openFile(main);
  }
}

// ---- Public API ----

export const isLinkingSupported = typeof window !== "undefined" && "showDirectoryPicker" in window;

/** Let the user pick a folder; the workspace is replaced by its contents and kept in sync. */
export async function linkFolder(): Promise<void> {
  const handle: FileSystemDirectoryHandle = await (window as any).showDirectoryPicker({
    mode: "readwrite",
  });
  if ((await walkWorkspace()).size > 0) {
    const ok = confirm(
      `Link "${handle.name}"?\n\nThe current workspace will be replaced by the contents of this folder. Use Backup ZIP first if you want to keep it.`,
    );
    if (!ok) return;
  }
  await flushSaves();
  await idb("readwrite", (store) => store.put(handle, HANDLE_KEY));
  snapshot.clear();
  setConnected(handle, true);
  await syncNow("replace");
  await ensureMainFile();
}

/** Restore the link from a previous session. Reconnecting may need a user gesture. */
export async function restoreLinkedFolder(): Promise<void> {
  if (!isLinkingSupported) return;
  try {
    const handle = await idb<FileSystemDirectoryHandle | undefined>("readonly", (store) =>
      store.get(HANDLE_KEY),
    );
    if (!handle) return;
    const permission = await (handle as any).queryPermission({ mode: "readwrite" });
    setConnected(handle, permission === "granted");
    await syncNow();
  } catch (err) {
    console.error("Failed to restore linked folder:", err);
  }
}

/** Ask for permission again after a reload (must be called from a click). */
export async function reconnectFolder(): Promise<void> {
  if (!rootHandle) return;
  const permission = await (rootHandle as any).requestPermission({ mode: "readwrite" });
  setConnected(rootHandle, permission === "granted");
  await syncNow();
}

/** Stop syncing; the workspace keeps its current contents. */
export async function unlinkFolder(): Promise<void> {
  await idb("readwrite", (store) => store.delete(HANDLE_KEY));
  rootHandle = null;
  connected = false;
  snapshot.clear();
  useScadStore.getState().setLinkedFolder(null);
}

export { syncNow as syncLinkedFolder };

// ---- Mirroring of workspace changes (used by workspace.ts) ----

function mirror(description: string, fn: () => Promise<void>): Promise<void> {
  if (!connected || !rootHandle) return Promise.resolve();
  return enqueue(fn).catch((err) => logError(`Failed to ${description} in linked folder`, err));
}

export const linkedMirror = {
  writeFile: (path: string, content: string | ArrayBuffer | Uint8Array | Blob) =>
    mirror(`write ${path}`, () => writeDiskFile(path, content)),
  mkdir: (path: string) =>
    mirror(`create ${path}`, async () => {
      await diskDir(path, true);
      snapshot.set(path, -1);
    }),
  remove: (path: string) => mirror(`delete ${path}`, () => removeDiskEntry(path)),
  rename: (oldPath: string, newPath: string) =>
    mirror(`move ${oldPath}`, async () => {
      // The workspace already holds the moved item; copy it over, then drop the old one
      await pushToDisk(newPath);
      await removeDiskEntry(oldPath);
    }),
};

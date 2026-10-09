// In-memory implementation of the File System Access handles used by opfs.ts and
// linkedFolder.ts, so the same fake can stand in for OPFS and for a folder on disk.

// Monotonic clock so every write gets a distinct lastModified
let clock = 1_000;

const domError = (name: string, message: string) => new DOMException(message, name);

async function toBytes(chunk: unknown): Promise<Uint8Array> {
  if (typeof chunk === "string") return new TextEncoder().encode(chunk);
  if (chunk instanceof Uint8Array) return new Uint8Array(chunk);
  if (chunk instanceof ArrayBuffer) return new Uint8Array(chunk.slice(0));
  if (chunk instanceof Blob) return new Uint8Array(await chunk.arrayBuffer());
  throw new TypeError(`Unsupported chunk: ${String(chunk)}`);
}

export class MemoryFileHandle {
  readonly kind = "file";
  data = new Uint8Array();
  lastModified = clock++;

  constructor(public name: string) {}

  async getFile(): Promise<File> {
    return new File([this.data], this.name, { lastModified: this.lastModified });
  }

  async createWritable() {
    const chunks: unknown[] = [];
    return {
      write: async (chunk: unknown) => {
        chunks.push(chunk);
      },
      close: async () => {
        const parts = await Promise.all(chunks.map(toBytes));
        const data = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
        let offset = 0;
        for (const part of parts) {
          data.set(part, offset);
          offset += part.length;
        }
        this.data = data;
        this.lastModified = clock++;
      },
    };
  }
}

export class MemoryDirectoryHandle {
  readonly kind = "directory";
  entries = new Map<string, MemoryDirectoryHandle | MemoryFileHandle>();
  permission: PermissionState = "granted";

  constructor(public name: string) {}

  async getDirectoryHandle(name: string, { create = false } = {}) {
    let entry = this.entries.get(name);
    if (!entry) {
      if (!create) throw domError("NotFoundError", `${name} not found`);
      entry = new MemoryDirectoryHandle(name);
      this.entries.set(name, entry);
    }
    if (entry.kind !== "directory") throw domError("TypeMismatchError", `${name} is a file`);
    return entry;
  }

  async getFileHandle(name: string, { create = false } = {}) {
    let entry = this.entries.get(name);
    if (!entry) {
      if (!create) throw domError("NotFoundError", `${name} not found`);
      entry = new MemoryFileHandle(name);
      this.entries.set(name, entry);
    }
    if (entry.kind !== "file") throw domError("TypeMismatchError", `${name} is a directory`);
    return entry;
  }

  async removeEntry(name: string, { recursive = false } = {}) {
    const entry = this.entries.get(name);
    if (!entry) throw domError("NotFoundError", `${name} not found`);
    if (entry.kind === "directory" && entry.entries.size > 0 && !recursive) {
      throw domError("InvalidModificationError", `${name} is not empty`);
    }
    this.entries.delete(name);
  }

  async *values() {
    yield* [...this.entries.values()];
  }

  async queryPermission() {
    return this.permission;
  }

  async requestPermission() {
    this.permission = "granted";
    return this.permission;
  }
}

const parts = (path: string) => path.split("/").filter(Boolean);

/** Create files (and their folders) from a { "/path/file": "content" } map. */
export function writeTree(root: MemoryDirectoryHandle, files: Record<string, string>) {
  for (const [path, content] of Object.entries(files)) {
    const segments = parts(path);
    const name = segments.pop()!;
    let dir = root;
    for (const segment of segments) {
      let next = dir.entries.get(segment);
      if (!next) {
        next = new MemoryDirectoryHandle(segment);
        dir.entries.set(segment, next);
      }
      dir = next as MemoryDirectoryHandle;
    }
    const file = new MemoryFileHandle(name);
    file.data = new TextEncoder().encode(content);
    dir.entries.set(name, file);
  }
}

/** Flatten a directory into a { "/path/file": "content" } map (folders end in "/"). */
export function readTree(root: MemoryDirectoryHandle): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (dir: MemoryDirectoryHandle, base: string) => {
    for (const [name, entry] of dir.entries) {
      const path = `${base}/${name}`;
      if (entry.kind === "directory") {
        if (entry.entries.size === 0) out[`${path}/`] = "";
        walk(entry, path);
      } else {
        out[path] = new TextDecoder().decode(entry.data);
      }
    }
  };
  walk(root, "");
  return out;
}

/** Simulate another program editing a file on disk. */
export function editFile(root: MemoryDirectoryHandle, path: string, content: string) {
  writeTree(root, { [path]: content });
}

/**
 * Minimal IndexedDB that keeps values by reference (real FileSystemHandles are
 * structured-cloneable, these fakes are not). Persists across module reloads as long
 * as the same instance stays installed.
 */
export function createMemoryIndexedDB() {
  const stores = new Map<string, Map<IDBValidKey, unknown>>();

  const request = <T>(fn: () => T) => {
    const req: any = {};
    queueMicrotask(() => {
      req.result = fn();
      req.onsuccess?.();
    });
    return req;
  };

  return {
    open() {
      const db = {
        createObjectStore: (name: string) => stores.set(name, new Map()),
        transaction: (name: string) => {
          const tx: any = {};
          const store = stores.get(name)!;
          tx.objectStore = () => ({
            get: (key: IDBValidKey) => request(() => store.get(key)),
            put: (value: unknown, key: IDBValidKey) =>
              request(() => {
                store.set(key, value);
                return key;
              }),
            delete: (key: IDBValidKey) => request(() => store.delete(key)),
          });
          queueMicrotask(() => queueMicrotask(() => tx.oncomplete?.()));
          return tx;
        },
        close: () => undefined,
      };
      const req: any = { result: db };
      queueMicrotask(() => {
        if (!stores.has("handles")) req.onupgradeneeded?.();
        req.onsuccess?.();
      });
      return req;
    },
  };
}

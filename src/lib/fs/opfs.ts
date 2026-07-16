import { FileItem } from "@/store/scadStore";
export const getParentDir = (path: string) => {
  const d = path.split("/").slice(0, -1).join("/");
  return d === "" ? (path.startsWith("/") ? "/" : ".") : d;
};

/**
 * Resolves a given path to its corresponding FileSystemDirectoryHandle.
 * Automatically creates intermediate directories if createIfMissing is true.
 */
async function resolveDirectory(
  path: string,
  createIfMissing = false,
): Promise<FileSystemDirectoryHandle> {
  let dirHandle = await navigator.storage.getDirectory();
  const parts = path.split("/").filter(Boolean);

  for (const part of parts) {
    dirHandle = await dirHandle.getDirectoryHandle(part, { create: createIfMissing });
  }
  return dirHandle;
}

export const opfs = {
  async readFile(path: string): Promise<string> {
    const parentPath = getParentDir(path);
    const fileName = path.split("/").filter(Boolean).pop();
    if (!fileName) throw new Error("Invalid file path");

    const dirHandle = await resolveDirectory(parentPath);
    const fileHandle = await dirHandle.getFileHandle(fileName);
    const file = await fileHandle.getFile();
    return file.text();
  },

  async readFileBuffer(path: string): Promise<ArrayBuffer> {
    const parentPath = getParentDir(path);
    const fileName = path.split("/").filter(Boolean).pop();
    if (!fileName) throw new Error("Invalid file path");

    const dirHandle = await resolveDirectory(parentPath);
    const fileHandle = await dirHandle.getFileHandle(fileName);
    const file = await fileHandle.getFile();
    return file.arrayBuffer();
  },

  async writeFile(path: string, content: string | ArrayBuffer | Uint8Array | Blob): Promise<void> {
    const parentPath = getParentDir(path);
    const fileName = path.split("/").filter(Boolean).pop();
    if (!fileName) throw new Error("Invalid file path");

    const dirHandle = await resolveDirectory(parentPath, true);
    const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(content as any);
    await writable.close();
  },

  async mkdir(path: string): Promise<void> {
    await resolveDirectory(path, true);
  },

  async rmdir(path: string): Promise<void> {
    const parentPath = getParentDir(path);
    const dirName = path.split("/").filter(Boolean).pop();
    if (!dirName) return;

    const dirHandle = await resolveDirectory(parentPath);
    await dirHandle.removeEntry(dirName, { recursive: true });
  },

  async unlink(path: string): Promise<void> {
    const parentPath = getParentDir(path);
    const fileName = path.split("/").filter(Boolean).pop();
    if (!fileName) return;

    const dirHandle = await resolveDirectory(parentPath);
    await dirHandle.removeEntry(fileName);
  },

  async exists(path: string): Promise<boolean> {
    try {
      if (path === "/" || path === "") return true;
      const parentPath = getParentDir(path);
      const name = path.split("/").filter(Boolean).pop();
      if (!name) return true;

      const dirHandle = await resolveDirectory(parentPath);

      // Check if it's a file
      try {
        await dirHandle.getFileHandle(name);
        return true;
      } catch {
        // Not a file
      }

      // Check if it's a directory
      try {
        await dirHandle.getDirectoryHandle(name);
        return true;
      } catch {
        // Not a directory
      }

      return false;
    } catch {
      return false;
    }
  },

  async readdirTree(path: string = "/"): Promise<FileItem[]> {
    const rootHandle = await resolveDirectory(path);

    async function traverse(
      handle: FileSystemDirectoryHandle,
      currentPath: string,
    ): Promise<FileItem[]> {
      const items: FileItem[] = [];
      // @ts-expect-error (values() exists on FileSystemDirectoryHandle in modern browsers)
      for await (const entry of handle.values()) {
        const fullPath = currentPath === "/" ? `/${entry.name}` : `${currentPath}/${entry.name}`;

        if (entry.kind === "directory") {
          items.push({
            name: entry.name,
            path: fullPath,
            isDir: true,
            children: await traverse(entry as FileSystemDirectoryHandle, fullPath),
          });
        } else {
          const fileHandle = entry as FileSystemFileHandle;
          const file = await fileHandle.getFile();
          items.push({
            name: entry.name,
            path: fullPath,
            isDir: false,
            size: file.size,
            lastModified: file.lastModified,
          });
        }
      }
      return items.sort((a, b) => {
        if (a.isDir && !b.isDir) return -1;
        if (!a.isDir && b.isDir) return 1;
        return a.name.localeCompare(b.name);
      });
    }

    return traverse(rootHandle, path);
  },

  async rename(oldPath: string, newPath: string): Promise<void> {
    const oldParentPath = getParentDir(oldPath);
    const oldName = oldPath.split("/").filter(Boolean).pop();
    if (!oldName) throw new Error("Invalid old path");

    const newParentPath = getParentDir(newPath);
    const newName = newPath.split("/").filter(Boolean).pop();
    if (!newName) throw new Error("Invalid new path");

    const oldDirHandle = await resolveDirectory(oldParentPath);

    // Check if it's a file or directory
    let isDir = false;
    try {
      await oldDirHandle.getDirectoryHandle(oldName);
      isDir = true;
    } catch {
      isDir = false;
    }

    if (isDir) {
      // OPFS doesn't support renaming directories directly yet without Move API
      // We must copy recursively and delete
      throw new Error(
        "Directory renaming not fully supported natively without Move API. Copy required.",
      );
    } else {
      const fileHandle = await oldDirHandle.getFileHandle(oldName);

      // Use Move API if supported (Chrome 114+)
      // @ts-expect-error - move is a valid API on FileSystemFileHandle in Chrome 114+
      if (fileHandle.move) {
        const newDirHandle = await resolveDirectory(newParentPath, true);
        // @ts-expect-error - move is a valid API on FileSystemFileHandle in Chrome 114+
        await fileHandle.move(newDirHandle, newName);
      } else {
        // Fallback: copy and delete
        const file = await fileHandle.getFile();
        const newDirHandle = await resolveDirectory(newParentPath, true);
        const newFileHandle = await newDirHandle.getFileHandle(newName, { create: true });
        const writable = await newFileHandle.createWritable();
        await writable.write(await file.arrayBuffer());
        await writable.close();
        await oldDirHandle.removeEntry(oldName);
      }
    }
  },
};

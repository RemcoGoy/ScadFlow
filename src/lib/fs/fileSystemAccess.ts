import { opfs } from "./opfs";

export const isFileSystemAccessSupported =
  typeof window !== "undefined" && "showDirectoryPicker" in window;

export async function syncDirectoryHandleToOpfs(
  dirHandle: FileSystemDirectoryHandle,
  targetPath = "/",
): Promise<void> {
  // @ts-expect-error - dirHandle.values() is valid in modern browsers but missing in types
  for await (const entry of dirHandle.values()) {
    const entryPath = targetPath === "/" ? `/${entry.name}` : `${targetPath}/${entry.name}`;

    if (entry.kind === "directory") {
      try {
        await opfs.mkdir(entryPath);
      } catch {
        // Directory already exists or error
      }
      await syncDirectoryHandleToOpfs(entry as FileSystemDirectoryHandle, entryPath);
    } else {
      const file = await (entry as FileSystemFileHandle).getFile();
      const arrayBuffer = await file.arrayBuffer();
      await opfs.writeFile(entryPath, arrayBuffer);
    }
  }
}

export async function syncFileToHandle(
  fileHandle: FileSystemFileHandle,
  content: string,
): Promise<void> {
  const writable = await fileHandle.createWritable();
  await writable.write(content);
  await writable.close();
}

/**
 * Fallback for browsers without showDirectoryPicker: import the files from an
 * `<input type="file" webkitdirectory>`. Paths are relative to the picked folder, so
 * its contents land in targetPath, matching syncDirectoryHandleToOpfs.
 */
export async function importFileListToOpfs(files: FileList, targetPath = "/"): Promise<void> {
  const parent = targetPath === "/" ? "" : targetPath;
  for (const file of Array.from(files)) {
    const relativePath = file.webkitRelativePath.split("/").slice(1).join("/") || file.name;
    await opfs.writeFile(`${parent}/${relativePath}`, await file.arrayBuffer());
  }
}

export const isFileSystemAccessSupported =
  typeof window !== "undefined" && "showDirectoryPicker" in window;

export async function syncDirectoryHandleToBrowserFS(
  dirHandle: FileSystemDirectoryHandle,
  bfs: any,
  targetPath = "/",
): Promise<void> {
  const BrowserFSBuffer = (window as any).BrowserFS.BFSRequire("buffer").Buffer;

  for await (const entry of (dirHandle as any).values()) {
    const entryPath = targetPath === "/" ? `/${entry.name}` : `${targetPath}/${entry.name}`;

    if (entry.kind === "directory") {
      try {
        bfs.mkdirSync(entryPath);
      } catch {
        // Directory already exists or error
      }
      await syncDirectoryHandleToBrowserFS(entry, bfs, entryPath);
    } else {
      const file = await (entry as FileSystemFileHandle).getFile();
      const arrayBuffer = await file.arrayBuffer();
      bfs.writeFileSync(entryPath, BrowserFSBuffer.from(arrayBuffer));
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

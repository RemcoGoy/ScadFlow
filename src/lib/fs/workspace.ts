import { opfs } from "@/lib/fs/opfs";
import { linkedMirror } from "@/lib/fs/linkedFolder";

// User-initiated changes to project files: applied to OPFS, then mirrored to the
// linked folder on disk when one is connected. Reads and app-internal writes
// (libraries, imports, syncing) use opfs directly.
export const workspace = {
  async writeFile(path: string, content: string | ArrayBuffer | Uint8Array | Blob) {
    await opfs.writeFile(path, content);
    await linkedMirror.writeFile(path, content);
  },

  async mkdir(path: string) {
    await opfs.mkdir(path);
    await linkedMirror.mkdir(path);
  },

  async rmdir(path: string) {
    await opfs.rmdir(path);
    await linkedMirror.remove(path);
  },

  async unlink(path: string) {
    await opfs.unlink(path);
    await linkedMirror.remove(path);
  },

  async rename(oldPath: string, newPath: string) {
    await opfs.rename(oldPath, newPath);
    await linkedMirror.rename(oldPath, newPath);
  },
};

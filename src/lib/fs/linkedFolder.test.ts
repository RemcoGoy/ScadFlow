import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createMemoryIndexedDB,
  editFile,
  MemoryDirectoryHandle,
  readTree,
  writeTree,
} from "@/test/memoryFs";

// The OPFS root and the folder "on disk", both in memory
let opfsRoot: MemoryDirectoryHandle;
let disk: MemoryDirectoryHandle;

/**
 * Load fresh copies of the modules. Calling this again in the same test simulates a
 * page reload: module state is gone, but OPFS, the disk and IndexedDB persist.
 */
async function load() {
  vi.resetModules();
  const linked = await import("@/lib/fs/linkedFolder");
  const { workspace } = await import("@/lib/fs/workspace");
  const { updateIncludePaths } = await import("@/lib/fs/includePaths");
  const { useScadStore } = await import("@/store/scadStore");
  return { ...linked, workspace, updateIncludePaths, useScadStore };
}

const logs = (store: Awaited<ReturnType<typeof load>>["useScadStore"]) =>
  store.getState().logs.map((log) => log.text);

beforeEach(() => {
  opfsRoot = new MemoryDirectoryHandle("");
  disk = new MemoryDirectoryHandle("project");
  Object.defineProperty(navigator, "storage", {
    value: { getDirectory: async () => opfsRoot },
    configurable: true,
  });
  vi.stubGlobal("indexedDB", createMemoryIndexedDB());
  vi.stubGlobal("showDirectoryPicker", async () => disk);
  vi.stubGlobal(
    "confirm",
    vi.fn(() => true),
  );
  localStorage.clear();
});

describe("linkFolder", () => {
  it("replaces the workspace with the folder contents and keeps the libraries", async () => {
    writeTree(opfsRoot, {
      "/main.scad": "old",
      "/scratch.scad": "x",
      "/libraries/BOSL2/std.scad": "lib",
    });
    writeTree(disk, { "/main.scad": "new", "/parts/a.scad": "a", "/.git/config": "git" });
    const { linkFolder, useScadStore } = await load();

    await linkFolder();

    expect(readTree(opfsRoot)).toEqual({
      "/main.scad": "new",
      "/parts/a.scad": "a",
      "/libraries/BOSL2/std.scad": "lib",
    });
    expect(readTree(disk)).toEqual({
      "/main.scad": "new",
      "/parts/a.scad": "a",
      "/.git/config": "git",
    });
    expect(useScadStore.getState().linkedFolder).toEqual({ name: "project", connected: true });
  });

  it("changes nothing when the user declines replacing the workspace", async () => {
    writeTree(opfsRoot, { "/main.scad": "mine" });
    writeTree(disk, { "/main.scad": "theirs" });
    vi.stubGlobal(
      "confirm",
      vi.fn(() => false),
    );
    const { linkFolder, useScadStore } = await load();

    await linkFolder();

    expect(readTree(opfsRoot)).toEqual({ "/main.scad": "mine" });
    expect(useScadStore.getState().linkedFolder).toBeNull();
  });

  it("picks a main file that exists in the folder, preferring main.scad", async () => {
    writeTree(disk, { "/a.scad": "", "/sub/main.scad": "" });
    const { linkFolder, useScadStore } = await load();
    await linkFolder();
    expect(useScadStore.getState().mainFilePath).toBe("/sub/main.scad");
  });

  it("falls back to the shallowest .scad file", async () => {
    writeTree(disk, { "/src/model.scad": "", "/src/other.scad": "", "/notes.txt": "" });
    const { linkFolder, useScadStore } = await load();
    await linkFolder();
    expect(useScadStore.getState().mainFilePath).toBe("/src/model.scad");
  });
});

describe("mirroring workspace changes", () => {
  it("writes, moves and deletes on disk", async () => {
    const { linkFolder, workspace } = await load();
    await linkFolder();

    await workspace.writeFile("/a.scad", "x");
    await workspace.mkdir("/dir");
    await workspace.rename("/a.scad", "/dir/a.scad");
    await workspace.writeFile("/b.scad", "b");
    await workspace.unlink("/b.scad");
    expect(readTree(disk)).toEqual({ "/dir/a.scad": "x" });

    await workspace.rename("/dir", "/moved");
    expect(readTree(disk)).toEqual({ "/moved/a.scad": "x" });

    await workspace.rmdir("/moved");
    expect(readTree(disk)).toEqual({});
  });

  it("stops after unlinking, also after a reload", async () => {
    const first = await load();
    await first.linkFolder();
    await first.unlinkFolder();
    await first.workspace.writeFile("/a.scad", "x");
    expect(readTree(disk)).toEqual({});
    expect(first.useScadStore.getState().linkedFolder).toBeNull();

    const second = await load();
    await second.restoreLinkedFolder();
    expect(second.useScadStore.getState().linkedFolder).toBeNull();
  });
});

describe("syncing changes made on disk", () => {
  it("pulls edits and new files, and removes files deleted on disk", async () => {
    writeTree(disk, { "/main.scad": "v1", "/old.scad": "o" });
    const { linkFolder, syncLinkedFolder, useScadStore } = await load();
    await linkFolder();

    editFile(disk, "/main.scad", "v2");
    writeTree(disk, { "/new.scad": "n" });
    disk.entries.delete("old.scad");
    await syncLinkedFolder();

    expect(readTree(opfsRoot)).toEqual({ "/main.scad": "v2", "/new.scad": "n" });
    expect(logs(useScadStore)).toContain(
      'Synced with folder "project": 2 pulled, 0 pushed, 1 removed',
    );
  });

  it("does not mistake its own writes for disk changes", async () => {
    writeTree(disk, { "/main.scad": "v1" });
    const { linkFolder, syncLinkedFolder, useScadStore, workspace } = await load();
    await linkFolder();

    await workspace.writeFile("/main.scad", "mine");
    await syncLinkedFolder();

    expect(readTree(disk)).toEqual({ "/main.scad": "mine" });
    expect(readTree(opfsRoot)).toEqual({ "/main.scad": "mine" });
    expect(logs(useScadStore).some((text) => text.startsWith("Synced"))).toBe(false);
  });

  it("reloads the open file and closes tabs of deleted files", async () => {
    writeTree(disk, { "/main.scad": "v1", "/old.scad": "o" });
    const { linkFolder, syncLinkedFolder, useScadStore } = await load();
    await linkFolder();
    useScadStore.getState().openFile("/old.scad");
    useScadStore.getState().openFile("/main.scad");
    useScadStore.getState().loadFile("/main.scad", "v1");

    editFile(disk, "/main.scad", "v2");
    disk.entries.delete("old.scad");
    await syncLinkedFolder();

    const state = useScadStore.getState();
    expect(state.scadCode).toBe("v2");
    expect(state.openFiles).not.toContain("/old.scad");
  });
});

describe("after a reload", () => {
  it("waits for permission, then keeps the newer side of each file without deleting", async () => {
    writeTree(disk, { "/a.scad": "a1", "/b.scad": "b1" });
    const first = await load();
    await first.linkFolder();

    // Reload without permission: edits only reach the workspace
    disk.permission = "prompt";
    const second = await load();
    await second.restoreLinkedFolder();
    expect(second.useScadStore.getState().linkedFolder).toEqual({
      name: "project",
      connected: false,
    });

    await second.workspace.writeFile("/a.scad", "a2-local");
    await second.workspace.writeFile("/local.scad", "l");
    editFile(disk, "/b.scad", "b2-disk");
    writeTree(disk, { "/disk-only.scad": "d" });
    expect(readTree(disk)["/a.scad"]).toBe("a1");

    await second.reconnectFolder();

    const expected = {
      "/a.scad": "a2-local",
      "/b.scad": "b2-disk",
      "/local.scad": "l",
      "/disk-only.scad": "d",
    };
    expect(readTree(disk)).toEqual(expected);
    expect(readTree(opfsRoot)).toEqual(expected);
  });

  it("reconnects automatically when permission is still granted", async () => {
    writeTree(disk, { "/a.scad": "a1" });
    const first = await load();
    await first.linkFolder();

    const second = await load();
    await second.restoreLinkedFolder();
    expect(second.useScadStore.getState().linkedFolder).toEqual({
      name: "project",
      connected: true,
    });
    await second.workspace.writeFile("/a.scad", "a2");
    expect(readTree(disk)).toEqual({ "/a.scad": "a2" });
  });
});

describe("updateIncludePaths", () => {
  it("rewrites includes in the workspace and the linked folder", async () => {
    writeTree(disk, {
      "/main.scad": "use <components/test.scad>\ntest();",
      "/components/test.scad": "",
    });
    const { linkFolder, updateIncludePaths, useScadStore, workspace } = await load();
    await linkFolder();

    await workspace.rename("/components", "/parts");
    const changed = await updateIncludePaths("/components", "/parts");

    expect(changed).toBe(1);
    const expected = "use <parts/test.scad>\ntest();";
    expect(readTree(opfsRoot)["/main.scad"]).toBe(expected);
    expect(readTree(disk)["/main.scad"]).toBe(expected);
    expect(logs(useScadStore)).toContain(
      "Updated include/use paths in 1 file after moving /components",
    );
  });
});

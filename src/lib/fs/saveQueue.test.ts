import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const writeFile = vi.fn<(path: string, content: string) => Promise<void>>();
vi.mock("@/lib/fs/workspace", () => ({ workspace: { writeFile } }));

// saveQueue keeps module-level state, so load a fresh copy for every test
async function loadQueue() {
  vi.resetModules();
  const queue = await import("@/lib/fs/saveQueue");
  const { useScadStore } = await import("@/store/scadStore");
  return { ...queue, useScadStore };
}

describe("saveQueue", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    writeFile.mockReset();
    writeFile.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("debounces edits and writes only the latest content", async () => {
    const { queueSave } = await loadQueue();
    queueSave("/main.scad", "a");
    queueSave("/main.scad", "ab");
    await vi.advanceTimersByTimeAsync(499);
    expect(writeFile).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(writeFile).toHaveBeenCalledTimes(1);
    expect(writeFile).toHaveBeenCalledWith("/main.scad", "ab");
  });

  it("does not write content that was just loaded from disk", async () => {
    const { markSaved, queueSave } = await loadQueue();
    markSaved("/main.scad", "cube(1);");
    queueSave("/main.scad", "cube(1);");
    await vi.advanceTimersByTimeAsync(1000);
    expect(writeFile).not.toHaveBeenCalled();
  });

  it("does not write the same content twice", async () => {
    const { flushSaves, queueSave } = await loadQueue();
    queueSave("/main.scad", "x");
    await flushSaves();
    queueSave("/main.scad", "x");
    await flushSaves();
    expect(writeFile).toHaveBeenCalledTimes(1);
  });

  it("flushSaves writes immediately and resolves once the write is done", async () => {
    let finishWrite!: () => void;
    writeFile.mockReturnValueOnce(new Promise<void>((resolve) => (finishWrite = resolve)));
    const { flushSaves, queueSave } = await loadQueue();

    queueSave("/main.scad", "x");
    let flushed = false;
    const flush = flushSaves().then(() => (flushed = true));
    await vi.advanceTimersByTimeAsync(0);
    expect(writeFile).toHaveBeenCalledWith("/main.scad", "x");
    expect(flushed).toBe(false);

    finishWrite();
    await flush;
    expect(flushed).toBe(true);
  });

  it("keeps pending edits for every file", async () => {
    const { flushSaves, queueSave } = await loadQueue();
    queueSave("/a.scad", "a");
    queueSave("/b.scad", "b");
    await flushSaves();
    expect(writeFile.mock.calls).toEqual([
      ["/a.scad", "a"],
      ["/b.scad", "b"],
    ]);
  });

  it("serializes writes so a later save can't overtake an earlier one", async () => {
    const order: string[] = [];
    let finishFirst!: () => void;
    writeFile.mockImplementationOnce(
      (_path, content) =>
        new Promise<void>((resolve) => {
          finishFirst = () => {
            order.push(content);
            resolve();
          };
        }),
    );
    writeFile.mockImplementation(async (_path, content) => {
      order.push(content);
    });
    const { flushSaves, queueSave } = await loadQueue();

    queueSave("/main.scad", "first");
    const firstFlush = flushSaves();
    queueSave("/main.scad", "second");
    const secondFlush = flushSaves();
    await vi.advanceTimersByTimeAsync(0);
    expect(order).toEqual([]);

    finishFirst();
    await Promise.all([firstFlush, secondFlush]);
    expect(order).toEqual(["first", "second"]);
  });

  it("bumps fsVersion after writing so the main file re-renders", async () => {
    const { flushSaves, queueSave, useScadStore } = await loadQueue();
    const before = useScadStore.getState().fsVersion;
    queueSave("/main.scad", "x");
    await flushSaves();
    expect(useScadStore.getState().fsVersion).toBe(before + 1);
  });

  it("keeps saving after a failed write", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    writeFile.mockRejectedValueOnce(new Error("disk full"));
    const { flushSaves, queueSave } = await loadQueue();
    queueSave("/main.scad", "x");
    await flushSaves();
    queueSave("/main.scad", "y");
    await flushSaves();
    expect(writeFile).toHaveBeenLastCalledWith("/main.scad", "y");
  });
});

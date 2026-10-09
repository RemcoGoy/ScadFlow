/// <reference lib="webworker" />
import OpenSCAD from "@/wasm/openscad.js";
import { parseOff } from "@/lib/io/off";
import { exportGlb } from "@/lib/io/glb";
import { opfs } from "@/lib/fs/opfs";
import type { FileItem } from "@/store/scadStore";
import type { CompileRequest, WorkerMessage } from "./scad.protocol";

// Runs OpenSCAD off the main thread. Keeps one wasm instance with an Emscripten FS
// that mirrors the OPFS workspace, so only changed files are copied per compile.

declare const self: DedicatedWorkerGlobalScope;

const post = (message: WorkerMessage) => self.postMessage(message);

// Id of the compile currently running, so stdout/stderr lines are attributed to it
let currentId = -1;
let sawEmptyObject = false;

const log = (text: string, level: "info" | "error") => {
  if (text.includes("Current top level object is empty")) sawEmptyObject = true;
  post({ type: "log", id: currentId, text, level });
};

// Path -> OPFS lastModified of every file copied into the Emscripten FS
const syncedFiles = new Map<string, number>();

// Mirror the OPFS workspace into the Emscripten FS, copying only changed files
async function syncOpfsToEmscripten(efs: any) {
  const tree = await opfs.readdirTree("/");
  const seen = new Set<string>();

  const traverse = async (nodes: FileItem[]) => {
    for (const node of nodes) {
      if (node.isDir) {
        try {
          efs.mkdir(node.path);
        } catch {
          // directory likely already exists
        }
        await traverse(node.children ?? []);
        continue;
      }

      seen.add(node.path);
      if (node.lastModified !== undefined && syncedFiles.get(node.path) === node.lastModified) {
        continue;
      }
      const buffer = await opfs.readFileBuffer(node.path);
      efs.writeFile(node.path, new Uint8Array(buffer));
      syncedFiles.set(node.path, node.lastModified ?? 0);
    }
  };
  await traverse(tree);

  // Remove files that were deleted or moved in OPFS
  for (const path of syncedFiles.keys()) {
    if (!seen.has(path)) {
      try {
        efs.unlink(path);
      } catch {
        // already gone
      }
      syncedFiles.delete(path);
    }
  }
}

let instancePromise: Promise<any> | null = null;

function getInstance() {
  instancePromise ??= OpenSCAD({
    noInitialRun: true,
    noExitRuntime: true,
    print: (text: string) => log(text, "info"),
    printErr: (text: string) => {
      const isError = /error|failed/i.test(text) && !/warning/i.test(text);
      log(text, isError ? "error" : "info");
    },
  }).then((instance) => {
    instance.FS.chdir("/");
    try {
      instance.FS.mkdir("/locale");
    } catch {
      /* locale directory already exists */
    }
    return instance;
  });
  return instancePromise;
}

async function compile({ id, mainPath, variables }: CompileRequest) {
  currentId = id;
  sawEmptyObject = false;

  const instance = await getInstance();
  await syncOpfsToEmscripten(instance.FS);

  if (!instance.FS.analyzePath(mainPath).exists) {
    return post({ type: "result", id, status: "error", error: `Main file ${mainPath} not found` });
  }

  // Remove the previous output so an empty result doesn't show the last model again
  if (instance.FS.analyzePath("/model.off").exists) {
    instance.FS.unlink("/model.off");
  }

  // Build compilation args with parameter overrides (-D flags)
  const args = [mainPath, "--backend=manifold", "--export-format=off", "-o", "/model.off"];
  for (const v of variables) {
    const value = v.type === "string" ? `"${v.value}"` : String(v.value);
    args.push("-D", `${v.name}=${value}`);
  }

  log(`Compiling with args: ${args.join(" ")}`, "info");
  const startTime = performance.now();
  let exitCode: number;
  try {
    // callMain returns OpenSCAD's exit code instead of throwing on errors
    exitCode = instance.callMain(args);
  } catch (err) {
    console.error("OpenSCAD crashed:", err);
    exitCode = -1;
  }
  const seconds = ((performance.now() - startTime) / 1000).toFixed(2);

  // OpenSCAD exits with an error when the top level object is empty, but that is a
  // valid (empty) model rather than a compile failure
  if (sawEmptyObject) {
    return post({ type: "result", id, status: "empty", seconds });
  }
  if (exitCode !== 0 || !instance.FS.analyzePath("/model.off").exists) {
    return post({ type: "result", id, status: "error", error: "Failed to compile SCAD code" });
  }

  const off = new TextDecoder("utf-8").decode(instance.FS.readFile("/model.off"));
  // Blobs are passed to the main thread by reference, without copying the data
  const glb = await exportGlb(parseOff(off));
  post({ type: "result", id, status: "ok", glb, seconds });
}

self.onmessage = async (e: MessageEvent<CompileRequest>) => {
  try {
    await compile(e.data);
  } catch (err) {
    post({
      type: "result",
      id: e.data.id,
      status: "error",
      error: err instanceof Error ? err.message : String(err),
    });
  }
};

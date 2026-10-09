import { useScadStore, type ParamVariable } from "@/store/scadStore";
import type { CompileRequest, WorkerMessage } from "./scad.protocol";

// Main-thread client for scad.worker.ts. Only the latest request matters: a request
// waiting behind a running compile is replaced by newer ones, and a compile that has
// been running for a while is aborted (by restarting the worker) instead of waited for.

// Restarting the worker means re-initializing wasm and re-syncing the workspace, so
// short compiles are cheaper to let finish
const RESTART_AFTER_MS = 2000;

export class CompileCancelledError extends Error {
  constructor() {
    super("Compilation cancelled");
    this.name = "CompileCancelledError";
  }
}

interface Job {
  request: CompileRequest;
  resolve: (url: string) => void;
  reject: (err: Error) => void;
  startedAt: number;
}

let worker: Worker | null = null;
let nextId = 0;
let running: Job | null = null;
let pending: Job | null = null;

function createWorker() {
  const w = new Worker(new URL("./scad.worker.ts", import.meta.url), { type: "module" });
  w.onmessage = (e: MessageEvent<WorkerMessage>) => handleMessage(e.data);
  w.onerror = (e) => {
    console.error("OpenSCAD worker crashed:", e);
    restartWorker(new Error(`OpenSCAD worker crashed: ${e.message}`));
  };
  return w;
}

function handleMessage(msg: WorkerMessage) {
  // Ignore messages from a job that was cancelled in the meantime
  if (!running || msg.id !== running.request.id) return;
  const { addLog } = useScadStore.getState();

  if (msg.type === "log") {
    addLog(msg.text, msg.level);
    return;
  }

  const job = running;
  running = null;
  if (msg.status === "ok") {
    addLog(`Compilation completed successfully in ${msg.seconds}s`, "info");
    job.resolve(URL.createObjectURL(msg.glb));
  } else if (msg.status === "empty") {
    addLog(`Compilation completed in ${msg.seconds}s (empty model)`, "info");
    job.resolve("");
  } else {
    addLog(`${msg.error}, keeping the previous model`, "error");
    job.reject(new Error(msg.error));
  }
  startNext();
}

function startNext() {
  const store = useScadStore.getState();
  if (!pending) {
    store.setCompiling(false);
    return;
  }
  running = pending;
  pending = null;
  running.startedAt = performance.now();
  store.clearLogs();
  store.setCompiling(true);
  worker ??= createWorker();
  worker.postMessage(running.request);
}

// Abort the running compile; the worker can't be interrupted, so replace it
function restartWorker(reason: Error) {
  worker?.terminate();
  worker = null;
  const job = running;
  running = null;
  job?.reject(reason);
  startNext();
}

/**
 * Compile the given entry file from the workspace (includes resolve relative to it).
 * Resolves with an object URL of the GLB model, or "" for an empty model. Rejects with
 * CompileCancelledError when a newer request supersedes this one.
 */
export function generateModel(mainPath: string, variables: ParamVariable[] = []): Promise<string> {
  return new Promise((resolve, reject) => {
    pending?.reject(new CompileCancelledError());
    pending = {
      request: {
        id: nextId++,
        mainPath,
        variables: variables.map(({ name, value, type }) => ({ name, value, type })),
      },
      resolve,
      reject,
      startedAt: 0,
    };

    if (!running) {
      startNext();
    } else if (performance.now() - running.startedAt > RESTART_AFTER_MS) {
      restartWorker(new CompileCancelledError());
    }
  });
}

/** Stop the running compile and drop any queued one. */
export function cancelCompile() {
  pending?.reject(new CompileCancelledError());
  pending = null;
  if (running) {
    useScadStore.getState().addLog("Compilation cancelled", "info");
    restartWorker(new CompileCancelledError());
  }
}

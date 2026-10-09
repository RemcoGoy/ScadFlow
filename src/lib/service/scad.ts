import OpenSCAD from "@/wasm/openscad.js";
import { parseOff } from "@/lib/io/off";
import { exportGlb } from "@/lib/io/glb";
import { readFileAsDataURL } from "@/lib/utils";
import { useScadStore, type FileItem } from "@/store/scadStore";

import { opfs } from "@/lib/fs/opfs";

// Path -> OPFS lastModified of every file copied into the Emscripten FS
const syncedFiles = new Map<string, number>();

// Mirror the OPFS workspace into the Emscripten FS, copying only changed files
async function syncOpfsToEmscripten(efs: any) {
  try {
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
  } catch (err) {
    console.error("Error synchronizing OPFS to Emscripten FS:", err);
  }
}

let globalScadInstance: any = null;

async function getScadInstance() {
  if (!globalScadInstance) {
    globalScadInstance = await OpenSCAD({
      noInitialRun: true,
      noExitRuntime: true,
      print: (text: string) => {
        console.log("[OpenSCAD WASM stdout]:", text);
        useScadStore.getState().addLog(text, "info");
      },
      printErr: (text: string) => {
        console.error("[OpenSCAD WASM stderr]:", text);
        const isError = /error|failed/i.test(text) && !/warning/i.test(text);
        useScadStore.getState().addLog(text, isError ? "error" : "info");
      },
    });

    globalScadInstance.FS.chdir("/");
    try {
      globalScadInstance.FS.mkdir("/locale");
    } catch {
      /* locale directory already exists or error */
    }
  }

  // Sync workspace files from OPFS to Emscripten FS
  console.log("Synchronizing OPFS files to Emscripten FS...");
  await syncOpfsToEmscripten(globalScadInstance.FS);

  return globalScadInstance;
}

// Compile the given entry file from the workspace; includes resolve relative to it
export async function generateModel(mainPath: string, variables: any[] = []): Promise<string> {
  const store = useScadStore.getState();
  store.setCompiling(true);
  store.clearLogs();

  try {
    const instance = await getScadInstance();

    if (!instance.FS.analyzePath(mainPath).exists) {
      store.addLog(`Main file ${mainPath} not found`, "error");
      throw new Error(`Main file ${mainPath} not found`);
    }

    // Remove the previous output so an empty result doesn't show the last model again
    if (instance.FS.analyzePath("/model.off").exists) {
      instance.FS.unlink("/model.off");
    }

    // Build compilation args with parameters overrides (-D flags)
    const compileArgs = [mainPath, "--backend=manifold", "--export-format=off", "-o", "/model.off"];

    // Append custom parameters from the Customizer Panel if any
    for (const v of variables) {
      let valStr = String(v.value);
      if (v.type === "string") {
        valStr = `"${v.value}"`;
      }
      compileArgs.push("-D", `${v.name}=${valStr}`);
    }

    store.addLog(`Compiling with args: ${compileArgs.join(" ")}`, "info");
    const startTime = performance.now();
    const success = await compileScad(instance, compileArgs);
    const compileTime = ((performance.now() - startTime) / 1000).toFixed(2);

    // OpenSCAD exits with an error when the top level object is empty, but that is a
    // valid (empty) model rather than a compile failure
    const isEmpty = useScadStore
      .getState()
      .logs.some((log) => log.text.includes("Current top level object is empty"));
    if (isEmpty) {
      store.addLog(`Compilation completed in ${compileTime}s (empty model)`, "info");
      return "";
    }

    if (!success || !instance.FS.analyzePath("/model.off").exists) {
      store.addLog("Compilation failed, keeping the previous model", "error");
      throw new Error("Failed to compile SCAD code");
    }

    store.addLog(`Compilation completed successfully in ${compileTime}s`, "info");

    const fileUrl = await convertOffToGlb(instance);
    if (!fileUrl) throw new Error("Failed to convert OFF to GLB");

    return fileUrl;
  } finally {
    store.setCompiling(false);
  }
}

async function compileScad(instance: any, args: string[]) {
  try {
    // callMain returns OpenSCAD's exit code instead of throwing on errors
    const exitCode = await instance.callMain(args);
    return exitCode === 0;
  } catch (error) {
    console.error("Error generating model:", error);
    return false;
  }
}

async function convertOffToGlb(instance: any) {
  try {
    if (!instance.FS.analyzePath("/model.off").exists) {
      console.error("Output file '/model.off' does not exist");
      return;
    }

    const output = instance.FS.readFile("/model.off");
    const decoder = new TextDecoder("utf-8");
    const offFileContent = decoder.decode(output);
    console.log("DEBUG: Raw OFF file content:", JSON.stringify(offFileContent));

    const parsedOutput = parseOff(offFileContent);
    const glbData = await exportGlb(parsedOutput);
    const displayFile = new File([glbData], "model.glb");
    const fileUrl = displayFile && (await readFileAsDataURL(displayFile));

    return fileUrl;
  } catch (error) {
    console.error("Error converting OFF to GLB:", error);
  }
}

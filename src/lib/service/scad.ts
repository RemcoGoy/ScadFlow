import OpenSCAD from "@/wasm/openscad.js";
import { parseOff } from "@/lib/io/off";
import { exportGlb } from "@/lib/io/glb";
import { readFileAsDataURL } from "@/lib/utils";
import { useScadStore } from "@/store/scadStore";

import { opfs } from "@/lib/fs/opfs";

// Sync files recursively from OPFS to Emscripten FS
async function syncOpfsToEmscripten(efs: any, currentPath: string = "/") {
  try {
    if (currentPath === "/tmp" || currentPath === "/locale") return;

    const entries = await opfs.readdirTree(currentPath);
    // Note: readdirTree returns the whole tree recursively if we use it,
    // but in opfs.ts it actually returns {name, path, isDir, children} for the subtree.
    // However, our opfs.readdirTree implementation actually does traverse the whole tree.
    // Let's just iterate over the flat entries or traverse the tree.

    // Helper to traverse the tree nodes
    const traverse = async (nodes: any[]) => {
      for (const node of nodes) {
        if (node.isDir) {
          try {
            efs.mkdir(node.path);
          } catch {
            // directory likely already exists
          }
          if (node.children) {
            await traverse(node.children);
          }
        } else {
          let writeNeeded = true;
          if (node.size !== undefined && node.lastModified !== undefined) {
            try {
              const efsStat = efs.stat(node.path);
              // Simple check: if size matches, we assume it's the same.
              // To be perfectly safe, we also check if mtime matches if we could,
              // but Emscripten sets mtime to current time on write.
              // For OpenSCAD scripts, size check is usually enough to prevent massive redundant copies.
              // We could also store a custom map of OPFS path -> lastModified if we want to be stricter.
              if (efsStat.size === node.size) {
                writeNeeded = false;
              }
            } catch {
              // file doesn't exist in Emscripten FS
            }
          }

          if (writeNeeded) {
            const buffer = await opfs.readFileBuffer(node.path);
            efs.writeFile(node.path, new Uint8Array(buffer));
          }
        }
      }
    };

    await traverse(entries);
  } catch (err) {
    console.error(`Error synchronizing ${currentPath} from OPFS to Emscripten FS:`, err);
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
  await syncOpfsToEmscripten(globalScadInstance.FS, "/");

  return globalScadInstance;
}

export async function generateModel(code: string, variables: any[] = []): Promise<string> {
  const store = useScadStore.getState();
  store.setCompiling(true);
  store.clearLogs();

  try {
    const instance = await getScadInstance();

    // Write current editor contents to virtual input file
    instance.FS.writeFile("/input.scad", code);

    // Build compilation args with parameters overrides (-D flags)
    const compileArgs = [
      "/input.scad",
      "--backend=manifold",
      "--export-format=off",
      "-o",
      "/model.off",
    ];

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

    if (!success) {
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
    await instance.callMain(args);
    return true;
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

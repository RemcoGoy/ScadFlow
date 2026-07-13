import OpenSCAD from "@/wasm/openscad.js";
import { parseOff } from "@/lib/io/off";
import { exportGlb } from "@/lib/io/glb";
import { readFileAsDataURL } from "@/lib/utils";
import { useScadStore } from "@/store/scadStore";

const getBfs = () => {
  const windowObj = (typeof window === "object" ? window : self) as any;
  return windowObj.BrowserFS ? windowObj.BrowserFS.BFSRequire("fs") : null;
};

// Sync files recursively from BrowserFS to Emscripten FS
function syncBrowserFSToEmscripten(bfs: any, efs: any, currentPath: string = "/") {
  try {
    if (currentPath === "/tmp" || currentPath === "/locale") return;

    const entries = bfs.readdirSync(currentPath);
    for (const entry of entries) {
      const fullPath = currentPath === "/" ? `/${entry}` : `${currentPath}/${entry}`;
      const stat = bfs.lstatSync(fullPath);

      if (stat.isDirectory()) {
        try {
          efs.mkdir(fullPath);
        } catch {
          // directory likely already exists
        }
        syncBrowserFSToEmscripten(bfs, efs, fullPath);
      } else {
        let writeNeeded = true;
        try {
          const efsStat = efs.stat(fullPath);
          const bfsStat = bfs.statSync(fullPath);
          if (efsStat.size === bfsStat.size) {
            writeNeeded = false;
          }
        } catch {
          // file doesn't exist in Emscripten FS
        }

        if (writeNeeded) {
          const content = bfs.readFileSync(fullPath);
          efs.writeFile(fullPath, new Uint8Array(content));
        }
      }
    }
  } catch (err) {
    console.error(`Error synchronizing ${currentPath} from BrowserFS to Emscripten FS:`, err);
  }
}

async function getScadInstance() {
  const store = useScadStore.getState();
  const instance = await OpenSCAD({
    noInitialRun: true,
    print: (text: string) => {
      console.log("[OpenSCAD WASM stdout]:", text);
      store.addLog(text, "info");
    },
    printErr: (text: string) => {
      console.error("[OpenSCAD WASM stderr]:", text);
      // OpenSCAD writes all logs, including stats, to stderr.
      // We categorize as error only if the log line contains error/failure indicators.
      const isError = /error|failed/i.test(text) && !/warning/i.test(text);
      store.addLog(text, isError ? "error" : "info");
    },
  });

  instance.FS.chdir("/");
  try {
    instance.FS.mkdir("/locale");
  } catch {
    /* locale directory already exists or error */
  }

  // Sync workspace files from BrowserFS to Emscripten FS
  const bfs = getBfs();
  if (bfs) {
    console.log("Synchronizing BrowserFS files to Emscripten FS...");
    syncBrowserFSToEmscripten(bfs, instance.FS, "/");
  } else {
    console.warn("BrowserFS is not initialized; using standard in-memory workspace.");
  }

  return instance;
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

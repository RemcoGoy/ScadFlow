import OpenSCAD from "@/wasm/openscad.js";
import { parseOff } from "@/lib/io/off";
import { exportGlb } from "@/lib/io/glb";
import { readFileAsDataURL } from "@/lib/utils";

async function compileScad(instance: any) {
  try {
    await instance.callMain([
      "/input.scad",
      "--backend=manifold",
      "--export-format=off",
      "-o",
      "/model.off",
    ]);
    return true;
  } catch (error) {
    console.error("Error generating model:", error);
    return false;
  }
}

async function convertOffToGlb(instance: any) {
  try {
    // Check if the file exists before trying to read it
    if (!instance.FS.analyzePath("/model.off").exists) {
      console.error("Output file '/model.off' does not exist");
      return;
    }

    // Read the output file
    const output = instance.FS.readFile("/model.off");
    const decoder = new TextDecoder("utf-8");
    const offFileContent = decoder.decode(output);

    // Convert off to glb
    const parsedOutput = parseOff(offFileContent);
    const glbData = await exportGlb(parsedOutput);
    const displayFile = new File([glbData], "model.glb");
    const fileUrl = displayFile && (await readFileAsDataURL(displayFile));

    return fileUrl;
  } catch (error) {
    console.error("Error converting OFF to GLB:", error);
  }
}

async function getScadInstance() {
  const instance = await OpenSCAD({ noInitialRun: true });
  instance.FS.chdir("/");
  instance.FS.mkdir("/locale");
  return instance;
}

export async function generateModel(code: string): Promise<string> {
  const instance = await getScadInstance();
  instance.FS.writeFile("/input.scad", code);
  const success = await compileScad(instance);
  if (!success) throw new Error("Failed to compile SCAD code");
  const fileUrl = await convertOffToGlb(instance);
  if (!fileUrl) throw new Error("Failed to convert OFF to GLB");
  return fileUrl;
}

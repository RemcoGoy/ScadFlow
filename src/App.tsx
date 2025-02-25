import "./App.css";
import { ScadEditor } from "./components/scadEditor";
import "@google/model-viewer";
import { useEffect, useState } from "react";
import OpenSCAD from "./wasm/openscad.js";
import { parseOff } from "./lib/io/off.ts";
import { exportGlb } from "./lib/io/glb.ts";
import { listFilesystem, readFileAsDataURL } from "./lib/utils.ts";

declare global {
  namespace JSX {
    interface IntrinsicElements {
      "model-viewer": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement>,
        HTMLElement
      > & {
        src: string;
        alt: string;
        "camera-controls"?: boolean;
        "touch-action"?: string;
      };
    }
  }
}

function App() {
  const [scadInstance, setScadInstance] = useState<any>(null);
  const [scadCode, setScadCode] = useState<string>("");
  const [displayFileUrl, setDisplayFileUrl] = useState<string | null>(null);

  const newInstance = async () => {
    const instance = await OpenSCAD({ noInitialRun: true });
    instance.FS.chdir("/");
    instance.FS.mkdir("/locale");
    return instance;
  };

  const generateModel = async (code: string) => {
    if (!scadInstance) return null;

    try {
      // Write the code to the filesystem
      scadInstance.FS.writeFile("/input.scad", code);

      await scadInstance.callMain([
        "/input.scad",
        "--backend=manifold",
        "--export-format=off",
        "-o",
        "/model.off",
      ]);
      console.log("OpenSCAD processing completed");
      return true;
    } catch (error) {
      console.error("Error generating model:", error);
      return false;
    }
  };

  const convertOffToGlb = async () => {
    if (!scadInstance) return;

    try {
      // Check if the file exists before trying to read it
      if (!scadInstance.FS.analyzePath("/model.off").exists) {
        console.error("Output file '/model.off' does not exist");
        return;
      }

      // Read the output file
      const output = scadInstance.FS.readFile("/model.off");

      // Convert binary data to text
      const decoder = new TextDecoder("utf-8");
      const offFileContent = decoder.decode(output);

      const parsedOutput = parseOff(offFileContent);
      const glbData = await exportGlb(parsedOutput);
      const displayFile = new File([glbData], "model.glb");
      const fileUrl = displayFile && (await readFileAsDataURL(displayFile));

      setDisplayFileUrl(fileUrl);
    } catch (error) {
      console.error("Failed to convert OFF to GLB:", error);
    }
  };

  useEffect(() => {
    const init = async () => {
      const instance = await newInstance();
      setScadInstance(instance);
    };

    init();
  }, []);

  const refresh = async () => {
    try {
      // Create a new instance for each operation
      const instance = await newInstance();
      setScadInstance(instance);

      // Get current code and regenerate model
      const modelGenerated = await generateModel(scadCode);

      if (modelGenerated) {
        await convertOffToGlb();
      }
    } catch (error) {
      console.error("Error during refresh:", error);
    }
  };

  const handleCodeChange = (newCode: string) => {
    setScadCode(newCode);
  };

  return (
    <main className="bg-black w-full h-screen grid grid-cols-2 relative">
      <div>
        <ScadEditor onChange={handleCodeChange} />
      </div>
      <div>
        {displayFileUrl && (
          <model-viewer
            style={{ width: "100%", height: "100%" }}
            src={displayFileUrl}
            alt="A 3D model"
            camera-controls
          ></model-viewer>
        )}
      </div>
      <button
        className="absolute bottom-8 right-8 bg-blue-500 hover:bg-blue-700 text-white font-bold py-4 px-4 rounded-full shadow-lg"
        onClick={refresh}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-6 w-6"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
          />
        </svg>
      </button>
    </main>
  );
}

export default App;

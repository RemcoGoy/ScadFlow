import "./App.css";
import { ScadEditor } from "./components/scadEditor";
import "@google/model-viewer";
import { useEffect, useState } from "react";
import OpenSCAD from "./wasm/openscad.js";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";

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
  const [scadCode, setScadCode] = useState<string>(`cube(10);`);

  const generateModel = async (code: string) => {
    if (!scadInstance) return null;

    // Write the code to the filesystem
    scadInstance.FS.writeFile("/input.scad", code);

    try {
      scadInstance.callMain([
        "/input.scad",
        "--backend=manifold",
        "--export-format=off",
        "-o",
        "/cube.off",
      ]);
    } catch (error) {
      console.error(error);
    }
  };

  useEffect(() => {
    const init = async () => {
      const instance = await OpenSCAD({ noInitialRun: true });
      // Write a file to the filesystem
      instance.FS.chdir("/");

      // Store instance for reuse
      setScadInstance(instance);

      // Generate initial model
      await generateModel(scadCode);
    };

    init();
  }, []);

  const refresh = async () => {
    // Get current code and regenerate model
    await generateModel(scadCode);
  };

  const handleCodeChange = (newCode: string) => {
    setScadCode(newCode);
  };

  const handleDownload = async () => {
    if (!scadInstance) return;

    // Read the output file
    const output = scadInstance.FS.readFile("/cube.off");

    try {
      // Open save dialog and get file path
      const filePath = await save({
        filters: [
          {
            name: "OFF Model",
            extensions: ["off"],
          },
        ],
        defaultPath: "model.off",
      });

      if (filePath) {
        // Write the binary file to the selected path
        await writeFile(filePath, output);
        console.log("File saved successfully");
      }
    } catch (error) {
      console.error("Failed to save file:", error);
    }
  };

  return (
    <main className="bg-black w-full h-screen grid grid-cols-2 relative">
      <div>
        <ScadEditor onChange={handleCodeChange} />
      </div>
      <div></div>
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
      <button
        className="absolute bottom-8 right-24 bg-green-500 hover:bg-green-700 text-white font-bold py-4 px-4 rounded-full shadow-lg"
        onClick={handleDownload}
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
            d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
          />
        </svg>
      </button>
    </main>
  );
}

export default App;

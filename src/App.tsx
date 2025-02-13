import "./App.css";
import { ScadEditor } from "./components/scadEditor";
import "@google/model-viewer";
import { invoke } from "@tauri-apps/api/core";

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
  return (
    <main className="bg-black w-full h-screen grid grid-cols-2 relative">
      <div>
        <ScadEditor />
      </div>
      <div>
        <model-viewer
          style={{ width: "100%", height: "100%" }}
          src="https://modelviewer.dev/shared-assets/models/Astronaut.glb"
          alt="A 3D model of an astronaut"
          camera-controls
          touch-action="pan-y"
        ></model-viewer>
      </div>
      <button
        className="absolute bottom-8 right-8 bg-blue-500 hover:bg-blue-700 text-white font-bold py-4 px-4 rounded-full shadow-lg"
        onClick={() => {
          invoke("greet", { name: "world" });
        }}
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
            d="M12 6v6m0 0v6m0-6h6m-6 0H6"
          />
        </svg>
      </button>
    </main>
  );
}

export default App;

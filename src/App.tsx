import "./App.css";
import { ScadEditor } from "./components/scadEditor";
import "@google/model-viewer";

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
    <main className="bg-black w-full h-screen grid grid-cols-2">
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
    </main>
  );
}

export default App;

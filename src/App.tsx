import "./App.css";
import { ScadEditor } from "@/components/ScadEditor.tsx";
import { Viewer } from "@/components/Viewer.tsx";
import { useScadStore } from "@/store/scadStore.ts";
import { generateModel } from "./lib/service/scad";

function App() {
  const { scadCode, setModelUrl } = useScadStore();

  const refresh = async () => {
    try {
      const displayUrl = await generateModel(scadCode);
      setModelUrl(displayUrl);
    } catch (error) {
      console.error("Error during refresh:", error);
    }
  };

  return (
    <main className="bg-black w-full h-screen grid grid-cols-2 relative">
      <div className="col-span-1">
        <ScadEditor />
      </div>
      <div className="col-span-1">
        <Viewer />
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

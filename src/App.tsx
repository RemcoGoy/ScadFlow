import "./App.css";
import { Sidebar } from "@/components/Sidebar.tsx";
import { ScadEditor } from "@/components/ScadEditor.tsx";
import { Viewer } from "@/components/Viewer.tsx";
import { ConsolePanel } from "@/components/ConsolePanel.tsx";
import { Customizer } from "@/components/Customizer.tsx";
import { useScadStore } from "@/store/scadStore.ts";
import { generateModel } from "./lib/service/scad";

function App() {
  const { scadCode, setModelUrl, variables, isCompiling } = useScadStore();

  const handleRefresh = async (customVars?: any[]) => {
    try {
      const varsToUse = customVars || variables;
      const displayUrl = await generateModel(scadCode, varsToUse);
      setModelUrl(displayUrl);
    } catch (error) {
      console.error("Error during compilation:", error);
    }
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-zinc-950 overflow-hidden text-zinc-300 font-sans">
      {/* Premium Navigation Header */}
      <header className="flex-shrink-0 flex items-center justify-between px-5 h-14 bg-zinc-950 border-b border-zinc-900 select-none">
        <div className="flex items-center space-x-3">
          <div className="bg-blue-600 p-1.5 rounded-lg flex items-center justify-center shadow-lg shadow-blue-500/20">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5 text-white"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2.5}
                d="M14 10l-2 1m0 0l-2-1m2 1v2.5M20 7l-2 1m2-1l-2-1m2 1v2.5M14 4l-2-1-2 1M4 7v2.5M4 7l2-1M4 7l2 1M6 8v2.5M14 10.5l2-.5m-2 .5v2.5M20 9.5l-2 .5"
              />
            </svg>
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-wider text-white">ScadFlow</h1>
            <p className="text-[10px] text-zinc-500 font-semibold uppercase tracking-wider">
              Web-First CAD Editor
            </p>
          </div>
        </div>

        {/* Global actions */}
        <div className="flex items-center space-x-3">
          {/* Quick status dot */}
          <span className="flex items-center space-x-2 text-xs text-zinc-400">
            <span
              className={`h-2.5 w-2.5 rounded-full ${isCompiling ? "bg-blue-500 animate-pulse" : "bg-emerald-500"}`}
            />
            <span className="font-medium text-[11px] font-mono">
              {isCompiling ? "Compiling" : "Idle"}
            </span>
          </span>

          <button
            onClick={() => handleRefresh()}
            disabled={isCompiling}
            className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 disabled:text-zinc-500 text-white font-semibold py-1.5 px-4 rounded-md text-xs tracking-wide transition-all shadow-md shadow-blue-600/10 active:scale-[0.98]"
          >
            {isCompiling ? (
              <svg
                className="animate-spin h-3.5 w-3.5 text-zinc-400"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                ></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
              </svg>
            ) : (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-3.5 w-3.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            )}
            <span>Compile (F5)</span>
          </button>
        </div>
      </header>

      {/* Main Workspace Frame */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left sidebar: Workspace files tree */}
        <Sidebar />

        {/* Center Panel: Editor + Logs */}
        <div className="flex-1 flex flex-col min-w-0 bg-zinc-950">
          <div className="flex-1 min-h-0 relative">
            <ScadEditor onCompileTrigger={() => handleRefresh()} />
          </div>
          <div className="h-56 flex-shrink-0">
            <ConsolePanel />
          </div>
        </div>

        {/* Right Panel: Viewport + Parametric customizer */}
        <div className="w-96 flex-shrink-0 flex flex-col border-l border-zinc-900 bg-zinc-950 min-w-0">
          <div className="flex-1 min-h-0 relative bg-zinc-900/10">
            <Viewer />
            {isCompiling && (
              <div className="absolute inset-0 bg-black/40 backdrop-blur-xs flex flex-col items-center justify-center space-y-3 select-none">
                <div className="animate-spin rounded-full h-10 w-10 border-2 border-t-blue-500 border-r-transparent border-b-transparent border-l-transparent" />
                <span className="text-xs text-zinc-400 font-semibold tracking-wider uppercase">
                  Rebuilding mesh...
                </span>
              </div>
            )}
          </div>
          <div className="h-64 flex-shrink-0">
            <Customizer onParametersChange={(updatedVars) => handleRefresh(updatedVars)} />
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;

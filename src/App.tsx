import "./App.css";
import { Sidebar } from "@/components/Sidebar.tsx";
import { ScadEditor } from "@/components/ScadEditor.tsx";
import { Viewer } from "@/components/Viewer.tsx";
import { ConsolePanel } from "@/components/ConsolePanel.tsx";
import { Customizer } from "@/components/Customizer.tsx";
import { useScadStore } from "@/store/scadStore.ts";
import { generateModel } from "./lib/service/scad";
import {
  Group as PanelGroup,
  Panel,
  Separator as PanelResizeHandle,
  useDefaultLayout,
} from "react-resizable-panels";

function App() {
  const {
    scadCode,
    setModelUrl,
    variables,
    isCompiling,
    showConsole,
    showCustomizer,
    showSidebar,
    toggleConsole,
    toggleCustomizer,
    toggleSidebar,
  } = useScadStore();

  const horizontalPanelIds = showSidebar
    ? ["sidebar-panel", "center-panel", "right-panel"]
    : ["center-panel", "right-panel"];
  const horizontalLayout = useDefaultLayout({
    id: "scadflow-horizontal-v4",
    panelIds: horizontalPanelIds,
  });

  const centerPanelIds = showConsole ? ["editor-panel", "console-panel"] : ["editor-panel"];
  const centerVerticalLayout = useDefaultLayout({
    id: "scadflow-center-vertical-v4",
    panelIds: centerPanelIds,
  });

  const rightPanelIds = showCustomizer ? ["viewer-panel", "customizer-panel"] : ["viewer-panel"];
  const rightVerticalLayout = useDefaultLayout({
    id: "scadflow-right-vertical-v4",
    panelIds: rightPanelIds,
  });

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
          {/* Layout controls */}
          <div className="flex items-center space-x-1 bg-zinc-900/40 p-1 rounded-lg border border-zinc-900 mr-1.5">
            <button
              onClick={toggleSidebar}
              className={`p-1.5 rounded-md hover:bg-zinc-800/80 transition-all ${showSidebar ? "text-blue-400 bg-blue-950/20" : "text-zinc-500 hover:text-zinc-300"}`}
              title="Toggle Sidebar (Files)"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h3a2 2 0 002-2V7a2 2 0 00-2-2h-3a2 2 0 00-2 2"
                />
              </svg>
            </button>
            <button
              onClick={toggleConsole}
              className={`p-1.5 rounded-md hover:bg-zinc-800/80 transition-all ${showConsole ? "text-blue-400 bg-blue-950/20" : "text-zinc-500 hover:text-zinc-300"}`}
              title="Toggle Console"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
            </button>
            <button
              onClick={toggleCustomizer}
              className={`p-1.5 rounded-md hover:bg-zinc-800/80 transition-all ${showCustomizer ? "text-blue-400 bg-blue-950/20" : "text-zinc-500 hover:text-zinc-300"}`}
              title="Toggle Parameters"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"
                />
              </svg>
            </button>
          </div>

          {/* Quick status dot */}
          <span className="flex items-center space-x-2 text-xs text-zinc-400 mr-1.5">
            <span
              className={`h-2.5 w-2.5 rounded-full ${isCompiling ? "bg-blue-500 animate-pulse" : "bg-emerald-500"}`}
            />
            <span className="font-medium text-[11px] font-mono select-none">
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
        <PanelGroup orientation="horizontal" {...horizontalLayout}>
          {/* Left sidebar: Workspace files tree */}
          {showSidebar && (
            <>
              <Panel defaultSize="22%" minSize="15%" maxSize="40%" id="sidebar-panel">
                <Sidebar />
              </Panel>
              <PanelResizeHandle className="w-1 bg-zinc-900 hover:bg-blue-600/80 active:bg-blue-600 transition-colors cursor-col-resize flex items-center justify-center">
                <div className="h-4 w-[2px] bg-zinc-700/60 rounded-full" />
              </PanelResizeHandle>
            </>
          )}

          {/* Center Panel: Editor + Logs */}
          <Panel id="center-panel">
            <PanelGroup orientation="vertical" {...centerVerticalLayout}>
              <Panel id="editor-panel">
                <div className="h-full w-full relative">
                  <ScadEditor onCompileTrigger={() => handleRefresh()} />
                </div>
              </Panel>
              {showConsole && (
                <>
                  <PanelResizeHandle className="h-1 bg-zinc-900 hover:bg-blue-600/80 active:bg-blue-600 transition-colors cursor-row-resize flex items-center justify-center">
                    <div className="w-4 h-[2px] bg-zinc-700/60 rounded-full" />
                  </PanelResizeHandle>
                  <Panel defaultSize="20%" minSize="10%" maxSize="60%" id="console-panel">
                    <ConsolePanel />
                  </Panel>
                </>
              )}
            </PanelGroup>
          </Panel>

          <PanelResizeHandle className="w-1 bg-zinc-900 hover:bg-blue-600/80 active:bg-blue-600 transition-colors cursor-col-resize flex items-center justify-center">
            <div className="h-4 w-[2px] bg-zinc-700/60 rounded-full" />
          </PanelResizeHandle>

          {/* Right Panel: Viewport + Parametric customizer */}
          <Panel defaultSize="45%" minSize="30%" maxSize="70%" id="right-panel">
            <PanelGroup orientation="vertical" {...rightVerticalLayout}>
              <Panel id="viewer-panel">
                <div className="h-full w-full relative bg-zinc-900/10">
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
              </Panel>
              {showCustomizer && (
                <>
                  <PanelResizeHandle className="h-1 bg-zinc-900 hover:bg-blue-600/80 active:bg-blue-600 transition-colors cursor-row-resize flex items-center justify-center">
                    <div className="w-4 h-[2px] bg-zinc-700/60 rounded-full" />
                  </PanelResizeHandle>
                  <Panel defaultSize="25%" minSize="15%" maxSize="80%" id="customizer-panel">
                    <Customizer onParametersChange={(updatedVars) => handleRefresh(updatedVars)} />
                  </Panel>
                </>
              )}
            </PanelGroup>
          </Panel>
        </PanelGroup>
      </div>
    </div>
  );
}

export default App;

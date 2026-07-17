import "./App.css";
import { Boxes } from "lucide-react";
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
    activeFilePath,
    autoRender,
    setAutoRender,
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
    <div className="flex flex-col h-screen w-screen bg-canvas-bg overflow-hidden text-zinc-300 font-sans">
      {/* ScadForge Top Navigation Header */}
      <header className="flex-shrink-0 flex items-center justify-between px-4 h-12 bg-header-bg border-b border-border-figma select-none z-50">
        <div className="flex items-center space-x-2.5">
          {/* Logo Icon */}
          <Boxes className="h-5 w-5 text-scad-amber flex-shrink-0" />
          <div className="flex items-baseline space-x-2.5">
            <h1 className="text-sm font-bold tracking-wide text-zinc-100 font-display">
              ScadForge
            </h1>
            <span className="px-2 py-0.5 rounded text-[10px] text-zinc-400 font-mono bg-panel-bg font-semibold select-none border border-border-figma/40">
              openscad-wasm
            </span>
          </div>
        </div>

        {/* Header Right Actions */}
        <div className="flex items-center space-x-4 select-none">
          {/* Layout controls hidden or kept small */}
          <div className="flex items-center space-x-0.5 bg-[#141922] p-0.5 rounded-lg border border-border-figma/45">
            <button
              onClick={toggleSidebar}
              className={`p-1.5 rounded-md transition-all ${
                showSidebar
                  ? "text-scad-amber bg-[#1e293b]/40"
                  : "text-zinc-500 hover:text-zinc-350"
              }`}
              title="Toggle Sidebar"
            >
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
                  d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h3a2 2 0 002-2V7a2 2 0 00-2-2h-3a2 2 0 00-2 2"
                />
              </svg>
            </button>
            <button
              onClick={toggleConsole}
              className={`p-1.5 rounded-md transition-all ${
                showConsole
                  ? "text-scad-amber bg-[#1e293b]/40"
                  : "text-zinc-500 hover:text-zinc-350"
              }`}
              title="Toggle Console"
            >
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
                  d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
            </button>
            <button
              onClick={toggleCustomizer}
              className={`p-1.5 rounded-md transition-all ${
                showCustomizer
                  ? "text-scad-amber bg-[#1e293b]/40"
                  : "text-zinc-500 hover:text-zinc-350"
              }`}
              title="Toggle Parameters"
            >
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
                  d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"
                />
              </svg>
            </button>
          </div>

          {/* Auto-render Checkbox */}
          <label className="flex items-center space-x-2 text-xs font-semibold text-scad-amber cursor-pointer">
            <input
              type="checkbox"
              checked={autoRender}
              onChange={(e) => setAutoRender(e.target.checked)}
              className="rounded border-[#e2a04e] text-scad-amber focus:ring-scad-amber h-3.5 w-3.5 bg-panel-bg accent-scad-amber"
            />
            <span>Auto-render</span>
          </label>

          {/* Render (⌘S) Button */}
          <button
            onClick={() => handleRefresh()}
            disabled={isCompiling}
            className="flex items-center space-x-1.5 bg-scad-amber hover:bg-scad-amber-dark disabled:bg-zinc-800 disabled:text-zinc-650 text-[#0b0e14] font-bold py-1.5 px-4 rounded-md text-xs transition-colors cursor-pointer"
          >
            {isCompiling ? (
              <svg
                className="animate-spin h-3.5 w-3.5 text-[#0b0e14]"
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
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
            ) : null}
            <span>Render (⌘S)</span>
          </button>

          {/* Download STL Button */}
          <button
            onClick={() => {
              // Stub or download action
              alert("Exporting model as STL. Ensure mesh compiled successfully.");
            }}
            className="bg-[#131924] hover:bg-[#1a2232] border border-border-figma text-zinc-300 font-semibold py-1.5 px-4 rounded-md text-xs transition-all cursor-pointer hover:text-white"
          >
            Download STL
          </button>
        </div>
      </header>

      {/* Main Workspace Frame - Full-bleed segments */}
      <div className="flex-1 flex overflow-hidden bg-canvas-bg">
        <PanelGroup orientation="horizontal" {...horizontalLayout}>
          {/* Left Sidebar: Workspace Files */}
          {showSidebar && (
            <>
              <Panel defaultSize="22%" minSize="15%" maxSize="40%" id="sidebar-panel">
                <div className="h-full w-full bg-panel-bg flex flex-col">
                  {/* Panel Title Bar */}
                  <div className="flex-shrink-0 flex items-center h-8 px-4 bg-header-bg border-b border-border-figma select-none">
                    <span className="text-scad-amber mr-1.5 text-[10px] leading-none">●</span>
                    <span className="text-[11px] text-zinc-400 font-medium font-sans tracking-wide lowercase">
                      files
                    </span>
                  </div>
                  <div className="flex-1 min-h-0">
                    <Sidebar />
                  </div>
                </div>
              </Panel>
              <PanelResizeHandle className="w-[1px] bg-border-figma cursor-col-resize hover:bg-scad-amber/50 active:bg-scad-amber transition-colors" />
            </>
          )}

          {/* Center Column: Editor + Logs */}
          <Panel id="center-panel">
            <PanelGroup orientation="vertical" {...centerVerticalLayout}>
              <Panel id="editor-panel">
                <div className="h-full w-full bg-canvas-bg flex flex-col">
                  {/* Panel Title Bar */}
                  <div className="flex-shrink-0 flex items-center h-8 px-4 bg-header-bg border-b border-border-figma select-none">
                    <span className="text-scad-amber mr-1.5 text-[10px] leading-none">●</span>
                    <span className="text-[11px] text-zinc-400 font-medium font-sans tracking-wide lowercase">
                      {activeFilePath.replace(/^\//, "") || "main.scad"}
                    </span>
                  </div>
                  <div className="flex-1 min-h-0">
                    <ScadEditor onCompileTrigger={() => handleRefresh()} />
                  </div>
                </div>
              </Panel>
              {showConsole && (
                <>
                  <PanelResizeHandle className="h-[1px] bg-border-figma cursor-row-resize hover:bg-scad-amber/50 active:bg-scad-amber transition-colors" />
                  <Panel defaultSize="20%" minSize="10%" maxSize="60%" id="console-panel">
                    <div className="h-full w-full bg-panel-bg flex flex-col">
                      {/* Panel Title Bar */}
                      <div className="flex-shrink-0 flex items-center h-8 px-4 bg-header-bg border-b border-border-figma select-none">
                        <span className="text-scad-amber mr-1.5 text-[10px] leading-none">●</span>
                        <span className="text-[11px] text-zinc-400 font-medium font-sans tracking-wide lowercase">
                          console
                        </span>
                      </div>
                      <div className="flex-1 min-h-0">
                        <ConsolePanel />
                      </div>
                    </div>
                  </Panel>
                </>
              )}
            </PanelGroup>
          </Panel>

          <PanelResizeHandle className="w-[1px] bg-border-figma cursor-col-resize hover:bg-scad-amber/50 active:bg-scad-amber transition-colors" />

          {/* Right Panel: Viewport + Customizer */}
          <Panel defaultSize="45%" minSize="30%" maxSize="70%" id="right-panel">
            <PanelGroup orientation="vertical" {...rightVerticalLayout}>
              <Panel id="viewer-panel">
                <div className="h-full w-full bg-canvas-bg flex flex-col relative">
                  {/* Panel Title Bar */}
                  <div className="flex-shrink-0 flex items-center h-8 px-4 bg-header-bg border-b border-border-figma select-none">
                    <span className="text-scad-amber mr-1.5 text-[10px] leading-none">●</span>
                    <span className="text-[11px] text-zinc-400 font-medium font-sans tracking-wide lowercase">
                      preview.stl
                    </span>
                  </div>
                  <div className="flex-1 min-h-0 relative">
                    <Viewer />
                    {isCompiling && (
                      <div className="absolute inset-0 bg-[#0f131acc]/85 backdrop-blur-[1px] flex flex-col items-center justify-center space-y-2 select-none z-10">
                        <div className="animate-spin rounded-full h-8 w-8 border-2 border-t-scad-amber border-r-transparent border-b-transparent border-l-transparent" />
                        <span className="text-[10px] text-zinc-400 font-semibold tracking-wider font-sans">
                          Updating viewport...
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </Panel>
              {showCustomizer && (
                <>
                  <PanelResizeHandle className="h-[1px] bg-border-figma cursor-row-resize hover:bg-scad-amber/50 active:bg-scad-amber transition-colors" />
                  <Panel defaultSize="25%" minSize="15%" maxSize="80%" id="customizer-panel">
                    <div className="h-full w-full bg-panel-bg flex flex-col">
                      {/* Panel Title Bar */}
                      <div className="flex-shrink-0 flex items-center h-8 px-4 bg-header-bg border-b border-border-figma select-none">
                        <span className="text-scad-amber mr-1.5 text-[10px] leading-none">●</span>
                        <span className="text-[11px] text-zinc-400 font-medium font-sans tracking-wide lowercase">
                          properties
                        </span>
                      </div>
                      <div className="flex-1 min-h-0">
                        <Customizer
                          onParametersChange={(updatedVars) => handleRefresh(updatedVars)}
                        />
                      </div>
                    </div>
                  </Panel>
                </>
              )}
            </PanelGroup>
          </Panel>
        </PanelGroup>
      </div>

      {/* Sleek status bar */}
      <footer className="flex-shrink-0 flex items-center justify-between px-4 h-6 bg-panel-bg border-t border-border-figma text-[10px] text-zinc-500 select-none font-sans font-medium">
        <div className="flex items-center space-x-2">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-3 w-3 text-zinc-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          <span className="text-zinc-300 font-normal">{activeFilePath || "/main.scad"}</span>
        </div>
        <div className="flex items-center space-x-4">
          <span>OpenSCAD Engine</span>
          <span>UTF-8</span>
        </div>
      </footer>
    </div>
  );
}

export default App;

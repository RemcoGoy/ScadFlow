import { useRef, useEffect } from "react";
import { useScadStore } from "@/store/scadStore";

export function ConsolePanel() {
  const { logs, clearLogs, isCompiling, toggleConsole } = useScadStore();
  const consoleBottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Scroll to bottom on new logs
    if (consoleBottomRef.current) {
      consoleBottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs]);

  const errorCount = logs.filter((log) => log.type === "error").length;
  const warningCount = logs.filter((log) => log.text.toLowerCase().includes("warning")).length;

  return (
    <div className="flex flex-col h-full bg-zinc-950 border-t border-zinc-900 text-zinc-300">
      {/* Console Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-zinc-950 border-b border-zinc-900 select-none">
        <div className="flex items-center space-x-3 text-xs font-semibold tracking-wider text-zinc-400 uppercase">
          <span>Console</span>
          {isCompiling && (
            <div className="flex items-center space-x-1.5 text-blue-400 font-normal normal-case">
              <svg
                className="animate-spin h-3.5 w-3.5 text-blue-500"
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
              <span>Compiling...</span>
            </div>
          )}
        </div>
        <div className="flex items-center space-x-3 text-xs">
          <div className="flex items-center space-x-2">
            <span className="flex items-center space-x-1 text-red-500 font-medium">
              <span className="h-2 w-2 rounded-full bg-red-500"></span>
              <span>{errorCount} Errors</span>
            </span>
            <span className="flex items-center space-x-1 text-yellow-500 font-medium">
              <span className="h-2 w-2 rounded-full bg-yellow-500"></span>
              <span>{warningCount} Warnings</span>
            </span>
          </div>
          <button
            onClick={clearLogs}
            className="text-zinc-500 hover:text-zinc-300 transition-colors p-1"
            title="Clear Console"
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
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
          </button>
          <button
            onClick={toggleConsole}
            className="text-zinc-500 hover:text-zinc-300 transition-colors p-1"
            title="Minimize Console"
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
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Console output body */}
      <div className="flex-1 p-3 overflow-y-auto font-mono text-xs space-y-1 bg-zinc-950 select-text leading-relaxed">
        {logs.length === 0 ? (
          <div className="text-zinc-600 italic py-4 pl-1">No compiler output logs</div>
        ) : (
          logs.map((log, index) => (
            <div
              key={index}
              className={`flex items-start space-x-2 py-0.5 px-1.5 rounded ${
                log.type === "error"
                  ? "bg-red-500/10 text-red-400 border border-red-500/10"
                  : log.text.toLowerCase().includes("warning")
                    ? "bg-yellow-500/10 text-yellow-400 border border-yellow-500/10"
                    : "text-zinc-300 hover:bg-zinc-900/50"
              }`}
            >
              <span className="text-[10px] text-zinc-600 select-none pt-0.5">{log.timestamp}</span>
              <span className="flex-1 whitespace-pre-wrap select-text">{log.text}</span>
            </div>
          ))
        )}
        <div ref={consoleBottomRef} />
      </div>
    </div>
  );
}

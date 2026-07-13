import { useRef, useEffect, useState } from "react";
import { useScadStore } from "@/store/scadStore";

export function ConsolePanel() {
  const { logs, clearLogs } = useScadStore();
  const consoleBottomRef = useRef<HTMLDivElement>(null);

  const [activeTab, setActiveTab] = useState<"all" | "errors" | "warnings">("all");
  const [searchText, setSearchText] = useState("");
  const [autoScroll, setAutoScroll] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (autoScroll && consoleBottomRef.current) {
      consoleBottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs, autoScroll, activeTab]);

  const errorCount = logs.filter((log) => log.type === "error").length;
  const warningCount = logs.filter((log) => log.text.toLowerCase().includes("warning")).length;

  const handleCopyLogs = () => {
    const text = filteredLogs.map((log) => `[${log.timestamp}] ${log.text}`).join("\n");
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const filteredLogs = logs.filter((log) => {
    if (activeTab === "errors" && log.type !== "error") return false;
    if (activeTab === "warnings" && !log.text.toLowerCase().includes("warning")) return false;

    if (searchText) {
      return log.text.toLowerCase().includes(searchText.toLowerCase());
    }
    return true;
  });

  return (
    <div className="flex flex-col h-full bg-[#0b0e14] text-zinc-350 select-text">
      {/* Console Filters Toolbar */}
      <div className="flex-shrink-0 flex items-center justify-between px-3 py-1.5 gap-2 border-b border-border-figma bg-[#0d1117]/60">
        <div className="flex items-center space-x-0.5 bg-[#0b0e14] p-0.5 rounded border border-border-figma select-none">
          <button
            onClick={() => setActiveTab("all")}
            className={`px-2.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide transition-all ${
              activeTab === "all"
                ? "bg-[#131924] border border-[#1e293b]/70 text-scad-amber"
                : "text-zinc-500 hover:text-zinc-350"
            }`}
          >
            All
          </button>
          <button
            onClick={() => setActiveTab("errors")}
            className={`px-2.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide transition-all flex items-center space-x-1 ${
              activeTab === "errors"
                ? "bg-[#131924] border border-[#1e293b]/70 text-red-400"
                : "text-zinc-500 hover:text-red-450"
            }`}
          >
            <span>Errors</span>
            <span className="bg-red-500/10 text-red-400 text-[8px] font-mono px-1 rounded">
              {errorCount}
            </span>
          </button>
          <button
            onClick={() => setActiveTab("warnings")}
            className={`px-2.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide transition-all flex items-center space-x-1 ${
              activeTab === "warnings"
                ? "bg-[#131924] border border-[#1e293b]/70 text-yellow-400"
                : "text-zinc-500 hover:text-yellow-450"
            }`}
          >
            <span>Warnings</span>
            <span className="bg-yellow-500/10 text-yellow-400 text-[8px] font-mono px-1 rounded">
              {warningCount}
            </span>
          </button>
        </div>

        <div className="flex items-center space-x-2">
          {/* Query Filter */}
          <div className="relative">
            <input
              type="text"
              placeholder="Filter logs"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="bg-[#0b0e14] border border-border-figma hover:border-zinc-700 focus:border-scad-amber text-zinc-350 rounded-md py-0.5 px-2 pl-6 text-[10px] focus:outline-none transition-colors w-32 font-sans"
            />
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="absolute left-1.5 top-1 h-3 w-3 text-zinc-650"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </div>

          {/* Copy Action */}
          <button
            onClick={handleCopyLogs}
            disabled={filteredLogs.length === 0}
            className="p-1 rounded bg-[#131924] border border-border-figma text-zinc-500 hover:text-zinc-350 hover:border-zinc-700 active:scale-95 disabled:opacity-40 disabled:pointer-events-none transition-all cursor-pointer"
            title="Copy Logs"
          >
            {copied ? (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-3.5 w-3.5 text-emerald-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2.5}
                  d="M5 13l4 4L19 7"
                />
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
                  d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m-5 4h6m-6 4h6m-6 4h6"
                />
              </svg>
            )}
          </button>

          {/* Auto Scroll Toggle */}
          <button
            onClick={() => setAutoScroll(!autoScroll)}
            className={`p-1 rounded border transition-colors cursor-pointer ${
              autoScroll
                ? "bg-[#131924] border-scad-amber/20 text-scad-amber"
                : "bg-[#131924] border-border-figma text-zinc-500 hover:text-zinc-300"
            }`}
            title="Toggle Scroll Lock"
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
                d="M19 13l-7 7-7-7m14-6l-7 7-7-7"
              />
            </svg>
          </button>

          <button
            onClick={clearLogs}
            className="p-1 rounded bg-[#131924] border border-border-figma text-zinc-500 hover:text-zinc-350 hover:border-zinc-700 transition-all cursor-pointer"
            title="Clear Feed"
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
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Logs Feed Container */}
      <div className="flex-1 p-3 overflow-y-auto font-mono text-[11px] space-y-1.5 bg-[#0b0e14] select-text">
        {filteredLogs.length === 0 ? (
          <div className="text-zinc-600 italic py-2 pl-1 select-none">
            {searchText ? "No matching messages" : "Empty terminal feed"}
          </div>
        ) : (
          filteredLogs.map((log, index) => {
            const isError = log.type === "error";
            const isWarning = log.text.toLowerCase().includes("warning");
            const isSuccess = log.text.toLowerCase().includes("completed successfully");

            let logClass = "text-zinc-400 bg-[#0d1117]/35 border-l border-zinc-800";
            if (isError) {
              logClass = "bg-red-950/5 text-red-400 border-l border-red-500/80";
            } else if (isWarning) {
              logClass = "bg-yellow-950/5 text-yellow-400 border-l border-yellow-550/80";
            } else if (isSuccess) {
              logClass = "bg-scad-amber-bg text-scad-amber border-l border-scad-amber/80";
            }

            return (
              <div
                key={index}
                className={`flex items-start space-x-2 py-1 px-2.5 rounded ${logClass}`}
              >
                <span className="text-[9px] text-zinc-600 select-none pt-0.5 font-sans font-medium">
                  {log.timestamp}
                </span>
                <span className="flex-1 whitespace-pre-wrap font-mono select-text leading-relaxed tracking-tight">
                  {log.text}
                </span>
              </div>
            );
          })
        )}
        <div ref={consoleBottomRef} />
      </div>
    </div>
  );
}

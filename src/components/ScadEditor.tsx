import { useScadStore } from "@/store/scadStore";
import { useEffect, useState } from "react";
import openscadEditorOptions from "@/language/openscad-editor-options";
import * as monaco from "monaco-editor/esm/vs/editor/editor.api";
import Editor, { loader, Monaco } from "@monaco-editor/react";

const getBfs = () => {
  const windowObj = (typeof window === "object" ? window : self) as any;
  return windowObj.BrowserFS ? windowObj.BrowserFS.BFSRequire("fs") : null;
};

const isMonacoSupported = (() => {
  const ua = window.navigator.userAgent;
  const iosWk = ua.match(/iPad|iPhone/i) && ua.match(/WebKit/i);
  return !iosWk;
})();

let monacoInstance: Monaco | null = null;
if (isMonacoSupported) {
  loader.init().then((mi) => (monacoInstance = mi));
}

interface ScadEditorProps {
  onCompileTrigger: () => void;
}

export function ScadEditor({ onCompileTrigger }: ScadEditorProps) {
  const { scadCode, setScadCode, activeFilePath, openFiles, autoRender } = useScadStore();
  const [editor, setEditor] = useState(null as monaco.editor.IStandaloneCodeEditor | null);

  const bfs = getBfs();

  // Read file from BFS when active file changes
  useEffect(() => {
    if (!bfs || !activeFilePath) return;
    try {
      const content = bfs.readFileSync(activeFilePath, { encoding: "utf8" });
      setScadCode(content);
    } catch (e) {
      console.error("Error reading file in editor mount:", e);
    }
  }, [activeFilePath, bfs]);

  // Debounced auto-compilation (1000ms delay after typing)
  useEffect(() => {
    if (!scadCode || !autoRender) return;
    const timer = setTimeout(() => {
      onCompileTrigger();
    }, 1000);
    return () => clearTimeout(timer);
  }, [scadCode, autoRender]);

  if (editor) {
    const checkerRun = { markers: [] };
    const editorModel = editor.getModel();
    if (editorModel) {
      if (checkerRun && monacoInstance) {
        monacoInstance.editor.setModelMarkers(editorModel, "openscad", checkerRun.markers);
      }
    }
  }

  const handleChange = (value: string | undefined) => {
    if (value !== undefined) {
      setScadCode(value);
    }
  };

  const onMount = (editor: monaco.editor.IStandaloneCodeEditor, monaco: Monaco) => {
    // Define a premium custom theme matching ScadForge mockup colors
    monaco.editor.defineTheme("scadflow-dark", {
      base: "vs-dark",
      inherit: true,
      rules: [
        { token: "comment", foreground: "6A8A5F", fontStyle: "italic" }, // Green comments
        { token: "keyword", foreground: "56B6C2", fontStyle: "bold" }, // Cyan/teal functions
        { token: "number", foreground: "E2A04E" }, // Amber numbers
        { token: "string", foreground: "D19A66" }, // Soft orange strings
        { token: "type", foreground: "61AFEF" }, // Soft blue parameters
      ],
      colors: {
        "editor.background": "#13161c", // Canvas background
        "editor.foreground": "#ABB2BF",
        "editorCursor.foreground": "#e2a04e", // Amber cursor
        "editor.lineHighlightBackground": "#171d29",
        "editorLineNumber.foreground": "#4b5263",
        "editorLineNumber.activeForeground": "#e2a04e",
        "editor.selectionBackground": "#e2a04e33", // Amber selection (hex-alpha)
      },
    });

    monaco.editor.setTheme("scadflow-dark");

    editor.addAction({
      id: "openscad-compile",
      label: "Compile OpenSCAD",
      keybindings: [monaco.KeyCode.F5],
      run: () => {
        onCompileTrigger();
      },
    });

    editor.addAction({
      id: "openscad-save",
      label: "Save OpenSCAD",
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS],
      run: (ed) => {
        const val = ed.getValue();
        const bfs = getBfs();
        if (bfs && activeFilePath) {
          try {
            bfs.writeFileSync(activeFilePath, val);
            console.log(`Saved file to BrowserFS: ${activeFilePath}`);
          } catch (e) {
            console.error(`Failed to save file ${activeFilePath}:`, e);
          }
        }
      },
    });

    setEditor(editor);
  };

  if (!activeFilePath || openFiles.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-[#13161c] text-center select-none font-sans p-6">
        <div className="bg-[#0b0e14] p-4 rounded-xl mb-3 border border-border-figma">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-8 w-8 text-zinc-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
        </div>
        <h3 className="text-xs font-semibold text-zinc-400 font-display">No File Selected</h3>
        <p className="text-[11px] text-zinc-550 mt-1 max-w-[200px] leading-relaxed">
          Open a file from the explorer sidebar to begin drawing models.
        </p>
      </div>
    );
  }

  return (
    <div className="scad-editor flex flex-col h-full bg-[#13161c]">
      {/* Editor Frame */}
      <div className="flex-1 min-h-0 relative">
        <Editor
          value={scadCode}
          theme="scadflow-dark"
          defaultLanguage="openscad"
          onChange={handleChange}
          onMount={(editor, monaco) => onMount(editor, monaco)}
          options={{
            ...openscadEditorOptions,
            minimap: { enabled: false },
            fontSize: 12.5,
            fontFamily: "JetBrains Mono, Fira Code, monospace",
            fontLigatures: true,
            cursorBlinking: "smooth",
            cursorSmoothCaretAnimation: "on",
            scrollBeyondLastLine: false,
            automaticLayout: true,
          }}
        />
      </div>
    </div>
  );
}

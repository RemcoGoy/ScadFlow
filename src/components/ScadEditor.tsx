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
  const { scadCode, setScadCode, activeFilePath } = useScadStore();
  const [editor, setEditor] = useState(null as monaco.editor.IStandaloneCodeEditor | null);

  // Debounced auto-compilation (1000ms delay after typing)
  useEffect(() => {
    if (!scadCode) return;
    const timer = setTimeout(() => {
      onCompileTrigger();
    }, 1000);
    return () => clearTimeout(timer);
  }, [scadCode]);

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

  const onMount = (editor: monaco.editor.IStandaloneCodeEditor) => {
    // F5 key or Compile action
    editor.addAction({
      id: "openscad-compile",
      label: "Compile OpenSCAD",
      keybindings: [monaco.KeyCode.F5],
      run: () => {
        onCompileTrigger();
      },
    });

    // Save action (Ctrl+S)
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

  return (
    <div className="scad-editor h-full">
      <Editor
        value={scadCode}
        theme="vs-dark"
        defaultLanguage="openscad"
        onChange={handleChange}
        onMount={onMount}
        options={{
          ...openscadEditorOptions,
          minimap: { enabled: false },
          fontSize: 14,
          scrollBeyondLastLine: false,
          automaticLayout: true,
        }}
      />
    </div>
  );
}

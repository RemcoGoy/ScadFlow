import { useScadStore } from "@/store/scadStore";
import { useEffect, useState } from "react";
import openscadEditorOptions from "@/language/openscad-editor-options";
import * as monaco from "monaco-editor/esm/vs/editor/editor.api";
import Editor, { loader, Monaco } from "@monaco-editor/react";

// const isMonacoSupported = false;
const isMonacoSupported = (() => {
  const ua = window.navigator.userAgent;
  const iosWk = ua.match(/iPad|iPhone/i) && ua.match(/WebKit/i);
  return !iosWk;
})();

let monacoInstance: Monaco | null = null;
if (isMonacoSupported) {
  loader.init().then((mi) => (monacoInstance = mi));
}

export function ScadEditor() {
  const { scadCode, setScadCode } = useScadStore();
  const [editor, setEditor] = useState(null as monaco.editor.IStandaloneCodeEditor | null);

  if (editor) {
    const checkerRun = { markers: [] };
    const editorModel = editor.getModel();
    if (editorModel) {
      if (checkerRun && monacoInstance) {
        monacoInstance.editor.setModelMarkers(editorModel, "openscad", checkerRun.markers);
      }
    }
  }

  useEffect(() => {
    setScadCode(scadCode);
  }, []);

  const handleChange = (value: string | undefined) => {
    if (value !== undefined) {
      setScadCode(value);
    }
  };

  const onMount = (editor: monaco.editor.IStandaloneCodeEditor) => {
    editor.addAction({
      id: "openscad-render",
      label: "Render OpenSCAD",
      run: () => {},
    });
    editor.addAction({
      id: "openscad-preview",
      label: "Preview OpenSCAD",
      run: () => {},
    });
    editor.addAction({
      id: "openscad-save-do-nothing",
      label: "Save (disabled)",
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS],
      run: () => {},
    });
    editor.addAction({
      id: "openscad-save-project",
      label: "Save OpenSCAD project",
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyS],
      run: () => {},
    });

    setEditor(editor);
  };

  return (
    <div className="scad-editor h-full">
      <Editor
        value={scadCode}
        // theme="vs-dark"
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

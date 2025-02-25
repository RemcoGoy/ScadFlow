import { Editor } from "@monaco-editor/react";
import { useScadStore } from "../store/scadStore";
import { useEffect } from "react";

export function ScadEditor() {
  const { scadCode, setScadCode } = useScadStore();

  useEffect(() => {
    setScadCode(scadCode);
  }, []);

  const handleChange = (value: string | undefined) => {
    if (value !== undefined) {
      setScadCode(value);
    }
  };

  return (
    <div className="scad-editor h-full">
      <Editor
        value={scadCode}
        theme="vs-dark"
        language="javascript"
        onChange={handleChange}
        options={{
          minimap: { enabled: false },
          fontSize: 14,
          scrollBeyondLastLine: false,
          automaticLayout: true,
        }}
      />
    </div>
  );
}

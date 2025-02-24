import { Editor } from "@monaco-editor/react";
import { useScadStore } from "../store/scadStore";

interface ScadEditorProps {
  initialValue?: string;
  onChange?: (value: string) => void;
}

export function ScadEditor({ initialValue = "", onChange }: ScadEditorProps) {
  const { scad, setScad } = useScadStore();

  // Set initial value if provided and scad is empty
  if (initialValue && !scad) {
    setScad(initialValue);
  }

  const handleChange = (value: string | undefined) => {
    if (value !== undefined) {
      setScad(value);
      onChange?.(value);
    }
  };

  return (
    <div className="scad-editor h-full">
      <Editor
        value={scad}
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

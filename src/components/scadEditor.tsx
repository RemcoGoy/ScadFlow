import { useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { javascript } from "@codemirror/lang-javascript";

interface ScadEditorProps {
  initialValue?: string;
  onChange?: (value: string) => void;
}

export function ScadEditor({ initialValue = "", onChange }: ScadEditorProps) {
  const [code, setCode] = useState(initialValue);

  const handleChange = (value: string) => {
    setCode(value);
    onChange?.(value);
  };

  return (
    <div className="scad-editor">
      <CodeMirror
        value={code}
        theme="dark"
        extensions={[javascript()]}
        onChange={handleChange}
      />
    </div>
  );
}

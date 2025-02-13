import CodeMirror from "@uiw/react-codemirror";
import { javascript } from "@codemirror/lang-javascript";
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

  const handleChange = (value: string) => {
    setScad(value);
    onChange?.(value);
  };

  return (
    <div className="scad-editor">
      <CodeMirror
        value={scad}
        theme="dark"
        extensions={[javascript()]}
        onChange={handleChange}
      />
    </div>
  );
}

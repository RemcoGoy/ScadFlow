import { useEffect, useRef } from "react";
import { useScadStore, type ParamVariable } from "@/store/scadStore";

export function parseScadVariables(code: string): ParamVariable[] {
  const vars: ParamVariable[] = [];
  const lines = code.split("\n");

  // Regex matches: name = value; // [options]
  const regex = /^([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*([^;]+)\s*;\s*\/\/\s*\[([^\]]+)\]/i;

  for (const line of lines) {
    const match = line.trim().match(regex);
    if (match) {
      const name = match[1];
      const origValStr = match[2].trim();
      const optionStr = match[3].trim();

      let parsedVal: any = origValStr;
      let type: "number" | "string" | "boolean" = "string";

      // Basic type evaluation
      if (origValStr === "true" || origValStr === "false") {
        parsedVal = origValStr === "true";
        type = "boolean";
      } else if (!isNaN(Number(origValStr))) {
        parsedVal = Number(origValStr);
        type = "number";
      } else if (origValStr.startsWith('"') && origValStr.endsWith('"')) {
        parsedVal = origValStr.slice(1, -1);
        type = "string";
      }

      // Parse custom options
      if (optionStr.includes(":")) {
        // Slider: [min:max:step] or [min:max]
        const parts = optionStr.split(":").map(Number);
        if (parts.length >= 2) {
          vars.push({
            name,
            value: parsedVal,
            type: "number",
            control: "slider",
            min: parts[0],
            max: parts[1],
            step: parts[2] ?? 1,
          });
        }
      } else {
        // Dropdown choices: [choice1, choice2]
        const choices = optionStr.split(",").map((c) => c.trim().replace(/^['"]|['"]$/g, ""));
        if (choices.length > 0) {
          vars.push({
            name,
            value: parsedVal,
            type: type,
            control: "select",
            choices,
          });
        }
      }
    }
  }
  return vars;
}

export function Customizer({
  onParametersChange,
}: {
  onParametersChange: (vars: ParamVariable[]) => void;
}) {
  const { scadCode, variables, setVariables, toggleCustomizer } = useScadStore();
  const initialParseDone = useRef(false);

  // Parse variables from code when the code changes
  useEffect(() => {
    const parsed = parseScadVariables(scadCode);

    // Merge existing user values with newly parsed variables to keep settings intact during typing
    const updatedVars = parsed.map((pv) => {
      const existing = variables.find((ev) => ev.name === pv.name);
      if (existing && typeof existing.value === typeof pv.value) {
        return { ...pv, value: existing.value };
      }
      return pv;
    });

    setVariables(updatedVars);
    initialParseDone.current = true;
  }, [scadCode]);

  const handleValueChange = (name: string, value: any) => {
    const updated = variables.map((v) => {
      if (v.name === name) {
        return { ...v, value };
      }
      return v;
    });
    setVariables(updated);
    onParametersChange(updated);
  };

  return (
    <div className="flex flex-col h-full bg-zinc-950 border-t border-zinc-900 text-zinc-300">
      <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-900 bg-zinc-950 select-none">
        <h2 className="text-xs font-semibold tracking-wider text-zinc-400 uppercase">
          Parameters Customizer
        </h2>
        <button
          onClick={toggleCustomizer}
          className="text-zinc-500 hover:text-zinc-300 transition-colors p-1"
          title="Minimize Parameters"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>
      <div className="flex-1 p-4 overflow-y-auto space-y-4">
        {variables.length === 0 ? (
          <div className="text-zinc-500 italic text-xs text-center">
            No customizer variables detected. Annotate variable lines with comments e.g.:
            <div className="font-mono text-zinc-600 mt-2 bg-zinc-900 p-2 rounded text-[10px] text-left not-italic">
              size = 20; // [10:100:1]
              <br />
              shape = "cube"; // [cube, sphere]
            </div>
          </div>
        ) : (
          variables.map((v) => (
            <div key={v.name} className="flex flex-col space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-zinc-400">{v.name}</span>
                <span className="font-mono text-blue-400 text-[11px] bg-zinc-900 px-1.5 py-0.5 rounded border border-zinc-800">
                  {String(v.value)}
                </span>
              </div>

              {v.control === "slider" ? (
                <div className="flex items-center space-x-3">
                  <span className="text-[10px] text-zinc-600 font-mono w-6 text-right select-none">
                    {v.min}
                  </span>
                  <input
                    type="range"
                    min={v.min}
                    max={v.max}
                    step={v.step}
                    value={v.value}
                    onChange={(e) => handleValueChange(v.name, Number(e.target.value))}
                    className="flex-1 h-1 bg-zinc-850 rounded-lg appearance-none cursor-pointer accent-blue-500"
                  />
                  <span className="text-[10px] text-zinc-600 font-mono w-6 select-none">
                    {v.max}
                  </span>
                </div>
              ) : v.control === "select" ? (
                <select
                  value={String(v.value)}
                  onChange={(e) => {
                    const val =
                      v.type === "number"
                        ? Number(e.target.value)
                        : v.type === "boolean"
                          ? e.target.value === "true"
                          : e.target.value;
                    handleValueChange(v.name, val);
                  }}
                  className="w-full bg-zinc-900 border border-zinc-800 text-zinc-200 rounded-md py-1.5 px-2 text-xs focus:outline-none focus:border-blue-500"
                >
                  {v.choices?.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              ) : null}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import { useScadStore, type ParamVariable } from "@/store/scadStore";

export function parseScadVariables(code: string): ParamVariable[] {
  const vars: ParamVariable[] = [];
  const lines = code.split("\n");

  const groupRegex = /^\/\/\s*(?:category|group):\s*(.+)/i;
  const varRegex = /^([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*([^;]+)\s*;\s*\/\/\s*\[([^\]]+)\]/i;

  let currentGroup = "Parameters";

  for (const line of lines) {
    const trimmed = line.trim();

    const groupMatch = trimmed.match(groupRegex);
    if (groupMatch) {
      currentGroup = groupMatch[1].trim();
      continue;
    }

    const match = trimmed.match(varRegex);
    if (match) {
      const name = match[1];
      const origValStr = match[2].trim();
      const optionStr = match[3].trim();

      let parsedVal: any = origValStr;
      let type: "number" | "string" | "boolean" = "string";

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

      if (optionStr.includes(":")) {
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
            group: currentGroup,
          });
        }
      } else {
        const choices = optionStr.split(",").map((c) => c.trim().replace(/^['"]|['"]$/g, ""));
        if (choices.length > 0) {
          vars.push({
            name,
            value: parsedVal,
            type: type,
            control: "select",
            choices,
            group: currentGroup,
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
  const { scadCode, variables, setVariables } = useScadStore();
  const initialParseDone = useRef(false);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const parsed = parseScadVariables(scadCode);

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

  const groups: Record<string, ParamVariable[]> = {};
  for (const v of variables) {
    const groupName = v.group || "Parameters";
    if (!groups[groupName]) {
      groups[groupName] = [];
    }
    groups[groupName].push(v);
  }

  useEffect(() => {
    setExpandedGroups((prev) => {
      const updated = { ...prev };
      for (const g of Object.keys(groups)) {
        if (updated[g] === undefined) {
          updated[g] = true;
        }
      }
      return updated;
    });
  }, [variables]);

  const toggleGroup = (groupName: string) => {
    setExpandedGroups((prev) => ({
      ...prev,
      [groupName]: !prev[groupName],
    }));
  };

  const handleValueChange = (name: string, value: any, commit: boolean = true) => {
    const updated = variables.map((v) => {
      if (v.name === name) {
        return { ...v, value };
      }
      return v;
    });
    setVariables(updated);
    if (commit) {
      onParametersChange(updated);
    }
  };

  const handleCommit = () => {
    onParametersChange(useScadStore.getState().variables);
  };

  return (
    <div className="flex flex-col h-full bg-panel-bg text-zinc-300">
      {/* Property Groups List - Flat Sidebar Design */}
      <div className="flex-1 overflow-y-auto divide-y divide-border-figma no-scrollbar">
        {variables.length === 0 ? (
          <div className="text-zinc-600 italic text-[11px] text-center flex flex-col items-center justify-center p-6 select-none">
            <span>No parameters parsed.</span>
            <div className="font-mono text-zinc-650 mt-2 bg-[#0b0e14]/50 border border-border-figma p-2.5 rounded text-[9px] text-left not-italic w-full leading-normal">
              // Group: Dimensions
              <br />
              size = 20; // [10:100:1]
            </div>
          </div>
        ) : (
          Object.entries(groups).map(([groupName, groupVars]) => {
            const isExpanded = expandedGroups[groupName] ?? true;

            return (
              <div key={groupName} className="bg-panel-bg">
                {/* Flat accordion group header */}
                <button
                  onClick={() => toggleGroup(groupName)}
                  className="w-full flex items-center justify-start px-3.5 py-2 mb-1 hover:bg-[#1e293b]/30 bg-[#131924]/40 border-y border-border-figma/40 transition-colors text-[11px] font-medium text-zinc-300 select-none tracking-wide"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className={`h-3 w-3 mr-2 transform text-zinc-500 transition-transform duration-150 ${
                      isExpanded ? "rotate-90" : ""
                    }`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2.5}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                  <span>{groupName}</span>
                </button>

                {/* Properties fields */}
                {isExpanded && (
                  <div className="px-3.5 pb-3.5 pt-1 space-y-3">
                    {groupVars.map((v) => (
                      <div key={v.name} className="flex items-center space-x-2">
                        {/* Label */}
                        <span
                          className="w-1/3 text-[10px] text-zinc-400 truncate select-none font-sans font-medium"
                          title={v.name}
                        >
                          {v.name}
                        </span>

                        {/* Controls */}
                        <div className="w-2/3 flex items-center space-x-2">
                          {v.control === "slider" ? (
                            <>
                              <input
                                type="range"
                                min={v.min}
                                max={v.max}
                                step={v.step}
                                value={v.value}
                                onChange={(e) =>
                                  handleValueChange(v.name, Number(e.target.value), false)
                                }
                                onMouseUp={handleCommit}
                                onTouchEnd={handleCommit}
                                onKeyUp={(e) => {
                                  if (
                                    ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(
                                      e.key,
                                    )
                                  ) {
                                    handleCommit();
                                  }
                                }}
                                className="figma-slider flex-1"
                              />
                              <input
                                type="text"
                                value={String(v.value)}
                                onChange={(e) => {
                                  const num = Number(e.target.value);
                                  if (!isNaN(num)) handleValueChange(v.name, num, false);
                                }}
                                onBlur={handleCommit}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    handleCommit();
                                  }
                                }}
                                className="w-11 bg-[#0b0e14] border border-border-figma text-zinc-300 font-mono text-[10px] rounded px-1 py-0.5 text-center focus:outline-none focus:border-scad-amber"
                              />
                            </>
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
                              className="w-full bg-[#0b0e14] border border-border-figma text-zinc-300 rounded px-1.5 py-0.5 text-[10px] focus:outline-none focus:border-scad-amber cursor-pointer transition-colors"
                            >
                              {v.choices?.map((c) => (
                                <option key={c} value={c}>
                                  {c}
                                </option>
                              ))}
                            </select>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";
import type {} from "@redux-devtools/extension"; // required for devtools typing

export interface LogEntry {
  text: string;
  type: "info" | "error";
  timestamp: string;
}

export interface FileItem {
  name: string;
  path: string;
  isDir: boolean;
  children?: FileItem[];
}

export interface ParamVariable {
  name: string;
  value: any;
  type: "number" | "string" | "boolean";
  control: "slider" | "select" | "input";
  min?: number;
  max?: number;
  step?: number;
  choices?: string[];
}

interface ScadState {
  scadCode: string;
  modelUrl: string;
  activeFilePath: string;
  filesList: FileItem[];
  logs: LogEntry[];
  isCompiling: boolean;
  variables: ParamVariable[];
  showConsole: boolean;
  showCustomizer: boolean;
  showSidebar: boolean;
  setScadCode: (scadCode: string) => void;
  setModelUrl: (modelUrl: string) => void;
  setActiveFilePath: (path: string) => void;
  setFilesList: (files: FileItem[]) => void;
  addLog: (text: string, type: "info" | "error") => void;
  clearLogs: () => void;
  setCompiling: (isCompiling: boolean) => void;
  setVariables: (variables: ParamVariable[]) => void;
  toggleConsole: () => void;
  toggleCustomizer: () => void;
  toggleSidebar: () => void;
}

export const useScadStore = create<ScadState>()(
  devtools(
    persist(
      (set) => ({
        scadCode: `// Welcome to ScadFlow pure web-first OpenSCAD editor!
// Try modifying parameters or including libraries.

size = 20; // [10:100:1]
height = 10; // [5:50:0.5]
shape = "cube"; // [cube, sphere, cylinder]

module draw_object() {
    if (shape == "cube") {
        cube([size, size, height], center = true);
    } else if (shape == "sphere") {
        sphere(r = size / 2, $fn = 50);
    } else if (shape == "cylinder") {
        cylinder(h = height, r = size / 2, center = true, $fn = 50);
    }
}

draw_object();
`,
        modelUrl: "",
        activeFilePath: "/main.scad",
        filesList: [],
        logs: [],
        isCompiling: false,
        variables: [],
        showConsole: true,
        showCustomizer: true,
        showSidebar: true,
        setScadCode: (scadCode) => set({ scadCode }),
        setModelUrl: (modelUrl) => set({ modelUrl }),
        setActiveFilePath: (path) => set({ activeFilePath: path }),
        setFilesList: (filesList) => set({ filesList }),
        addLog: (text, type) =>
          set((state) => ({
            logs: [
              ...state.logs,
              {
                text,
                type,
                timestamp: new Date().toLocaleTimeString(),
              },
            ].slice(-100), // Keep last 100 log entries
          })),
        clearLogs: () => set({ logs: [] }),
        setCompiling: (isCompiling) => set({ isCompiling }),
        setVariables: (variables) => set({ variables }),
        toggleConsole: () => set((state) => ({ showConsole: !state.showConsole })),
        toggleCustomizer: () => set((state) => ({ showCustomizer: !state.showCustomizer })),
        toggleSidebar: () => set((state) => ({ showSidebar: !state.showSidebar })),
      }),
      {
        name: "scad-storage",
        partialize: (state) => ({
          scadCode: state.scadCode,
          activeFilePath: state.activeFilePath,
          showConsole: state.showConsole,
          showCustomizer: state.showCustomizer,
          showSidebar: state.showSidebar,
        }),
      },
    ),
  ),
);

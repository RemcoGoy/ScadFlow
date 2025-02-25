import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";
import type {} from "@redux-devtools/extension"; // required for devtools typing

interface ScadState {
  scadCode: string;
  modelUrl: string;
  setScadCode: (scadCode: string) => void;
  setModelUrl: (modelUrl: string) => void;
}

export const useScadStore = create<ScadState>()(
  devtools(
    persist(
      (set) => ({
        scadCode: "",
        modelUrl: "",
        setScadCode: (scadCode) => set({ scadCode }),
        setModelUrl: (modelUrl) => set({ modelUrl }),
      }),
      {
        name: "scad-storage",
      }
    )
  )
);

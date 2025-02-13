import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";
import type {} from "@redux-devtools/extension"; // required for devtools typing

interface ScadState {
  scad: string;
  setScad: (scad: string) => void;
}

export const useScadStore = create<ScadState>()(
  devtools(
    persist(
      (set) => ({
        scad: "",
        setScad: (scad) => set({ scad }),
      }),
      {
        name: "scad-storage",
      }
    )
  )
);

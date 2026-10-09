import type { ParamVariable } from "@/store/scadStore";

// Messages exchanged between the main thread and scad.worker.ts

export interface CompileRequest {
  id: number;
  mainPath: string;
  variables: Pick<ParamVariable, "name" | "value" | "type">[];
}

export type WorkerMessage =
  | { type: "log"; id: number; text: string; level: "info" | "error" }
  | { type: "result"; id: number; status: "ok"; glb: Blob; seconds: string }
  | { type: "result"; id: number; status: "empty"; seconds: string }
  | { type: "result"; id: number; status: "error"; error: string };

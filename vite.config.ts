import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],

  // Add resolve configuration for path aliases
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },

  // The OpenSCAD worker is a module worker that code-splits the wasm loader
  worker: {
    format: "es",
  },

  // Limit dependency scanning to index.html to prevent scanning the libs/ folder
  optimizeDeps: {
    entries: ["index.html"],
  },
});

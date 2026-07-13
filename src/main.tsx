import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { registerOpenSCADLanguage } from "@/language/openscad-register-language";
import { createEditorFS } from "@/lib/fs/filesystem";

// Add window load event listener
window.addEventListener("load", async () => {
  try {
    // Initialize BrowserFS workspace
    await createEditorFS({ prefix: "/libraries", allowPersistence: true });
    console.log("BrowserFS workspace initialized successfully");
  } catch (error) {
    console.error("Failed to initialize BrowserFS workspace:", error);
  }
  await registerOpenSCADLanguage();
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

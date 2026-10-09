import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { registerOpenSCADLanguage } from "@/language/openscad-register-language";
import { extractLibrariesToOpfs } from "@/lib/fs/libraries";

// Add window load event listener
window.addEventListener("load", async () => {
  try {
    // Initialize OPFS and extract libraries
    await extractLibrariesToOpfs();
    console.log("OPFS workspace initialized successfully");
  } catch (error) {
    console.error("Failed to initialize OPFS workspace:", error);
  }
  await registerOpenSCADLanguage();
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

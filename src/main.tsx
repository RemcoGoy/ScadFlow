import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { registerOpenSCADLanguage } from "@/language/openscad-register-language";

// Add window load event listener
window.addEventListener("load", async () => {
  await registerOpenSCADLanguage();
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

---
"scadflow": minor
---

Convert ScadFlow to a pure web app with a multi-file workspace:

- Replace the Tauri shell with a browser-only build backed by OPFS, and switch the viewer to three.js
- Sidebar file tree with folders, drag-and-drop moves, rename/delete and a right-click context menu
- Autosave of editor and customizer changes
- Main file selection: the main file is always rendered and drives the customizer, with includes resolved relative to it
- Two-way sync with a linked local folder in Chromium browsers, and a folder import fallback elsewhere
- Fix stale renders for empty models and report compile errors in the console

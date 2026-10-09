# scadflow

## 0.2.0

### Minor Changes

- 38e92b6: Convert ScadFlow to a pure web app with a multi-file workspace:
  - Replace the Tauri shell with a browser-only build backed by OPFS, and switch the viewer to three.js
  - Sidebar file tree with folders, drag-and-drop moves, rename/delete and a right-click context menu
  - Autosave of editor and customizer changes
  - Main file selection: the main file is always rendered and drives the customizer, with includes resolved relative to it
  - Two-way sync with a linked local folder in Chromium browsers, and a folder import fallback elsewhere
  - Fix stale renders for empty models and report compile errors in the console

## 0.1.2

### Patch Changes

- e284f85: Fix CI/CD to only use `dev` branch

## 0.1.1

### Patch Changes

- 46b6d83: Add CI/CD pipelines

# OpenSCAD Web Editor 🎨

<div align="center">

A modern, feature-rich editor for OpenSCAD, built with [React](https://reactjs.org/) and [TypeScript](https://www.typescriptlang.org/). Create, edit, and visualize 3D models, powered by WebAssembly.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![OpenSCAD](https://img.shields.io/badge/Powered%20by-OpenSCAD-green)](https://openscad.org/)

</div>

## ✨ Features

- 🚀 **Real-time Compilation & Preview**: Your model re-renders automatically as you edit, shown in a three.js viewport.
- 🌐 **WebAssembly Engine**: Runs the original OpenSCAD interpreter directly in your browser, no install needed.
- 📝 **Monaco-based Editor**: Includes syntax highlighting, custom auto-completions, and snippets built specifically for OpenSCAD.
- 🎛️ **Parameters Customizer**: Interactively modify your model parameters (like sizes, counts, shapes) with auto-generated sliders and dropdowns.
- 📁 **Multi-file Workspace**: Organize files in folders with drag-and-drop and a right-click menu. Changes are saved automatically in the browser (OPFS), and you can export everything as a zip.
- 🎯 **Main File**: Pick the file to render; it stays rendered while you edit the files it `include`s or `use`s.
- 🔗 **Local Folder Sync**: Link a folder on disk (Chrome and Edge) to keep it in sync with the workspace in both directions, so you can work alongside your own editor or git. Other browsers can import a folder.

## 🗺️ Roadmap

- [x] Syntax highlighting
- [x] Auto-completion and code snippets
- [x] Multi-file workspace with main file selection
- [x] Two-way sync with a local folder
- [x] Export to various 3D formats (OFF and GLB)
- [x] Parameter customization UI
- [ ] Viewport tools: section planes, measurements, animation
- [ ] Sharing designs via URL
- [ ] Mesh analysis and 3D printer integrations
- [ ] Visual flow editor

See [ROADMAP.md](ROADMAP.md) for details.

## 🛠️ Prerequisites

Before you begin, ensure you have the following installed:

- [Node.js](https://nodejs.org/) (v22.13 or newer)
- [pnpm](https://pnpm.io/installation) (v10 or newer)
- [Git](https://git-scm.com/downloads)

## 📦 Installation

1. Clone the repository:
```bash
git clone https://github.com/RemcoGoy/scadflow.git
cd scadflow
```

2. Build the WebAssembly components:
```bash
make wasm
make public
```

3. Install dependencies:
```bash
pnpm install
```

4. Start the development server:
```bash
pnpm run dev
```

## 🏗️ Building for Production

```bash
pnpm run build
```

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request. For major changes, please open an issue first to discuss what you would like to change.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📚 References & Inspiration

This project stands on the shoulders of giants:

- [OpenSCAD](https://github.com/openscad/openscad) - The original OpenSCAD project
- [OpenSCAD WASM](https://github.com/openscad/openscad-wasm) - WebAssembly build of OpenSCAD
- [OpenSCAD Playground](https://github.com/openscad/openscad-playground) - Web-based OpenSCAD editor
- [OpenSCAD Documentation](https://openscad.org/documentation.html) - Official OpenSCAD documentation

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- The OpenSCAD team for their amazing work
- All contributors and supporters of this project

---

<div align="center">
Made with ❤️ by Remco Goyvaerts
</div>

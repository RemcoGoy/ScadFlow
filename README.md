# OpenSCAD Web Editor 🎨

<div align="center">

A modern, feature-rich (well, not yet) editor for OpenSCAD, built with [Tauri](https://tauri.app/), [React](https://reactjs.org/), and [TypeScript](https://www.typescriptlang.org/). Create, edit, and visualize 3D models, powered by WebAssembly.

![OpenSCAD Web Editor Screenshot](screenshot.png)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Made with Tauri](https://img.shields.io/badge/Made%20with-Tauri-blue)](https://tauri.app/)
[![OpenSCAD](https://img.shields.io/badge/Powered%20by-OpenSCAD-green)](https://openscad.org/)

</div>

## ✨ Features

- 🚀 Real-time OpenSCAD compilation and preview

- 🌐 WebAssembly-powered OpenSCAD engine
- 💻 Cross-platform support (Windows, macOS, Linux)

## 🗺️ Roadmap

- [ ] Syntax highlighting
- [ ] Auto-completion and code snippets
- [ ] Integrated documentation viewer
- [ ] File system integration
- [ ] Export to various 3D formats
- [ ] Parameter customization UI
- [ ] Integrated debugging tools
- [ ] Flow editor

## 🛠️ Prerequisites

Before you begin, ensure you have the following installed:

- [Node.js](https://nodejs.org/) (v21 or newer)
- [pnpm](https://pnpm.io/installation) (v10 or newer)
- [Rust](https://www.rust-lang.org/tools/install)
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
pnpm run tauri dev
```

## 🏗️ Building for Production

```bash
pnpm run tauri build
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

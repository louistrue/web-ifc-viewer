# IFC Viewer

[![Node.js](https://img.shields.io/badge/Node.js-v18.0.0+-green.svg)](https://nodejs.org)
[![Three.js](https://img.shields.io/badge/Three.js-v0.162.0-blue.svg)](https://threejs.org)
[![web-ifc](https://img.shields.io/badge/web--ifc-v0.0.46-orange.svg)](https://github.com/ThatOpen/engine_web-ifc)
[![Vite](https://img.shields.io/badge/Vite-v5.0.0-646CFF.svg)](https://vitejs.dev)
[![License](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](https://www.gnu.org/licenses/agpl-3.0.en.html)

A modern, web-based IFC viewer built with Three.js and web-ifc.

## Features

- 🏗️ Load and view IFC models in the browser
- 🔍 Interactive model exploration with picking and selection
- 📊 Display detailed IFC properties and relationships
- 🎨 Material and layer visualization
- 🛠️ Model manipulation tools (visibility, opacity)
- 📏 Grid and axes helpers
- 🎥 Orbit controls for camera navigation

## Installation

```bash
# Clone the repository
git clone [your-repo-url]

# Navigate to the project directory
cd ifc-viewer

# Install dependencies
npm install
```

## Development

```bash
# Start development server
npm run dev
```

## Building

```bash
# Build for production
npm run build

# Preview production build
npm run preview
```

## Dependencies

- [Three.js](https://threejs.org/) (v0.162.0) - 3D graphics library
- [web-ifc](https://github.com/ThatOpen/engine_web-ifc) (v0.0.46) - IFC parsing engine
- [three-mesh-bvh](https://github.com/gkjohnson/three-mesh-bvh) (v0.7.0) - Mesh optimization
- [Vite](https://vitejs.dev/) (v5.0.0) - Build tool and development server

## License

This project is licensed under the GNU Affero General Public License v3.0 (AGPL-3.0). This means:

- ✅ You can use this software for any purpose
- ✅ You can modify this software
- ✅ You can distribute this software
- ⚠️ You must disclose the source code when you distribute this software
- ⚠️ You must state the changes you made
- ⚠️ You must distribute your modifications under the same license
- ⚠️ You must provide the same rights to users interacting with your software over a network

See the [LICENSE](LICENSE) file for the full license text.

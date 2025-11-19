<div align="center">
  <img src="https://raw.githubusercontent.com/rezwanahmedsami/SaveAction-recorder-browser-extenstion/5a7b19469e082ae6f18a7917c2232bfa09f5898c/src/icons/icon.svg" alt="SaveAction Recorder Logo" width="128" height="128">
  
  # SaveAction Recorder
  
  > A cross-browser extension to record user interactions on web pages and export them as JSON files for automated testing.
  
  [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
  [![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg)](https://www.typescriptlang.org/)
</div>

## 🎯 Overview

SaveAction Recorder is a powerful browser extension designed to capture user interactions on any webpage. It records clicks, inputs, navigation, and more, then exports the data as structured JSON files. These recordings can be used with the SaveAction automated testing platform to replay and validate user workflows without writing any code.

## ✨ Features

- 🎬 **Comprehensive Recording**: Captures clicks, inputs, navigation, scrolls, form submissions, keyboard events
- 🌐 **Multi-Page Recording**: Seamlessly records actions across page navigation and reloads
- 🎮 **Overlay Controls**: Pause, resume, and stop recording directly from the webpage
- 🎯 **Multi-Selector Strategy**: Generates 7+ selector types per element for maximum reliability
- 🔢 **Sequential Action IDs**: Global action counter maintains continuous numbering across all pages
- 🔒 **Privacy-First**: Automatically masks sensitive data (passwords, credit cards, SSN)
- 📦 **Rich Metadata**: Records full context including coordinates, modifiers, timing, navigation triggers
- ⏱️ **Real-time Feedback**: Live timer and action counter in overlay
- 🌐 **Cross-Browser**: Works on Chrome, Firefox, Edge, Safari, and Chromium-based browsers
- 📋 **Production-Ready JSON**: Exports validated JSON with complete simulation data
- ⚡ **Zero Configuration**: No setup required, just install and start recording
- 🧪 **Fully Tested**: 164 unit tests with 100% coverage

## 🚀 Installation

### For Users

#### Chrome/Edge

1. Download the latest release from [GitHub Releases](https://github.com/rezwanahmedsami/SaveAction-recorder-browser-extenstion/releases)
2. Unzip the `saveaction-recorder-chrome.zip` file
3. Open Chrome/Edge and navigate to `chrome://extensions` or `edge://extensions`
4. Enable "Developer mode"
5. Click "Load unpacked" and select the unzipped folder

#### Firefox

1. Download the latest release from [GitHub Releases](https://github.com/rezwanahmedsami/SaveAction-recorder-browser-extenstion/releases)
2. Open Firefox and navigate to `about:addons`
3. Click the gear icon and select "Install Add-on From File"
4. Select the `saveaction-recorder-firefox.xpi` file

### For Developers

```bash
# Clone the repository
git clone https://github.com/rezwanahmedsami/SaveAction-recorder-browser-extenstion.git
cd SaveAction-recorder-browser-extenstion

# Install dependencies
npm install

# Run in development mode
npm run dev

# Build for all browsers
npm run build:all

# Run tests
npm test

# Run tests with coverage
npm run test:coverage
```

## 📖 Usage

### Recording Actions

1. **Start Recording**
   - Click the SaveAction icon in your browser toolbar
   - Enter a test name (e.g., "Login Flow Test")
   - Click "Start Recording"

2. **Interact with the Webpage**
   - An overlay indicator appears showing:
     - Recording status (green pulse)
     - Live timer and action count
     - Control buttons
   - All your actions are captured automatically:
     - Mouse clicks (with coordinates and modifiers)
     - Form inputs (text, selections, checkboxes, radio buttons)
     - Page navigation and reloads (multi-page support)
     - Scroll events (with positions)
     - Keyboard shortcuts
     - Form submissions

3. **Control Recording**
   - **⏸️ Pause**: Temporarily stop capturing actions
   - **▶️ Resume**: Continue recording from where you paused
   - **⏹️ Stop**: End recording and download JSON immediately

4. **Download Recording**
   - Click **Stop** button in the overlay for instant download
   - Or click the extension icon and use "Stop & Download"
   - JSON file saves automatically: `{testName}_{timestamp}.json`

### Multi-Page Recording

The extension automatically tracks actions across:

- Page navigations (clicking links)
- Form submissions that redirect
- Page reloads (F5 or Ctrl+R)
- Browser back/forward navigation

Action IDs remain sequential across all pages (e.g., act_001, act_002, ..., act_009) for a complete user journey recording.

## 🏗️ Development

### Project Structure

```
SaveAction-Recorder/
├── src/
│   ├── background/      # Service worker
│   ├── content/         # Content scripts (event capture)
│   ├── popup/           # Extension UI
│   ├── types/           # TypeScript definitions
│   ├── utils/           # Utilities (storage, validation, etc.)
│   └── manifest.json    # Extension manifest
├── tests/               # Vitest unit & integration tests
├── docs/                # Documentation
└── dist/                # Build outputs
```

### Tech Stack

- **TypeScript** - Type-safe development
- **Vite** - Fast building and bundling
- **Vitest** - Unit and integration testing
- **WebExtension Polyfill** - Cross-browser compatibility
- **ESLint + Prettier** - Code quality

### Available Scripts

```bash
npm run dev              # Start development server with hot reload
npm run build           # Build for production (all browsers)
npm run build:chrome    # Build for Chrome/Edge
npm run build:firefox   # Build for Firefox
npm run build:safari    # Build for Safari
npm run build:all       # Build for all browsers simultaneously
npm test                # Run tests (single run)
npm run test:watch      # Run tests in watch mode
npm run test:coverage   # Run tests with coverage report
npm run typecheck       # Run TypeScript type checking
npm run lint            # Run ESLint
npm run format          # Format code with Prettier
```

### CI/CD

The project includes a comprehensive GitHub Actions workflow that:

- Tests on Node.js 18.x, 20.x, and 22.x
- Runs type checking and linting
- Generates code coverage reports (Codecov integration)
- Builds for all browsers (Chrome, Firefox, Safari)
- Uploads build artifacts for releases

All tests must pass and coverage is tracked on every commit.

### Git Hooks (Husky)

The project uses [Husky](https://typicode.github.io/husky/) for Git hooks to maintain code quality:

**Pre-commit:**

- Auto-formats code with Prettier
- Lints with ESLint
- Only checks staged files (via lint-staged)

**Commit-msg:**

- Enforces [Conventional Commits](https://www.conventionalcommits.org/) format
- Valid types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`
- Example: `feat: add recording pause functionality`

**Pre-push:**

- Runs TypeScript type checking
- Executes all 164 unit tests

See [docs/HUSKY_SETUP.md](./docs/HUSKY_SETUP.md) for detailed documentation.

## 📄 JSON Output Format

The recorder exports a structured JSON file with complete action metadata:

```json
{
  "id": "rec_1700305800000",
  "testName": "User Login Flow",
  "url": "https://example.com/login",
  "startTime": "2025-11-18T10:30:00.000Z",
  "endTime": "2025-11-18T10:31:30.000Z",
  "viewport": { "width": 1920, "height": 1080 },
  "actions": [
    {
      "id": "act_001",
      "type": "click",
      "selector": {
        "id": "email",
        "css": "#email",
        "xpath": "//input[@id='email']",
        "priority": ["id", "css", "xpath"]
      },
      "coordinates": { "x": 50, "y": 15 },
      "coordinatesRelativeTo": "element",
      "clickCount": 1
    }
  ]
}
```

See [JSON_SCHEMA.md](./docs/JSON_SCHEMA.md) for complete documentation.

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](./CONTRIBUTING.md) for details.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Built with ❤️ for the SaveAction automated testing platform
- Inspired by tools like Selenium IDE and Playwright Codegen

## 📬 Support

- 🐛 [Report a bug](https://github.com/rezwanahmedsami/SaveAction-recorder-browser-extenstion/issues/new?template=bug_report.md)
- 💡 [Request a feature](https://github.com/rezwanahmedsami/SaveAction-recorder-browser-extenstion/issues/new?template=feature_request.md)
- 💬 [Discussions](https://github.com/rezwanahmedsami/SaveAction-recorder-browser-extenstion/discussions)

---

**Made with 🚀 by the SaveAction Team**

# SaveAction Recorder - Implementation Plan

## Project Overview
A cross-browser extension to record user interactions on web pages and export them as JSON files for automated testing.

**Target Browsers:** Chrome, Firefox, Edge, Safari, and Chromium-based browsers

---

## Technology Stack

### Core
- **TypeScript** - Type safety and better maintainability
- **Vite** - Fast bundling and development
- **Manifest V3** - Modern extension standard (with V2 fallback for Firefox if needed)
- **WebExtension Polyfill** - Cross-browser API compatibility

### Testing
- **Vitest** - Fast unit testing (Vite-native)
- **Testing Library** - Component testing
- **web-ext** - Extension testing and validation

### Code Quality
- **ESLint** - Linting
- **Prettier** - Code formatting
- **Husky** - Git hooks
- **Commitlint** - Conventional commits

---

## Project Structure

```
SaveAction-Recorder/
├── src/
│   ├── background/
│   │   ├── index.ts              # Service worker (background script)
│   │   └── message-handler.ts    # Message routing
│   ├── content/
│   │   ├── index.ts              # Content script entry
│   │   ├── event-listener.ts     # DOM event capturing
│   │   ├── selector-generator.ts # Multi-selector generation
│   │   └── action-recorder.ts    # Action state management
│   ├── popup/
│   │   ├── index.html            # Popup UI
│   │   ├── index.ts              # Popup logic
│   │   └── styles.css            # Popup styles
│   ├── types/
│   │   ├── actions.ts            # Action type definitions
│   │   ├── selectors.ts          # Selector type definitions
│   │   └── recording.ts          # Recording session types
│   ├── utils/
│   │   ├── storage.ts            # Chrome storage API wrapper
│   │   ├── download.ts           # JSON file download
│   │   ├── sanitizer.ts          # Sensitive data masking
│   │   └── validator.ts          # Data validation
│   └── manifest.json             # Extension manifest
├── tests/
│   ├── unit/
│   │   ├── selector-generator.test.ts
│   │   ├── sanitizer.test.ts
│   │   └── validator.test.ts
│   └── integration/
│       └── recording-flow.test.ts
├── dist/                         # Build output (gitignored)
├── docs/
│   └── JSON_SCHEMA.md           # Recording format documentation
├── .github/
│   └── workflows/
│       └── ci.yml               # CI/CD pipeline
├── package.json
├── tsconfig.json
├── vite.config.ts
├── .eslintrc.json
├── .prettierrc
├── .gitignore
├── LICENSE                       # MIT License
└── README.md
```

---

## Phase 1: Project Setup (TDD Foundation)

### 1.1 Initialize Project
- [ ] Create package.json with dependencies
- [ ] Setup TypeScript configuration
- [ ] Configure Vite for multi-entry build
- [ ] Setup Vitest for testing
- [ ] Configure ESLint + Prettier
- [ ] Create .gitignore
- [ ] Add MIT License
- [ ] Create basic README.md

### 1.2 Cross-Browser Compatibility Setup
- [ ] Install webextension-polyfill
- [ ] Configure manifest.json for Manifest V3
- [ ] Setup browser-specific builds (Chrome, Firefox, Safari)
- [ ] Configure web-ext for testing

---

## Phase 2: Core Type Definitions (TDD)

### 2.1 Define Types (`src/types/`)
**Test First:** Write type tests and validation tests

```typescript
// actions.ts - Action types
interface BaseAction {
  id: string;                    // Unique action ID (act_xxx)
  type: ActionType;
  timestamp: number;             // Unix timestamp in milliseconds
  url: string;                   // Current page URL
  frameId?: string;              // iFrame identifier if in frame
  frameUrl?: string;             // iFrame URL if in frame
  frameSelector?: string;        // Selector to target frame
}

interface ClickAction extends BaseAction {
  type: 'click';
  selector: SelectorStrategy;    // Multi-strategy selector object
  tagName: string;
  text?: string;                 // Button/link text content
  coordinates: { x: number; y: number };
  coordinatesRelativeTo: 'element' | 'viewport' | 'document';
  button: 'left' | 'right' | 'middle';
  clickCount: number;            // 1 = single, 2 = double
  modifiers: ModifierKey[];      // ['ctrl', 'shift', 'alt', 'meta']
}

interface InputAction extends BaseAction {
  type: 'input';
  selector: SelectorStrategy;
  tagName: string;
  value: string;                 // Masked if sensitive
  inputType: string;             // text, email, password, etc.
  isSensitive: boolean;          // True for passwords/cards
  simulationType: 'type' | 'setValue'; // Keystroke vs instant
  typingDelay?: number;          // Delay between keystrokes (ms)
}

interface SelectAction extends BaseAction {
  type: 'select';
  selector: SelectorStrategy;
  tagName: 'select';
  selectedValue: string;
  selectedText: string;
  selectedIndex: number;
}

interface NavigationAction extends BaseAction {
  type: 'navigation';
  from: string;
  to: string;
  navigationTrigger: 'click' | 'form-submit' | 'manual' | 'redirect' | 'back' | 'forward';
  waitUntil: 'load' | 'domcontentloaded' | 'networkidle';
  duration: number;              // Navigation duration in ms
}

interface ScrollAction extends BaseAction {
  type: 'scroll';
  scrollX: number;
  scrollY: number;
  element: 'window' | SelectorStrategy; // Window or specific element
}

interface KeypressAction extends BaseAction {
  type: 'keypress';
  key: string;                   // 'Enter', 'Escape', 'Tab', etc.
  code: string;                  // KeyboardEvent.code
  modifiers: ModifierKey[];
}

interface SubmitAction extends BaseAction {
  type: 'submit';
  selector: SelectorStrategy;    // Form selector
  tagName: 'form';
  formData?: Record<string, string>; // Sanitized form data
}

interface CheckpointAction extends BaseAction {
  type: 'checkpoint';
  checkType: 'urlMatch' | 'elementVisible' | 'elementText' | 'pageLoad';
  expectedUrl?: string;
  actualUrl?: string;
  selector?: SelectorStrategy;
  expectedValue?: string;
  actualValue?: string;
  passed: boolean;
}

type ModifierKey = 'ctrl' | 'shift' | 'alt' | 'meta';

type Action = ClickAction | InputAction | SelectAction | NavigationAction | 
              ScrollAction | KeypressAction | SubmitAction | CheckpointAction;
```

```typescript
// selectors.ts - Multi-selector strategy
interface SelectorStrategy {
  // Primary selectors (ordered by stability)
  id?: string;                   // Highest priority: element ID
  dataTestId?: string;           // Second: data-testid attribute
  ariaLabel?: string;            // Third: ARIA label
  name?: string;                 // Fourth: name attribute (forms)
  
  // Fallback selectors
  css?: string;                  // Combined CSS selector
  xpath?: string;                // XPath (relative preferred)
  xpathAbsolute?: string;        // Absolute XPath (last resort)
  
  // Content-based selectors
  text?: string;                 // Exact text content
  textContains?: string;         // Partial text match
  
  // Position-based selector (least stable)
  position?: {
    parent: string;              // Parent element selector
    index: number;               // nth-child index
  };
  
  // Selector priority order for playback
  priority: SelectorType[];      // ['id', 'dataTestId', 'css', 'xpath']
}

type SelectorType = 'id' | 'dataTestId' | 'ariaLabel' | 'name' | 
                    'css' | 'xpath' | 'xpathAbsolute' | 'text' | 
                    'textContains' | 'position';

// Selector generation config
interface SelectorConfig {
  preferStableSelectors: boolean; // Prioritize ID, data-testid
  includeXPath: boolean;          // Generate XPath
  includeText: boolean;           // Include text-based selectors
  includePosition: boolean;       // Include position (fallback only)
  maxCssDepth: number;            // Max CSS selector nesting depth
}
```

```typescript
// recording.ts - Recording session
interface Recording {
  id: string;
  testName: string;
  url: string;
  startTime: string;
  endTime?: string;
  viewport: { width: number; height: number };
  userAgent: string;
  actions: Action[];
  version: string; // Schema version
}
```

---

## Phase 3: Selector Generator (TDD)

### 3.1 Build Selector Generator (`src/content/selector-generator.ts`)
**Test First:** Write tests for each selector strategy

**Features:**
- [ ] Generate ID selector (highest priority)
- [ ] Generate data-testid selector
- [ ] Generate name attribute selector (for form fields)
- [ ] Generate ARIA label selector
- [ ] Generate CSS selector (class, tag, attributes)
- [ ] Generate relative XPath
- [ ] Generate absolute XPath (fallback)
- [ ] Generate text-based selector (exact and contains)
- [ ] Generate position-based selector (nth-child - last resort)
- [ ] Return priority-ordered selector array
- [ ] Validate selectors uniquely identify element
- [ ] Handle shadow DOM
- [ ] Handle iframes
- [ ] Generate multiple selectors per element (minimum 3, ideally 6+)

**Selector Priority Order (Critical for Reliability):**
1. `id` - Most stable
2. `dataTestId` - Second most stable
3. `ariaLabel` - Accessibility-based
4. `name` - Form fields
5. `css` - Combined CSS
6. `text` - Content-based
7. `xpath` - Relative XPath
8. `xpathAbsolute` - Absolute path
9. `position` - Last resort (fragile)

**Tests:**
```typescript
describe('SelectorGenerator', () => {
  it('should generate ID selector when element has ID')
  it('should generate data-testid when available')
  it('should generate name selector for form inputs')
  it('should generate ARIA label selector')
  it('should generate CSS selector with classes')
  it('should generate relative XPath')
  it('should generate absolute XPath as fallback')
  it('should generate text-based selector')
  it('should generate position-based selector')
  it('should return priority-ordered selector array')
  it('should generate minimum 3 selectors per element')
  it('should validate selector uniqueness')
  it('should handle elements in shadow DOM')
  it('should handle elements in iframes')
  it('should prioritize stable selectors over fragile ones')
  it('should handle elements without ID or data-testid')
})
```

---

## Phase 4: Event Listener (TDD)

### 4.1 Build Event Capture System (`src/content/event-listener.ts`)
**Test First:** Write integration tests for event capture

**Events to Capture (with full context):**
- [ ] Click (left, right, middle, double-click)
  - Capture: coordinates, coordinatesRelativeTo, button, clickCount, modifiers, text
- [ ] Input (text, email, password, number, tel, url, search)
  - Capture: value, inputType, isSensitive, simulationType, typingDelay
- [ ] Change (select, checkbox, radio, file)
  - Capture: selectedValue, selectedText, selectedIndex, checked state
- [ ] Submit (forms)
  - Capture: form selector, sanitized formData
- [ ] Navigation (pushState, popstate, hashchange, reload)
  - Capture: from, to, navigationTrigger, waitUntil, duration
- [ ] Keypress (Enter, Tab, Escape, Arrow keys)
  - Capture: key, code, modifiers
- [ ] Focus/Blur (for accessibility)
  - Capture: selector, focusReason
- [ ] Scroll (window and element scrolling)
  - Capture: scrollX, scrollY, element selector
- [ ] Hover (debounced, only triggering dropdowns/tooltips)
  - Capture: selector, duration
- [ ] File upload
  - Capture: filename(s), mimeType, size (not actual file content)

**Critical Context Capture:**
- [ ] Coordinates relative to element (not just viewport)
- [ ] Modifier keys for all click/keypress events
- [ ] Typing simulation delay (average time between keystrokes)
- [ ] Navigation wait conditions (load, domcontentloaded, networkidle)
- [ ] Navigation duration for timeout reference
- [ ] Navigation trigger source (click, submit, manual)
- [ ] Form submission with sanitized data
- [ ] Click count for double-clicks
- [ ] Auto-detect checkpoints after navigation

**Smart Filtering:**
- [ ] Debounce rapid input events (combine into single action)
- [ ] Debounce scroll events (capture final position)
- [ ] Ignore non-interactive elements (div, span without handlers)
- [ ] Filter out framework-generated events (React, Vue internals)
- [ ] Detect and ignore robot/automation tools
- [ ] Ignore duplicate consecutive actions
- [ ] Filter out noise events (empty inputs, accidental clicks)

**Tests:**
```typescript
describe('EventListener', () => {
  it('should capture click events with full context')
  it('should capture coordinates relative to element')
  it('should capture modifier keys on clicks')
  it('should detect double-clicks')
  it('should debounce input events')
  it('should capture typing delay for simulation')
  it('should detect sensitive input fields')
  it('should capture select dropdown changes')
  it('should capture form submissions')
  it('should capture navigation with trigger source')
  it('should capture navigation duration')
  it('should auto-create checkpoints after navigation')
  it('should ignore mousemove events')
  it('should ignore framework-generated events')
  it('should handle events in iframes')
  it('should debounce scroll events')
  it('should capture keypress with modifiers')
})
```

---

## Phase 5: Action Recorder (TDD)

### 5.1 Build Recording State Manager (`src/content/action-recorder.ts`)
**Test First:** Write tests for state management

**Features:**
- [ ] Start recording (requires test name)
- [ ] Stop recording
- [ ] Pause/resume recording
- [ ] Add actions to session
- [ ] Generate unique action IDs
- [ ] Track recording metadata (including test name)
- [ ] Handle session persistence
- [ ] Clear recording
- [ ] Validate test name before starting

**Tests:**
```typescript
describe('ActionRecorder', () => {
  it('should require test name to start recording')
  it('should reject empty or invalid test names')
  it('should start new recording session with valid test name')
  it('should add actions to current recording')
  it('should pause and resume recording')
  it('should stop and finalize recording')
  it('should prevent duplicate actions')
  it('should maintain action order')
  it('should store test name in recording metadata')
})
```

---

## Phase 6: Sanitizer & Validator (TDD)

### 6.1 Build Data Sanitizer (`src/utils/sanitizer.ts`)
**Test First:** Write security-focused tests

**Features:**
- [ ] Detect password fields
- [ ] Detect credit card inputs
- [ ] Detect email/phone fields
- [ ] Mask sensitive values
- [ ] Allow user to mark fields as sensitive
- [ ] Sanitize before storage

**Tests:**
```typescript
describe('Sanitizer', () => {
  it('should mask password field values')
  it('should mask credit card numbers')
  it('should preserve non-sensitive data')
  it('should detect input type="password"')
  it('should detect common password field names')
})
```

### 6.2 Build Data Validator (`src/utils/validator.ts`)
**Test First:** Write schema validation tests

**Features:**
- [ ] Validate recording schema (all required fields)
- [ ] Validate action types and structures
- [ ] Validate selector strategy (minimum 3 selectors)
- [ ] Validate selector priority array
- [ ] Validate timestamps (chronological order)
- [ ] Validate URLs (valid HTTP/HTTPS)
- [ ] Validate test name (filename-safe)
- [ ] Validate JSON export before download
- [ ] Validate coordinatesRelativeTo values
- [ ] Validate navigationTrigger values
- [ ] Validate waitUntil values
- [ ] Validate simulationType values

**Tests:**
```typescript
describe('Validator', () => {
  it('should validate complete recording schema')
  it('should reject recording without required fields')
  it('should validate action has minimum 3 selectors')
  it('should validate selector priority matches available selectors')
  it('should reject actions with invalid timestamps')
  it('should validate test name is filename-safe')
  it('should validate URLs are valid HTTP/HTTPS')
  it('should validate coordinatesRelativeTo enum')
  it('should reject click without clickCount')
  it('should reject input without simulationType')
  it('should reject navigation without waitUntil')
  it('should validate endTime is after startTime')
})
```

---

## Phase 7: Background Script (TDD)

### 7.1 Build Service Worker (`src/background/index.ts`)
**Test First:** Write message handler tests

**Features:**
- [ ] Handle messages from content script
- [ ] Handle messages from popup
- [ ] Manage recording state
- [ ] Store recordings in chrome.storage
- [ ] Handle extension lifecycle
- [ ] Validate test name before starting recording

**Tests:**
```typescript
describe('Background Script', () => {
  it('should initialize on extension install')
  it('should reject start recording without test name')
  it('should handle start recording message with valid test name')
  it('should handle stop recording message')
  it('should store recording with test name in chrome.storage')
  it('should retrieve recordings')
  it('should sanitize test name for storage key')
})
```

---

## Phase 8: Popup UI

### 8.1 Build Extension Popup (`src/popup/`)
**Simple, functional UI**

**Features:**
- [ ] Test name input field (required before recording)
- [ ] Start/Stop recording button
- [ ] Pause/Resume recording button
- [ ] Recording status indicator
- [ ] Action count display
- [ ] Download JSON button
- [ ] Clear recording button
- [ ] Settings (sensitivity options)

**UI Guidelines:**
1. **Test Name is Mandatory**
   - Test name input field must be filled before "Start Recording" button becomes enabled
   - Show validation message if user tries to start without test name
   - Minimum 3 characters, maximum 100 characters
   - Auto-focus on test name field when popup opens (if not recording)

2. **State-Based UI**
   - **Idle State:** Test name input enabled, Start button enabled (if name valid), other buttons disabled
   - **Recording State:** Test name input disabled, Stop/Pause buttons enabled, Download disabled
   - **Paused State:** Resume/Stop buttons enabled, test name shows but disabled
   - **Recorded (Stopped) State:** Download/Clear enabled, Start new test enabled

3. **Visual Feedback**
   - Recording indicator: Red dot animation + "Recording..." text
   - Paused indicator: Yellow dot + "Paused" text
   - Action counter: Live update during recording
   - Disabled buttons: Greyed out with cursor:not-allowed

4. **Validation & Error Handling**
   - Show error if test name is empty on Start attempt
   - Show warning if test name contains special characters (/, \, :, *, ?, ", <, >, |)
   - Sanitize test name for filename safety
   - Show error if recording fails to start

**Layout:**
```
┌─────────────────────────┐
│   SaveAction Recorder   │
├─────────────────────────┤
│ Test Name: *            │
│ [___________________]   │
│ (Required to start)     │
│                         │
│ Status: ○ Not Recording │
│ Actions: 0              │
│                         │
│ [▶ Start Recording]     │ ← Disabled until test name valid
│                         │
└─────────────────────────┘

After starting:
┌─────────────────────────┐
│   SaveAction Recorder   │
├─────────────────────────┤
│ Test: Login Flow Test   │ ← Display only, not editable
│                         │
│ Status: ● Recording     │
│ Actions: 15             │
│                         │
│ [■ Stop]  [⏸ Pause]    │
│                         │
└─────────────────────────┘

After stopping:
┌─────────────────────────┐
│   SaveAction Recorder   │
├─────────────────────────┤
│ Test: Login Flow Test   │
│                         │
│ Status: ○ Stopped       │
│ Actions: 23             │
│                         │
│ [↓ Download JSON]      │
│ [🗑 Clear] [▶ New Test] │
└─────────────────────────┘
```

---

## Phase 9: Storage & Download (TDD)

### 9.1 Build Storage Wrapper (`src/utils/storage.ts`)
**Test First:** Write storage tests with mocks

**Features:**
- [ ] Save recording to chrome.storage.local
- [ ] Retrieve recordings
- [ ] Clear storage
- [ ] Handle storage quota
- [ ] Cross-browser compatibility

### 9.2 Build Download Handler (`src/utils/download.ts`)
**Features:**
- [ ] Generate JSON blob
- [ ] Trigger browser download
- [ ] Generate filename (testname-timestamp.json)
- [ ] Handle download permissions

---

## Phase 10: Cross-Browser Build System

### 10.1 Configure Vite for Multi-Target Build
**Targets:**
- [ ] Chrome (Manifest V3)
- [ ] Firefox (Manifest V2/V3)
- [ ] Edge (Manifest V3)
- [ ] Safari (Manifest V3 with webkit prefix)

**Build Scripts:**
```json
{
  "scripts": {
    "dev": "vite",
    "build": "npm run build:chrome && npm run build:firefox && npm run build:safari",
    "build:chrome": "vite build --mode chrome",
    "build:firefox": "vite build --mode firefox",
    "build:safari": "vite build --mode safari",
    "test": "vitest",
    "test:coverage": "vitest --coverage",
    "lint": "eslint src --ext .ts",
    "format": "prettier --write \"src/**/*.{ts,json,css,html}\""
  }
}
```

### 10.2 Manifest Variations
- [ ] Create base manifest.json
- [ ] Generate browser-specific manifests during build
- [ ] Handle browser-specific permissions

---

## Phase 11: Documentation

### 11.1 README.md
**Sections:**
- [ ] Project description
- [ ] Features
- [ ] Installation (for users)
- [ ] Development setup
- [ ] Building from source
- [ ] Usage guide
- [ ] Contributing guidelines
- [ ] License

### 11.2 JSON Schema Documentation (`docs/JSON_SCHEMA.md`)
- [ ] Document recording format with all fields
- [ ] Document all action types with examples
- [ ] Document selector strategy in detail
- [ ] Document validation rules
- [ ] Provide complete examples for each action type
- [ ] Document priority ordering logic
- [ ] Document simulation requirements (typingDelay, coordinatesRelativeTo, etc.)
- [ ] Document checkpoint auto-generation
- [ ] Provide migration guide for schema updates
- [ ] Version history and breaking changes

### 11.3 API Documentation
- [ ] Document message passing API
- [ ] Document storage structure
- [ ] Document selector priority

---

## Phase 12: Testing & Quality Assurance

### 12.1 Unit Tests
- [ ] Achieve >80% code coverage
- [ ] Test all utils
- [ ] Test selector generation
- [ ] Test sanitization

### 12.2 Integration Tests
- [ ] Test full recording flow
- [ ] Test cross-script communication
- [ ] Test storage operations

### 12.3 Manual Testing
- [ ] Test on Chrome
- [ ] Test on Firefox
- [ ] Test on Edge
- [ ] Test on Safari
- [ ] Test on various websites (simple, SPA, complex)

### 12.4 Browser Compatibility Testing
- [ ] Test WebExtension polyfill
- [ ] Test on all target browsers
- [ ] Validate manifest compatibility

---

## Phase 13: CI/CD Setup

### 13.1 GitHub Actions
- [ ] Automated testing on push
- [ ] Linting checks
- [ ] Build verification
- [ ] Cross-browser build
- [ ] Release automation

---

## Phase 14: MVP Release

### 14.1 Pre-Release Checklist
- [ ] All tests passing
- [ ] Documentation complete
- [ ] LICENSE file added (MIT)
- [ ] CHANGELOG.md created
- [ ] README.md polished
- [ ] Build artifacts tested

### 14.2 Distribution
- [ ] Chrome Web Store (optional for MVP)
- [ ] Firefox Add-ons (optional for MVP)
- [ ] GitHub Releases with build artifacts
- [ ] Installation instructions

---

## Future Enhancements (Post-MVP)

### Phase 15: Advanced Features
- [ ] Visual assertion builder (screenshot comparison)
- [ ] Smart wait detection (network idle, element visibility)
- [ ] iFrame deep support
- [ ] Shadow DOM full support
- [ ] Edit recorded actions in popup
- [ ] Export to multiple formats (Playwright, Cypress, Selenium)
- [ ] Cloud sync (upload to SaveAction platform)
- [ ] Recording annotations
- [ ] Variable extraction from page
- [ ] API request recording (intercept fetch/XHR)

---

## JSON Export Format (Production-Ready Schema)

**⚠️ CRITICAL: This schema is the contract between recorder and playback engine. All fields are mandatory unless marked optional.**

```json
{
  "id": "rec_1700305800000",
  "testName": "User Login Flow",
  "url": "https://example.com/login",
  "startTime": "2025-11-18T10:30:00.000Z",
  "endTime": "2025-11-18T10:31:30.000Z",
  "viewport": {
    "width": 1920,
    "height": 1080
  },
  "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36...",
  "version": "1.0.0",
  "actions": [
    {
      "id": "act_001",
      "type": "navigation",
      "timestamp": 1700305800000,
      "url": "https://example.com/login",
      "to": "https://example.com/login",
      "navigationTrigger": "manual",
      "waitUntil": "load",
      "duration": 1200
    },
    {
      "id": "act_002",
      "type": "click",
      "timestamp": 1700305802000,
      "url": "https://example.com/login",
      "selector": {
        "id": "email",
        "dataTestId": "email-input",
        "ariaLabel": "Email address",
        "name": "email",
        "css": "#email",
        "xpath": "//input[@id='email']",
        "xpathAbsolute": "/html/body/div[1]/form/input[1]",
        "text": "",
        "position": {
          "parent": "form.login-form",
          "index": 0
        },
        "priority": ["id", "dataTestId", "name", "css", "xpath"]
      },
      "tagName": "input",
      "coordinates": { "x": 50, "y": 15 },
      "coordinatesRelativeTo": "element",
      "button": "left",
      "clickCount": 1,
      "modifiers": []
    },
    {
      "id": "act_003",
      "type": "input",
      "timestamp": 1700305803000,
      "url": "https://example.com/login",
      "selector": {
        "id": "email",
        "dataTestId": "email-input",
        "name": "email",
        "css": "#email",
        "xpath": "//input[@id='email']",
        "priority": ["id", "dataTestId", "name", "css"]
      },
      "tagName": "input",
      "value": "user@example.com",
      "inputType": "email",
      "isSensitive": false,
      "simulationType": "type",
      "typingDelay": 50
    },
    {
      "id": "act_004",
      "type": "click",
      "timestamp": 1700305805000,
      "url": "https://example.com/login",
      "selector": {
        "id": "password",
        "dataTestId": "password-input",
        "name": "password",
        "css": "#password",
        "xpath": "//input[@id='password']",
        "priority": ["id", "dataTestId", "name", "css"]
      },
      "tagName": "input",
      "coordinates": { "x": 50, "y": 15 },
      "coordinatesRelativeTo": "element",
      "button": "left",
      "clickCount": 1,
      "modifiers": []
    },
    {
      "id": "act_005",
      "type": "input",
      "timestamp": 1700305806000,
      "url": "https://example.com/login",
      "selector": {
        "id": "password",
        "dataTestId": "password-input",
        "name": "password",
        "css": "#password",
        "xpath": "//input[@id='password']",
        "priority": ["id", "dataTestId", "name", "css"]
      },
      "tagName": "input",
      "value": "***MASKED***",
      "inputType": "password",
      "isSensitive": true,
      "simulationType": "type",
      "typingDelay": 50
    },
    {
      "id": "act_006",
      "type": "click",
      "timestamp": 1700305808000,
      "url": "https://example.com/login",
      "selector": {
        "dataTestId": "login-button",
        "css": "button[type='submit']",
        "xpath": "//button[@type='submit']",
        "text": "Sign In",
        "position": {
          "parent": "form.login-form",
          "index": 2
        },
        "priority": ["dataTestId", "css", "text", "xpath"]
      },
      "tagName": "button",
      "text": "Sign In",
      "coordinates": { "x": 60, "y": 20 },
      "coordinatesRelativeTo": "element",
      "button": "left",
      "clickCount": 1,
      "modifiers": []
    },
    {
      "id": "act_007",
      "type": "navigation",
      "timestamp": 1700305810000,
      "url": "https://example.com/login",
      "from": "https://example.com/login",
      "to": "https://example.com/dashboard",
      "navigationTrigger": "form-submit",
      "waitUntil": "networkidle",
      "duration": 850
    },
    {
      "id": "act_008",
      "type": "checkpoint",
      "timestamp": 1700305811000,
      "url": "https://example.com/dashboard",
      "checkType": "urlMatch",
      "expectedUrl": "https://example.com/dashboard",
      "actualUrl": "https://example.com/dashboard",
      "passed": true
    }
  ]
}
```

**Schema Validation Rules (Critical):**

1. **Recording Level:**
   - `id`: Must be unique, format: `rec_<timestamp>`
   - `testName`: Required, 3-100 characters, filename-safe
   - `url`: Starting URL, must be valid HTTP(S)
   - `startTime`: ISO 8601 format
   - `endTime`: ISO 8601 format, must be after startTime
   - `version`: Semantic version (1.0.0)

2. **Action Level:**
   - `id`: Must be unique within recording, format: `act_<sequence>`
   - `timestamp`: Unix milliseconds, must be >= startTime
   - `selector`: Must contain minimum 3 selector strategies
   - `selector.priority`: Must list available selectors in priority order

3. **Selector Requirements:**
   - At least 3 different selector types
   - Priority array must match available selectors
   - ID selector preferred if available
   - Position selector only if no better option

4. **Input Actions:**
   - `simulationType` required for playback behavior
   - `typingDelay` required if simulationType is "type"
   - `isSensitive` must be true for password fields

5. **Click Actions:**
   - `coordinatesRelativeTo` required for accurate replay
   - `modifiers` must be array (empty if none)
   - `clickCount` required (1 or 2)

6. **Navigation Actions:**
   - `navigationTrigger` required for debugging
   - `waitUntil` required for playback timing
   - `duration` required for timeout calculation

---

## Success Criteria

### MVP Complete When:
- ✅ Records clicks, inputs, selects, navigation, scroll, keypress on any webpage
- ✅ Generates minimum 3 selectors per element (ideally 6+)
- ✅ Captures full context: coordinates (relative to element), modifiers, click count
- ✅ Captures typing delay for realistic simulation
- ✅ Captures navigation triggers and wait conditions
- ✅ Captures navigation duration for timeout reference
- ✅ Auto-generates checkpoints after navigation
- ✅ Masks sensitive data (passwords, credit cards)
- ✅ Validates selector uniqueness
- ✅ Validates complete schema before export
- ✅ Exports production-ready JSON to local file
- ✅ Test name required before recording starts
- ✅ UI states properly managed (Idle → Recording → Paused → Stopped)
- ✅ Works on Chrome, Firefox, Edge, Safari
- ✅ Has >80% test coverage
- ✅ Comprehensive documentation (README, JSON schema with validation rules)
- ✅ MIT License
- ✅ Clean, maintainable, type-safe codebase

---

## Timeline Estimate

- **Phase 1-2:** Project Setup & Types (1.5 days)
- **Phase 3:** Selector Generator with 6+ strategies (3 days)
- **Phase 4-5:** Event Listener & Recorder with full context capture (4 days)
- **Phase 6:** Sanitizer & Validator with schema validation (2 days)
- **Phase 7:** Background Script (1 day)
- **Phase 8:** Popup UI with state management (1.5 days)
- **Phase 9:** Storage & Download (1 day)
- **Phase 10:** Cross-Browser Build (2 days)
- **Phase 11:** Documentation with validation rules (1.5 days)
- **Phase 12:** Testing & QA (3 days)
- **Phase 13:** CI/CD (1 day)

**Total: ~22 days** (realistic with comprehensive TDD, may extend to 28-30 days with buffer and edge case handling)

---

## Risk Mitigation

### Technical Risks:
1. **Safari Manifest V3 limitations** → Test early, have fallback
2. **Shadow DOM complexity** → Defer to post-MVP if needed
3. **iFrame access restrictions** → Document limitations
4. **Storage quota limits** → Implement auto-cleanup

### Process Risks:
1. **Scope creep** → Stick to MVP, defer advanced features
2. **Testing overhead** → Prioritize critical path tests
3. **Browser compatibility issues** → Use webextension-polyfill from day 1

---

**This plan follows TDD principles: Write tests → Implement features → Refactor → Repeat**

Ready for implementation upon approval! 🚀

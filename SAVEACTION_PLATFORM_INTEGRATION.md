# SaveAction Recorder Browser Extension - Technical Overview

This document provides a comprehensive technical overview of the SaveAction Recorder browser extension for integration with the main SaveAction platform.

## 🎯 Purpose

The SaveAction Recorder is a browser extension that captures user interactions on web pages and exports them as structured JSON files. These recordings are designed to be consumed by the SaveAction platform for automated test replay and validation.

## 🏗️ Architecture

### Extension Type: Manifest V3

- **Background Service Worker**: Manages state and coordinates between components
- **Content Scripts**: Injected into web pages to capture user interactions
- **Popup UI**: Extension interface for starting/stopping recordings
- **Chrome Extension APIs**: Uses chrome.storage, chrome.runtime, chrome.tabs

### Component Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Background Service Worker                │
│  - Global state management (chrome.storage.session)         │
│  - Action ID assignment (sequential: act_001, act_002...)   │
│  - Message routing between components                        │
│  - Recording orchestration                                   │
└─────────────────────────────────────────────────────────────┘
                              ↕ Messages
┌─────────────────────────────────────────────────────────────┐
│                      Content Scripts                         │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ action-recorder.ts                                   │   │
│  │ - Recording lifecycle management                     │   │
│  │ - Coordinates event listeners and overlay           │   │
│  └─────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ event-listener.ts                                    │   │
│  │ - DOM event capture (click, input, scroll, etc)     │   │
│  │ - Element data extraction                            │   │
│  │ - Event filtering (excludes extension overlay)      │   │
│  └─────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ selector-generator.ts                                │   │
│  │ - Multi-selector generation (7+ strategies)         │   │
│  │ - Priority: id > data-testid > CSS > ARIA > XPath   │   │
│  └─────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ recording-indicator.ts                               │   │
│  │ - Overlay UI (pause/resume/stop buttons)            │   │
│  │ - Real-time feedback (timer, action count)          │   │
│  │ - Direct download functionality                      │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              ↕ User Interaction
┌─────────────────────────────────────────────────────────────┐
│                         Web Page                             │
│  - User performs actions (click, type, scroll, navigate)    │
│  - Extension captures and records                           │
└─────────────────────────────────────────────────────────────┘
```

## 📊 Data Flow

### Recording Flow

1. **User starts recording** via popup → sends `START_RECORDING` message to background
2. **Background initializes** → creates recording state, assigns recording ID
3. **Background injects content script** → into active tab
4. **Content script starts listeners** → captures DOM events
5. **User performs action** → content script captures event data
6. **Content script sends `SYNC_ACTION`** → to background with action data
7. **Background assigns sequential ID** → increments global counter, assigns act_001, act_002...
8. **Background saves to storage** → chrome.storage.session for persistence
9. **Process repeats** for each user action

### Multi-Page Recording Flow

1. **User navigates** (clicks link, submits form, etc.)
2. **New page loads** → content script re-injected automatically
3. **Content script reads existing actions** → from chrome.storage.session
4. **Recording continues** → with same recording ID and sequential counter
5. **Action IDs remain sequential** → act_007, act_008, act_009 across pages

### Stop & Export Flow

1. **User clicks stop** → overlay or popup
2. **Background finalizes recording** → adds endTime, calculates duration
3. **Recording exported as JSON** → downloaded to user's machine
4. **State cleaned up** → storage cleared, listeners removed

## 📋 JSON Output Format

### Recording Structure

```json
{
  "id": "rec_1700305800000",           // Unique recording ID (timestamp-based)
  "testName": "User Login Flow",       // User-provided test name
  "url": "https://example.com/login",  // Initial URL where recording STARTED (not last page)
  "startTime": "2025-11-18T10:30:00.000Z",  // ISO 8601 timestamp
  "endTime": "2025-11-18T10:31:30.000Z",    // ISO 8601 timestamp
  "duration": 90000,                   // Duration in milliseconds (calculated from start/end times)
  "viewport": {
    "width": 1920,
    "height": 1080
  },
  "userAgent": "Mozilla/5.0...",       // Browser user agent
  "actions": [...]                      // Array of captured actions
}
```

**Important Notes:**

- **`url` field**: This is the **initial URL** where recording started, NOT the final page URL
- **Multi-page recordings**: Each action has its own `url` field showing which page it occurred on
- **Duration**: Not stored directly, calculate as `new Date(endTime) - new Date(startTime)`

### Action Types & Structures

#### 1. Click Action

```json
{
  "id": "act_001",
  "type": "click",
  "timestamp": 1700305801234,
  "url": "https://example.com/page",
  "selector": {
    "id": "submit-button",
    "css": "#submit-button",
    "xpath": "//button[@id='submit-button']",
    "dataTestId": "submit-btn",
    "ariaLabel": "Submit form",
    "textContent": "Submit",
    "priority": ["id", "dataTestId", "css", "xpath", "ariaLabel", "textContent"]
  },
  "element": {
    "tagName": "BUTTON",
    "type": "submit",
    "name": "submitBtn",
    "value": "",
    "className": "btn btn-primary"
  },
  "coordinates": { "x": 150, "y": 25 },
  "coordinatesRelativeTo": "element", // or "viewport"
  "clickCount": 1,
  "button": 0, // 0=left, 1=middle, 2=right
  "modifiers": {
    "ctrlKey": false,
    "shiftKey": false,
    "altKey": false,
    "metaKey": false
  }
}
```

#### 2. Input Action

```json
{
  "id": "act_002",
  "type": "input",
  "timestamp": 1700305802345,
  "url": "https://example.com/page",
  "selector": {
    /* same as click */
  },
  "element": {
    "tagName": "INPUT",
    "type": "text",
    "name": "username",
    "value": "john_doe", // Current value after input
    "placeholder": "Enter username"
  },
  "value": "john_doe", // The entered value
  "inputType": "insertText", // Input event type
  "previousValue": "", // Value before this input
  "masked": false // Whether value was masked for privacy
}
```

#### 3. Scroll Action

```json
{
  "id": "act_003",
  "type": "scroll",
  "timestamp": 1700305803456,
  "url": "https://example.com/page",
  "scrollPosition": {
    "x": 0,
    "y": 500
  },
  "scrollTarget": "window", // or element selector
  "deltaX": 0,
  "deltaY": 500
}
```

#### 4. Navigation Action

```json
{
  "id": "act_004",
  "type": "navigation",
  "timestamp": 1700305804567,
  "fromUrl": "https://example.com/page1",
  "toUrl": "https://example.com/page2",
  "trigger": "click", // or "submit", "back", "forward", "refresh"
  "targetElement": {
    "selector": {
      /* if triggered by element */
    },
    "element": {
      /* element details */
    }
  }
}
```

#### 5. Select Action

```json
{
  "id": "act_005",
  "type": "select",
  "timestamp": 1700305805678,
  "url": "https://example.com/page",
  "selector": {
    /* same structure */
  },
  "element": {
    "tagName": "SELECT",
    "name": "country",
    "multiple": false
  },
  "selectedValue": "US",
  "selectedText": "United States",
  "selectedIndex": 0,
  "previousValue": ""
}
```

#### 6. Checkbox/Radio Action

```json
{
  "id": "act_006",
  "type": "checkbox", // or "radio"
  "timestamp": 1700305806789,
  "url": "https://example.com/page",
  "selector": {
    /* same structure */
  },
  "element": {
    "tagName": "INPUT",
    "type": "checkbox",
    "name": "terms",
    "value": "accepted"
  },
  "checked": true, // New state
  "previousChecked": false // Previous state
}
```

#### 7. Keyboard Action

```json
{
  "id": "act_007",
  "type": "keyboard",
  "timestamp": 1700305807890,
  "url": "https://example.com/page",
  "key": "Enter", // Key pressed
  "code": "Enter", // Physical key code
  "keyCode": 13, // Legacy key code
  "modifiers": {
    "ctrlKey": false,
    "shiftKey": false,
    "altKey": false,
    "metaKey": false
  },
  "targetElement": {
    "selector": {
      /* if focused on element */
    }
  }
}
```

#### 8. Form Submit Action

```json
{
  "id": "act_008",
  "type": "submit",
  "timestamp": 1700305808901,
  "url": "https://example.com/page",
  "formSelector": {
    "id": "login-form",
    "css": "#login-form",
    "xpath": "//form[@id='login-form']"
  },
  "formData": {
    "username": "john_doe",
    "password": "***MASKED***", // Automatically masked
    "remember": "true"
  },
  "method": "POST",
  "action": "/api/login"
}
```

## 🔐 Privacy & Data Masking

### Automatic Masking

The recorder automatically masks sensitive data:

**Password fields:**

- Detected by: type="password", name/id contains "password", "passwd", "pwd"
- Replacement: `***MASKED***`

**Credit card fields:**

- Detected by: name/id contains "card", "cc", "creditcard"
- Pattern: 16 digits with optional spaces/dashes
- Replacement: `**** **** **** ****`

**SSN fields:**

- Detected by: name/id contains "ssn", "social"
- Pattern: XXX-XX-XXXX
- Replacement: `***-**-****`

**API Keys/Tokens:**

- Detected by: name/id contains "token", "apikey", "api_key"
- Replacement: `***MASKED***`

### Implementation

```typescript
// Example from src/utils/sanitizer.ts
const SENSITIVE_PATTERNS = {
  password: ['password', 'passwd', 'pwd', 'pass'],
  creditCard: ['card', 'cc', 'creditcard', 'cardnumber'],
  ssn: ['ssn', 'social', 'social-security'],
  apiKey: ['token', 'apikey', 'api_key', 'secret'],
};
```

## 🎯 Selector Strategy

### Priority Order (Most to Least Reliable)

1. **ID Attribute** - `#submit-button` (most unique)
2. **Data Test ID** - `[data-testid="submit-btn"]`
3. **Data Test** - `[data-test="submit-btn"]`
4. **CSS Classes** - `.btn.btn-primary.submit`
5. **ARIA Labels** - `[aria-label="Submit form"]`
6. **XPath** - `//button[@id='submit-button']`
7. **Text Content** - Contains text "Submit" (least reliable)

### Why Multiple Selectors?

- **Robustness**: If one selector breaks, others may still work
- **Flexibility**: Different testing frameworks prefer different selector types
- **Maintainability**: Class names change more often than IDs or data attributes

### Example Output

```json
"selector": {
  "id": "email-input",
  "css": "#email-input",
  "xpath": "//input[@id='email-input']",
  "dataTestId": "email-field",
  "ariaLabel": "Email address",
  "textContent": "",
  "priority": ["id", "dataTestId", "css", "xpath", "ariaLabel"]
}
```

## 🔄 State Management

### Storage Strategy

- **chrome.storage.session** - Current recording state (survives page reload, not browser restart)
  - Recording metadata
  - Current actions array
  - Global action counter
  - Recording status (idle/recording/paused)

- **chrome.storage.local** - Historical recordings (persists across browser sessions)
  - List of all recording IDs
  - Complete recording data for each ID

### State Synchronization

```typescript
// Background maintains source of truth
interface BackgroundState {
  isRecording: boolean;
  isPaused: boolean;
  testName: string;
  recordingId: string;
  startTime: number;
  currentTabId: number | null;
  actionCounter: number; // Global counter for sequential IDs
  actionCache: Action[]; // Current recording actions
  accumulatedActions: Action[]; // For multi-page navigation
}
```

## 🔌 Message Passing Protocol

### Message Types

```typescript
type Message =
  | { type: 'START_RECORDING'; payload: { testName: string } }
  | { type: 'STOP_RECORDING' }
  | { type: 'PAUSE_RECORDING' }
  | { type: 'RESUME_RECORDING' }
  | { type: 'GET_STATUS' }
  | { type: 'SYNC_ACTION'; payload: { action: Action } };

type MessageResponse = {
  success: boolean;
  data?: any;
  error?: string;
};
```

### Communication Flow

1. **Popup → Background**: Control commands (start, stop, pause)
2. **Content → Background**: Action sync, status queries
3. **Background → Content**: State updates, commands

## 🧪 Testing & Quality

### Test Coverage

- **164 unit tests** (Vitest)
- **94%+ coverage** (lines, statements, functions)
- **79%+ branch coverage**

### Test Files

```
tests/unit/
├── action-recorder.test.ts      # Recording lifecycle
├── event-listener.test.ts       # Event capture
├── selector-generator.test.ts   # Selector generation
├── sanitizer.test.ts            # Data masking
├── validator.test.ts            # Data validation
├── exporter.test.ts             # JSON export
└── storage.test.ts              # Storage operations
```

### Validation

All actions are validated before saving:

- Required fields present
- Correct data types
- Valid timestamps
- Valid selector structures
- Element data completeness

## 🚀 Integration Points for SaveAction Platform

### 1. JSON Import

The platform should accept the exported JSON format and parse:

- Recording metadata (id, testName, url, timestamps)
- Action array with sequential IDs
- Multi-selector strategies per action
- Masked sensitive data

### 2. Action Replay

For each action type, implement replay logic:

**Click:**

```javascript
// Use selector priority to find element
const element = findElement(action.selector);
element.click();
// Or simulate with coordinates if needed
simulateClick(element, action.coordinates);
```

**Input:**

```javascript
const element = findElement(action.selector);
element.value = action.value;
element.dispatchEvent(new Event('input', { bubbles: true }));
```

**Navigation:**

```javascript
if (action.trigger === 'click') {
  // Click the link/button that triggers navigation
  const element = findElement(action.targetElement.selector);
  element.click();
}
// Wait for navigation and verify URL
await waitForNavigation(action.toUrl);
```

### 3. Element Location Strategy

```javascript
function findElement(selector) {
  // Try selectors in priority order
  for (const method of selector.priority) {
    const el = tryFindElement(selector[method]);
    if (el) return el;
  }
  throw new Error('Element not found');
}
```

### 4. Verification Points

Use captured metadata for verification:

- Element existence: `selector` strategies
- Element state: `element` properties (value, checked, etc.)
- Page state: `url`, `scrollPosition`
- Timing: `timestamp` for performance testing

### 5. Error Handling

Handle common replay failures:

- Element not found → try alternate selectors
- Timing issues → add waits based on timestamps
- Navigation failures → verify URL matches expected
- State mismatch → report detailed diff

## 📦 File Structure for Integration

### Key Files to Reference

```
src/
├── types/
│   ├── actions.ts           # TypeScript definitions for all action types
│   ├── recording.ts         # Recording data structure
│   ├── selectors.ts         # Selector strategy types
│   └── messages.ts          # Message passing types
├── utils/
│   ├── validator.ts         # Action validation logic
│   ├── sanitizer.ts         # Data masking logic
│   └── exporter.ts          # JSON export logic
```

### TypeScript Types for Integration

```typescript
// Import these types into SaveAction platform
import type {
  Recording, // Complete recording structure
  Action, // Base action interface
  ClickAction, // Specific action types
  InputAction,
  ScrollAction,
  NavigationAction,
  // ... etc
  SelectorStrategy, // Selector structure
} from '@saveaction/recorder-types';
```

## 🔍 Important Considerations

### 1. Sequential Action IDs

- **Format**: `act_001`, `act_002`, ..., `act_999`
- **Scope**: Global across entire recording, even multi-page
- **Purpose**: Maintains action order for reliable replay

### 2. Multi-Page Recording

- Actions from multiple pages are in single `actions` array
- Use `url` field to know which page each action occurred on
- Navigation actions explicitly mark page transitions

### 3. Timing & Performance

- `timestamp` is Unix epoch milliseconds
- Can calculate delays between actions: `action[n].timestamp - action[n-1].timestamp`
- `duration` in recording metadata for total test time

### 4. Privacy Compliance

- All sensitive data pre-masked before export
- No raw passwords, credit cards, or SSNs in JSON
- Platform doesn't need to implement additional masking

### 5. Selector Reliability

- Always try selectors in `priority` order
- ID-based selectors most stable
- XPath and text content least stable (DOM changes)
- Platform should allow fallback strategies

## 🔮 Future Enhancements (Roadmap)

### Planned Features

1. **Shadow DOM support** - Record actions in shadow roots
2. **iFrame support** - Record actions in nested frames
3. **File upload** - Capture file input interactions
4. **Drag & drop** - Record drag and drop actions
5. **Hover actions** - Record significant hover interactions
6. **Right-click context menu** - Record context menu actions
7. **Custom assertions** - Allow users to add verification points
8. **Screenshots** - Capture screenshots at key moments
9. **Network activity** - Record XHR/Fetch requests (optional)
10. **Console logs** - Capture console errors during recording

### API Evolution

The JSON format is versioned for backward compatibility:

```json
{
  "version": "1.0.0",
  "id": "rec_..."
  // ... rest of recording
}
```

## 📚 Additional Resources

### Documentation Files

- `.github/copilot-instructions.md` - Comprehensive project guide
- `.github/instructions/*.instructions.md` - Module-specific guidelines
- `docs/HUSKY_SETUP.md` - Git hooks and workflow
- `AI_INSTRUCTIONS_SETUP.md` - AI agent configuration
- `README.md` - User-facing documentation

### Code Quality

- **ESLint + Prettier** - Code formatting and linting
- **Husky Git Hooks** - Pre-commit, commit-msg, pre-push
- **Conventional Commits** - Standardized commit messages
- **GitHub Actions CI/CD** - Automated testing and building

---

## 🎯 Summary for SaveAction Platform Integration

To integrate recordings from this extension:

1. **Parse JSON** - Import the recording JSON file
2. **Validate structure** - Use TypeScript types from `src/types/`
3. **Iterate actions** - Process actions in sequential order by `id`
4. **Locate elements** - Use selector strategies in priority order
5. **Replay actions** - Implement handlers for each action type
6. **Handle navigation** - Wait for page loads, verify URLs
7. **Verify state** - Use captured metadata for assertions
8. **Handle failures** - Graceful fallback for element location
9. **Report results** - Compare actual vs. expected outcomes

The recorder provides everything needed for reliable test replay:

- ✅ Sequential action ordering
- ✅ Multiple selector strategies
- ✅ Complete element context
- ✅ Privacy-safe data
- ✅ Multi-page support
- ✅ Rich metadata for verification

**Contact:** [SaveAction Platform Repository](https://github.com/SaveActionHQ/SaveAction)

# GitHub Copilot Instructions for SaveAction Recorder

This document provides AI agents, including GitHub Copilot, with context and guidelines for working on the SaveAction Recorder browser extension project.

---

## AI Agent Conduct Rules

**These rules are non-negotiable and override any conflicting instruction.**

1. **Never compromise on security.** Every change must be reviewed through a security lens. No shortcuts that introduce vulnerabilities (XSS, injection, data leaks, permission escalation). If a faster approach is less secure, take the slower secure path. Always.
2. **Be honest, not agreeable.** Do not tell the developer what they want to hear. If an approach is wrong, fragile, or will cause problems later — say so directly. The project moves forward by doing the right things, not by making people feel good about bad decisions.
3. **Flag real problems, don't hide them.** If tests are failing, coverage is dropping, code is brittle, or a feature is half-baked — report it clearly. Never silently paper over issues or mark something as "done" when it isn't.
4. **Push back on bad ideas.** If a requested change would introduce technical debt, security holes, or architectural problems — explain why and suggest a better alternative. Respectful disagreement is expected.
5. **Don't over-engineer to impress.** Write the simplest correct solution. No unnecessary abstractions, no "clever" code, no premature optimization. Complexity is a cost, not a feature.
6. **Privacy is sacred.** Never log, store, or expose user data (passwords, PII, API keys) in plain text. The sanitizer exists for a reason — use it. When in doubt, mask it.
7. **Test what you build.** Every new feature or bug fix must have corresponding tests. "It works on my machine" is not a testing strategy. If you can't write a test for it, question whether the implementation is right.
8. **Read before you write.** Understand existing code, patterns, and architecture before making changes. Don't introduce conflicting patterns or reinvent things that already exist in the codebase.

---

## Project Overview

SaveAction Recorder is a cross-browser extension (Chrome, Firefox, Safari, Edge) that records user interactions on web pages and exports them as structured JSON files for automated testing. It uses Manifest V3, TypeScript, Vite, and Vitest.

**Key Features:**

- Multi-page recording with sequential action IDs across navigation
- Real-time overlay controls (pause/resume/stop)
- Privacy-first approach with automatic data masking and variable substitution
- Multi-selector strategy for element identification
- Comprehensive action capture (clicks, inputs, scrolls, keyboard, navigation, dialogs, file uploads)
- Manual and auto-generated assertions (checkpoint actions)
- Variable marking for parameterized test recording
- iframe support with frame context propagation
- Platform integration (upload recordings to SaveAction API)

## Tech Stack

- **TypeScript 5.3+** with strict mode
- **Vite 5.0** for building
- **Vitest 1.0** for testing (522+ unit tests)
- **Chrome Extension APIs** (Manifest V3)
- **ESLint + Prettier** for code quality
- **Husky** for Git hooks

## Project Structure

```
src/
├── background/         # Service worker (Manifest V3)
│   └── index.ts       # State management, message handling, multi-frame routing
├── content/           # Content scripts injected into web pages (all frames)
│   ├── action-recorder.ts      # Core recording logic
│   ├── assertion-inspector.ts  # Inspect mode for manual assertions
│   ├── dialog-early-inject.ts  # Dialog monkey-patching (MAIN world, document_start)
│   ├── dialog-interceptor.ts   # Dialog event capture bridge
│   ├── event-listener.ts       # DOM event capture + iframe frame context
│   ├── intent-classifier.ts    # Navigation intent classification
│   ├── recording-indicator.ts  # Overlay UI controls (main frame only)
│   ├── selector-generator.ts   # Multi-selector generation
│   ├── variable-marker.ts      # "Mark as Variable" UI for input fields
│   └── index.ts               # Entry point & message router (iframe-aware)
├── platform/          # Platform integration
│   └── api.ts         # SaveAction API client (upload, projects, connection test)
├── popup/             # Extension popup UI
│   ├── index.html     # Popup HTML
│   ├── popup.css      # Popup styles
│   └── popup.ts       # UI logic and state management
├── types/             # TypeScript type definitions
│   ├── actions.ts     # Action type definitions (click, input, checkpoint, dialog, file-upload, etc.)
│   ├── index.ts       # Barrel exports
│   ├── messages.ts    # Message passing types
│   ├── recording.ts   # Recording data structure
│   ├── selectors.ts   # Selector strategy types
│   └── settings.ts    # Extension settings types
└── utils/             # Shared utilities
    ├── content-signature.ts    # Content signatures for dynamic lists
    ├── element-state.ts        # Element state capture (visible, enabled, viewport)
    ├── exporter.ts             # JSON export logic
    ├── modal-tracker.ts        # Modal/dialog lifecycle tracking
    ├── sanitizer.ts            # Data masking (passwords, credit cards, SSN)
    ├── storage.ts              # Chrome storage abstraction
    ├── toast-notification.ts   # In-page notification toasts
    ├── validation-helpers.ts   # Validation utility functions
    └── validator.ts            # Data validation

tests/
└── unit/              # Unit tests with Vitest (522+ tests)
```

## Coding Standards

### TypeScript

- Use strict mode (`strict: true` in tsconfig.json)
- Prefer `const` over `let`
- Use explicit types for public APIs
- `any` is allowed but discouraged (ESLint warning disabled for practicality)
- Use type guards and discriminated unions
- Async/await preferred over Promise chains

### Naming Conventions

- **Files:** kebab-case (`action-recorder.ts`)
- **Classes:** PascalCase (`ActionRecorder`)
- **Functions/Methods:** camelCase (`startRecording`)
- **Constants:** UPPER_SNAKE_CASE (`MAX_ACTIONS`)
- **Interfaces/Types:** PascalCase (`ClickAction`, `MessageResponse`)

### Code Style

- **Formatting:** Prettier (auto-format on commit)
- **Linting:** ESLint (auto-fix on commit)
- **Line length:** 100 characters (soft limit)
- **Indentation:** 2 spaces
- **Quotes:** Single quotes for strings
- **Semicolons:** Required
- **Trailing commas:** Always (multiline)

### Chrome Extension Patterns

- **Background service worker:** Use `chrome.storage.session` for state (not in-memory)
- **Message passing:** Always use `chrome.runtime.sendMessage` with response callbacks
- **Multi-frame messaging:** Use `sendMessageToAllFrames()` with `chrome.webNavigation.getAllFrames()` for reliable delivery to all frames (including iframes)
- **Content scripts:** Run at `document_idle` with `all_frames: true` (both main frame and iframes)
- **iframe mode:** Content scripts detect `window.self !== window.top` and run in lightweight mode (no overlay UI) inside iframes
- **Permissions:** Request minimal permissions in manifest.json (currently: storage, activeTab, tabs, downloads, notifications, scripting, webNavigation)

## Testing Guidelines

### Unit Tests (Vitest)

- **Location:** `tests/unit/`
- **Coverage:** 81%+ (lines, statements), 77%+ (branches), 88%+ (functions)
- **Pattern:** Each source file should have a corresponding `.test.ts` file
- **Naming:** `describe('ClassName/FunctionName', () => { it('should...') })`
- **Mocking:** Use `vi.mock()` for Chrome APIs and external dependencies
- **Setup:** `tests/setup.ts` provides global test configuration

**When writing tests:**

- Test public API behavior, not implementation details
- Mock Chrome APIs (storage, runtime, tabs)
- Use `beforeEach` for test isolation
- Test edge cases and error conditions
- Avoid testing UI components requiring E2E (popup, indicator)

### Running Tests

```bash
npm test              # Run all tests (non-watch)
npm run test:watch   # Run in watch mode
npm run test:coverage # Run with coverage report
npm run typecheck    # TypeScript type checking
```

## Architecture Patterns

### State Management

- **Background:** Single source of truth in `chrome.storage.session`
- **Content scripts:** Stateless, sync via message passing
- **Popup:** Read-only view of background state

### Message Passing Protocol

```typescript
// Request types
type Message =
  | { type: 'START_RECORDING'; payload: { testName: string } }
  | { type: 'STOP_RECORDING' }
  | { type: 'PAUSE_RECORDING' }
  | { type: 'RESUME_RECORDING' }
  | { type: 'GET_STATUS' }
  | { type: 'SYNC_ACTION'; payload: { action: Action } }
  | { type: 'ENTER_ASSERTION_MODE' }
  | { type: 'EXIT_ASSERTION_MODE' }
  | { type: 'MARK_VARIABLE'; payload: { fieldId: string; variableName: string } }
  | { type: 'UNMARK_VARIABLE'; payload: { fieldId: string } };

// Response format
type MessageResponse = {
  success: boolean;
  data?: any;
  error?: string;
};
```

### Multi-Page Recording

- **Action IDs:** Global counter in background (`state.actionCounter`)
- **Navigation handling:**
  1. Content script sends `SYNC_ACTION` messages
  2. Background assigns sequential IDs (act_001, act_002...)
  3. Actions stored in `chrome.storage.session.saveaction_current_actions`
  4. On navigation, new page reads and merges actions

### Privacy & Data Masking

- **Auto-masked fields:** passwords, credit cards, SSN, tokens, API keys
- **Detection:** Case-insensitive name/id/class matching
- **Replacement:** `***MASKED***` or `**** **** **** ****` (credit cards)
- **Implementation:** See `src/utils/sanitizer.ts`

## Git Workflow (Husky Hooks)

### Commit Message Format (Conventional Commits)

```
<type>(<scope>): <subject>

Types:
- feat: New feature
- fix: Bug fix
- docs: Documentation only
- style: Formatting, missing semicolons, etc.
- refactor: Code restructuring
- perf: Performance improvement
- test: Adding/updating tests
- build: Build system changes
- ci: CI/CD changes
- chore: Maintenance tasks

Examples:
✅ feat: add pause/resume recording functionality
✅ fix(popup): resolve action count display issue
✅ docs: update installation instructions
❌ "added new feature" (invalid format)
```

### Pre-commit Hook

- Auto-formats code (Prettier)
- Lints and fixes issues (ESLint)
- Only checks staged files (lint-staged)

### Pre-push Hook

- Runs TypeScript type checking
- Executes all 522+ unit tests
- Prevents broken code from reaching remote

## Common Tasks

### Adding a New Action Type

1. Define type in `src/types/actions.ts`
2. Add capture logic in `src/content/event-listener.ts`
3. Update validator in `src/utils/validator.ts`
4. Write unit tests in `tests/unit/`
5. Update JSON schema documentation

### Adding a New Message Type

1. Define in `src/types/messages.ts`
2. Add handler in `src/background/index.ts`
3. Add sender in content/popup as needed
4. Document in architecture comments

### Fixing a Bug

1. Write a failing test that reproduces the bug
2. Fix the bug
3. Ensure test passes
4. Run full test suite
5. Commit with `fix:` prefix

### Improving Performance

1. Profile and identify bottleneck
2. Implement optimization
3. Add performance test if applicable
4. Benchmark before/after
5. Commit with `perf:` prefix

## Key Implementation Details

### Action ID Generation

```typescript
// Background maintains global counter
state.actionCounter++;
action.id = `act_${String(state.actionCounter).padStart(3, '0')}`;
```

### Selector Priority

1. `id` attribute (highest priority)
2. `data-testid` attribute
3. `data-test` attribute
4. CSS class combination
5. ARIA labels
6. XPath (fallback)
7. Text content (lowest priority)

### Storage Keys

- `saveaction_recording_state` - Current recording metadata
- `saveaction_current_actions` - Array of actions in current recording
- `saveaction_action_counter` - Global action counter
- `recording_ids` - List of all recording IDs (local storage)
- `recording_{id}` - Individual recording data (local storage)

## Debugging

### Console Logging

- **Background:** Check service worker console in chrome://extensions
- **Content:** Check page console (DevTools)
- **Popup:** Right-click extension icon → Inspect popup

### Common Issues

1. **Actions not recording:** Check content script injection
2. **IDs not sequential:** Verify background counter state
3. **Navigation breaks recording:** Check message passing between pages
4. **Storage errors:** Ensure manifest permissions include "storage"

## CI/CD Pipeline

The project uses GitHub Actions (`.github/workflows/ci.yml`):

- Tests on Node.js 18.x, 20.x, 22.x
- Runs lint, typecheck, tests with coverage
- Builds for all browsers (Chrome, Firefox, Safari)
- Uploads build artifacts

## Important Files

- `.github/copilot-instructions.md` - This file
- `.eslintrc.json` - Linting configuration (relaxed for Chrome extension dev)
- `vitest.config.ts` - Test configuration
- `src/manifest.json` - Extension manifest (Manifest V3)
- `package.json` - Dependencies and scripts
- `tsconfig.json` - TypeScript configuration

## When Making Changes

1. **Understand the context:** Read related code and tests
2. **Follow patterns:** Use existing patterns in the codebase
3. **Write tests first:** TDD when possible
4. **Keep it simple:** Avoid over-engineering
5. **Document complex logic:** Add comments for non-obvious code
6. **Update types:** Keep TypeScript definitions current
7. **Test cross-browser:** Consider Chrome, Firefox differences
8. **Respect privacy:** Never log or store sensitive data unmasked

## External Dependencies

- **webextension-polyfill:** Cross-browser API compatibility
- **chrome types:** @types/chrome for TypeScript definitions
- Minimal external dependencies to reduce bundle size

## Performance Considerations

- **Event throttling:** Don't record every mousemove (only significant events)
- **Storage limits:** chrome.storage.session has 10MB limit
- **Message overhead:** Minimize message passing frequency
- **Selector generation:** Cache selectors when possible
- **Memory leaks:** Clean up event listeners on stop

## Security Considerations

- **Content Security Policy:** Follow Manifest V3 CSP
- **Permissions:** Request minimal permissions
- **Data masking:** Always mask sensitive fields
- **XSS prevention:** Sanitize user input in popup
- **Code injection:** Use `chrome.scripting.executeScript` safely

## Resources

- **Chrome Extension Docs:** https://developer.chrome.com/docs/extensions/mv3/
- **Manifest V3 Migration:** https://developer.chrome.com/docs/extensions/migrating/
- **Vitest Docs:** https://vitest.dev/
- **TypeScript Handbook:** https://www.typescriptlang.org/docs/

---

**Note to AI Agents:** This project prioritizes code quality, test coverage, and user privacy. When suggesting changes, ensure they align with these principles and follow the established patterns. Always write tests for new features and bug fixes.

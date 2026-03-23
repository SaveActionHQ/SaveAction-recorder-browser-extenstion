# Road to Being a Real E2E Platform

> **Created:** March 5, 2026
> **Goal:** Transform SaveAction from a "browser recorder + replayer" into a real E2E test automation platform that QA engineers and developers trust for production testing.

---

## Current State — What We've Built

### Browser Extension (SaveAction Recorder)

- **Tests:** 270 (261 passing, 9 failing — 2 carousel selector priority tests)
- **Action Types:** click, input, select, scroll, keypress, submit, hover, navigation, modal-lifecycle, checkpoint (type defined but never generated)
- **Smart Recording:** Multi-strategy selectors with confidence scores, content signatures for dynamic lists, element state capture (visible, enabled, viewport), modal/dialog detection, AJAX form detection, carousel detection, dropdown state tracking, navigation intent classification
- **Sensitive Data:** Variable masking for passwords (`${PASSWORD}`)
- **Platform Integration:** Upload to API with project selection, auto-upload toggle, connection test

### Core Engine (@saveaction/core)

- **Tests:** 163 unit + 43 integration (browser)
- **Replay:** All 8 action types executed with Playwright
- **Element Location:** 6 selector strategies with exponential backoff retry (500ms → 1000ms → 2000ms)
- **Navigation:** NavigationHistoryManager + NavigationAnalyzer for URL change detection and recovery
- **Screenshots:** `screenshotMode: 'on-failure' | 'always' | 'never'` — captures PNG after each action
- **Video:** Full replay recording via Playwright
- **Timing:** 3 modes (realistic, fast, instant) with speed multiplier
- **Error Recovery:** `continueOnError` mode, abort signal support
- **Cross-Browser:** Chromium, Firefox, WebKit

### CLI (@saveaction/cli)

- **Tests:** 173 (3 skipped)
- **Commands:** run, validate, info, list
- **CI/CD:** CIDetector (8 providers), PlatformClient (fetch recordings by ID or tag), base URL override
- **Output:** Console + JSON (`--output json --output-file results.json`)

### API (@saveaction/api)

- **Tests:** 821+ unit + integration
- **Auth:** JWT + API tokens + account lockout + password reset
- **CRUD:** Recordings, runs, projects, suites, tests, schedules
- **Worker:** BullMQ with 3 workers (test runs, scheduled tests, cleanup)
- **Real-Time:** SSE via Redis pub/sub for live run progress
- **Security:** Helmet, rate limiting, CSRF, Swagger docs
- **Storage:** Local filesystem for videos/screenshots with cleanup jobs

### Web UI (@saveaction/web)

- **Framework:** Next.js 15 + Tailwind CSS + shadcn/ui
- **Pages:** Dashboard, recordings library, run results (with video + screenshot gallery), schedules, settings (profile, tokens, security), projects, suites, tests
- **Features:** Drag-and-drop upload, SSE live progress, lightbox with zoom/pan, keyboard navigation

### Infrastructure

- **CI:** GitHub Actions (lint, typecheck, test, integration)
- **Git Hooks:** Husky (pre-commit, commit-msg, pre-push)
- **Deployment:** Docker Compose (API + Worker + Web + PostgreSQL + Redis + Nginx), self-hosting docs

---

## The Gap — What Makes an E2E Platform "Real"

### The Core Problem

**Today:** A test "passes" if all actions execute without throwing an exception.
**Reality:** The page could show an error message, wrong data, broken layout, or be completely blank — and the test still "passes."

Every real E2E tool (Cypress, Playwright Test, Selenium) has **assertions** — the ability to verify that the page state is correct after each action. Without assertions, test results are meaningless.

---

## Steps to Complete

### Step 1: Assertions via CheckpointAction ⭐ HIGHEST PRIORITY

**Why:** This is the #1 gap. Makes SaveAction go from "did it crash?" to "did it work?". Without assertions, a test "passes" even if the page shows an error message, blank screen, or wrong data.

**Two-Part Strategy: Manual Assertions + Auto-Assertions**

The `CheckpointAction` type already exists in both the extension and core types but **nobody generates them** and **nobody verifies them**:

```typescript
interface CheckpointAction extends BaseAction {
  type: 'checkpoint';
  checkType:
    | 'urlMatch'
    | 'elementVisible'
    | 'elementText'
    | 'pageLoad'
    | 'elementHasValue'
    | 'containsText'
    | 'pageTitle';
  selector?: SelectorStrategy;
  expectedUrl?: string;
  expectedValue?: string;
  actualValue?: string;
  passed: boolean;
}
```

---

#### Part A: "Add Assertion" Button — Manual Assertions (Extension)

**UX Flow:**

1. User is recording normally. They click the **"Add Assertion"** button in the extension popup toolbar.
2. Recording **pauses**. A blue semi-transparent overlay appears on the page with a message: _"Click any element to add an assertion, or press Escape to cancel"_.
3. As user hovers over elements, they are **highlighted** with a blue outline + tooltip showing the element tag and text (similar to Chrome DevTools inspect mode).
4. User **clicks** an element → a small **assertion panel** appears near the clicked element (floating popover).
5. The panel shows assertion options based on the element type:

| Assertion Type    | When Shown                                       | What It Verifies During Replay                  |
| ----------------- | ------------------------------------------------ | ----------------------------------------------- |
| **Text Equals**   | Element has `textContent`                        | `locator.textContent() === expectedValue`       |
| **Text Contains** | Element has `textContent`                        | `locator.textContent().includes(expectedValue)` |
| **Is Visible**    | Any element                                      | `locator.isVisible() === true`                  |
| **Has Value**     | `<input>`, `<select>`, `<textarea>`              | `locator.inputValue() === expectedValue`        |
| **URL Contains**  | Always (page-level, no element selection needed) | `page.url().includes(expectedValue)`            |
| **Page Title**    | Always (page-level, no element selection needed) | `page.title() === expectedValue`                |

6. User selects an assertion type. For text/value assertions, the current value is pre-filled (editable).
7. User clicks **"Add"** → a `CheckpointAction` is appended to the recording's `actions[]` array.
8. The overlay dismisses, recording **resumes** automatically.

**Multiple Assertions:** User can click "Add Assertion" multiple times at any point during recording. Each creates a separate `CheckpointAction` in the actions array.

**What the recorded CheckpointAction looks like:**

```json
{
  "id": "act_007",
  "type": "checkpoint",
  "timestamp": 1709654400000,
  "url": "https://app.example.com/dashboard",
  "checkType": "elementText",
  "selector": {
    "id": "welcome-message",
    "css": "#welcome-message",
    "xpath": "//*[@id='welcome-message']"
  },
  "expectedValue": "Welcome, John!",
  "actualValue": "Welcome, John!",
  "passed": true
}
```

**Extension Implementation Details:**

| #   | Change                            | File                            | Details                                                                                                                                                                              |
| --- | --------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1a  | ✅ Add "Add Assertion" button     | Extension (popup UI)            | New button in the recording toolbar, only visible while recording is active                                                                                                          |
| 1b  | ✅ Implement inspect mode         | Extension (`content-script`)    | Inject overlay + hover highlight + click handler into page. Use `document.elementFromPoint()` for hover detection. Blue outline via `outline: 2px solid #3b82f6` on hovered element. |
| 1c  | ✅ Build assertion panel          | Extension (`content-script`)    | Floating popover near clicked element. Show assertion type dropdown + pre-filled expected value (editable). "Add" and "Cancel" buttons.                                              |
| 1d  | ✅ Determine available assertions | Extension (`content-script`)    | Inspect clicked element: if has `textContent` → show Text Equals/Contains. If is `input/select/textarea` → show Has Value. Always show Is Visible.                                   |
| 1e  | ✅ Generate CheckpointAction      | Extension (`event-listener.ts`) | On "Add" click: build `CheckpointAction` with selectors (same multi-strategy as other actions), `checkType`, `expectedValue`, `actualValue`. Append to `actions[]`.                  |
| 1f  | ✅ Page-level assertions          | Extension (popup UI)            | In the assertion panel, add "URL Contains" and "Page Title" options that don't require an element selection — available directly from the "Add Assertion" button as a dropdown.      |

---

#### Part B: Auto-Assertions — Zero-Effort Implicit Checkpoints (Extension)

On top of manual assertions, the extension automatically inserts checkpoint actions at key moments without any user interaction:

| Trigger                            | Auto-Generated CheckpointAction                              | Why                                                          |
| ---------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------ |
| **After navigation** (URL changes) | `checkType: 'urlMatch'`, `expectedUrl: window.location.href` | Catches broken redirects, 404s, wrong routes                 |
| **After form submit**              | `checkType: 'urlMatch'`, `expectedUrl: window.location.href` | After submit, user typically lands on a new page — verify it |

These auto-checkpoints are **non-intrusive** — they appear as regular actions in the recording but are clearly marked as auto-generated (`"auto": true`). Users can delete them from the recording if unwanted.

| #   | Change                                   | File                            | Details                                                                                                                                               |
| --- | ---------------------------------------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1g  | ✅ Auto URL checkpoint after navigation  | Extension (`event-listener.ts`) | After detecting URL change (already tracked), emit `CheckpointAction` with `checkType: 'urlContains'` and `expectedUrl` (pathname only), `auto: true` |
| 1h  | ✅ Auto URL checkpoint after form submit | Extension (`event-listener.ts`) | After `submit` action, wait 500ms for navigation to settle, then emit URL checkpoint if URL changed                                                   |

---

#### Part C: Checkpoint Verification in Runner (Platform — Core)

When the runner encounters a `checkpoint` action during replay, it verifies the assertion:

```typescript
// In PlaywrightRunner.executeAction()
case 'checkpoint':
  const actual = await this.evaluateCheckpoint(page, action);
  const passed = this.compareCheckpointResult(action, actual);
  return { passed, expected: action.expectedValue, actual };
```

**Verification logic per `checkType`:**

| checkType         | How Runner Verifies                                    |
| ----------------- | ------------------------------------------------------ |
| `urlMatch`        | `page.url() === action.expectedUrl`                    |
| `elementText`     | `locator.textContent() === action.expectedValue`       |
| `containsText`    | `locator.textContent().includes(action.expectedValue)` |
| `elementVisible`  | `locator.isVisible() === true`                         |
| `elementHasValue` | `locator.inputValue() === action.expectedValue`        |
| `pageTitle`       | `page.title() === action.expectedValue`                |
| `pageLoad`        | `page.waitForLoadState('domcontentloaded')` succeeds   |

**On checkpoint failure:**

- The action result is marked as `failed` with `assertion_passed: false`
- `assertion_expected` and `assertion_actual` are stored for debugging
- If `continueOnError` is false (default), the run stops immediately
- If `continueOnError` is true, the run continues but the overall result is `failed`
- A screenshot is captured showing the page state at failure

| #   | Change                                    | File                         | Details                                                                                               |
| --- | ----------------------------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------- |
| 1i  | ✅ Add `executeCheckpoint()` method       | Core (`PlaywrightRunner.ts`) | ~80 lines: find element via selector, get actual value based on `checkType`, compare against expected |
| 1j  | ✅ Handle checkpoint in `executeAction()` | Core (`PlaywrightRunner.ts`) | Add `case 'checkpoint'` to the action type switch, call `executeCheckpoint()`                         |
| 1k  | ✅ Add checkpoint to Zod schema           | Core (`RecordingParser.ts`)  | Validate `checkpoint` actions during parsing with proper schema                                       |

---

#### Part D: Store Assertion Results (Platform — API)

| #   | Change                                    | File                        | Details                                                                                                                                                                                                      |
| --- | ----------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1l  | ✅ Add assertion columns to `run_actions` | API (`run_actions` schema)  | Add `assertion_passed: boolean \| null`, `assertion_expected: text \| null`, `assertion_actual: text \| null` columns. Also added `assertionsTotal`, `assertionsPassed`, `assertionsFailed` to `runs` table. |
| 1m  | ✅ Generate migration                     | API (drizzle)               | `pnpm db:generate` → `pnpm db:migrate`                                                                                                                                                                       |
| 1n  | ✅ Update action persistence              | API (`testRunProcessor.ts`) | When saving checkpoint action results, include assertion fields                                                                                                                                              |

---

#### Part E: Display Assertion Results (Platform — Web UI)

| #   | Change                              | File                  | Details                                                                                                                                                      |
| --- | ----------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1o  | ✅ Assertion badge in actions table | Web (run detail page) | For checkpoint actions: green ✅ badge if `assertion_passed === true`, red ❌ badge if `false`. Show `checkType` as label (e.g., "Text Equals", "URL Match") |
| 1p  | ✅ Expected vs Actual diff          | Web (run detail page) | On failed assertions: expandable row showing `Expected: "Welcome, John!"` vs `Actual: "Error: Unauthorized"` with red highlight on differences               |
| 1q  | ✅ Assertion summary in run header  | Web (run detail page) | Show "Assertions: 5/6 passed" in the run summary bar alongside existing duration/actions count                                                               |

---

**Estimated effort:** 4-5 days (2-3 days extension, 0.5 day core, 0.5 day API, 0.5-1 day web)
**Lines of code:** ~800 across extension + 3 platform packages

> **✅ STEP 1 FULLY COMPLETED** — March 6-8, 2026. All sub-items (1a–1q) implemented across extension, core, API, and web.

---

### Step 3: Visual Regression Testing (Screenshot Comparison)

**Why:** Catches UI bugs that functional tests miss — CSS breaks, wrong images, layout shifts, invisible buttons.

**How it works:**

1. Run #1 with `screenshotMode: 'always'` → user clicks "Set as Baseline"
2. Run #2 → each action's screenshot compared pixel-by-pixel against baseline using `pixelmatch`
3. Diff images highlight what changed, threshold controls sensitivity

**What to build:**

| #   | Change                            | Package                          | Details                                                                            |
| --- | --------------------------------- | -------------------------------- | ---------------------------------------------------------------------------------- |
| 3a  | Add comparison logic              | Core (new `VisualComparator.ts`) | `pixelmatch` + `pngjs` — load baseline PNG, compare with current, produce diff PNG |
| 3b  | Add `baselineRunId` to RunOptions | Core (`runner.ts`)               | Pass baseline screenshots directory                                                |
| 3c  | Add `is_baseline` column          | API (`runs` schema)              | Mark a run as the baseline for its test                                            |
| 3d  | `POST /runs/:id/set-baseline`     | API (`runs` routes)              | Endpoint to mark a run as baseline                                                 |
| 3e  | Pass baseline to worker           | API (`testRunProcessor.ts`)      | Load baseline screenshots and pass to runner                                       |
| 3f  | Add `diff_path` + `diff_percent`  | API (`run_actions` schema)       | Store diff results per action                                                      |
| 3g  | "Set as Baseline" button          | Web (run detail page)            | Only for passed runs with screenshots                                              |
| 3h  | Diff viewer in lightbox           | Web (screenshot gallery)         | Baseline / Current / Diff three-way toggle with slider                             |

**Estimated effort:** 3 days
**Lines of code:** ~600

---

### Step 4: iframe Support

**Why:** Many real apps use iframes (payment forms, embedded widgets, third-party integrations). Tests that can't interact with iframes are incomplete.

**Key Insight:** The extension originally skipped all iframe execution. Recording and assertion mode needed to be enabled inside iframes, with frame context (`frameId`, `frameUrl`, `frameSelector`) populated on every action so the runner can replay them in the correct frame.

**Extension Work (✅ DONE — March 14–15, 2026):**

| #   | Change                                   | Package                                         | Details                                                                                                                                                                                                                                                                         |
| --- | ---------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 4e  | ✅ Enable content script in iframes      | Extension (`content/index.ts`)                  | Removed `if (window.self !== window.top) return` guard. Content script now runs in lightweight mode inside iframes (ActionRecorder + EventListener only, no overlay UI).                                                                                                        |
| 4f  | ✅ Populate frame context on all actions | Extension (`event-listener.ts`)                 | `emitAction()` detects iframe context and populates `frameUrl`, `frameId`, `frameSelector` on every captured action. `generateFrameSelector()` produces CSS selector for the `<iframe>` element (id → name → src → nth-of-type fallback). CSS.escape polyfill for jsdom compat. |
| 4g  | ✅ Assertion mode in iframes             | Extension (`content/index.ts`)                  | Removed iframe guard from `ENTER_ASSERTION_MODE` handler. AssertionInspector now activates in all frames. Checkpoint actions include frame context before syncing to background.                                                                                                |
| 4h  | ✅ Reliable multi-frame message routing  | Extension (`background/index.ts`)               | Added `sendMessageToAllFrames()` helper using `chrome.webNavigation.getAllFrames()` to explicitly route PAUSE_RECORDING, ENTER_ASSERTION_MODE, EXIT_ASSERTION_MODE, RESUME_RECORDING to each frame via `frameId`. Failures per-frame are isolated via `Promise.allSettled()`.   |
| 4i  | ✅ webNavigation permission              | Extension (`manifest.json`)                     | Added `"webNavigation"` to permissions array to support `getAllFrames()`.                                                                                                                                                                                                       |
| 4j  | ✅ Unit tests for iframe frame detection | Extension (`tests/unit/iframe-support.test.ts`) | 7 tests: main frame (no frame fields), iframe with id/name/src, nth-of-type fallback, cross-origin (null frameElement), all action types populated.                                                                                                                             |

**Core/Platform Work (✅ DONE — March 12–15, 2026):**

| #   | Change                                    | Package                                            | Details                                                                                                                                                                                                                          |
| --- | ----------------------------------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 4a  | ✅ Resolve iframe context per action      | Core (`PlaywrightRunner.ts`)                       | `resolveFrameContext()` — 3 strategies: `frameSelector` (CSS + `elementHandle().contentFrame()`), `frameUrl` (`page.frame({ url })`), `frameId` (`page.frame({ name })`). Falls back to main page with warning.                  |
| 4b  | ✅ Execute actions inside frame           | Core (`PlaywrightRunner.ts` + `ElementLocator.ts`) | All execute methods updated to accept `Page \| Frame`. Element finding uses iframe context; page-level operations (keyboard, URL tracking, navigation) stay on `Page`.                                                           |
| 4c  | ✅ Skip URL validation for iframe actions | Core (`PlaywrightRunner.ts`)                       | `validateAndCorrectPageState()` and `attemptRecovery()` now skip URL mismatch correction when `action.frameUrl/frameId/frameSelector` is set — prevents runner from navigating away from parent page to the iframe URL directly. |

**Estimated effort:** 1 day
**Lines of code:** ~100 (core) + ~400 (extension)

---

### Step 5: File Upload Recording & Replay

**Why:** File uploads are common in real apps (profile pictures, documents, CSV imports). Can't test them today.

**What to build:**

| #   | Change                         | Package                         | Details                                                                                                     |
| --- | ------------------------------ | ------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 5a  | Detect `<input type="file">`   | Extension (`event-listener.ts`) | Capture file name, size, MIME type (not content) when user selects a file                                   |
| 5b  | Define `FileUploadAction` type | Extension + Core (`actions.ts`) | New action type with `fileName`, `fileSize`, `mimeType`                                                     |
| 5c  | Replay file upload             | Core (`PlaywrightRunner.ts`)    | Use `page.setInputFiles()` with a test fixture file, or create a dummy file matching the expected size/type |
| 5d  | Test file management           | API + Web                       | Allow users to upload test fixture files that the runner uses during replay                                 |

**Estimated effort:** 2 days
**Lines of code:** ~300

---

### Step 6: Variables & Test Data / Parameterization ⭐ CRITICAL

**Why:** The extension already records `${PASSWORD}` in password fields — but the runner has **zero variable resolution**. It would type the literal string `${PASSWORD}` into the field. That means **any recording with a login flow is broken during replay**. This is a P0 blocker.

Beyond fixing passwords, a generic variable system enables running the same test with different data — different users, different environments, different inputs.

**Key Insight:** The `${VARIABLE}` syntax already exists for passwords. We need to:

1. **Make the runner actually resolve variables** (currently nobody does)
2. **Extend to any input field** (not just passwords)
3. **Provide a way to supply variable values** (UI, CLI, API)

---

#### Part A: Variable Resolution in Runner (Platform — Core) ⭐ MUST DO FIRST

This is the most critical piece — without it, `${PASSWORD}` recordings fail.

**How it works:**

1. Before executing an `input` action, scan `action.value` for `${VAR_NAME}` patterns
2. Replace each variable with its value from the provided variables map
3. If a variable is not found, throw a clear error: `Variable "PASSWORD" is not defined`

```typescript
// In PlaywrightRunner, before typing into input
const resolvedValue = this.resolveVariables(action.value, this.variables);
await locator.fill(resolvedValue);

// resolveVariables('Hello ${USERNAME}, your pass is ${PASSWORD}', vars)
// → 'Hello admin, your pass is secret123'
```

**Variable sources (priority order):**

1. Variables passed directly via `RunOptions.variables` (from API/CLI)
2. Environment variables (`process.env.SAVEACTION_VAR_PASSWORD`)
3. `.env` file in project root (optional)

| #   | Change                                  | File                         | Details                                                                                                                     |
| --- | --------------------------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| 6a  | ✅ Add `variables` to `RunOptions`      | Core (`runner.ts` types)     | `variables?: Record<string, string>` — key-value map                                                                        |
| 6b  | ✅ Add `resolveVariables()` method      | Core (`PlaywrightRunner.ts`) | Regex scan for `\${VAR_NAME}`, replace with value from variables map. Error if variable undefined.                          |
| 6c  | ✅ Call resolver before `input` actions | Core (`PlaywrightRunner.ts`) | In `executeInputAction()`, resolve `action.value` before typing. Also resolve in `executeSelectAction()` for select values. |
| 6d  | 🔜 DEFERRED                             | Core (`PlaywrightRunner.ts`) | Env var fallback (`SAVEACTION_VAR_*`). Not needed now — variables flow through test config → worker → runner.               |

---

#### Part B: Generic Variable Marking in Extension

Currently only password fields get `${PASSWORD}`. Let users mark any input as a variable.

**UX Flow:**

1. During recording, when user types into an input field, the extension shows a small icon/button near the field: **"Mark as Variable"**
2. User clicks it → prompt asks for variable name (pre-filled with field name, e.g., `EMAIL`, `USERNAME`)
3. The recorded action's `value` becomes `${EMAIL}` instead of the actual typed value
4. Existing `${PASSWORD}` auto-detection continues to work for password fields

| #   | Change                         | File                            | Details                                                                                                                                     |
| --- | ------------------------------ | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 6e  | ✅ "Mark as Variable" button   | Extension (`content-script`)    | HTML popup with inline naming (replaced window.prompt). Pre-fills with inferred name. Enter/Escape keyboard support. Click-outside dismiss. |
| 6f  | ✅ Replace value with variable | Extension (`event-listener.ts`) | `variableName` field on input actions. `backfillVariableNames()` at stop time. Store Credentials toggle to control password sanitization.   |
| 6g  | ✅ Variable list in popup      | Extension (popup UI)            | Variables button shows popup with marked variables. UNMARK_VARIABLE message flow. Remove Variable button (red-themed).                      |

---

#### Part C: Variables Storage & API (Platform — API)

| #   | Change                               | File                        | Details                                                                                      |
| --- | ------------------------------------ | --------------------------- | -------------------------------------------------------------------------------------------- |
| 6h  | ✅ Add `variables` column to `tests` | API (`tests` schema)        | `variables: jsonb` — stores `Record<string, string>` default values per test                 |
| 6i  | 🔜 DEFERRED                          | API (`runs` schema)         | `variable_overrides: jsonb` — audit trail only. Runs already execute with correct variables. |
| 6j  | ✅ Pass variables to worker          | API (`testRunProcessor.ts`) | Load test's `variables`, merge with any run-specific overrides, pass to runner               |
| 6k  | ✅ Variables API endpoint            | API (test routes)           | Variables accepted in test POST/PUT body (part of test CRUD, no dedicated endpoint needed)   |

---

#### Part D: Variables UI (Platform — Web)

| #   | Change                             | File                  | Details                                                                |
| --- | ---------------------------------- | --------------------- | ---------------------------------------------------------------------- |
| 6l  | ✅ Variables editor in test config | Web (test edit page)  | Variables input in test edit form, loaded/saved as part of test CRUD   |
| 6m  | 🔜 DEFERRED                        | Web (run dialog)      | Override variables per-run. Edge case — 99% of runs use test defaults. |
| 6n  | 🔜 DEFERRED                        | Web (run detail page) | Show variables used in run. Depends on 6i. Pure display feature.       |

---

#### Part E: CLI Variables Support

| #   | Change      | File                | Details                                                                                      |
| --- | ----------- | ------------------- | -------------------------------------------------------------------------------------------- |
| 6o  | 🔜 DEFERRED | CLI (`run` command) | `--var KEY=VALUE` — inline variable definition. CLI runs recordings directly, not API tests. |
| 6p  | 🔜 DEFERRED | CLI (`run` command) | `--variables vars.json` — load from file. Low priority.                                      |
| 6q  | 🔜 DEFERRED | CLI (`run` command) | `--env-prefix SAVEACTION_VAR_` — env var prefix. Low priority.                               |

**CLI usage examples:**

```bash
# Inline variables
saveaction run recording.json --var PASSWORD=secret123 --var EMAIL=admin@test.com

# From JSON file
saveaction run recording.json --variables vars.json

# From environment variables (auto: SAVEACTION_VAR_PASSWORD, SAVEACTION_VAR_EMAIL)
export SAVEACTION_VAR_PASSWORD=secret123
saveaction run recording.json
```

---

**Estimated effort:** 3-4 days (0.5 day core, 1 day extension, 1 day API, 0.5 day web, 0.5 day CLI)
**Lines of code:** ~600 across 4 platform packages + extension

---

### Step 7: Multi-Tab Support

**Why:** Many apps open links in new tabs, or have flows that involve popups (OAuth, payment, file preview). Currently, if a recording includes any multi-tab interaction, **the test breaks** — the runner has no concept of multiple pages.

**Real-world scenarios that require this:**

- **OAuth**: "Login with Google" → popup → auth → popup closes → back to app
- **Payment**: Stripe/PayPal open in new tab or popup window
- **`target="_blank"` links**: External links, PDF preview, admin panel in new tab
- **`window.open()` calls**: Programmatic popups, chat widgets, help windows

---

#### Design: Tab Identification via `tabIndex`

Every tab is identified by a **sequential `tabIndex`** (0 = original tab, 1 = first new tab, 2 = second, etc.). This is NOT the browser's internal tab ID — it's a simple counter that maps naturally to the order Playwright creates `Page` objects.

**Every existing action type** gets an optional `tabIndex?: number` field on `BaseAction` so the runner knows which page to execute it on. Default is `0` (main tab). This is identical to how `frameUrl`/`frameId`/`frameSelector` were added for iframe support.

---

#### Part A: Define TabAction Type (Extension + Core)

```typescript
interface TabAction extends BaseAction {
  type: 'tab';
  tabOperation: 'open' | 'switch' | 'close';
  tabIndex: number; // Target tab index (0 = original)
  newTabIndex?: number; // For 'open': the new tab's assigned index
  triggerUrl?: string; // URL of the new tab (for matching during replay)
  triggerType?: 'target_blank' | 'window_open' | 'popup'; // How the tab was opened
}
```

**`tabIndex` on BaseAction** (addition to existing interface):

```typescript
interface BaseAction {
  // ... existing fields (id, type, timestamp, url, frameId, frameUrl, frameSelector, etc.)
  tabIndex?: number; // NEW: Which tab this action belongs to (0 = main tab, default)
}
```

| #   | Change                                 | File                           | Details                                                                                                                                                                                                 |
| --- | -------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 7a  | Add `tabIndex` to `BaseAction`         | Core (`actions.ts`)            | Optional `tabIndex?: number` field. Default `0`. Added after `frameSelector` field. No breaking change — all existing actions without it implicitly belong to tab 0.                                    |
| 7b  | Define `TabAction` interface           | Core (`actions.ts`)            | New action type with `tabOperation`, `tabIndex`, `newTabIndex`, `triggerUrl`, `triggerType`. Add `isTabAction()` type guard. Add `'tab'` to `ActionType` union. Add `TabAction` to `Action` union type. |
| 7c  | Add `tab` to Zod schema                | Core (`RecordingParser.ts`)    | Validate `tab` actions during parsing. `tabOperation` is required enum `['open', 'switch', 'close']`. `tabIndex` required number. Rest optional.                                                        |
| 7d  | ✅ Add `tabIndex` to `BaseAction` type | Extension (`actions.ts` types) | Mirror the core type change. Same optional `tabIndex?: number` field.                                                                                                                                   |
| 7e  | ✅ Define `TabAction` interface        | Extension (`actions.ts` types) | Mirror the core `TabAction`. Add to the extension's `Action` union type. Includes `isTabAction()` type guard.                                                                                           |

---

#### Part B: Record Tab Interactions (Extension)

The extension must detect three tab events: **tab opens**, **tab switches**, and **tab closes**. It must also tag every action with which tab it was recorded in.

**Tab tracking state in extension background script:**

```typescript
// Background script state
let tabCounter = 0; // Increments for each new tab opened during recording
const tabIndexMap = new Map<number, number>(); // chrome tab ID → sequential tabIndex
// The recording tab (where recording started) gets tabIndex 0
```

**How tab detection works:**

1. **`target="_blank"` clicks**: The extension's content script already captures click events. When a click triggers a new tab (detectable via `chrome.tabs.onCreated` shortly after a click action), emit a `TabAction { tabOperation: 'open', triggerType: 'target_blank' }`.

2. **`window.open()` calls**: Monkey-patch `window.open` in the content script (inject via `<script>` tag into page context, same technique as dialog handling in Step 9). When called, post a message to the content script which relays to background. Background then listens for `chrome.tabs.onCreated` to capture the new tab.

3. **User switches tabs**: `chrome.tabs.onActivated` fires when user clicks a different tab. If the activated tab is in our `tabIndexMap`, emit `TabAction { tabOperation: 'switch', tabIndex: <target> }`.

4. **Tab closes**: `chrome.tabs.onRemoved` fires. If the closed tab is in our `tabIndexMap`, emit `TabAction { tabOperation: 'close', tabIndex: <closed> }`. Also emit a `switch` action to the tab that becomes active.

5. **Content script injection in new tabs**: When a new tab is created during recording, the extension must inject the content script into it so actions performed in that tab are captured. Use `chrome.scripting.executeScript({ target: { tabId: newTabId } })` from the background script.

6. **Tag all actions with `tabIndex`**: In the content script's `emitAction()` function (same place that adds `frameUrl`/`frameId`/`frameSelector`), add `tabIndex` from the background script's `tabIndexMap`. The content script queries the background for its tab's index.

| #   | Change                                             | File                                                                           | Details                                                                                                                                                                                                                                             |
| --- | -------------------------------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 7f  | ✅ Tab tracking state in background                | Extension (`background/index.ts`)                                              | `tabCounter`, `tabIndexMap`, `activeTabId`, `lastClosedTabIndex`, `pendingWindowOpen` in `BackgroundState`. Initialized on `START_RECORDING` (tab 0), cleared on `STOP_RECORDING`. `GET_TAB_INDEX` message handler for content scripts.             |
| 7g  | ✅ Detect new tab via `chrome.tabs.onCreated`      | Extension (`background/index.ts`)                                              | Full handler: increments `tabCounter`, adds to `tabIndexMap`, claims `activeTabId` before any awaits (prevents onActivated race), injects content script, detects trigger type (`target_blank`/`window_open`/`popup`), emits open + switch actions. |
| 7h  | ✅ Detect `window.open()` calls                    | Extension (`window-open-early-inject.ts` + `event-listener.ts` + `background`) | MAIN world script at `document_start` wraps `window.open`. Posts `saveaction-window-open` message → content script relays `WINDOW_OPENED` to background → background stores in `pendingWindowOpen` → correlated with `onCreated` within 3s window.  |
| 7i  | ✅ Detect `target="_blank"` clicks                 | Extension (`background/index.ts`)                                              | Implemented via `tab.openerTabId` detection in `onCreated` handler instead of content script flag. Chrome sets `openerTabId` for `target="_blank"` links — simpler and more reliable than the flag approach.                                        |
| 7j  | ✅ Detect tab switch via `chrome.tabs.onActivated` | Extension (`background/index.ts`)                                              | Handles: skip if already active, determine "from" tab via `previousTabId` or `lastClosedTabIndex` (for switch-after-close), emit switch action with `tabIndex`/`newTabIndex`.                                                                       |
| 7k  | ✅ Detect tab close via `chrome.tabs.onRemoved`    | Extension (`background/index.ts`)                                              | Emits close action, removes from map. If tab 0 closed → stops recording. For popup closes: deferred 200ms `setTimeout` queries actual active tab and emits switch if `onActivated` didn't fire (handles cross-window popup close).                  |
| 7l  | ✅ Inject content script into new tabs             | Extension (`background/index.ts`)                                              | `chrome.scripting.executeScript()` in `onCreated` handler injects content script into new tabs.                                                                                                                                                     |
| 7m  | ✅ Tag all actions with `tabIndex`                 | Extension (`background/index.ts`)                                              | Two mechanisms: (1) `SYNC_ACTION` handler stamps `tabIndex` from `tabIndexMap` on every action received from content scripts, (2) `GET_TAB_INDEX` message for content scripts to query their tab index.                                             |
| 7n  | ✅ Handle popup windows (self-closing)             | Extension (`background/index.ts`)                                              | OAuth popup close handled via deferred 200ms check in `onRemoved`. Queries `chrome.tabs.query({ active: true, lastFocusedWindow: true })` and emits switch if `onActivated` didn't fire for the main window's tab.                                  |
| 7o  | ✅ Unit tests for tab tracking                     | Extension (`tests/unit/multi-tab-support.test.ts`)                             | Tests for tab index assignment, sequential numbering, switch detection, close detection, action tagging, state cleanup.                                                                                                                             |

**What the recorded actions look like:**

```json
[
  {
    "id": "act_001",
    "type": "click",
    "tabIndex": 0,
    "url": "https://app.com/dashboard",
    "selector": { "css": "a.external-link" }
  },
  {
    "id": "act_002",
    "type": "tab",
    "tabOperation": "open",
    "tabIndex": 0,
    "newTabIndex": 1,
    "triggerUrl": "https://payment.stripe.com/checkout",
    "triggerType": "target_blank"
  },
  { "id": "act_003", "type": "tab", "tabOperation": "switch", "tabIndex": 1 },
  {
    "id": "act_004",
    "type": "input",
    "tabIndex": 1,
    "url": "https://payment.stripe.com/checkout",
    "selector": { "css": "#card-number" },
    "value": "4242424242424242"
  },
  {
    "id": "act_005",
    "type": "click",
    "tabIndex": 1,
    "url": "https://payment.stripe.com/checkout",
    "selector": { "css": "#pay-button" }
  },
  { "id": "act_006", "type": "tab", "tabOperation": "close", "tabIndex": 1 },
  { "id": "act_007", "type": "tab", "tabOperation": "switch", "tabIndex": 0 },
  {
    "id": "act_008",
    "type": "checkpoint",
    "tabIndex": 0,
    "url": "https://app.com/order-confirmed",
    "checkType": "elementText",
    "expectedValue": "Payment Successful"
  }
]
```

---

#### Part C: Replay Tab Actions in Runner (Core)

The runner maintains a **page registry** (`Map<number, Page>`) mapping `tabIndex` → Playwright `Page` object. Before executing each action, the runner selects the correct page from the registry.

**Key Playwright APIs used:**

- `context.waitForEvent('page')` — captures new Page object when a tab/popup opens
- `page.close()` — closes a tab
- `page.url()` — URL matching for tab identification
- `context.pages()` — list all open pages (fallback)

**How it works:**

1. At start, `pageRegistry.set(0, page)` — the initial page is tab 0.
2. When a `TabAction { tabOperation: 'open' }` is encountered:
   - The runner already executed the click/action that triggers the new tab.
   - Call `context.waitForEvent('page', { timeout: 10000 })` to capture the new `Page`.
   - Store it: `pageRegistry.set(action.newTabIndex, newPage)`.
   - Wait for the new page to load: `newPage.waitForLoadState('domcontentloaded')`.
3. When a `TabAction { tabOperation: 'switch' }` is encountered:
   - Set `activePage = pageRegistry.get(action.tabIndex)`.
   - Call `activePage.bringToFront()` (brings focus to the page).
4. When a `TabAction { tabOperation: 'close' }` is encountered:
   - Get `closingPage = pageRegistry.get(action.tabIndex)`.
   - Call `closingPage.close()`.
   - Remove from registry: `pageRegistry.delete(action.tabIndex)`.
5. For all other actions: look up the page via `action.tabIndex ?? 0` from the registry.
6. **Auto-detect new pages** (fallback): Register a `context.on('page')` listener that captures any new page not explicitly expected. This handles self-opening popups.

| #   | Change                                         | File                              | Details                                                                                                                                                                                                              |
| --- | ---------------------------------------------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 7p  | Add `pageRegistry` to runner                   | Core (`PlaywrightRunner.ts`)      | `Map<number, Page>` initialized with `{ 0: page }` after `context.newPage()`. Local variable inside `execute()` method (same pattern as current `page` variable).                                                    |
| 7q  | Add `context.on('page')` auto-capture listener | Core (`PlaywrightRunner.ts`)      | Register after creating context. Automatically adds unexpected new pages to registry with next available index. Calls `newPage.waitForLoadState('domcontentloaded')`. Logs warning about unrecorded tab.             |
| 7r  | Handle `tab:open` in `executeAction()`         | Core (`PlaywrightRunner.ts`)      | When previous action triggered a new tab: `const newPage = await context.waitForEvent('page')`. Store in registry. Wait for load. URL-match against `action.triggerUrl` for verification.                            |
| 7s  | Handle `tab:switch` in `executeAction()`       | Core (`PlaywrightRunner.ts`)      | Look up `pageRegistry.get(action.tabIndex)`. If found, `page.bringToFront()`. Set as active page. If not found, try URL-based fallback via `context.pages()`.                                                        |
| 7t  | Handle `tab:close` in `executeAction()`        | Core (`PlaywrightRunner.ts`)      | Look up page, call `page.close()`, remove from registry. Listen for `page.on('close')` to also handle self-closing popups.                                                                                           |
| 7u  | Select correct page for every action           | Core (`PlaywrightRunner.ts`)      | Before `executeAction()`, resolve page: `const activePage = pageRegistry.get(action.tabIndex ?? 0) ?? page`. Pass `activePage` to all execute methods instead of the original `page`.                                |
| 7v  | URL-based page matching fallback               | Core (`PlaywrightRunner.ts`)      | If `pageRegistry.get(tabIndex)` returns undefined, iterate `context.pages()` and find the page whose URL contains `action.url` or `action.triggerUrl`. Last resort before throwing error.                            |
| 7w  | Navigation/URL validation per-tab              | Core (`PlaywrightRunner.ts`)      | `validateAndCorrectPageState()` must use the active tab's page, not always the original page. Same pattern as the iframe fix — skip URL correction if `tabIndex > 0` and page URL matches the action's expected URL. |
| 7x  | Video/screenshot per-tab                       | Core (`PlaywrightRunner.ts`)      | Screenshots are already taken via `page.screenshot()`. Just ensure the correct page is used. Video is per-context (Playwright records all pages in context), so no change needed.                                    |
| 7y  | Unit tests for tab management                  | Core (`PlaywrightRunner.test.ts`) | Test: pageRegistry lifecycle, tab open/switch/close actions, auto-capture listener, URL fallback, cleanup, self-closing popup handling.                                                                              |

---

#### Part D: Display Tab Context in UI (Web)

The Web UI should indicate which tab each action ran in, similar to how browser badges are shown.

| #   | Change                         | File                  | Details                                                                                                                                                                                                        |
| --- | ------------------------------ | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 7z  | Tab indicator in actions table | Web (run detail page) | For actions with `tabIndex > 0`: show small "Tab N" badge next to the action type icon. For `tab` action type: show icon + operation label ("New Tab", "Switch Tab", "Close Tab") with target URL as subtitle. |

---

#### Extension Permissions Required

```json
{
  "permissions": ["tabs", "scripting", "webNavigation"]
}
```

- `tabs` — already likely present. Needed for `chrome.tabs.onCreated`, `onActivated`, `onRemoved`.
- `scripting` — for `chrome.scripting.executeScript()` to inject content script into new tabs.
- `webNavigation` — already present (added for iframe support).

---

#### Edge Cases to Handle

| Edge Case                                  | How to Handle                                                                                                                                                               |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **OAuth popup closes itself**              | `chrome.tabs.onRemoved` captures the close. Runner listens for `page.on('close')` event. Emit switch back to parent.                                                        |
| **Multiple popups at once**                | Each gets sequential `tabIndex`. Registry handles multiple pages.                                                                                                           |
| **Tab opens but user doesn't interact**    | Only emit `tab:open`. No further actions recorded in that tab. Runner still creates the page but doesn't do anything in it.                                                 |
| **New tab navigates via redirect**         | `triggerUrl` captures the initial URL. Runner uses `page.waitForLoadState()` to wait for redirects to settle before proceeding.                                             |
| **Tab opened by JavaScript after delay**   | `context.on('page')` auto-capture listener handles this. If a `tab:open` action is pending, `waitForEvent('page')` will wait.                                               |
| **Recording tab is closed**                | If tab 0 (original recording tab) is closed, stop recording. The main tab should never be closed during a recording session.                                                |
| **User manually opens a new tab (Ctrl+T)** | Only track tabs that are opened as a result of page interactions. Ignore manually opened blank tabs — check if `tab.pendingUrl` or `tab.url` is `chrome://newtab` and skip. |

**Estimated effort:** 2 days (0.75 day extension, 0.75 day core, 0.25 day core types, 0.25 day web)
**Lines of code:** ~500 across extension + 3 platform packages

> **✅ EXTENSION WORK COMPLETED** — March 22-23, 2026. All extension sub-items (7d–7o) implemented and tested with real-world multi-tab OAuth flows (Google OAuth on minimax.io). Key fixes: race condition prevention (activeTabId claimed before awaits in onCreated), deferred popup close detection (200ms setTimeout for cross-window closes), per-tab URL tracking (`tabPreviousUrls`), navigation trigger classification (redirect vs back). 544+ unit tests passing. Core/platform items (7a–7c, 7p–7z) pending.

---

### Step 8: Drag & Drop Recording

**Why:** Kanban boards, file managers, sortable lists, range sliders — all use drag & drop.

**What to build:**

| #   | Change                       | Package                         | Details                                             |
| --- | ---------------------------- | ------------------------------- | --------------------------------------------------- |
| 8a  | Detect drag events           | Extension (`event-listener.ts`) | Track `dragstart`, `drag`, `dragend`, `drop` events |
| 8b  | Define `DragDropAction` type | Extension + Core (`actions.ts`) | Source selector, target selector, coordinates       |
| 8c  | Replay drag & drop           | Core (`PlaywrightRunner.ts`)    | Use `page.dragAndDrop(source, target)`              |

**Estimated effort:** 1-2 days
**Lines of code:** ~200

---

### Step 9: Browser Dialog Handling

**Why:** The runner hangs when the page triggers `alert()`, `confirm()`, or `prompt()` dialogs. These are common in real apps (delete confirmations, form validation alerts, session timeout prompts). Without handling, the test just times out.

**What to build:**

#### Part A: Record Dialog Interactions (Extension)

The extension monkey-patches `window.alert`, `window.confirm`, `window.prompt` at `document_start` (before any page script runs). When the user interacts with a dialog, the wrapper captures what happened and emits a `DialogAction`.

**How it works per dialog type:**

- `confirm("Delete this?")` → user clicks OK → returns `true` → record `{ response: 'accept' }`
- `confirm("Delete this?")` → user clicks Cancel → returns `false` → record `{ response: 'dismiss' }`
- `prompt("Enter name:")` → user types "John" → returns `"John"` → record `{ response: 'accept', promptValue: 'John' }`
- `prompt("Enter name:")` → user clicks Cancel → returns `null` → record `{ response: 'dismiss' }`
- `alert("Done!")` → user clicks OK → record `{ response: 'accept' }`

| #   | Change                             | File                                                       | Details                                                                                                                                                                                                                                                                                                                                                              |
| --- | ---------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 9a  | Monkey-patch dialog functions      | Extension (`content-script`, injected at `document_start`) | Override `window.alert`, `window.confirm`, `window.prompt` with wrapper functions. The wrapper calls the original native function, captures the return value, then sends a message to the event listener with dialog type, message text, and user response. Must inject via `<script>` tag into page context (content scripts can't override page globals directly). |
| 9b  | Emit `DialogAction` on interaction | Extension (`event-listener.ts`)                            | Listen for dialog messages from injected script. Build `DialogAction` with: `dialogType` (`alert` / `confirm` / `prompt`), `message` (dialog text), `response` (`accept` / `dismiss`), `promptValue` (for prompt only). Append to `actions[]`.                                                                                                                       |
| 9c  | Handle `beforeunload` dialogs      | Extension (`content-script`)                               | These can't be monkey-patched (browser-level). Skip recording — runner will handle via Playwright's dialog event.                                                                                                                                                                                                                                                    |

---

#### Part B: Define DialogAction Type (Extension + Core)

```typescript
interface DialogAction extends BaseAction {
  type: 'dialog';
  dialogType: 'alert' | 'confirm' | 'prompt';
  message: string; // The text shown in the dialog
  response: 'accept' | 'dismiss'; // What the user did
  promptValue?: string; // For prompt: what the user typed (only if accepted)
}
```

| #   | Change                          | File                            | Details                                                       |
| --- | ------------------------------- | ------------------------------- | ------------------------------------------------------------- |
| 9d  | Define `DialogAction` interface | Extension + Core (`actions.ts`) | Add to `Action` union type, add `isDialogAction()` type guard |
| 9e  | Add to Zod schema               | Core (`RecordingParser.ts`)     | Validate `dialog` actions during parsing                      |

---

#### Part C: Replay Dialog Responses (Core)

During replay, the runner registers a `page.on('dialog')` handler **before** executing each action. If the recording contains a `DialogAction`, the handler matches it by message text and replays the exact user response.

| #   | Change                          | File                         | Details                                                                                                                                                                                                                  |
| --- | ------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 9f  | Register dialog handler         | Core (`PlaywrightRunner.ts`) | `page.on('dialog', handler)` — registered once when page is created. Maintains a queue of expected dialogs from the recording's `DialogAction` entries.                                                                  |
| 9g  | Match and respond to dialogs    | Core (`PlaywrightRunner.ts`) | When a dialog fires: check the queue for a matching `DialogAction` (by `dialogType` + `message`). If found → `dialog.accept(promptValue)` or `dialog.dismiss()`. If no match → auto-accept (fallback, prevents hanging). |
| 9h  | Execute `DialogAction` as no-op | Core (`PlaywrightRunner.ts`) | When the runner encounters a `dialog` action in the sequence, it's a no-op — the actual handling happens in the `page.on('dialog')` handler. The `DialogAction` just pre-loads the expected response into the queue.     |
| 9i  | Auto-accept unrecorded dialogs  | Core (`PlaywrightRunner.ts`) | If a dialog fires that wasn't in the recording (e.g., unexpected `alert()`), auto-accept it to prevent the runner from hanging. Log a warning.                                                                           |

---

#### Part D: Display Dialog Actions in UI (Web)

| #   | Change                             | File                  | Details                                                                                                                       |
| --- | ---------------------------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 9j  | Dialog action row in actions table | Web (run detail page) | Show dialog icon + type label (e.g., "Confirm Dialog"), message text as subtitle, response badge (✅ Accepted / ❌ Dismissed) |

---

**Estimated effort:** 1-2 days (0.5 day extension, 0.5 day core, 0.5 day web)
**Lines of code:** ~300

---

### Step 10: Flaky Test Detection & Auto-Retry

**Why:** E2E tests are inherently flaky. A platform must handle this gracefully.

**What to build:**

| #   | Change                | Package                      | Details                                                                    |
| --- | --------------------- | ---------------------------- | -------------------------------------------------------------------------- |
| 10a | Auto-retry on failure | Core (`PlaywrightRunner.ts`) | `retryCount: 2` — re-run the entire test on failure                        |
| 10b | Flaky test marking    | API (`tests` table)          | Track pass/fail ratio over last N runs, flag as flaky if ratio < threshold |
| 10c | Flaky badge in UI     | Web (test list, run results) | Show "Flaky" badge on tests with inconsistent results                      |
| 10d | Retry in worker       | API (`testRunProcessor.ts`)  | On failure, re-queue the job up to N times automatically                   |

**Estimated effort:** 2 days
**Lines of code:** ~300

---

### Step 11: Webhooks (Already Planned)

**Why:** Notify external systems (Slack, email, PagerDuty) on test failure.

**What to build:**

| #   | Change                   | Package                    | Details                                 |
| --- | ------------------------ | -------------------------- | --------------------------------------- |
| 11a | Webhook delivery service | API (`WebhookService.ts`)  | Send POST with HMAC signature on events |
| 11b | Webhook routes           | API (`webhooks.ts` routes) | CRUD for webhook config                 |
| 11c | Webhook management UI    | Web (settings)             | Configure webhook URLs, events, secrets |
| 11d | Delivery logs            | API + Web                  | Show delivery history with retry        |

**Estimated effort:** 2-3 days (schema already exists)

---

### Step 12: Team / Organization Support

**Why:** Real companies need multiple users sharing projects, tests, and results.

**What to build:**

| #   | Change                  | Package            | Details                                                 |
| --- | ----------------------- | ------------------ | ------------------------------------------------------- |
| 12a | Organizations table     | API (schema)       | `organizations` with owner, plan                        |
| 12b | Organization membership | API (schema)       | `org_members` with roles (owner, admin, member, viewer) |
| 12c | Invite flow             | API (routes) + Web | Invite by email, accept/decline                         |
| 12d | Permission checks       | API (middleware)   | Check user role before every operation                  |
| 12e | Org switcher            | Web (layout)       | Switch between personal and org workspaces              |

**Estimated effort:** 5-7 days

---

## Priority Order

| Priority | Step                               | Impact      | Effort   | Status                                                  |
| -------- | ---------------------------------- | ----------- | -------- | ------------------------------------------------------- |
| **P0**   | Step 1: Assertions (Manual + Auto) | 🔴 Critical | 4-5 days | ✅ DONE                                                 |
| **P0**   | Step 6: Variables & Test Data      | 🔴 Critical | 3-4 days | ✅ DONE (Core + API + editor; remaining items deferred) |
| **P1**   | Step 3: Visual Regression          | 🟠 High     | 3 days   | ⏳ TODO                                                 |
| **P1**   | Step 9: Browser Dialog Handling    | 🟠 High     | 1-2 days | ✅ DONE                                                 |
| **P1**   | Step 10: Flaky Test Detection      | 🟡 Medium   | 2 days   | ✅ DONE                                                 |
| **P2**   | Step 4: iframe Support             | 🟡 Medium   | 1 day    | ✅ DONE                                                 |
| **P2**   | Step 5: File Upload                | 🟡 Medium   | 2 days   | ✅ DONE                                                 |
| **P2**   | Step 7: Multi-Tab                  | 🟡 Medium   | 2 days   | ⏳ TODO                                                 |
| **P2**   | Step 11: Webhooks                  | 🟡 Medium   | 2-3 days | ⏳ TODO — schema exists, no routes                      |
| **P3**   | Step 8: Drag & Drop                | 🟢 Low      | 1-2 days | ⏳ TODO                                                 |
| **P3**   | Step 12: Team Support              | 🟢 Low      | 5-7 days | ⏳ TODO                                                 |

**Total estimated effort:** ~27-39 days for all steps (~9-10 days already done)

---

## How to Work Through This

1. Pick a step from the priority list
2. Create a branch: `feat/<step-name>` (e.g., `feat/implicit-assertions`)
3. Implement across all affected packages (extension, core, API, web)
4. Write tests for each change
5. Update this file — mark the step as ✅ DONE with completion date
6. Move to the next step

---

## Progress Tracker

| Step                                                | Status      | Date              |
| --------------------------------------------------- | ----------- | ----------------- |
| Step 1: Assertions — Extension (1a–1h)              | ✅ DONE     | March 6-7, 2026   |
| Step 1: Assertions — Core (1i–1k)                   | ✅ DONE     | March 7-8, 2026   |
| Step 1: Assertions — API (1l–1n)                    | ✅ DONE     | March 7-8, 2026   |
| Step 1: Assertions — Web UI (1o–1q)                 | ✅ DONE     | March 7-8, 2026   |
| Step 3: Visual Regression                           | ⏳ TODO     | —                 |
| Step 4: iframe Support — Extension (4e–4j)          | ✅ DONE     | March 14–15, 2026 |
| Step 4: iframe Support — Core (4a–4c)               | ✅ DONE     | March 12, 2026    |
| Step 5: File Upload                                 | ✅ DONE     | March 11, 2026    |
| Step 6: Variables — Extension (6e–6g)               | ✅ DONE     | March 6-7, 2026   |
| Step 6: Variables — Core (6a–6c)                    | ✅ DONE     | March 7-8, 2026   |
| Step 6: Variables — API (6h, 6j)                    | ✅ DONE     | March 7-8, 2026   |
| Step 6: Variables — API (6k)                        | ✅ DONE     | March 7-8, 2026   |
| Step 6: Variables — Web UI (6l)                     | ✅ DONE     | March 7-8, 2026   |
| Step 6: Variables — Deferred (6d, 6i, 6m–6n, 6o–6q) | 🔜 DEFERRED | —                 |
| Step 5: File Upload — Extension (5a–5b)             | ✅ DONE     | March 11, 2026    |
| Step 5: File Upload — Platform (5c–5d)              | ✅ DONE     | March 11, 2026    |
| Step 7: Multi-Tab Support                           | ⏳ TODO     | —                 |
| Step 8: Drag & Drop                                 | ⏳ TODO     | —                 |
| Step 9: Browser Dialog Handling — Extension (9a–9c) | ✅ DONE     | March 9-10, 2026  |
| Step 9: Browser Dialog Handling — Core (9d–9i)      | ✅ DONE     | March 10, 2026    |
| Step 9: Browser Dialog Handling — Web UI (9j)       | ✅ DONE     | March 10, 2026    |
| Step 10: Flaky Test Detection                       | ✅ DONE     | March 15–19, 2026 |
| Step 11: Webhooks                                   | ⏳ TODO     | —                 |
| Step 12: Team Support                               | ⏳ TODO     | —                 |

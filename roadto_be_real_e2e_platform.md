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
  checkType: 'urlMatch' | 'elementVisible' | 'elementText' | 'pageLoad' | 'elementHasValue' | 'containsText' | 'pageTitle';
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

| Assertion Type | When Shown | What It Verifies During Replay |
|---|---|---|
| **Text Equals** | Element has `textContent` | `locator.textContent() === expectedValue` |
| **Text Contains** | Element has `textContent` | `locator.textContent().includes(expectedValue)` |
| **Is Visible** | Any element | `locator.isVisible() === true` |
| **Has Value** | `<input>`, `<select>`, `<textarea>` | `locator.inputValue() === expectedValue` |
| **URL Contains** | Always (page-level, no element selection needed) | `page.url().includes(expectedValue)` |
| **Page Title** | Always (page-level, no element selection needed) | `page.title() === expectedValue` |

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

| # | Change | File | Details |
|---|--------|------|---------|
| 1a | ✅ Add "Add Assertion" button | Extension (popup UI) | New button in the recording toolbar, only visible while recording is active |
| 1b | ✅ Implement inspect mode | Extension (`content-script`) | Inject overlay + hover highlight + click handler into page. Use `document.elementFromPoint()` for hover detection. Blue outline via `outline: 2px solid #3b82f6` on hovered element. |
| 1c | ✅ Build assertion panel | Extension (`content-script`) | Floating popover near clicked element. Show assertion type dropdown + pre-filled expected value (editable). "Add" and "Cancel" buttons. |
| 1d | ✅ Determine available assertions | Extension (`content-script`) | Inspect clicked element: if has `textContent` → show Text Equals/Contains. If is `input/select/textarea` → show Has Value. Always show Is Visible. |
| 1e | ✅ Generate CheckpointAction | Extension (`event-listener.ts`) | On "Add" click: build `CheckpointAction` with selectors (same multi-strategy as other actions), `checkType`, `expectedValue`, `actualValue`. Append to `actions[]`. |
| 1f | ✅ Page-level assertions | Extension (popup UI) | In the assertion panel, add "URL Contains" and "Page Title" options that don't require an element selection — available directly from the "Add Assertion" button as a dropdown. |

---

#### Part B: Auto-Assertions — Zero-Effort Implicit Checkpoints (Extension)

On top of manual assertions, the extension automatically inserts checkpoint actions at key moments without any user interaction:

| Trigger | Auto-Generated CheckpointAction | Why |
|---|---|---|
| **After navigation** (URL changes) | `checkType: 'urlMatch'`, `expectedUrl: window.location.href` | Catches broken redirects, 404s, wrong routes |
| **After form submit** | `checkType: 'urlMatch'`, `expectedUrl: window.location.href` | After submit, user typically lands on a new page — verify it |

These auto-checkpoints are **non-intrusive** — they appear as regular actions in the recording but are clearly marked as auto-generated (`"auto": true`). Users can delete them from the recording if unwanted.

| # | Change | File | Details |
|---|--------|------|---------|
| 1g | ✅ Auto URL checkpoint after navigation | Extension (`event-listener.ts`) | After detecting URL change (already tracked), emit `CheckpointAction` with `checkType: 'urlContains'` and `expectedUrl` (pathname only), `auto: true` |
| 1h | ✅ Auto URL checkpoint after form submit | Extension (`event-listener.ts`) | After `submit` action, wait 500ms for navigation to settle, then emit URL checkpoint if URL changed |

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

| checkType | How Runner Verifies |
|---|---|
| `urlMatch` | `page.url() === action.expectedUrl` |
| `elementText` | `locator.textContent() === action.expectedValue` |
| `containsText` | `locator.textContent().includes(action.expectedValue)` |
| `elementVisible` | `locator.isVisible() === true` |
| `elementHasValue` | `locator.inputValue() === action.expectedValue` |
| `pageTitle` | `page.title() === action.expectedValue` |
| `pageLoad` | `page.waitForLoadState('domcontentloaded')` succeeds |

**On checkpoint failure:**
- The action result is marked as `failed` with `assertion_passed: false`
- `assertion_expected` and `assertion_actual` are stored for debugging
- If `continueOnError` is false (default), the run stops immediately
- If `continueOnError` is true, the run continues but the overall result is `failed`
- A screenshot is captured showing the page state at failure

| # | Change | File | Details |
|---|--------|------|---------|
| 1i | Add `executeCheckpoint()` method | Core (`PlaywrightRunner.ts`) | ~80 lines: find element via selector, get actual value based on `checkType`, compare against expected |
| 1j | Handle checkpoint in `executeAction()` | Core (`PlaywrightRunner.ts`) | Add `case 'checkpoint'` to the action type switch, call `executeCheckpoint()` |
| 1k | Add checkpoint to Zod schema | Core (`RecordingParser.ts`) | Validate `checkpoint` actions during parsing with proper schema |

---

#### Part D: Store Assertion Results (Platform — API)

| # | Change | File | Details |
|---|--------|------|---------|
| 1l | Add assertion columns to `run_actions` | API (`run_actions` schema) | Add `assertion_passed: boolean \| null`, `assertion_expected: text \| null`, `assertion_actual: text \| null` columns |
| 1m | Generate migration | API (drizzle) | `pnpm db:generate` → `pnpm db:migrate` |
| 1n | Update action persistence | API (`testRunProcessor.ts`) | When saving checkpoint action results, include assertion fields |

---

#### Part E: Display Assertion Results (Platform — Web UI)

| # | Change | File | Details |
|---|--------|------|---------|
| 1o | Assertion badge in actions table | Web (run detail page) | For checkpoint actions: green ✅ badge if `assertion_passed === true`, red ❌ badge if `false`. Show `checkType` as label (e.g., "Text Equals", "URL Match") |
| 1p | Expected vs Actual diff | Web (run detail page) | On failed assertions: expandable row showing `Expected: "Welcome, John!"` vs `Actual: "Error: Unauthorized"` with red highlight on differences |
| 1q | Assertion summary in run header | Web (run detail page) | Show "Assertions: 5/6 passed" in the run summary bar alongside existing duration/actions count |

---

**Estimated effort:** 4-5 days (2-3 days extension, 0.5 day core, 0.5 day API, 0.5-1 day web)
**Lines of code:** ~800 across extension + 3 platform packages

---

### Step 2: Wire Up Existing Wait Conditions

**Why:** The extension already records `waitConditions` per action (`networkIdle`, `elementVisible`, `elementStable`, `imageLoaded`, `parentVisible`). The runner **completely ignores them** — it uses hardcoded 300ms delays instead.

**What to build:**

| # | Change | Package | Details |
|---|--------|---------|---------|
| 2a | Read `waitConditions` from action | Core (`PlaywrightRunner.ts`) | Before executing each action, check `action.waitConditions` |
| 2b | Implement waiters | Core (`PlaywrightRunner.ts`) | `elementVisible` → `locator.waitFor({ state: 'visible' })`, `networkIdle` → `page.waitForLoadState('networkidle')`, `imageLoaded` → wait for `img.complete`, `elementStable` → poll position until stable |
| 2c | Respect `alternativeSelectors` | Core (`ElementLocator.ts`) | Try `action.alternativeSelectors` array in priority order as fallback |

**Estimated effort:** 1 day
**Lines of code:** ~150

---

### Step 3: Visual Regression Testing (Screenshot Comparison)

**Why:** Catches UI bugs that functional tests miss — CSS breaks, wrong images, layout shifts, invisible buttons.

**How it works:**
1. Run #1 with `screenshotMode: 'always'` → user clicks "Set as Baseline"
2. Run #2 → each action's screenshot compared pixel-by-pixel against baseline using `pixelmatch`
3. Diff images highlight what changed, threshold controls sensitivity

**What to build:**

| # | Change | Package | Details |
|---|--------|---------|---------|
| 3a | Add comparison logic | Core (new `VisualComparator.ts`) | `pixelmatch` + `pngjs` — load baseline PNG, compare with current, produce diff PNG |
| 3b | Add `baselineRunId` to RunOptions | Core (`runner.ts`) | Pass baseline screenshots directory |
| 3c | Add `is_baseline` column | API (`runs` schema) | Mark a run as the baseline for its test |
| 3d | `POST /runs/:id/set-baseline` | API (`runs` routes) | Endpoint to mark a run as baseline |
| 3e | Pass baseline to worker | API (`testRunProcessor.ts`) | Load baseline screenshots and pass to runner |
| 3f | Add `diff_path` + `diff_percent` | API (`run_actions` schema) | Store diff results per action |
| 3g | "Set as Baseline" button | Web (run detail page) | Only for passed runs with screenshots |
| 3h | Diff viewer in lightbox | Web (screenshot gallery) | Baseline / Current / Diff three-way toggle with slider |

**Estimated effort:** 3 days
**Lines of code:** ~600

---

### Step 4: iframe Support

**Why:** Many real apps use iframes (payment forms, embedded widgets, third-party integrations). Tests that can't interact with iframes are incomplete.

**Key Insight:** The extension already captures `frameId`, `frameUrl`, `frameSelector` on every action. The runner ignores them.

**What to build:**

| # | Change | Package | Details |
|---|--------|---------|---------|
| 4a | Detect and switch to iframe | Core (`PlaywrightRunner.ts`) | If `action.frameSelector` exists, use `page.frameLocator(frameSelector)` to get frame context |
| 4b | Execute action inside frame | Core (`PlaywrightRunner.ts`) | Use frame locator for element finding instead of page |
| 4c | Switch back to main frame | Core (`PlaywrightRunner.ts`) | After action in iframe, return to main page context |

**Estimated effort:** 1 day
**Lines of code:** ~100

---

### Step 5: File Upload Recording & Replay

**Why:** File uploads are common in real apps (profile pictures, documents, CSV imports). Can't test them today.

**What to build:**

| # | Change | Package | Details |
|---|--------|---------|---------|
| 5a | Detect `<input type="file">` | Extension (`event-listener.ts`) | Capture file name, size, MIME type (not content) when user selects a file |
| 5b | Define `FileUploadAction` type | Extension + Core (`actions.ts`) | New action type with `fileName`, `fileSize`, `mimeType` |
| 5c | Replay file upload | Core (`PlaywrightRunner.ts`) | Use `page.setInputFiles()` with a test fixture file, or create a dummy file matching the expected size/type |
| 5d | Test file management | API + Web | Allow users to upload test fixture files that the runner uses during replay |

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

| # | Change | File | Details |
|---|--------|------|----------|
| 6a | Add `variables` to `RunOptions` | Core (`runner.ts` types) | `variables?: Record<string, string>` — key-value map |
| 6b | Add `resolveVariables()` method | Core (`PlaywrightRunner.ts`) | Regex scan for `\${VAR_NAME}`, replace with value from variables map. Error if variable undefined. |
| 6c | Call resolver before `input` actions | Core (`PlaywrightRunner.ts`) | In `executeInputAction()`, resolve `action.value` before typing. Also resolve in `executeSelectAction()` for select values. |
| 6d | Support env var fallback | Core (`PlaywrightRunner.ts`) | If variable not in map, check `process.env.SAVEACTION_VAR_<NAME>` |

---

#### Part B: Generic Variable Marking in Extension

Currently only password fields get `${PASSWORD}`. Let users mark any input as a variable.

**UX Flow:**
1. During recording, when user types into an input field, the extension shows a small icon/button near the field: **"Mark as Variable"**
2. User clicks it → prompt asks for variable name (pre-filled with field name, e.g., `EMAIL`, `USERNAME`)
3. The recorded action's `value` becomes `${EMAIL}` instead of the actual typed value
4. Existing `${PASSWORD}` auto-detection continues to work for password fields

| # | Change | File | Details |
|---|--------|------|----------|
| 6e | ✅ "Mark as Variable" button | Extension (`content-script`) | HTML popup with inline naming (replaced window.prompt). Pre-fills with inferred name. Enter/Escape keyboard support. Click-outside dismiss. |
| 6f | ✅ Replace value with variable | Extension (`event-listener.ts`) | `variableName` field on input actions. `backfillVariableNames()` at stop time. Store Credentials toggle to control password sanitization. |
| 6g | ✅ Variable list in popup | Extension (popup UI) | Variables button shows popup with marked variables. UNMARK_VARIABLE message flow. Remove Variable button (red-themed). |

---

#### Part C: Variables Storage & API (Platform — API)

| # | Change | File | Details |
|---|--------|------|----------|
| 6h | Add `variables` column to `tests` | API (`tests` schema) | `variables: jsonb` — stores `Record<string, string>` default values per test |
| 6i | Add `variable_overrides` to `runs` | API (`runs` schema) | `variable_overrides: jsonb` — variables used for a specific run (for history/debugging) |
| 6j | Pass variables to worker | API (`testRunProcessor.ts`) | Load test's `variables`, merge with any run-specific overrides, pass to runner |
| 6k | Variables API endpoint | API (test routes) | `PUT /api/v1/projects/:projectId/tests/:testId/variables` — update test variables |

---

#### Part D: Variables UI (Platform — Web)

| # | Change | File | Details |
|---|--------|------|----------|
| 6l | Variables editor in test config | Web (test detail page) | Key-value table: `PASSWORD = ****`, `EMAIL = test@example.com`. Add/remove/edit rows. Sensitive values masked. |
| 6m | Variable override on run trigger | Web (run dialog) | When manually triggering a run, show "Override Variables" expandable section to change values for this run only |
| 6n | Variables used in run detail | Web (run detail page) | Show which variables were used (names only, values masked for sensitive ones) |

---

#### Part E: CLI Variables Support

| # | Change | File | Details |
|---|--------|------|----------|
| 6o | `--var` flag | CLI (`run` command) | `--var PASSWORD=secret --var EMAIL=test@test.com` — inline variable definition |
| 6p | `--variables` flag | CLI (`run` command) | `--variables vars.json` — load variables from JSON file |
| 6q | `--env-prefix` flag | CLI (`run` command) | `--env-prefix SAVEACTION_VAR_` (default) — read variables from env vars |

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

**Why:** Many apps open links in new tabs, or have flows that involve popups (OAuth, payment, file preview).

**What to build:**

| # | Change | Package | Details |
|---|--------|---------|---------|
| 7a | Detect new tab/window | Extension (`event-listener.ts`) | Track `window.open()` calls and `target="_blank"` link clicks |
| 7b | Define `TabAction` type | Extension + Core (`actions.ts`) | `switchTab`, `closeTab`, `newTab` action types |
| 7c | Tab management in runner | Core (`PlaywrightRunner.ts`) | Use `context.waitForEvent('page')` for new tabs, switch between pages in context |

**Estimated effort:** 2 days
**Lines of code:** ~300

---

### Step 8: Drag & Drop Recording

**Why:** Kanban boards, file managers, sortable lists, range sliders — all use drag & drop.

**What to build:**

| # | Change | Package | Details |
|---|--------|---------|---------|
| 8a | Detect drag events | Extension (`event-listener.ts`) | Track `dragstart`, `drag`, `dragend`, `drop` events |
| 8b | Define `DragDropAction` type | Extension + Core (`actions.ts`) | Source selector, target selector, coordinates |
| 8c | Replay drag & drop | Core (`PlaywrightRunner.ts`) | Use `page.dragAndDrop(source, target)` |

**Estimated effort:** 1-2 days
**Lines of code:** ~200

---

### Step 9: Flaky Test Detection & Auto-Retry

**Why:** E2E tests are inherently flaky. A platform must handle this gracefully.

**What to build:**

| # | Change | Package | Details |
|---|--------|---------|---------|
| 9a | Auto-retry on failure | Core (`PlaywrightRunner.ts`) | `retryCount: 2` — re-run the entire test on failure |
| 9b | Flaky test marking | API (`tests` table) | Track pass/fail ratio over last N runs, flag as flaky if ratio < threshold |
| 9c | Flaky badge in UI | Web (test list, run results) | Show "Flaky" badge on tests with inconsistent results |
| 9d | Retry in worker | API (`testRunProcessor.ts`) | On failure, re-queue the job up to N times automatically |

**Estimated effort:** 2 days
**Lines of code:** ~300

---

### Step 10: Webhooks (Already Planned)

**Why:** Notify external systems (Slack, email, PagerDuty) on test failure.

**What to build:**

| # | Change | Package | Details |
|---|--------|---------|---------|
| 10a | Webhook delivery service | API (`WebhookService.ts`) | Send POST with HMAC signature on events |
| 10b | Webhook routes | API (`webhooks.ts` routes) | CRUD for webhook config |
| 10c | Webhook management UI | Web (settings) | Configure webhook URLs, events, secrets |
| 10d | Delivery logs | API + Web | Show delivery history with retry |

**Estimated effort:** 2-3 days (schema already exists)

---

### Step 11: Team / Organization Support

**Why:** Real companies need multiple users sharing projects, tests, and results.

**What to build:**

| # | Change | Package | Details |
|---|--------|---------|---------|
| 11a | Organizations table | API (schema) | `organizations` with owner, plan |
| 11b | Organization membership | API (schema) | `org_members` with roles (owner, admin, member, viewer) |
| 11c | Invite flow | API (routes) + Web | Invite by email, accept/decline |
| 11d | Permission checks | API (middleware) | Check user role before every operation |
| 11e | Org switcher | Web (layout) | Switch between personal and org workspaces |

**Estimated effort:** 5-7 days

---

## Priority Order

| Priority | Step | Impact | Effort | Why First |
|----------|------|--------|--------|-----------|
| **P0** | Step 1: Assertions (Manual + Auto) | 🔴 Critical | 4-5 days | Without this, tests don't actually verify anything |
| **P0** | Step 6: Variables & Test Data | 🔴 Critical | 3-4 days | `${PASSWORD}` exists but runner doesn't resolve it — login tests broken |
| **P0** | Step 2: Wire Up Wait Conditions | 🟠 High | 1 day | Data already captured, just needs wiring |
| **P1** | Step 3: Visual Regression | 🟠 High | 3 days | Screenshots already captured, adds visual verification |
| **P1** | Step 9: Flaky Test Detection | 🟡 Medium | 2 days | Essential for real-world reliability |
| **P2** | Step 4: iframe Support | 🟡 Medium | 1 day | Types already exist |
| **P2** | Step 5: File Upload | 🟡 Medium | 2 days | Common in real apps |
| **P2** | Step 7: Multi-Tab | 🟡 Medium | 2 days | OAuth, payment flows need this |
| **P2** | Step 10: Webhooks | 🟡 Medium | 2-3 days | Schema already exists |
| **P3** | Step 8: Drag & Drop | 🟢 Low | 1-2 days | Niche but important for some apps |
| **P3** | Step 11: Team Support | 🟢 Low | 5-7 days | Needed for enterprise but not for platform correctness |

**Total estimated effort:** ~26-38 days for all steps

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

| Step | Status | Branch | Date |
|------|--------|--------|------|
| Step 1: Assertions — Extension (1a–1h) | ✅ DONE | — | March 6-7, 2026 |
| Step 1: Assertions — Core/API/Web (1i–1q) | ⏳ TODO | — | — |
| Step 2: Wire Up Wait Conditions | ⏳ TODO | — | — |
| Step 3: Visual Regression | ⏳ TODO | — | — |
| Step 4: iframe Support | ⏳ TODO | — | — |
| Step 5: File Upload | ⏳ TODO | — | — |
| Step 6: Variables — Extension (6e–6g + extras) | ✅ DONE | — | March 6-7, 2026 |
| Step 6: Variables — Core/API/Web/CLI (6a–6d, 6h–6q) | ⏳ TODO | — | — |
| Step 7: Multi-Tab Support | ⏳ TODO | — | — |
| Step 8: Drag & Drop | ⏳ TODO | — | — |
| Step 9: Flaky Test Detection | ⏳ TODO | — | — |
| Step 10: Webhooks | ⏳ TODO | — | — |
| Step 11: Team Support | ⏳ TODO | — | — |

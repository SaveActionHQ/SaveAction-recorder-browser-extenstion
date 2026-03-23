---
applyTo: 'src/background/**/*.ts'
excludeAgent: ['code-review']
---

# Background Service Worker Instructions

The background service worker is the heart of the extension's state management and message routing.

## Key Rules

1. **NO in-memory state** - Always use `chrome.storage.session` for persistence
2. **Message handlers must be async** - All handlers return `MessageResponse`
3. **Global action counter** - Maintain `state.actionCounter` for sequential IDs
4. **Tab tracking** - Track `state.currentTabId` for recording origin, `state.activeTabId` for current focus
5. **Multi-tab tracking** - Use `tabIndexMap` (chrome tab ID → sequential index), `tabCounter`, `activeTabId`, `lastClosedTabIndex` for multi-tab recording
6. **Error handling** - Always wrap in try-catch and return error responses
7. **Multi-frame messaging** - Use `sendMessageToAllFrames()` for messages that must reach iframes (assertion mode, pause/resume)
8. **Race condition prevention** - In async handlers (especially `onCreated`), update `state.activeTabId` BEFORE any `await` calls to prevent `onActivated` from racing
9. **Never compromise security** - Validate all message payloads, never trust content script data blindly

## State Structure

```typescript
interface BackgroundState {
  isRecording: boolean;
  isPaused: boolean;
  testName: string | null;
  currentTabId: number | null;
  startTime: number | null;
  initialUrl: string | null;
  metadata: RecordingMetadata | null;
  accumulatedActions: any[];
  actionCache: any[];
  pollingInterval: NodeJS.Timeout | null;
  actionCounter: number;
  previousUrl: string | null;
  tabPreviousUrls: Map<number, string>; // Per-tab URL tracking for navigation detection
  // Viewport/window data from initial page
  viewport: { width: number; height: number } | null;
  windowSize: { width: number; height: number } | null;
  screenSize: { width: number; height: number } | null;
  devicePixelRatio: number | null;
  lastUploadResult: {
    success: boolean;
    error?: string;
    recordingName?: string;
    timestamp: number;
  } | null;
  // Variable marking
  markedVariables: Array<{
    variableName: string;
    selector: string;
    fieldType: string;
    defaultValue: string;
  }>;
  // Multi-tab tracking
  tabCounter: number; // Sequential tab index counter
  tabIndexMap: Map<number, number>; // Chrome tab ID → sequential tabIndex
  activeTabId: number | null; // Currently focused tracked tab
  lastClosedTabIndex: number | null; // For switch-after-close detection
  pendingWindowOpen: { url: string; timestamp: number } | null; // window.open() correlation
}
```

## Message Handler Pattern

```typescript
async function handleMessage(message: Message, sender: chrome.runtime.MessageSender) {
  try {
    switch (message.type) {
      case 'YOUR_TYPE':
        // 1. Validate input
        // 2. Update state
        // 3. Persist to storage
        // 4. Return success response
        return { success: true, data: result };
      default:
        return { success: false, error: 'Unknown message type' };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
}
```

## Multi-Frame Messaging

When a message must reach ALL frames (main + iframes), use `sendMessageToAllFrames()`:

```typescript
async function sendMessageToAllFrames(
  tabId: number,
  message: Record<string, unknown>
): Promise<void> {
  const frames = await chrome.webNavigation.getAllFrames({ tabId });
  if (!frames || frames.length === 0) return;
  const results = await Promise.allSettled(
    frames.map((frame) => chrome.tabs.sendMessage(tabId, message, { frameId: frame.frameId }))
  );
  // Per-frame failures are logged but don't cascade
}
```

**Messages that require multi-frame delivery:**

- `PAUSE_RECORDING` / `RESUME_RECORDING` (before/after assertion mode)
- `ENTER_ASSERTION_MODE` / `EXIT_ASSERTION_MODE`

**Messages that use standard single-frame delivery:**

- `START_RECORDING`, `STOP_RECORDING`, `GET_STATUS`, `SYNC_ACTION`
- `GET_TAB_INDEX`, `WINDOW_OPENED`, `MARK_VARIABLE`, `UNMARK_VARIABLE`

## Critical Functions

- `restoreStateFromStorage()` - Restore state from `chrome.storage.session` on startup
- `persistActionCounter()` - Save action counter to storage
- `handleStartRecording()` - Initialize recording, set tab 0, inject content script
- `handleStopRecording()` - Compile actions, save recording, extract variables
- `handleSyncAction()` - Queue action from content script, stamp `tabIndex`, assign sequential IDs
- `handleSaveCurrentState()` - Preserve actions before page navigation (deduplicates)
- `handleEnterAssertionMode()` - Pause recording + activate assertion inspector in all frames
- `handleExitAssertionMode()` - Deactivate inspector + resume recording in all frames
- `sendMessageToAllFrames()` - Reliable multi-frame message delivery via `chrome.webNavigation.getAllFrames()`
- `emitTabAction()` - Assign sequential ID and store a `TabAction` (open/switch/close)
- `deduplicateActions()` - Remove duplicate actions by type+timestamp+selector
- `backfillVariableNames()` - Add `variableName` to input actions matching user-marked variables
- `broadcastStatusUpdate()` - Broadcast recording status to all open popups
- `resetState()` - Clear global state and storage

## Multi-Tab Event Handlers

Three Chrome tab event listeners drive multi-tab recording:

- **`chrome.tabs.onCreated`** - Detects new tabs (target_blank, window.open, popup). Assigns sequential `tabIndex`, claims `activeTabId` before any awaits, injects content script, emits `tab:open` + `tab:switch` actions.
- **`chrome.tabs.onActivated`** - Detects user switching between tabs. Emits `tab:switch` with from/to indices. Handles switch-after-close via `lastClosedTabIndex`.
- **`chrome.tabs.onRemoved`** - Detects tab/popup close. Emits `tab:close`. For popup window closes, uses deferred 200ms check to emit switch when `onActivated` doesn't fire.
- **`chrome.tabs.onUpdated`** - Detects navigation within tracked tabs. Emits navigation actions with trigger classification (redirect, link_click, etc.).

### Race Condition Prevention

In `onCreated`, `state.activeTabId = newTabId` MUST happen immediately after `tabIndexMap.set()`, BEFORE any `await` calls (like `chrome.tabs.get()` for trigger detection). This prevents `onActivated` from racing and emitting a duplicate switch before the open action.

## Testing

Background logic is integration-heavy. When modifying:

- Test state persistence across service worker restarts
- Verify action ID continuity across page navigation
- Test concurrent message handling
- Mock `chrome.storage.session` in tests
- Verify multi-frame message delivery (mock `chrome.webNavigation.getAllFrames`)

## Common Pitfalls

❌ Storing state in memory (service worker can restart)
❌ Not awaiting storage operations
❌ Forgetting to increment actionCounter
❌ Not handling sender.tab?.id properly
❌ Using `chrome.tabs.sendMessage()` without frameId for multi-frame scenarios
❌ Placing `state.activeTabId` assignment after `await` calls in `onCreated` (causes race with `onActivated`)
❌ Hard-coding switch target in `onRemoved` (Chrome may activate a different tab)
❌ Forgetting to stamp `tabIndex` on actions in `SYNC_ACTION` handler
✅ Always use chrome.storage.session
✅ Await all async operations
✅ Validate message payloads
✅ Return proper MessageResponse
✅ Use `sendMessageToAllFrames()` for assertion mode and pause/resume across iframes
✅ Claim `activeTabId` immediately in `onCreated` before any awaits
✅ Use deferred setTimeout(200ms) in `onRemoved` for popup window closes
✅ Stamp `tabIndex` from `tabIndexMap` on every `SYNC_ACTION`

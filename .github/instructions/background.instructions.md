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
4. **Tab tracking** - Track `state.currentTabId` for active recording
5. **Error handling** - Always wrap in try-catch and return error responses
6. **Multi-frame messaging** - Use `sendMessageToAllFrames()` for messages that must reach iframes (assertion mode, pause/resume)
7. **Never compromise security** - Validate all message payloads, never trust content script data blindly

## State Structure

```typescript
interface BackgroundState {
  isRecording: boolean;
  isPaused: boolean;
  testName: string;
  recordingId: string;
  startTime: number;
  currentTabId: number | null;
  actionCounter: number;
  actionCache: Action[];
  accumulatedActions: Action[];
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

## Critical Functions

- `loadState()` - Restore state from storage on startup
- `saveState()` - Persist state to storage
- `handleSyncAction()` - Assign sequential IDs to actions
- `handleNavigation()` - Merge actions on page transitions
- `handleEnterAssertionMode()` - Pause recording + activate assertion inspector in all frames
- `handleExitAssertionMode()` - Deactivate inspector + resume recording in all frames
- `sendMessageToAllFrames()` - Reliable multi-frame message delivery via `chrome.webNavigation.getAllFrames()`

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
✅ Always use chrome.storage.session
✅ Await all async operations
✅ Validate message payloads
✅ Return proper MessageResponse
✅ Use `sendMessageToAllFrames()` for assertion mode and pause/resume across iframes

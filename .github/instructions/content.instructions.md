---
applyTo: 'src/content/**/*.ts'
excludeAgent: ['code-review']
---

# Content Scripts Instructions

Content scripts run in the context of web pages and capture user interactions. They run in **all frames** (main frame + iframes) with different behavior depending on context.

## Key Rules

1. **Stateless design** - No persistent state in content scripts
2. **Message passing** - Always communicate with background via `chrome.runtime.sendMessage`
3. **Event cleanup** - Remove all event listeners when recording stops
4. **Element filtering** - Don't record clicks on extension's own overlay
5. **Selector generation** - Generate multiple selector strategies for reliability
6. **iframe-aware** - Detect `window.self !== window.top` and adjust behavior accordingly
7. **Frame context** - Every action inside an iframe must include `frameUrl`, `frameId`, `frameSelector`
8. **Never store sensitive data** - Use the sanitizer for passwords, PII, API keys

## Architecture

```
content/
├── index.ts                # Entry point, message router (iframe-aware)
├── action-recorder.ts      # Core recording orchestrator
├── assertion-inspector.ts  # Inspect mode for manual assertions (all frames)
├── dialog-early-inject.ts  # Dialog monkey-patching (MAIN world, document_start)
├── dialog-interceptor.ts   # Dialog event capture bridge
├── event-listener.ts       # DOM event capture + iframe frame context
├── intent-classifier.ts    # Navigation intent classification
├── recording-indicator.ts  # Overlay UI controls (main frame ONLY)
├── selector-generator.ts   # Multi-selector generation
└── variable-marker.ts      # "Mark as Variable" UI for input fields
```

## iframe Support

Content scripts run in all frames (`all_frames: true` in manifest). Behavior differs:

**Main frame (`window.self === window.top`):**

- Full initialization: ActionRecorder + EventListener + RecordingIndicator + AssertionInspector + VariableMarker
- Overlay UI (floating toolbar) is rendered

**iframe (`window.self !== window.top`):**

- Lightweight mode: Only ActionRecorder + EventListener + AssertionInspector
- No overlay UI (RecordingIndicator, VariableMarker skipped)
- Frame context (`frameUrl`, `frameId`, `frameSelector`) populated on every action

### Frame Context Propagation

```typescript
// In EventListener.emitAction(), when inside an iframe:
if (window.self !== window.top) {
  action.frameUrl = window.location.href;
  const frameEl = window.frameElement as HTMLIFrameElement | null;
  if (frameEl) {
    action.frameId = frameEl.id || frameEl.name || undefined;
    action.frameSelector = generateFrameSelector(frameEl);
  }
}
```

### Frame Selector Priority

`generateFrameSelector()` creates a CSS selector for the `<iframe>` element in the parent page:

1. `#iframe-id` (if iframe has `id`)
2. `iframe[name="..."]` (if iframe has `name`)
3. `iframe[src="..."]` (if iframe has `src`)
4. `iframe:nth-of-type(N)` (fallback)

## Event Listener Pattern

```typescript
class EventListener {
  private handleClick = (event: MouseEvent) => {
    // 1. Check if should record (not extension overlay)
    // 2. Extract element and event data
    // 3. Generate selectors
    // 4. Create action object
    // 5. Call callback with action (frame context auto-populated in emitAction)
  };

  start() {
    // Use capture phase for early interception
    document.addEventListener('click', this.handleClick, true);
  }

  stop() {
    // Always clean up
    document.removeEventListener('click', this.handleClick, true);
  }
}
```

## Selector Generation Priority

1. `id` attribute (most reliable)
2. `data-testid` or `data-test`
3. CSS class combination
4. ARIA labels (`aria-label`, `aria-labelledby`)
5. XPath
6. Text content (least reliable)

Always generate ALL selector types and let the consumer choose based on priority.

## Action Syncing

```typescript
// Send to background for ID assignment
chrome.runtime.sendMessage(
  {
    type: 'SYNC_ACTION',
    payload: { action },
  },
  (response) => {
    if (response?.success) {
      // Action saved with sequential ID
    }
  }
);
```

## Overlay UI Guidelines

- Position: fixed, top-right
- z-index: 2147483647 (maximum)
- Filter out overlay clicks: `if (element.closest('#saveaction-recording-indicator')) return;`
- Use shadow DOM to avoid style conflicts (future enhancement)
- **Main frame only** — never render overlay UI inside iframes

## Testing Content Scripts

Content scripts interact with DOM. When testing:

- Mock `chrome.runtime.sendMessage`
- Use JSDOM for DOM testing
- Test event listener cleanup
- Verify selector generation accuracy
- Test iframe frame context detection (`frameUrl`, `frameId`, `frameSelector`)
- Include CSS.escape polyfill for jsdom compatibility (not available in jsdom natively)

## Common Pitfalls

❌ Recording clicks on extension's own UI
❌ Not cleaning up event listeners
❌ Storing state in content script (use background)
❌ Generating only one selector type
❌ Not handling navigation properly
❌ Rendering overlay UI inside iframes
❌ Forgetting to populate frame context on actions inside iframes
✅ Filter extension overlay elements
✅ Remove listeners on stop
✅ Keep content scripts stateless
✅ Generate multiple selectors
✅ Sync actions immediately to background
✅ Detect iframe context and populate frameUrl/frameId/frameSelector
✅ Run lightweight mode (no UI) inside iframes

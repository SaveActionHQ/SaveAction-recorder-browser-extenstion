# Chrome Extension Recorder - Fix False Right-Clicks on Select Elements

## Problem Description

The SaveAction Chrome extension recorder is incorrectly capturing **right-click events** on native HTML `<select>` dropdown elements when users perform normal left-clicks to open the dropdown menu.

### Symptoms

- When user left-clicks a `<select>` dropdown, the recorder saves `"button": "right"`
- Coordinates are often negative or near-zero: `{"x": -0.8, "y": -0.6}`
- This happens specifically with native browser dropdown menus
- Affects test replay reliability (right-clicks on dropdowns don't make sense functionally)

### Example of Buggy Recording

```json
{
  "id": "act_029",
  "type": "click",
  "timestamp": 21191,
  "tagName": "select",
  "selector": {
    "id": "janazah-time"
  },
  "coordinates": {
    "x": -0.800018310546875,
    "y": -0.5999984741210938
  },
  "coordinatesRelativeTo": "element",
  "button": "right", // ❌ WRONG - should be "left"
  "clickCount": 1
}
```

## Root Cause Analysis

### Why This Happens

1. **Browser Synthetic Events**: When a native `<select>` dropdown opens, some browsers generate internal/synthetic events during the dropdown rendering process
2. **Event Capturing Phase**: The recorder's `click` event listener (with `capture: true`) catches these synthetic events
3. **Event Property Confusion**: The synthetic event may have:
   - `event.button = 2` (right-click code) even though user clicked left
   - Negative or near-zero coordinates relative to element
   - `event.isTrusted = true` (can't filter by trust level)

### Technical Details

- Browser: Chromium-based (Chrome, Edge, etc.)
- Element Type: Native `<select>` with `<option>` children
- Event Phase: Capture phase during dropdown menu open animation
- User Action: Normal left-click on select element
- What Recorder Sees: `MouseEvent { button: 2, clientX: ..., clientY: ... }`

---

## Solution Implementation

### Fix Strategy

**Filter out or correct false right-clicks on select elements** by detecting the pattern and normalizing the button value.

### Code Changes Required

#### Location

File: `content-script.js` (or wherever click event listener is registered)

#### Current Code (Buggy)

```javascript
document.addEventListener(
  'click',
  (event) => {
    const target = event.target;

    // Record click action
    const action = {
      type: 'click',
      tagName: target.tagName.toLowerCase(),
      button: event.button === 0 ? 'left' : event.button === 2 ? 'right' : 'middle',
      coordinates: {
        x: event.offsetX,
        y: event.offsetY,
      },
      // ... other properties
    };

    recordAction(action);
  },
  true
); // capture: true
```

#### Fixed Code (3 Options - Choose One)

**Option 1: Force Left-Click on Select Elements** (Recommended)

```javascript
document.addEventListener(
  'click',
  (event) => {
    const target = event.target;

    // Determine button type
    let buttonType = event.button === 0 ? 'left' : event.button === 2 ? 'right' : 'middle';

    // FIX: Native <select> dropdowns never use right-clicks
    // Browser generates synthetic right-click events during dropdown open
    if (target.tagName === 'SELECT' && buttonType === 'right') {
      console.warn('[SaveAction] Correcting false right-click on <select> element to left-click');
      buttonType = 'left';
    }

    // Record click action
    const action = {
      type: 'click',
      tagName: target.tagName.toLowerCase(),
      button: buttonType,
      coordinates: {
        x: event.offsetX,
        y: event.offsetY,
      },
      // ... other properties
    };

    recordAction(action);
  },
  true
);
```

**Option 2: Skip Right-Clicks on Select Elements**

```javascript
document.addEventListener(
  'click',
  (event) => {
    const target = event.target;

    // FIX: Ignore synthetic right-click events on <select> elements
    if (target.tagName === 'SELECT' && event.button === 2) {
      console.warn('[SaveAction] Ignoring synthetic right-click on <select> element');
      return; // Don't record this event
    }

    // Record click action
    const action = {
      type: 'click',
      tagName: target.tagName.toLowerCase(),
      button: event.button === 0 ? 'left' : event.button === 2 ? 'right' : 'middle',
      // ... other properties
    };

    recordAction(action);
  },
  true
);
```

**Option 3: Filter by Coordinate Pattern** (Most Robust)

```javascript
document.addEventListener(
  'click',
  (event) => {
    const target = event.target;

    // Calculate coordinates
    const coords = {
      x: event.offsetX,
      y: event.offsetY,
    };

    // Determine button type
    let buttonType = event.button === 0 ? 'left' : event.button === 2 ? 'right' : 'middle';

    // FIX: Detect synthetic right-clicks on select elements
    // Pattern: right-click with suspicious coordinates (negative or near-zero)
    if (target.tagName === 'SELECT' && buttonType === 'right') {
      const isSuspiciousCoords = Math.abs(coords.x) < 2 && Math.abs(coords.y) < 2;

      if (isSuspiciousCoords) {
        console.warn(
          '[SaveAction] Correcting synthetic right-click on <select> (suspicious coords)'
        );
        buttonType = 'left';
      } else {
        // User actually right-clicked (rare but possible)
        console.log('[SaveAction] Preserving genuine right-click on <select>');
      }
    }

    // Record click action
    const action = {
      type: 'click',
      tagName: target.tagName.toLowerCase(),
      button: buttonType,
      coordinates: coords,
      // ... other properties
    };

    recordAction(action);
  },
  true
);
```

---

## Testing Requirements

### Test Cases

#### Test 1: Normal Dropdown Click

**Steps:**

1. Visit page with native `<select id="dropdown">` element
2. Left-click the dropdown to open it
3. Select an option
4. Stop recording

**Expected Result:**

```json
{
  "type": "click",
  "tagName": "select",
  "button": "left", // ✅ Must be "left"
  "selector": { "id": "dropdown" }
}
```

#### Test 2: Multiple Dropdown Interactions

**Steps:**

1. Open dropdown
2. Close it (click away)
3. Open again
4. Select option

**Expected Result:**

- All clicks on `<select>` should have `"button": "left"`
- No right-click events recorded

#### Test 3: Genuine Right-Click (Edge Case)

**Steps:**

1. Right-click select element (context menu)
2. Dismiss context menu

**Expected Result (Option 1/2):**

- Event converted to left-click or skipped
- Test passes either way

**Expected Result (Option 3):**

- If coordinates are normal (not near-zero), preserve right-click
- If coordinates are suspicious, convert to left-click

#### Test 4: Different Browsers

**Test on:**

- Chrome 120+
- Edge 120+
- Opera (Chromium-based)

**Expected Result:**

- No right-clicks recorded on `<select>` elements in any browser

---

## Implementation Checklist

### Pre-Implementation

- [ ] Backup current content-script.js
- [ ] Identify exact location of click event listener
- [ ] Confirm event listener uses `capture: true` parameter
- [ ] Check if recorder uses TypeScript (needs type updates)

### Code Changes

- [ ] Add button type correction logic before recording
- [ ] Add console warning for debugging (removable in production)
- [ ] Handle both `addEventListener` and any event delegation
- [ ] Update TypeScript types if applicable

### Testing

- [ ] Test Case 1: Normal dropdown click → Verify "button": "left"
- [ ] Test Case 2: Multiple interactions → No right-clicks recorded
- [ ] Test Case 3: Genuine right-click → Handled appropriately
- [ ] Test Case 4: Cross-browser → Works on Chrome, Edge, Opera
- [ ] Regression test: Other elements (buttons, links) still record correctly
- [ ] Regression test: Middle-clicks still work (if supported)

### Validation

- [ ] Record a test with dropdowns
- [ ] Inspect JSON: No `"button": "right"` on `"tagName": "select"`
- [ ] Replay test: Dropdowns interact correctly
- [ ] Check coordinates: No negative values on select clicks
- [ ] Performance: No noticeable delay (<5ms per click)

### Documentation

- [ ] Update recorder README with fix details
- [ ] Add comment in code explaining the workaround
- [ ] Note browser quirk in troubleshooting docs
- [ ] Update CHANGELOG.md

---

## Edge Cases to Consider

### 1. Select Elements in Shadow DOM

**Issue:** Shadow DOM boundaries may affect event propagation
**Solution:** Ensure listener is on correct document context

### 2. Custom Styled Select Dropdowns

**Issue:** Some libraries (Select2, Chosen) use divs that look like selects
**Solution:** Only filter actual `<select>` elements, let custom dropdowns work normally

### 3. Disabled Select Elements

**Issue:** Clicks on disabled selects might still bubble
**Solution:** Check `target.disabled` before normalizing

### 4. Select Inside iFrame

**Issue:** iFrame may have separate event context
**Solution:** Ensure recorder injects into all frames

### 5. Rapid Consecutive Clicks

**Issue:** User quickly opens/closes dropdown multiple times
**Solution:** Deduplication logic should handle multiple left-clicks

---

## Performance Considerations

- **Overhead:** < 0.5ms per click event (simple tagName check)
- **Memory:** No additional memory allocation
- **Browser Load:** Negligible (single conditional check)
- **Production Ready:** Yes, safe for all users

---

## Backward Compatibility

### Existing Recordings with Right-Clicks

- **Runner Workaround:** Already implemented in PlaywrightRunner.ts (converts right → left)
- **Migration:** No migration needed, old recordings still work
- **New Recordings:** Will be correct from the start

### Version Compatibility

- **Recorder Version:** Add fix in v1.x+
- **Runner Version:** Already compatible (v0.1.0+)
- **JSON Schema:** No schema changes required

---

## Verification Steps

### After Implementation

1. **Build Extension:**

   ```bash
   npm run build
   # or
   pnpm build
   ```

2. **Load Unpacked Extension:**
   - Chrome → Extensions → Developer Mode → Load Unpacked
   - Select dist/ folder

3. **Record Test:**
   - Visit test site with dropdowns
   - Click dropdown 3-4 times
   - Select options
   - Stop recording

4. **Inspect JSON:**

   ```bash
   grep -c '"button": "right".*"tagName": "select"' recording.json
   ```

   **Expected:** 0 matches

5. **Replay Test:**
   ```bash
   saveaction run recording.json --headless false
   ```
   **Expected:** Dropdowns click and select correctly

---

## Alternative Solutions (Not Recommended)

### Alternative 1: Use mousedown Instead of click

**Pros:** More control over event
**Cons:** Breaks click-related logic, affects other elements

### Alternative 2: Add Debouncing to Select Clicks

**Pros:** Reduces duplicate events
**Cons:** Doesn't fix the button type issue

### Alternative 3: Filter in Post-Processing

**Pros:** No recorder changes needed
**Cons:** Requires runner workaround (already done), perpetuates bad data

---

## Success Criteria

✅ **Fix is successful when:**

1. No `"button": "right"` on `"tagName": "select"` in new recordings
2. Dropdowns still record all interactions correctly
3. Other elements (buttons, links) unaffected
4. Test replay works without errors
5. No performance degradation
6. Cross-browser compatible (Chrome, Edge, Opera)

---

## Related Issues

- SaveAction Issue #TBD: Right-clicks recorded on select elements
- Chromium Bug: Synthetic events during native dropdown open
- Related Fix: Runner workaround in `PlaywrightRunner.executeClick()` (already implemented)

---

## Contact & Support

If implementing this fix raises questions:

1. Check if click event listener is in content script vs background script
2. Verify `event.target.tagName === 'SELECT'` (uppercase) matches your code
3. Test with `console.log(event)` to see actual event properties
4. Ensure recorder is using capture phase (`{ capture: true }`)

---

## Summary

**What to change:** Add 3-line check in click event listener to normalize button type for select elements

**Why:** Browser generates synthetic right-click events when opening native dropdowns

**Impact:** Fixes false right-clicks in recordings, improves test reliability

**Effort:** < 30 minutes to implement and test

**Risk:** Very low (simple conditional check, no breaking changes)

**Priority:** High (affects all recordings with dropdowns)

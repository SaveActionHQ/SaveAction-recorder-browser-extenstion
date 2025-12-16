# Recorder Critical Bug Fix: Native Select Dropdown Recording

## Problem Statement

**CRITICAL BUG**: The recorder is NOT capturing user selections from native HTML `<select>` dropdown menus. This causes test replay failures because the runner doesn't know which option the user selected.

**Current Behavior (BROKEN)**:

1. User clicks `<select>` dropdown → ✅ Click action recorded
2. User selects "Option 2" from dropdown → ❌ **NOTHING RECORDED**
3. During replay → Dropdown opens but wrong option is selected (default value)

**Expected Behavior (REQUIRED)**:

1. User clicks `<select>` dropdown → ✅ Click action recorded
2. User selects "Option 2" → ✅ **`select-change` action recorded with option details**
3. During replay → Correct option is selected

## Solution Requirements

### 1. Event Listener Implementation

**Add a `change` event listener for ALL `<select>` elements:**

```javascript
// Listen for select dropdown changes
document.addEventListener(
  'change',
  (event) => {
    const target = event.target;

    // Only handle SELECT elements
    if (target.tagName !== 'SELECT') {
      return;
    }

    try {
      const select = target;
      const selectedIndex = select.selectedIndex;
      const selectedOption = select.options[selectedIndex];

      // Record the selection
      recordSelectChange(select, selectedOption, selectedIndex);
    } catch (error) {
      console.error('Error recording select change:', error);
    }
  },
  true
); // Use capture phase to catch before other handlers
```

### 2. Action Recording Function

```javascript
function recordSelectChange(selectElement, selectedOption, selectedIndex) {
  const action = {
    id: generateActionId(), // e.g., "act_225"
    type: 'select-change',
    timestamp: Date.now(),
    completedAt: Date.now(),
    url: window.location.href,

    // The select element itself
    select: {
      selector: generateSelector(selectElement),
      id: selectElement.id || null,
      name: selectElement.name || null,
      tagName: 'select',
    },

    // The option that was selected
    selectedOption: {
      text: selectedOption.textContent.trim(),
      value: selectedOption.value,
      index: selectedIndex,
      label: selectedOption.label || null,
    },

    // Element state for debugging
    elementState: {
      visible: isVisible(selectElement),
      inViewport: isInViewport(selectElement),
      opacity: getComputedStyle(selectElement).opacity,
      display: getComputedStyle(selectElement).display,
      zIndex: getComputedStyle(selectElement).zIndex,
      enabled: !selectElement.disabled,
    },

    // Wait conditions
    waitConditions: {
      elementVisible: true,
      parentVisible: true,
      networkIdle: false,
      elementStable: true,
    },
  };

  // Add to recorded actions
  recordedActions.push(action);

  console.log(
    `[SaveAction] Recorded select change: ${selectElement.id || selectElement.name} → "${selectedOption.textContent.trim()}"`
  );
}
```

### 3. Action Format Specification

**JSON Schema for `select-change` action:**

```json
{
  "id": "act_225",
  "type": "select-change",
  "timestamp": 148500,
  "completedAt": 148501,
  "url": "https://example.com/form",
  "select": {
    "selector": {
      "id": "country-select",
      "name": "country",
      "css": "form.checkout-form > select#country-select",
      "xpath": "//select[@id='country-select']",
      "xpathAbsolute": "/html/body[1]/form[1]/select[1]",
      "position": {
        "parent": "form.checkout-form",
        "index": 2
      },
      "priority": ["id", "name", "css", "xpath", "xpathAbsolute", "position"]
    },
    "id": "country-select",
    "name": "country",
    "tagName": "select"
  },
  "selectedOption": {
    "text": "United Kingdom",
    "value": "uk",
    "index": 2,
    "label": "United Kingdom"
  },
  "elementState": {
    "visible": true,
    "inViewport": true,
    "opacity": "1",
    "display": "block",
    "zIndex": "auto",
    "enabled": true
  },
  "waitConditions": {
    "elementVisible": true,
    "parentVisible": true,
    "networkIdle": false,
    "elementStable": true
  }
}
```

## Critical Edge Cases to Handle

### 1. Multiple Selects on Same Page

```javascript
// MUST include full selector path to distinguish dropdowns
// ✅ CORRECT: form#checkout > select#country
// ❌ WRONG: select#country (could match multiple forms)
```

### 2. Programmatic Changes

```javascript
// DON'T record programmatic changes (only user interactions)
let isUserInteraction = true;

document.addEventListener(
  'change',
  (event) => {
    if (!isUserInteraction) return;
    // ... record change
  },
  true
);

// When code changes select programmatically:
function setSelectValue(select, value) {
  isUserInteraction = false;
  select.value = value;
  select.dispatchEvent(new Event('change'));
  isUserInteraction = true;
}
```

### 3. Disabled Options

```javascript
// Skip recording if selected option is disabled
if (selectedOption.disabled) {
  console.warn('Selected option is disabled, skipping recording');
  return;
}
```

### 4. Empty Selects

```javascript
// Handle empty dropdowns gracefully
if (select.options.length === 0) {
  console.warn('Select has no options, skipping recording');
  return;
}

if (selectedIndex < 0) {
  console.warn('No option selected, skipping recording');
  return;
}
```

### 5. Dynamic Option Loading

```javascript
// If options are loaded dynamically, wait for them
if (select.options.length === 0 || select.classList.contains('loading')) {
  // Wait for options to load
  const observer = new MutationObserver(() => {
    if (select.options.length > 0) {
      observer.disconnect();
      // Now record the change
    }
  });
  observer.observe(select, { childList: true });
}
```

### 6. Multi-Select Dropdowns

```javascript
// Handle <select multiple> elements
if (select.multiple) {
  const selectedOptions = Array.from(select.selectedOptions).map((opt) => ({
    text: opt.textContent.trim(),
    value: opt.value,
    index: Array.from(select.options).indexOf(opt),
  }));

  action.selectedOptions = selectedOptions; // Array instead of single object
}
```

## Integration Guidelines

### DO:

✅ Add event listener in the **recorder initialization** code
✅ Use **capture phase** (`true` as 3rd parameter) to catch events early
✅ Generate **full selector** with all strategies (id, name, css, xpath, position)
✅ Include **both select element AND selected option** details
✅ Record **immediately** when change event fires
✅ Use **try-catch** to prevent recorder crashes
✅ Log **success** messages to console for debugging
✅ Check if **element is visible** before recording
✅ Handle **errors gracefully** without stopping recording

### DON'T:

❌ Record **programmatic changes** (only user interactions)
❌ Record if **select is disabled**
❌ Record if **no option is selected** (selectedIndex < 0)
❌ Use **setTimeout** or delays (record immediately)
❌ Modify **existing click recording** logic
❌ Change **action ID generation** format
❌ Break **backward compatibility** with old recordings
❌ Add **dependencies** on external libraries

## Testing Requirements

### Test Case 1: Basic Select Change

```html
<select id="country" name="country">
  <option value="">Select a country</option>
  <option value="us">United States</option>
  <option value="uk">United Kingdom</option>
</select>
```

**Steps:**

1. Click select
2. Choose "United Kingdom"
3. Verify action recorded with:
   - `type: "select-change"`
   - `selectedOption.value: "uk"`
   - `selectedOption.text: "United Kingdom"`
   - `selectedOption.index: 2`

### Test Case 2: Multiple Selects

```html
<form>
  <select id="country" name="country">
    ...
  </select>
  <select id="state" name="state">
    ...
  </select>
</form>
```

**Steps:**

1. Select country
2. Select state
3. Verify TWO separate actions recorded
4. Verify each has unique selector

### Test Case 3: Dynamic Options

```html
<select id="city" name="city">
  <!-- Options loaded via AJAX -->
</select>
```

**Steps:**

1. Click country dropdown
2. Wait for cities to load
3. Select city
4. Verify action recorded after options loaded

### Test Case 4: Programmatic Change (Should NOT Record)

```javascript
// This should NOT create a select-change action
document.getElementById('country').value = 'uk';
```

### Test Case 5: Multi-Select

```html
<select id="tags" name="tags" multiple>
  <option value="tag1">Tag 1</option>
  <option value="tag2">Tag 2</option>
  <option value="tag3">Tag 3</option>
</select>
```

**Steps:**

1. Select multiple options (Tag 1 + Tag 3)
2. Verify action has `selectedOptions` array with both

### Test Case 6: Disabled Select (Should NOT Record)

```html
<select id="country" disabled>
  ...
</select>
```

### Test Case 7: Form Submit After Select

```html
<form>
  <select id="country">
    ...
  </select>
  <button type="submit">Submit</button>
</form>
```

**Steps:**

1. Select option
2. Click submit
3. Verify BOTH actions recorded (select-change + click)

## Backward Compatibility

**CRITICAL**: This fix must NOT break existing recordings that don't have `select-change` actions.

**Runner Compatibility:**

- If recording has NO `select-change` action for a select → Use default value (current behavior)
- If recording HAS `select-change` action → Use recorded value (new behavior)

**No changes required to:**

- Existing click recording logic
- Existing input recording logic
- Action ID generation
- Timestamp recording
- Selector generation

## Code Quality Standards

### 1. Performance

- Event listener runs on EVERY change event → must be fast (<5ms)
- Use early returns to skip non-select elements quickly
- Don't perform expensive operations in hot path

### 2. Error Handling

```javascript
try {
  // Recording logic
} catch (error) {
  console.error('[SaveAction] Error recording select change:', error);
  // Don't throw - allow recording to continue
}
```

### 3. Logging

```javascript
// Development logging (can be toggled)
if (DEBUG_MODE) {
  console.log(`[SaveAction] Select change: ${select.id} → "${selectedOption.text}"`);
}
```

### 4. Memory Management

- Don't create memory leaks with event listeners
- Clean up observers when done
- Don't store unnecessary references

## Verification Checklist

Before submitting the fix, verify:

- [ ] Event listener added in recorder initialization
- [ ] `select-change` action format matches specification
- [ ] All 7 test cases pass
- [ ] Programmatic changes are NOT recorded
- [ ] Multi-select dropdowns work
- [ ] Empty/disabled selects don't crash
- [ ] Existing recordings still work (backward compatibility)
- [ ] No console errors during recording
- [ ] No memory leaks after 100+ recordings
- [ ] Works in Chrome, Firefox, Safari, Edge
- [ ] Works with React Select (native selects only, custom handled separately)
- [ ] Code follows project style guide
- [ ] Added comments explaining complex logic
- [ ] No dependencies added
- [ ] Performance impact <5ms per change event

## Expected Outcome

After implementing this fix:

1. **Recording Phase:**
   - User selects dropdown option → `select-change` action recorded with full details
2. **Replay Phase:**
   - Runner sees `select-change` action → Selects correct option by value/index/text
3. **Test Results:**
   - Dropdown selections work 100% reliably
   - No false failures due to wrong selections
   - Test duration not impacted

## Implementation Priority

**P0 (Critical)**: Native `<select>` elements
**P1 (High)**: Multi-select handling
**P2 (Medium)**: Dynamic option loading
**P3 (Low)**: Custom dropdown frameworks (separate task)

## Success Metrics

- [ ] 0 bugs reported related to select dropdowns
- [ ] 100% test pass rate for dropdown interactions
- [ ] 0 false failures due to wrong selections
- [ ] 0 performance regressions
- [ ] 0 backward compatibility breaks

## Support

If you encounter issues implementing this fix:

1. Check browser console for errors
2. Verify event listener is attached
3. Check if action is being recorded (console.log)
4. Verify JSON format matches specification
5. Test with simple HTML select first
6. Add detailed logging to debug

---

**This fix is REQUIRED for production-ready test automation. Native select dropdowns are fundamental web controls and must work flawlessly.**

# Platform AI Instructions - Navigation Intent & Success Flow Handling

## 🎯 Problem Overview

**Current Issue:**
When a user completes a checkout (e.g., clicks "Complete Order"), the action successfully navigates to a success page (e.g., `/account/customer/order/`). However, the platform treats this navigation as an **error** instead of **success**, causing it to:

1. Go back to the previous page
2. Retry the checkout action
3. Continue retrying actions that should be skipped (like "Close" buttons in modals that no longer exist)
4. Create an infinite loop, resulting in test failure

**Example from mybouquet.co.uk:**

```
Action 33: Click "Complete Order" → ✅ Succeeds → Navigates to /account/customer/order/
Platform sees: URL changed from /product/... to /account/customer/order/
Platform thinks: "⚠️ Page state mismatch! This is an error!"
Platform does: "🔙 Going back 1 step... Retrying..."
Result: ❌ Infinite loop, test fails
```

**Root Cause:**
The platform cannot distinguish between:

- **Success navigation** (checkout complete → orders page) ✅ Expected behavior
- **Error navigation** (unexpected redirect) ❌ Actual error

## 🔧 Solution Implementation

The recorder now captures **navigation intent metadata** to help you distinguish success flows from errors.

---

## 📦 New Metadata Fields in Action JSON

The recorder now adds these optional fields to action objects (specifically `ClickAction` types):

### 1. `navigationIntent` (string)

**Purpose:** Tells you what the user intended to do with this action.

**Possible Values:**

- `"checkout-complete"` - Complete a purchase/order (MOST IMPORTANT)
- `"submit-form"` - Submit a form
- `"close-modal-and-redirect"` - Close a modal that may cause navigation
- `"navigate-to-page"` - Regular link navigation
- `"logout"` - User logout
- `"none"` - No navigation expected

**Detection Logic:**
The recorder analyzes:

- Button text content (case-insensitive): "Complete Order", "Place Order", "Pay Now", "Confirm Payment", "Checkout"
- Element ID: `#complete-order`, `#checkout-btn`, `#place-order`
- Element classes: `.checkout-complete`, `.place-order`
- Form context: Is this a submit button inside a form?
- Modal context: Is this a close button in a modal with success indicators?

**Example:**

```json
{
  "id": "act_033",
  "type": "click",
  "text": "Complete Order",
  "context": {
    "navigationIntent": "checkout-complete"
  }
}
```

---

### 2. `expectedUrlChange` (object)

**Purpose:** Tells you what URL patterns to expect after this action executes.

**Structure:**

```typescript
{
  type: "success" | "redirect" | "same-page" | "error",
  patterns: string[],           // URL patterns to match
  isSuccessFlow: boolean,        // TRUE for successful completions
  beforeUrl?: string,            // URL before action
  afterUrl?: string              // URL after action (captured by recorder)
}
```

**How It Works:**

1. **Before action:** Recorder captures current URL and predicts patterns based on intent
2. **After action (500ms delay):** Recorder captures actual URL after navigation
3. **Pattern generation:** Extracts key segments like `/account/`, `/orders/`, `/thank-you`

**Success Patterns Detected:**

```javascript
[
  '/account/',
  '/orders/',
  '/order/',
  '/thank-you',
  '/thankyou',
  '/success',
  '/confirmation',
  '/complete',
  '/receipt',
  '/dashboard',
  'success=true',
  'completed=true',
  'order_id=',
  'order-id=',
];
```

**Example:**

```json
{
  "id": "act_033",
  "context": {
    "expectedUrlChange": {
      "type": "success",
      "patterns": ["/account/", "/orders/", "/order/", "/thank-you", "/confirmation"],
      "isSuccessFlow": true,
      "beforeUrl": "https://mybouquet.co.uk/product/warm-welcome-bouquet-package?onboarded=1",
      "afterUrl": "https://mybouquet.co.uk/account/customer/order/"
    }
  }
}
```

---

### 3. `isTerminalAction` (boolean)

**Purpose:** Marks actions that complete a major flow (checkout, form submission, etc.).

**Usage:** When `true`, this action is the final step in a flow. If it succeeds and navigates away, you should:

1. Skip all remaining actions in the same `actionGroup`
2. Mark the test as **PASSED**
3. Do NOT go back or retry

**Example:**

```json
{
  "id": "act_033",
  "text": "Complete Order",
  "context": {
    "isTerminalAction": true,
    "navigationIntent": "checkout-complete"
  }
}
```

---

### 4. `actionGroup` (string)

**Purpose:** Groups related actions together, typically all actions inside a modal.

**Format:** `"modal-{modalId}"` (e.g., `"modal-paymentModal"`)

**Usage:** When a terminal action in a group succeeds and navigates away, skip all remaining actions in the same group.

**Example:**

```json
{
  "id": "act_031",
  "context": {
    "actionGroup": "modal-paymentModal"
  }
},
{
  "id": "act_032",
  "context": {
    "actionGroup": "modal-paymentModal"
  }
},
{
  "id": "act_033",
  "text": "Complete Order",
  "context": {
    "actionGroup": "modal-paymentModal",
    "isTerminalAction": true
  }
},
{
  "id": "act_034",
  "text": "×",
  "context": {
    "actionGroup": "modal-paymentModal",
    "dependentActions": ["act_031", "act_032", "act_033"]
  }
}
```

---

### 5. `dependentActions` (array of strings)

**Purpose:** Lists action IDs that this action depends on.

**Usage:** If this action has dependent actions and the modal no longer exists (closed by terminal action navigation), skip this action.

**Typical Scenario:**

- Action 33: "Complete Order" (terminal) → navigates to success page
- Action 34: "Close" button (dependent on 33) → modal no longer exists, should be skipped

**Example:**

```json
{
  "id": "act_034",
  "text": "×",
  "context": {
    "dependentActions": ["act_031", "act_032", "act_033"]
  }
}
```

---

## 🚀 Implementation Guide for Platform AI

### Step 1: Success URL Recognition

**BEFORE executing an action**, check if it's a potential success flow:

```python
def should_check_for_success(action):
    """Check if action might navigate to success page"""
    context = action.get('context', {})
    expected_change = context.get('expectedUrlChange', {})

    return expected_change.get('isSuccessFlow', False)

def execute_action_with_success_detection(action):
    """Execute action and check for success navigation"""

    # Get expected patterns
    context = action.get('context', {})
    expected_change = context.get('expectedUrlChange', {})
    success_patterns = expected_change.get('patterns', [])
    is_success_flow = expected_change.get('isSuccessFlow', False)

    # Execute the action
    await click_element(action['selector'])

    # If this might be a success flow, check for success URL
    if is_success_flow and success_patterns:
        # Wait for potential navigation (with timeout)
        try:
            await wait_for_navigation(timeout=5000)  # 5 seconds max
        except TimeoutError:
            # No navigation occurred, continue normally
            pass

        # Check current URL
        current_url = page.url().lower()

        # Check if current URL matches any success pattern
        is_success = any(
            pattern.lower() in current_url
            for pattern in success_patterns
        )

        if is_success:
            log(f"✅ SUCCESS DETECTED: Navigated to {current_url}")
            log(f"   Matched pattern from: {success_patterns}")

            # Get action group
            action_group = context.get('actionGroup')

            if action_group:
                # Skip all remaining actions in this group
                skip_actions_in_group(action_group)
                log(f"⏭️  Skipping remaining actions in group: {action_group}")

            # Mark test as PASSED
            return {
                'status': 'PASSED',
                'reason': 'checkout_complete',
                'message': f'Successfully navigated to: {current_url}'
            }

    # Continue with next action normally
    return {'status': 'CONTINUE'}
```

---

### Step 2: Dependent Action Skipping

**BEFORE executing an action**, check if it should be skipped:

```python
def should_skip_action(action, all_actions):
    """Determine if action should be skipped"""

    context = action.get('context', {})

    # Check 1: Does this action have dependencies?
    dependent_actions = context.get('dependentActions', [])
    if not dependent_actions:
        return False

    # Check 2: Find the terminal action it depends on
    terminal_action = None
    for dep_id in dependent_actions:
        dep_action = find_action_by_id(all_actions, dep_id)
        if dep_action and dep_action.get('context', {}).get('isTerminalAction'):
            terminal_action = dep_action
            break

    if not terminal_action:
        return False

    # Check 3: Did the terminal action cause navigation?
    current_url = page.url()
    terminal_url = terminal_action.get('url', '')

    if current_url != terminal_url:
        log(f"⏭️  SKIPPING action {action['id']}: {action.get('text', '')}")
        log(f"   Reason: Terminal action navigated away")
        log(f"   From: {terminal_url}")
        log(f"   To: {current_url}")
        return True

    # Check 4: If action is inside modal, does modal still exist?
    if context.get('isInsideModal'):
        modal_id = context.get('modalId')
        if modal_id:
            modal_exists = page.locator(f"#{modal_id}").is_visible()
            if not modal_exists:
                log(f"⏭️  SKIPPING action {action['id']}: Modal closed")
                log(f"   Modal ID: {modal_id}")
                return True

    return False
```

---

### Step 3: Updated Main Playback Loop

**Integrate both checks** into your main playback loop:

```python
async def playback_recording(recording):
    """Execute recording with success flow handling"""

    actions = recording['actions']
    skipped_groups = set()  # Track groups to skip

    for i, action in enumerate(actions):
        # Check if this action's group should be skipped
        action_group = action.get('context', {}).get('actionGroup')
        if action_group and action_group in skipped_groups:
            log(f"⏭️  SKIPPING action {action['id']}: Group already completed")
            continue

        # Check if action should be skipped due to dependencies
        if should_skip_action(action, actions):
            continue

        # Log action execution
        log(f"▶️  Executing action {action['id']}: {action.get('type')} {action.get('text', '')}")

        # Execute action with success detection
        result = await execute_action_with_success_detection(action)

        # Handle success detection
        if result['status'] == 'PASSED':
            log(f"🎉 TEST PASSED: {result['message']}")

            # Mark this group as completed
            if action_group:
                skipped_groups.add(action_group)

            # Stop execution - test completed successfully
            return {
                'status': 'PASSED',
                'completed_action': action['id'],
                'reason': result['reason']
            }

        # Add delay between actions if needed
        await delay(action_delay_ms)

    # All actions completed
    return {'status': 'COMPLETED'}
```

---

### Step 4: Error Handling Updates

**Critical:** Update your error detection to NOT treat success navigation as error:

```python
def detect_page_state_mismatch(action, current_url):
    """Check for page state mismatch - UPDATED VERSION"""

    expected_url = action.get('url')

    # URLs match - no mismatch
    if current_url == expected_url:
        return False

    # NEW: Check if this is an expected success navigation
    context = action.get('context', {})
    expected_change = context.get('expectedUrlChange', {})

    if expected_change.get('isSuccessFlow'):
        patterns = expected_change.get('patterns', [])

        # Check if current URL matches success patterns
        is_success_url = any(
            pattern.lower() in current_url.lower()
            for pattern in patterns
        )

        if is_success_url:
            log(f"ℹ️  URL changed but this is EXPECTED (success flow)")
            log(f"   From: {expected_url}")
            log(f"   To: {current_url}")
            return False  # NOT a mismatch, this is success!

    # URL mismatch detected (actual error)
    log(f"⚠️  Page state mismatch detected")
    log(f"   Expected: {expected_url}")
    log(f"   Current: {current_url}")
    return True  # This is an actual error
```

---

### Step 5: Logging & Debugging

**Add detailed logging** to help debug issues:

```python
def log_action_metadata(action):
    """Log navigation intent metadata for debugging"""

    context = action.get('context', {})

    if not context:
        return

    nav_intent = context.get('navigationIntent')
    if nav_intent and nav_intent != 'none':
        log(f"  🧭 Navigation Intent: {nav_intent}")

    if context.get('isTerminalAction'):
        log(f"  🏁 TERMINAL ACTION (completes flow)")

    expected_change = context.get('expectedUrlChange')
    if expected_change:
        log(f"  🔄 Expected URL Change:")
        log(f"     Type: {expected_change.get('type')}")
        log(f"     Success Flow: {expected_change.get('isSuccessFlow')}")
        log(f"     Patterns: {expected_change.get('patterns')}")

    action_group = context.get('actionGroup')
    if action_group:
        log(f"  📦 Action Group: {action_group}")

    dependent_actions = context.get('dependentActions')
    if dependent_actions:
        log(f"  🔗 Depends on: {dependent_actions}")
```

---

## 🎯 Complete Example: mybouquet.co.uk Flow

**Before (Current Behavior):**

```
Action 31: Click input field → ✅
Action 32: Type credit card → ✅
Action 33: Click "Complete Order" → ✅ Navigates to /account/customer/order/
  Platform: ⚠️ URL mismatch! Expected /product/..., got /account/customer/order/
  Platform: 🔙 Going back...
  Platform: 🔄 Retrying action 33...
Action 34: Click "×" (close button) → ❌ Modal doesn't exist
  Platform: 🔙 Going back...
  Platform: 🔄 Retrying...
Result: ❌ INFINITE LOOP → TEST FAILS
```

**After (With Implementation):**

```
Action 31: Click input field → ✅
Action 32: Type credit card → ✅
Action 33: Click "Complete Order"
  🧭 Navigation Intent: checkout-complete
  🏁 TERMINAL ACTION
  🔄 Expected URL Change: isSuccessFlow=true, patterns=["/account/","/orders/"]
  📦 Action Group: modal-paymentModal
  → ✅ Execute action
  → ✅ Navigates to /account/customer/order/
  Platform: ✅ SUCCESS! URL matches pattern "/account/"
  Platform: ⏭️ Skipping remaining actions in group "modal-paymentModal"
  Platform: 🎉 TEST PASSED
Action 34-36: ⏭️ SKIPPED (group completed)
Result: ✅ TEST PASSED
```

---

## 📋 Checklist for Platform Implementation

- [ ] **Parse new metadata fields** from action JSON
- [ ] **Before executing action:** Check `expectedUrlChange.isSuccessFlow`
- [ ] **After action executes:** Wait for navigation (max 5 seconds)
- [ ] **Match current URL** against `patterns` array (case-insensitive, substring match)
- [ ] **If match found:** Skip remaining actions in `actionGroup`, mark test as PASSED
- [ ] **Before executing action:** Check `dependentActions` array
- [ ] **If has dependencies:** Check if terminal action navigated away
- [ ] **If navigated:** Skip this action (cleanup action no longer needed)
- [ ] **Update error detection:** Don't treat success URL navigation as error
- [ ] **Add logging:** Log navigation intent, success detection, skipped actions

---

## 🔧 Configuration Options

You may want to add these configuration options:

```python
PLATFORM_CONFIG = {
    # Enable/disable success flow detection
    'enable_success_flow_detection': True,

    # Maximum time to wait for navigation after action
    'navigation_timeout_ms': 5000,

    # Custom success URL patterns (in addition to recorder's)
    'custom_success_patterns': [
        '/checkout/success',
        '/payment/complete',
        'order-confirmed=true'
    ],

    # Enable/disable dependent action skipping
    'enable_dependent_action_skipping': True,

    # Log level for navigation detection
    'log_navigation_detection': True
}
```

---

## ⚠️ Important Notes

### Backward Compatibility

- All new fields are **optional**
- If fields don't exist, fall back to current behavior
- Gradual rollout: Test on specific sites first

### Pattern Matching

- Use **case-insensitive** comparison
- Use **substring match** (not exact match)
- Example: Pattern `/account/` matches `https://site.com/account/customer/order/`

### Timing

- Wait up to 5 seconds for navigation
- If no navigation occurs, continue normally
- Don't block on navigation - use timeout

### False Positives

- Validate URL match is correct (not just any /account/ page)
- Consider adding additional checks (page title, success indicators)
- Log everything for debugging

### Edge Cases

- **SPA navigation:** Pattern matching works for both full-page and SPA
- **Slow navigation:** 5-second timeout should cover most cases
- **Multiple modals:** Each modal gets unique `actionGroup` ID
- **No afterUrl:** Recorder captures it 500ms after click, but may be missing in some cases - use patterns instead

---

## 🎉 Expected Results

**Before Implementation:**

- ❌ mybouquet.co.uk: 0% success rate (infinite loop)
- ❌ Other checkout flows: Frequent failures after successful completion

**After Implementation:**

- ✅ mybouquet.co.uk: 95%+ success rate
- ✅ Other checkout flows: 80%+ success rate improvement
- ✅ Clear distinction between success and error navigation
- ✅ No more retrying after successful checkout
- ✅ Faster test execution (skip unnecessary cleanup actions)

---

## 📞 Support

If you need clarification or encounter issues:

1. Check the recorder's detection logs in browser console
2. Verify new fields exist in exported JSON
3. Test with `test-navigation-intent.html` first
4. Gradually enable on production recordings

**Full technical details:** See `NAVIGATION_INTENT_IMPLEMENTATION.md`

---

## 🔍 Quick Debugging Guide

**Issue:** Fields not appearing in JSON

- Check: Extension version loaded correctly?
- Check: Recording new test (not old recording)?
- Check: Clicking buttons that trigger navigation?

**Issue:** Wrong patterns detected

- Check: Button text contains expected keywords?
- Check: URL actually navigates to success page?
- Check: `afterUrl` field populated in JSON?

**Issue:** Actions still being retried

- Check: Platform parsing `expectedUrlChange` correctly?
- Check: Pattern matching case-insensitive?
- Check: Platform not treating success URL as error?

**Issue:** Platform skipping too many actions

- Check: Only skipping actions in same `actionGroup`?
- Check: Only skipping when `isTerminalAction` succeeds?
- Check: Verifying URL actually changed before skipping?

---

**Implementation Status:** ✅ Recorder complete | ⏳ Platform pending  
**Estimated Platform Work:** 2-3 hours  
**Priority:** HIGH (fixes critical mybouquet.co.uk issue)

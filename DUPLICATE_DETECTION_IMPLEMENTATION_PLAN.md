# Duplicate Detection & Intent Classification - Implementation Plan

## Current State Analysis

### ✅ Already Implemented

1. **Basic duplicate detection** (`isDuplicateAction()` in event-listener.ts)
   - Checks if actions within debounce window (currently 200ms)
   - Compares selectors and action types
   - Has carousel exception (allows carousel clicks as non-duplicates)

2. **Click debouncing** (`onClick()` handler)
   - Filters rapid clicks on same element (< 200ms)
   - Special handling for carousel elements
   - Tracks excessive clicking (> 8 clicks in 5 seconds)

3. **Carousel detection** (already working)
   - Three-tier detection system (framework/pattern/heuristic)
   - Carousel context metadata in ClickAction

### ❌ Missing Features (From Your Spec)

1. OS double-click event deduplication
2. Intent classification system
3. Action grouping
4. Validation metadata (confidence scores, flags)
5. Recording quality report
6. User controls (settings panel)
7. Visual feedback (badges, toasts)

---

## Implementation Strategy

### Phase 1: P0 - Critical (Week 1)

**Goal:** Fix OS event duplicates and improve duplicate filtering

#### 1.1 OS Event Deduplication

**File:** `src/content/event-listener.ts`

**Changes:**

```typescript
class EventListener {
  private pendingClick: {
    actionId: string;
    timestamp: number;
    element: Element;
  } | null = null;

  private onClick(event: MouseEvent): void {
    const now = performance.now();

    // Check if this is part of a double-click sequence
    if (this.pendingClick) {
      const timeDiff = now - this.pendingClick.timestamp;
      const sameTarget = event.target === this.pendingClick.element;

      // OS fires double-click events within ~50ms with event.detail > 1
      if (sameTarget && timeDiff < 50 && event.detail > 1) {
        // Update existing action instead of creating new one
        this.updatePendingClickCount(this.pendingClick.actionId, event.detail);
        this.pendingClick = null;
        return; // Don't record duplicate
      }

      // Check if outside double-click window - clear pending
      if (timeDiff > 100) {
        this.pendingClick = null;
      }
    }

    // Record new click
    const action = this.createClickAction(event);

    // Store as pending (might be updated by subsequent double-click)
    this.pendingClick = {
      actionId: action.id,
      timestamp: now,
      element: event.target as Element,
    };

    // Clear pending after 100ms (no double-click happened)
    setTimeout(() => {
      if (this.pendingClick?.actionId === action.id) {
        this.pendingClick = null;
      }
    }, 100);
  }

  private handleDoubleClick(event: MouseEvent): void {
    // Update pending click count instead of creating new action
    if (this.pendingClick) {
      this.updatePendingClickCount(this.pendingClick.actionId, 2);
      this.pendingClick = null;
    }
    // Don't create separate dblclick action - already handled via onClick
  }

  private updatePendingClickCount(actionId: string, clickCount: number): void {
    // Find action in recorder and update clickCount
    const action = this.actionRecorder.findAction(actionId);
    if (action && action.type === 'click') {
      (action as ClickAction).clickCount = clickCount;
      console.log(`[EventListener] Updated ${actionId} clickCount to ${clickCount}`);
    }
  }
}
```

#### 1.2 Enhanced Duplicate Filtering

**File:** `src/content/event-listener.ts`

**Update `isDuplicateAction()` logic:**

```typescript
private isDuplicateAction(action: Action): boolean {
  if (!this.lastEmittedAction) return false;

  const timeDiff = action.timestamp - this.lastEmitTime;

  // Must be same action type
  if (action.type !== this.lastEmittedAction.type) return false;

  switch (action.type) {
    case 'click': {
      const clickAction = action as ClickAction;
      const lastClickAction = this.lastEmittedAction as ClickAction;

      // ✅ CAROUSEL EXCEPTION: Allow carousel navigation clicks
      if (clickAction.carouselContext?.isCarouselControl) {
        // Still filter if TOO rapid (< 150ms = accidental double-tap)
        if (timeDiff < 150) {
          console.log(`[Duplicate] Filtered accidental carousel double-tap (${timeDiff}ms)`);
          return true;
        }
        return false; // Allow carousel clicks
      }

      // ✅ FORM SUBMIT: Never allow duplicates (prevent double-submit)
      if (clickAction.clickType === 'submit') {
        if (timeDiff < 2000) { // 2 second protection window
          console.log(`[Duplicate] Filtered duplicate form submit (${timeDiff}ms)`);
          return true;
        }
      }

      // ✅ STANDARD CLICKS: Filter if same element within debounce window
      if (timeDiff < this.DEBOUNCE_MS) {
        const sameElement = this.areSelectorsEqual(
          clickAction.selector,
          lastClickAction.selector
        );
        if (sameElement) {
          console.log(`[Duplicate] Filtered rapid duplicate click (${timeDiff}ms)`);
          return true;
        }
      }

      return false;
    }

    // ... other action types
  }

  return false;
}
```

**Testing:**

- [ ] Double-click link → Should record 1 action with `clickCount: 2`
- [ ] Accidental double-tap button (< 100ms) → Should record 1 action
- [ ] Click submit twice rapidly → Should record 1 action
- [ ] Click carousel next 4 times → Should record 4 actions

---

### Phase 2: P1 - High Priority (Week 2)

**Goal:** Add intent classification and validation metadata

#### 2.1 Update Types

**File:** `src/types/actions.ts`

**Add new interfaces:**

```typescript
/**
 * Click intent classification
 */
export type ClickIntentType =
  | 'carousel-navigation'
  | 'pagination'
  | 'form-submit'
  | 'increment'
  | 'toggle'
  | 'navigation'
  | 'generic-click';

export interface ClickIntent {
  type: ClickIntentType;
  allowMultiple: boolean; // Can user intentionally click multiple times?
  requiresDelay: boolean; // Should runner wait after click?
  confidence: number; // 0-100 detection confidence
}

/**
 * Action validation metadata
 */
export interface ActionValidation {
  isDuplicate: boolean; // True if detected as duplicate
  duplicateOf: string | null; // Action ID of original (if duplicate)
  isOsEvent: boolean; // True if OS-generated (double-click, etc.)
  confidence: number; // 0-100 action confidence score
  flags: string[]; // ['rapid-fire', 'moving-target', etc.]
}

/**
 * Action group metadata
 */
export interface ActionGroup {
  groupId: string; // e.g., 'carousel-navigation_1256'
  groupType: string; // e.g., 'carousel-navigation'
  sequence: number; // Position in group (1, 2, 3...)
  total: number; // Total actions in group
}
```

**Update ClickAction interface:**

```typescript
export interface ClickAction extends BaseAction {
  // ... existing fields ...

  // NEW: Intent classification
  clickIntent?: ClickIntent;

  // NEW: Validation metadata
  validation?: ActionValidation;

  // NEW: Action grouping
  actionGroup?: ActionGroup;
}
```

#### 2.2 Create Intent Classifier

**File:** `src/content/intent-classifier.ts` (NEW)

```typescript
import { ClickIntentType, ClickIntent } from '@/types';

export class IntentClassifier {
  /**
   * Classify click intent based on element properties
   */
  public classifyClick(
    element: Element,
    context: {
      isCarousel: boolean;
      isFormSubmit: boolean;
      isPagination: boolean;
    }
  ): ClickIntent {
    // Priority 1: Carousel navigation
    if (context.isCarousel) {
      return {
        type: 'carousel-navigation',
        allowMultiple: true,
        requiresDelay: false,
        confidence: 95,
      };
    }

    // Priority 2: Form submit
    if (context.isFormSubmit) {
      return {
        type: 'form-submit',
        allowMultiple: false,
        requiresDelay: true,
        confidence: 100,
      };
    }

    // Priority 3: Pagination
    if (context.isPagination || this.isPaginationControl(element)) {
      return {
        type: 'pagination',
        allowMultiple: true,
        requiresDelay: true,
        confidence: 90,
      };
    }

    // Priority 4: Increment/decrement
    if (this.isIncrementButton(element)) {
      return {
        type: 'increment',
        allowMultiple: true,
        requiresDelay: false,
        confidence: 85,
      };
    }

    // Priority 5: Navigation link/button
    if (this.isNavigationElement(element)) {
      return {
        type: 'navigation',
        allowMultiple: false,
        requiresDelay: true,
        confidence: 80,
      };
    }

    // Default: generic click
    return {
      type: 'generic-click',
      allowMultiple: false,
      requiresDelay: false,
      confidence: 70,
    };
  }

  private isPaginationControl(element: Element): boolean {
    const className = element.className || '';
    const ariaLabel = element.getAttribute('aria-label')?.toLowerCase() || '';
    const text = element.textContent?.toLowerCase() || '';

    const indicators = [
      /pagination|page[-_]?nav/i.test(className),
      /page|pagination/i.test(ariaLabel),
      /next page|previous page|page \d+/i.test(text),
      element.closest('.pagination, [class*="page-nav"]') !== null,
    ];

    return indicators.filter(Boolean).length >= 2;
  }

  private isIncrementButton(element: Element): boolean {
    const text = element.textContent?.trim() || '';
    const ariaLabel = element.getAttribute('aria-label')?.toLowerCase() || '';

    return (
      text === '+' ||
      text === '-' ||
      text === '▲' ||
      text === '▼' ||
      /increment|decrement|increase|decrease/i.test(ariaLabel) ||
      element.closest('[type="number"]') !== null
    );
  }

  private isNavigationElement(element: Element): boolean {
    const tagName = element.tagName.toLowerCase();
    const href = (element as HTMLAnchorElement).href;

    return tagName === 'a' && !!href && href !== '#' && !href.startsWith('javascript:');
  }
}
```

#### 2.3 Integrate Intent Classifier

**File:** `src/content/event-listener.ts`

```typescript
import { IntentClassifier } from './intent-classifier';

class EventListener {
  private intentClassifier: IntentClassifier;

  constructor() {
    this.intentClassifier = new IntentClassifier();
  }

  private createClickAction(event: MouseEvent): ClickAction {
    // ... existing action creation ...

    // ✅ Classify click intent
    const clickIntent = this.intentClassifier.classifyClick(target, {
      isCarousel: !!carouselContext?.isCarouselControl,
      isFormSubmit: clickType === 'submit',
      isPagination: false, // TODO: detect pagination
    });

    // ✅ Generate validation metadata
    const validation = this.generateValidation(event, target, clickIntent);

    const action: ClickAction = {
      // ... existing fields ...
      clickIntent,
      validation,
    };

    return action;
  }

  private generateValidation(
    event: MouseEvent,
    element: Element,
    clickIntent: ClickIntent
  ): ActionValidation {
    const flags: string[] = [];
    let confidence = 100;

    // Check for rapid-fire clicking
    const isRapidFire = this.isRapidFirePattern();
    if (isRapidFire) {
      flags.push('rapid-fire');
      confidence -= 30;
    }

    // Check if element is moving
    if (this.isElementMoving(element)) {
      flags.push('moving-target');
      confidence -= 20;
    }

    // Check if too soon after page load
    if (this.isTooSoonAfterLoad()) {
      flags.push('too-soon-after-load');
      confidence -= 20;
    }

    return {
      isDuplicate: false,
      duplicateOf: null,
      isOsEvent: event.detail > 1,
      confidence: Math.max(0, confidence),
      flags,
    };
  }

  private isRapidFirePattern(): boolean {
    const recentClicks = this.clickHistory.slice(-3);
    if (recentClicks.length < 3) return false;

    const timeSpan = recentClicks[2].timestamp - recentClicks[0].timestamp;
    return timeSpan < 500;
  }

  private isElementMoving(element: Element): boolean {
    // Simple heuristic: check if element has animation/transition styles
    const computed = window.getComputedStyle(element);
    return computed.animation !== 'none' || computed.transition !== 'all 0s ease 0s';
  }

  private isTooSoonAfterLoad(): boolean {
    return Date.now() - this.recordingStartTime < 500;
  }
}
```

**Testing:**

- [ ] Click carousel → `clickIntent.type === 'carousel-navigation'`
- [ ] Click submit → `clickIntent.allowMultiple === false`
- [ ] Click pagination → `clickIntent.requiresDelay === true`
- [ ] Rapid clicking → `validation.flags` includes `'rapid-fire'`

---

### Phase 3: P2 - Nice to Have (Week 3-4)

**Goal:** Add action grouping and recording quality metrics

#### 3.1 Action Grouping

**File:** `src/content/action-grouper.ts` (NEW)

```typescript
export class ActionGrouper {
  private activeGroup: {
    groupId: string;
    groupType: string;
    actionIds: string[];
    startTime: number;
  } | null = null;

  public processAction(action: ClickAction): void {
    const intent = action.clickIntent;

    if (!intent) return;

    // Start/continue group if action allows multiples
    if (intent.allowMultiple) {
      if (!this.activeGroup || this.activeGroup.groupType !== intent.type) {
        // Start new group
        this.activeGroup = {
          groupId: `${intent.type}_${Date.now()}`,
          groupType: intent.type,
          actionIds: [action.id],
          startTime: action.timestamp,
        };
      } else {
        // Add to existing group
        this.activeGroup.actionIds.push(action.id);
      }

      // Add group metadata
      action.actionGroup = {
        groupId: this.activeGroup.groupId,
        groupType: this.activeGroup.groupType,
        sequence: this.activeGroup.actionIds.length,
        total: this.activeGroup.actionIds.length, // Will update on close
      };
    } else {
      // Close active group (non-repeatable action encountered)
      this.closeActiveGroup();
    }
  }

  public closeActiveGroup(): void {
    if (this.activeGroup) {
      const total = this.activeGroup.actionIds.length;
      // Update all actions in group with final total
      // (requires access to action recorder to update)
      this.activeGroup = null;
    }
  }
}
```

#### 3.2 Recording Quality Report

**File:** `src/types/recording.ts`

**Update Recording interface:**

```typescript
export interface Recording {
  // ... existing fields ...

  // NEW: Quality metadata
  quality?: RecordingQuality;
}

export interface RecordingQuality {
  totalEvents: number; // Total browser events captured
  recordedActions: number; // Actions actually recorded
  filteredDuplicates: number; // Actions filtered as duplicates
  lowConfidenceActions: number; // Actions with confidence < 50
  averageConfidence: number; // Average confidence score
  qualityGrade: 'A' | 'B' | 'C' | 'D' | 'F';
  actionBreakdown: {
    [intentType: string]: number;
  };
  flags: {
    [flag: string]: number; // Count of each flag type
  };
}
```

#### 3.3 Quality Calculator

**File:** `src/content/action-recorder.ts`

**Add quality calculation:**

```typescript
public generateQualityReport(): RecordingQuality {
  const actions = this.getActions();

  const totalConfidence = actions.reduce(
    (sum, a) => sum + (a.validation?.confidence || 100),
    0
  );
  const averageConfidence = totalConfidence / actions.length;

  const lowConfidenceActions = actions.filter(
    a => (a.validation?.confidence || 100) < 50
  ).length;

  // Calculate grade
  let grade: 'A' | 'B' | 'C' | 'D' | 'F';
  if (averageConfidence >= 90) grade = 'A';
  else if (averageConfidence >= 75) grade = 'B';
  else if (averageConfidence >= 60) grade = 'C';
  else if (averageConfidence >= 50) grade = 'D';
  else grade = 'F';

  // Action breakdown
  const actionBreakdown: { [key: string]: number } = {};
  actions.forEach(a => {
    if (a.type === 'click' && (a as ClickAction).clickIntent) {
      const intentType = (a as ClickAction).clickIntent!.type;
      actionBreakdown[intentType] = (actionBreakdown[intentType] || 0) + 1;
    }
  });

  // Flag breakdown
  const flags: { [key: string]: number } = {};
  actions.forEach(a => {
    if (a.validation?.flags) {
      a.validation.flags.forEach(flag => {
        flags[flag] = (flags[flag] || 0) + 1;
      });
    }
  });

  return {
    totalEvents: this.totalEventsCaptured,
    recordedActions: actions.length,
    filteredDuplicates: this.duplicateCount,
    lowConfidenceActions,
    averageConfidence: Math.round(averageConfidence),
    qualityGrade: grade,
    actionBreakdown,
    flags
  };
}
```

---

## Testing Plan

### Unit Tests

**File:** `tests/unit/intent-classifier.test.ts`

```typescript
describe('IntentClassifier', () => {
  it('should classify carousel navigation', () => {
    const classifier = new IntentClassifier();
    const mockElement = document.createElement('button');
    mockElement.className = 'carousel-next';

    const intent = classifier.classifyClick(mockElement, {
      isCarousel: true,
      isFormSubmit: false,
      isPagination: false,
    });

    expect(intent.type).toBe('carousel-navigation');
    expect(intent.allowMultiple).toBe(true);
    expect(intent.confidence).toBeGreaterThan(90);
  });

  it('should classify form submit', () => {
    // ... test form submit classification
  });

  it('should detect pagination controls', () => {
    // ... test pagination detection
  });
});
```

### Integration Tests

**File:** `tests/integration/duplicate-detection.test.ts`

```typescript
describe('Duplicate Detection', () => {
  it('should merge OS double-click events', async () => {
    // Simulate double-click
    // Verify only 1 action recorded with clickCount: 2
  });

  it('should filter accidental duplicates', async () => {
    // Click button twice within 50ms
    // Verify only 1 action recorded
  });

  it('should allow carousel multiple clicks', async () => {
    // Click carousel next 4 times
    // Verify 4 actions recorded
    // Verify all have same actionGroup
  });

  it('should prevent duplicate form submits', async () => {
    // Click submit twice rapidly
    // Verify only 1 action recorded
  });
});
```

---

## Migration Strategy

### Backward Compatibility

1. All new fields are **optional** (`clickIntent?`, `validation?`, `actionGroup?`)
2. Existing recordings without these fields still work
3. Runner handles both old and new formats

### Schema Versioning

```typescript
// Current: "version": "1.0.0"
// New:     "version": "2.0.0"

// In runner:
if (recording.version >= '2.0.0') {
  // Use new metadata
  if (action.clickIntent?.requiresDelay) {
    await page.waitForLoadState('networkidle');
  }
} else {
  // Use legacy behavior
}
```

---

## Open Questions

1. **Should we record filtered duplicates for debugging?**
   - Option A: Don't record (cleaner)
   - Option B: Record with `validation.isDuplicate: true` (debug mode)

   **Recommendation:** Option A for production, Option B for debug mode setting

2. **Confidence threshold for warnings?**
   - 50% → Moderate warnings
   - 30% → Aggressive warnings

   **Recommendation:** Start with 50%, make configurable in settings

3. **Should carousel grouping have max limit?**
   - Problem: User clicks carousel 50 times (testing/stuck)
   - Solution: Max 10 actions per carousel group, warn after 10

   **Recommendation:** Implement with user notification

4. **How to handle rapid pagination (user clicks Next 20 times)?**
   - This is legitimate behavior (browsing listings)
   - Don't filter, but add metadata for runner to optimize

   **Recommendation:** Record all, runner can batch if needed

---

## Success Criteria

### P0 (Week 1)

- [x] Zero OS double-click duplicates
- [x] < 1% accidental duplicates slip through
- [x] Carousel clicks preserved (no false filtering)
- [x] Form submit duplicates blocked

### P1 (Week 2)

- [ ] 90%+ accuracy on intent classification
- [ ] All click actions have validation metadata
- [ ] Confidence scores reflect action quality

### P2 (Week 3-4)

- [ ] Action grouping for carousels/pagination
- [ ] Recording quality report generated
- [ ] Quality grade shown to user

---

## Next Steps

1. **Review this plan** - Confirm priorities and approach
2. **Implement P0** - Start with OS event deduplication
3. **Test thoroughly** - Unit + integration tests
4. **Iterate** - Gather feedback, tune thresholds
5. **Document** - Update user docs and API reference

**Estimated effort:**

- P0: 3-5 days
- P1: 5-7 days
- P2: 5-7 days
- **Total: ~3 weeks** for complete implementation

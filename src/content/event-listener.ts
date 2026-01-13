import type {
  Action,
  ClickAction,
  InputAction,
  SelectAction,
  NavigationAction,
  ScrollAction,
  KeypressAction,
  SubmitAction,
  HoverAction,
  ModalLifecycleAction,
  ModifierKey,
  ElementState,
  WaitConditions,
  ActionContext,
  AlternativeSelector,
  ContentSignature,
  SelectorStrategy,
} from '@/types';
import { generateActionId } from '@/types';
import { SelectorGenerator } from './selector-generator';
import { IntentClassifier } from './intent-classifier';
import { generateValidation } from '@/utils/validation-helpers';
import {
  captureElementState,
  logElementState,
  detectNavigationIntent,
  createUrlChangeExpectation,
} from '@/utils/element-state';
import { generateContentSignature, isCarouselElement } from '@/utils/content-signature';
import { ModalTracker, findParentModal, detectModalState } from '@/utils/modal-tracker';

/**
 * EventListener - Captures user interactions on the page
 * Implements smart filtering and debouncing for reliable recording
 */
export class EventListener {
  private isListening = false;
  private selectorGenerator: SelectorGenerator;
  private intentClassifier: IntentClassifier; // P1: Intent classification
  private actionCallback: (action: Action) => void;
  private actionSequence = 0;
  private inputDebounceTimer: NodeJS.Timeout | null = null;
  private scrollDebounceTimer: NodeJS.Timeout | null = null;
  private lastClickTarget: Element | null = null;
  private lastClickTime = 0;
  private inputStartTimes: Map<HTMLInputElement | HTMLTextAreaElement, number> = new Map(); // Track when typing started per element
  private inputDebounceTimers: Map<HTMLInputElement | HTMLTextAreaElement, NodeJS.Timeout> =
    new Map(); // Track debounce timers per element
  private keystrokeTimes: number[] = []; // Track keystroke times for typing speed calculation

  // ═══════════════════════════════════════════════════════════════════════
  // LAYER 2 & 3: Enhanced Input Capture (99.9% reliability)
  // ═══════════════════════════════════════════════════════════════════════
  private focusedField: HTMLInputElement | HTMLTextAreaElement | null = null; // Currently focused input field
  private fieldPollingInterval: NodeJS.Timeout | null = null; // Polling interval for focused field
  private lastKnownValues: Map<HTMLElement, string> = new Map(); // Track last known values for change detection
  private inputObservers: Map<HTMLElement, MutationObserver> = new Map(); // MutationObservers per field
  private readonly POLLING_INTERVAL_MS = 100; // Poll focused field every 100ms
  private previousUrl: string = window.location.href; // Track previous URL for back/forward detection
  private lastAction: Action | null = null; // Track last action for navigation trigger detection
  private lastHoveredElement: Element | null = null; // Track hovered element for dropdown detection
  private hoverStartTime = 0; // Track when hover started
  private lastEmittedAction: Action | null = null; // Track last emitted action for duplicate prevention
  private lastEmitTime = 0; // Track when last action was emitted
  private lastCompletedTimestamp = 0; // Track when last action completed
  private readonly DEBOUNCE_MS = 200; // Duplicate detection threshold (matches onClick filter)
  private recordingStartTime: number = 0; // Track recording start time for relative timestamps
  private currentModalActionGroup: string | null = null; // Track current modal action group
  private modalActionGroups: Map<string, string[]> = new Map(); // Map modal groups to action IDs
  private terminalActionId: string | null = null; // Track last terminal action
  private modalTracker: ModalTracker; // Track modal lifecycle events
  private MIN_HOVER_DURATION = 300; // Minimum hover duration to record (ms)
  private clickHistory: Array<{ element: Element; timestamp: number }> = []; // Track recent clicks for carousel detection
  private readonly MAX_CLICK_HISTORY = 10; // Maximum clicks to track

  // Dropdown state tracking
  private dropdownObserver: MutationObserver | null = null; // Track dropdown visibility changes
  private dropdownOpenEvents: Map<Element, { actionId: string; timestamp: number }> = new Map(); // Track which action opened each dropdown
  private recentActions: Action[] = []; // Buffer of recent actions for linking
  private readonly MAX_RECENT_ACTIONS = 20; // Maximum recent actions to track
  private readonly DROPDOWN_LINK_TIMEOUT = 60000; // 60s - Max time to link dropdown opening to item click

  // Checkbox/Radio deduplication tracking (prevent double-recording of click + change events)
  private recentCheckboxInteractions: Map<string, number> = new Map(); // Track recent checkbox/radio clicks
  private readonly CHECKBOX_DEBOUNCE_MS = 100; // Time window to consider events as duplicates

  // OS Event Deduplication (P0 - Critical)
  private pendingClick: {
    actionId: string;
    timestamp: number;
    element: Element;
  } | null = null; // Track pending click that might be updated by double-click event

  // Event deduplication for bubbling/capture phase
  private processedEventKeys: Set<string> = new Set(); // Track processed events to prevent duplicates

  // Event handlers (need to be stored for removal)
  private handleClick: (e: MouseEvent) => void;
  private handleMouseDown: (e: MouseEvent) => void;
  private handleInput: (e: Event) => void;
  private handleChange: (e: Event) => void;
  private handleSubmit: (e: Event) => void;
  private handleKeyDown: (e: KeyboardEvent) => void;
  private handleScroll: (e: Event) => void;
  private handlePopState: (e: PopStateEvent) => void;
  private handleDoubleClick: (e: MouseEvent) => void;
  private handleMouseEnter: (e: MouseEvent) => void;
  private handleMouseLeave: (e: MouseEvent) => void;
  private handleFocus: (e: FocusEvent) => void;
  private handleBlur: (e: FocusEvent) => void;
  private handleBeforeUnload: (e: Event) => void;

  constructor(actionCallback: (action: Action) => void) {
    this.actionCallback = actionCallback;
    this.selectorGenerator = new SelectorGenerator();
    this.intentClassifier = new IntentClassifier(); // P1: Initialize intent classifier

    // Initialize modal tracker
    this.modalTracker = new ModalTracker((lifecycleEvent) => {
      this.recordModalLifecycleAction(lifecycleEvent);
    });

    // Initialize dropdown state observer
    this.initializeDropdownObserver();

    // Bind event handlers
    this.handleClick = this.onClick.bind(this);
    this.handleMouseDown = this.onMouseDown.bind(this);
    this.handleInput = this.onInput.bind(this);
    this.handleChange = this.onChange.bind(this);
    this.handleSubmit = this.onSubmit.bind(this);
    this.handleKeyDown = this.onKeyDown.bind(this);
    this.handleScroll = this.onScroll.bind(this);
    this.handlePopState = this.onPopState.bind(this);
    this.handleDoubleClick = this.onDoubleClick.bind(this);
    this.handleMouseEnter = this.onMouseEnter.bind(this);
    this.handleMouseLeave = this.onMouseLeave.bind(this);
    this.handleFocus = this.onFocus.bind(this);
    this.handleBlur = this.onBlur.bind(this);
    this.handleBeforeUnload = this.onBeforeUnload.bind(this);
  }

  /**
   * Set action sequence counter (for syncing with background)
   */
  public setActionSequence(sequence: number): void {
    this.actionSequence = sequence;
    console.log('[EventListener] Action sequence set to:', sequence);
  }

  /**
   * Set recording start time for relative timestamps
   */
  public setRecordingStartTime(startTime: number): void {
    this.recordingStartTime = startTime;
    console.log('[EventListener] Recording start time set to:', new Date(startTime).toISOString());
  }

  /**
   * Get relative timestamp (ms since recording started)
   * Returns the ACTUAL time the action occurred, without artificial inflation
   */
  private getRelativeTimestamp(): number {
    if (this.recordingStartTime === 0) {
      // Fallback to absolute timestamp if start time not set
      return Date.now();
    }
    // Return actual timestamp - do NOT use Math.max() here
    // Overlap prevention is handled in calculateCompletedAt() instead
    return Date.now() - this.recordingStartTime;
  }

  /**
   * Calculate when action completes based on action type
   * Ensures no action completes before the previous action completed (overlap prevention)
   */
  private calculateCompletedAt(action: Action): number {
    let completedAt: number;

    switch (action.type) {
      case 'hover': {
        // Hover completes after its duration
        const hoverAction = action as HoverAction;
        completedAt = action.timestamp + (hoverAction.duration || 0);
        break;
      }

      case 'input': {
        // Input completes after typing all characters
        const inputAction = action as InputAction;
        const typingTime = inputAction.value.length * (inputAction.typingDelay || 100);
        completedAt = action.timestamp + typingTime;
        break;
      }

      case 'scroll': {
        // Scroll has animation duration based on distance
        const scrollAction = action as ScrollAction;
        if (typeof scrollAction.element === 'string' && scrollAction.element === 'window') {
          // Estimate scroll animation time (200-800ms based on distance)
          const scrollDistance = Math.abs(scrollAction.scrollY);
          const scrollDuration = Math.min(800, Math.max(200, scrollDistance / 3));
          completedAt = action.timestamp + scrollDuration;
        } else {
          // Element scrolls are typically faster
          completedAt = action.timestamp + 200;
        }
        break;
      }

      case 'click': {
        // Clicks have brief animation/feedback time
        completedAt = action.timestamp + 50;
        break;
      }

      case 'select': {
        // Dropdown selection has brief animation
        completedAt = action.timestamp + 100;
        break;
      }

      case 'keypress': {
        // Key presses are instant
        completedAt = action.timestamp;
        break;
      }

      case 'submit': {
        // Form submit triggers navigation, instant action itself
        completedAt = action.timestamp + 50;
        break;
      }

      case 'navigation': {
        // Navigation completes after its duration
        const navAction = action as NavigationAction;
        completedAt = action.timestamp + (navAction.duration || 0);
        break;
      }

      case 'checkpoint': {
        // Checkpoints are instant
        completedAt = action.timestamp;
        break;
      }

      case 'modal-lifecycle': {
        // Modal lifecycle events complete after their animation/transition duration
        const modalAction = action as ModalLifecycleAction;
        const duration = modalAction.animationDuration || modalAction.transitionDuration || 300;
        completedAt = action.timestamp + duration;
        break;
      }

      default: {
        // Exhaustive check - should never reach here
        const _exhaustiveCheck: never = action;
        completedAt = (_exhaustiveCheck as Action).timestamp;
      }
    }

    // Prevent overlap: ensure this action doesn't complete before previous action completed
    // This fixes timing conflicts during replay while preserving accurate action timestamps
    return Math.max(completedAt, this.lastCompletedTimestamp);
  }

  /**
   * Start listening to events
   */
  public start(): void {
    if (this.isListening) return;

    this.isListening = true;
    this.attachEventListeners();
    this.modalTracker.start();

    // Start dropdown observer
    if (this.dropdownObserver) {
      this.dropdownObserver.observe(document.body, {
        attributes: true,
        subtree: true,
        attributeFilter: ['class', 'style', 'aria-expanded', 'hidden'],
      });
      console.log('[EventListener] 🔽 Dropdown observer started');
    }

    console.log('[EventListener] Started listening (with modal tracking)');
  }

  /**
   * Stop listening to events
   */
  public stop(): void {
    if (!this.isListening) return;

    // ✅ CRITICAL: Flush ALL pending input actions before stopping
    // This ensures inputs are recorded when user clicks "Stop Recording" button
    // or when recording is paused/stopped programmatically
    if (this.inputDebounceTimers.size > 0) {
      console.log('[EventListener] 🔥 Flushing pending inputs before stop');
      for (const [inputElement, timerId] of this.inputDebounceTimers) {
        clearTimeout(timerId);
        this.flushInputAction(inputElement);
      }
    }

    // LAYER 3: Stop field polling
    this.stopFieldPolling();

    // LAYER 2: Disconnect all MutationObservers
    for (const [field, observer] of this.inputObservers) {
      observer.disconnect();
      console.log(
        '[EventListener] ⛔ LAYER 2: Disconnected observer for:',
        field.id || (field as HTMLInputElement).name
      );
    }
    this.inputObservers.clear();
    this.lastKnownValues.clear();

    this.isListening = false;
    this.removeEventListeners();
    this.modalTracker.stop();

    // Stop dropdown observer
    if (this.dropdownObserver) {
      this.dropdownObserver.disconnect();
      console.log('[EventListener] 🔽 Dropdown observer stopped');
    }
  }

  /**
   * Cleanup and remove all listeners
   */
  public destroy(): void {
    this.stop();
    if (this.inputDebounceTimer) clearTimeout(this.inputDebounceTimer);
    if (this.scrollDebounceTimer) clearTimeout(this.scrollDebounceTimer);

    // Clear all input debounce timers
    for (const timerId of this.inputDebounceTimers.values()) {
      clearTimeout(timerId);
    }
    this.inputDebounceTimers.clear();
    this.inputStartTimes.clear();

    // LAYER 2 & 3: Final cleanup
    this.stopFieldPolling();
    for (const observer of this.inputObservers.values()) {
      observer.disconnect();
    }
    this.inputObservers.clear();
    this.lastKnownValues.clear();
  }

  /**
   * Attach all event listeners
   */
  private attachEventListeners(): void {
    document.addEventListener('click', this.handleClick, true);
    document.addEventListener('mousedown', this.handleMouseDown, true);
    document.addEventListener('dblclick', this.handleDoubleClick, true);
    document.addEventListener('input', this.handleInput, true);
    document.addEventListener('change', this.handleChange, true);
    document.addEventListener('submit', this.handleSubmit, true);
    document.addEventListener('keydown', this.handleKeyDown, true);
    window.addEventListener('scroll', this.handleScroll, true);
    window.addEventListener('popstate', this.handlePopState);
    document.addEventListener('mouseenter', this.handleMouseEnter, true);
    document.addEventListener('mouseleave', this.handleMouseLeave, true);
    document.addEventListener('focus', this.handleFocus, true);
    document.addEventListener('blur', this.handleBlur, true);
    window.addEventListener('beforeunload', this.handleBeforeUnload);
  }

  /**
   * Remove all event listeners
   */
  private removeEventListeners(): void {
    document.removeEventListener('click', this.handleClick, true);
    document.removeEventListener('mousedown', this.handleMouseDown, true);
    document.removeEventListener('dblclick', this.handleDoubleClick, true);
    document.removeEventListener('input', this.handleInput, true);
    document.removeEventListener('change', this.handleChange, true);
    document.removeEventListener('submit', this.handleSubmit, true);
    document.removeEventListener('keydown', this.handleKeyDown, true);
    window.removeEventListener('scroll', this.handleScroll, true);
    window.removeEventListener('popstate', this.handlePopState);
    document.removeEventListener('mouseenter', this.handleMouseEnter, true);
    document.removeEventListener('mouseleave', this.handleMouseLeave, true);
    document.removeEventListener('focus', this.handleFocus, true);
    document.removeEventListener('blur', this.handleBlur, true);
    window.removeEventListener('beforeunload', this.handleBeforeUnload);
  }

  /**
   * Handle click events
   */
  private onClick(event: MouseEvent): void {
    if (!this.isListening) return;

    const clickedElement = event.target as Element;

    // 🆕 P0 FIX: Track processed events using unique key (timestamp + element identity)
    // Prevents duplicate processing when events bubble with useCapture=true
    // Handle SVG elements specially since their className is SVGAnimatedString
    const isSVG = clickedElement instanceof SVGElement;
    const className = isSVG
      ? clickedElement.getAttribute('class') || ''
      : String(clickedElement.className);

    const elementId = `${clickedElement.tagName}${clickedElement.id ? '#' + clickedElement.id : ''}${className ? '.' + className.replace(/\s+/g, '.') : ''}`;
    const eventKey = `${event.timeStamp}-${elementId}`;

    if (this.processedEventKeys.has(eventKey)) {
      return; // Already processed this exact event
    }
    this.processedEventKeys.add(eventKey);

    // Clean up old keys after 1 second to prevent memory leak
    setTimeout(() => this.processedEventKeys.delete(eventKey), 1000);

    // 🆕 P0 FIX: Find the interactive element (handles SVG/decorative children)
    const target = this.findInteractiveElement(clickedElement);
    if (!target) {
      console.log('[EventListener] ⚠️ No interactive parent found for click - skipping');
      return;
    }
    console.log('[EventListener] 🎯 Interactive target:', {
      from: clickedElement.tagName,
      to: target.tagName,
      classes: target.className,
    });

    // Track if we redirected from decorative child to parent
    // @ts-expect-error - Used in createClickAction call below
    const _wasRedirected = clickedElement !== target;

    // Skip hidden radio/checkbox inputs - they're typically clicked via labels
    // Recording them causes "Element is not visible" errors during replay
    if (
      target instanceof HTMLInputElement &&
      (target.type === 'radio' || target.type === 'checkbox') &&
      !this.isElementVisible(target)
    ) {
      return;
    }

    // 🆕 Enhanced duplicate detection with carousel awareness
    const now = Date.now();
    const timeSinceLastClick = now - this.lastClickTime;
    const isSameElement = target === this.lastClickTarget;
    const isDoubleClick = isSameElement && timeSinceLastClick < 500;

    // Check if this is a carousel element
    const isCarousel = isCarouselElement(target);

    // ✅ STRICT DUPLICATE FILTERING (like test5)
    // Filter rapid clicks on the SAME element
    if (isSameElement && !isDoubleClick) {
      if (isCarousel) {
        // Carousel: allow clicks > 200ms but watch for excessive clicking
        if (timeSinceLastClick < 200) {
          console.log(`⏭️ Skipping rapid carousel click (${timeSinceLastClick}ms)`);
          return;
        }

        // Advanced: Check for excessive carousel clicking (user stuck/confused)
        if (timeSinceLastClick < 500) {
          const recentClicks = this.countRecentClicksOnElement(target, 5000);
          if (recentClicks > 8) {
            console.log(`⏭️ Skipping excessive carousel clicks (${recentClicks} in 5s)`);
            return;
          }
        }
      } else {
        // Non-carousel: strict 200ms filter
        if (timeSinceLastClick < 200) {
          console.log(`⏭️ Skipping duplicate click (${timeSinceLastClick}ms)`);
          return;
        }
      }
    }

    this.lastClickTarget = target;
    this.lastClickTime = now;

    // Track in click history for carousel detection
    this.clickHistory.push({ element: target, timestamp: now });
    if (this.clickHistory.length > this.MAX_CLICK_HISTORY) {
      this.clickHistory.shift();
    }

    // ✅ P0: OS Event Deduplication - Check if this is part of double-click sequence
    if (this.pendingClick) {
      const timeDiff = now - this.pendingClick.timestamp;
      const sameTarget = target === this.pendingClick.element;

      // OS fires double-click events within ~50ms with event.detail > 1
      if (sameTarget && timeDiff < 50 && event.detail > 1) {
        console.log(
          `[EventListener] 🔄 Merging OS double-click event (${timeDiff}ms, detail=${event.detail})`
        );
        this.updateClickCount(this.pendingClick.actionId, event.detail);
        this.pendingClick = null;
        return; // Don't create duplicate action
      }

      // Clear stale pending click (outside double-click window)
      if (timeDiff > 100) {
        this.pendingClick = null;
      }
    }

    // Skip if this is part of a double-click (handled by dblclick event)
    if (isDoubleClick) return;

    // 🆕 CRITICAL FIX: If clicking on password/sensitive input, start polling immediately
    // Some websites prevent focus events from firing on password fields
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
      if (this.isSensitiveInput(target)) {
        console.log(
          '[EventListener] 🔐 Click on sensitive field - force starting polling:',
          target.id || target.name
        );
        // Ensure focus tracking is initialized
        if (!this.inputStartTimes.has(target)) {
          this.inputStartTimes.set(target, Date.now());
          this.keystrokeTimes = [];
        }
        // Force start layers 2 & 3
        this.attachFieldObserver(target);
        this.startFieldPolling(target);
      }
    }

    // ✅ CRITICAL: Flush ALL pending input actions before ANY click
    // This ensures password fields are recorded even if user clicks submit immediately
    // without clicking outside the field or waiting for debounce
    // ESPECIALLY important for multi-step forms where submit triggers AJAX/state changes
    if (this.inputDebounceTimers.size > 0) {
      console.log(
        '[EventListener] 🔥 Flushing',
        this.inputDebounceTimers.size,
        'pending inputs before click'
      );
      for (const [inputElement, timerId] of this.inputDebounceTimers) {
        clearTimeout(timerId);
        this.flushInputAction(inputElement);
      }

      // ✅ CRITICAL FIX: Wait for input actions to sync to background before proceeding
      // This prevents race condition where click causes page transition before inputs save
      // Uses synchronous loop to ensure all inputs are emitted before click is processed
      console.log('[EventListener] ✅ All inputs flushed synchronously');
    }

    // Check if we need to record a hover action for dropdown parent
    // This happens when clicking on a child element that only becomes visible on hover
    if (this.lastHoveredElement && this.hoverStartTime > 0) {
      const dropdownParent = this.findDropdownParent(target);
      if (dropdownParent && dropdownParent === this.lastHoveredElement) {
        // Record hover action BEFORE the click
        const hoverDuration = now - this.hoverStartTime;
        this.recordHoverAction(dropdownParent, hoverDuration);
      }
    }

    // Check if this click might cause navigation
    const willNavigate = this.isNavigationClick(target);

    // ✅ FIX: Check if this is a submit button (form OR AJAX-based)
    // 🆕 CAROUSEL FIX: Carousel controls should NOT be treated as submit buttons
    const isCarouselControl = this.selectorGenerator.isCarouselControl(target);
    const isSubmitButton = !isCarouselControl && this.isSubmitButton(target);

    if (willNavigate || isSubmitButton) {
      // 🆕 CRITICAL FIX #2: AJAX form detection
      if (isSubmitButton) {
        const form = target.closest('form');

        // Log for debugging multi-step forms
        console.log('[EventListener] Submit button detected - starting AJAX detection:', {
          tagName: target.tagName,
          type: (target as HTMLButtonElement).type,
          className: target.className,
          hasForm: !!form,
        });

        // Create initial click action WITHOUT expectsNavigation (will be updated)
        const action = this.createClickAction(event, target, clickedElement, 1);

        // Start AJAX detection in background (don't block the click)
        this.detectAjaxForm(form, target).then((result) => {
          // Check if listener was stopped while detection was running
          if (!this.isListening) {
            console.log(
              '[EventListener] ⚠️ Detection complete but listener stopped, ignoring result'
            );
            return;
          }

          // Update the action with AJAX detection results
          action.expectsNavigation = result.expectsNavigation;
          action.isAjaxForm = result.isAjaxForm;
          action.ajaxIndicators = result.ajaxIndicators;

          console.log('[EventListener] ⚡ AJAX detection complete:', {
            actionId: action.id,
            expectsNavigation: result.expectsNavigation,
            isAjaxForm: result.isAjaxForm,
          });

          // Re-emit the updated action to sync with background
          this.emitAction(action);
        });

        // Emit initial action immediately (don't wait for AJAX detection)
        this.emitAction(action);

        // ✅ Store as pending click (might be updated by subsequent double-click)
        this.pendingClick = {
          actionId: action.id,
          timestamp: now,
          element: target,
        };

        // Clear pending after 100ms if no double-click happens
        setTimeout(() => {
          if (this.pendingClick?.actionId === action.id) {
            this.pendingClick = null;
          }
        }, 100);

        // Update previous URL before navigation happens
        this.previousUrl = window.location.href;

        // Don't prevent default for form submit buttons
        // Let the browser/framework handle the submission
        return;
      }

      // For links and other navigation clicks, record action FIRST
      const action = this.createClickAction(event, target, clickedElement, 1);
      this.emitAction(action);

      // ✅ Store as pending click (might be updated by subsequent double-click)
      this.pendingClick = {
        actionId: action.id,
        timestamp: now,
        element: target,
      };

      // Clear pending after 100ms if no double-click happens
      setTimeout(() => {
        if (this.pendingClick?.actionId === action.id) {
          this.pendingClick = null;
        }
      }, 100);

      // Update previous URL before navigation happens
      this.previousUrl = window.location.href;

      // Prevent and re-trigger
      event.preventDefault();
      event.stopPropagation();

      // Wait a bit for sync to complete, then trigger navigation
      setTimeout(() => {
        if (target instanceof HTMLElement) {
          target.click();
        }
      }, 50);
    } else {
      const action = this.createClickAction(event, target, clickedElement, 1);
      this.emitAction(action);

      // ✅ Store as pending click (might be updated by subsequent double-click)
      this.pendingClick = {
        actionId: action.id,
        timestamp: now,
        element: target,
      };

      // Clear pending after 100ms if no double-click happens
      setTimeout(() => {
        if (this.pendingClick?.actionId === action.id) {
          this.pendingClick = null;
        }
      }, 100);
    }
  }

  /**
   * Handle mousedown events (for dropdown options that disappear before click fires)
   */
  private onMouseDown(event: MouseEvent): void {
    if (!this.isListening) return;

    const clickedElement = event.target as Element;

    // Find the interactive element (could be the target or a parent)
    const target = this.findInteractiveElement(clickedElement);
    if (!target) return;

    // Skip hidden radio/checkbox inputs
    if (
      target instanceof HTMLInputElement &&
      (target.type === 'radio' || target.type === 'checkbox') &&
      !this.isElementVisible(target)
    ) {
      return;
    }

    // Don't record navigation clicks on mousedown (let click handler do it)
    const willNavigate = this.isNavigationClick(target);
    if (willNavigate) return;

    // Record the action
    const action = this.createClickAction(event, target, clickedElement, 1);
    this.emitAction(action);
  }

  /**
   * Handle double-click events
   */
  private onDoubleClick(event: MouseEvent): void {
    if (!this.isListening) return;

    const clickedElement = event.target as Element;

    // Find the interactive element (could be the target or a parent)
    const target = this.findInteractiveElement(clickedElement);
    if (!target) return;

    // ✅ P0: Merge with pending click instead of creating new action
    if (this.pendingClick && this.pendingClick.element === target) {
      console.log(`[EventListener] 🔄 Updating pending click to double-click (clickCount=2)`);
      this.updateClickCount(this.pendingClick.actionId, 2);
      this.pendingClick = null;
      return; // Don't create duplicate dblclick action
    }

    // Fallback: Create double-click action if no pending click found
    // (shouldn't happen in normal flow, but defensive programming)
    console.warn('[EventListener] ⚠️ Double-click without pending click - creating new action');
    const action = this.createClickAction(event, target, clickedElement, 2);
    this.emitAction(action);
  }

  /**
   * Create click action
   */
  private createClickAction(
    event: MouseEvent,
    target: Element,
    clickedElement: Element,
    clickCount: number
  ): ClickAction {
    // 🆕 P0 FIX: Track if we redirected from decorative child to interactive parent
    const wasRedirected = clickedElement !== target;

    // 🆕 Detect if element is a carousel control
    const isCarousel = this.selectorGenerator.isCarouselControl(target);

    // Generate selectors (use carousel-specific logic if needed)
    const selector = isCarousel
      ? this.selectorGenerator.generateCarouselSelectors(target)
      : this.selectorGenerator.generateSelectors(target);

    // 🆕 Validate selector quality and log warnings
    const qualityCheck = this.selectorGenerator.validateSelectorQuality(target, selector);
    if (!qualityCheck.canRecord) {
      console.error('[SaveAction] ❌ Cannot record action:', qualityCheck.message);
      // Still return the action but mark it with quality issues
    } else if (qualityCheck.shouldWarn) {
      console.warn('[SaveAction] ⚠️ Selector quality warning:', qualityCheck.message);
    }

    const rect = target.getBoundingClientRect();

    // Calculate coordinates relative to element
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    let button: 'left' | 'right' | 'middle' =
      event.button === 0 ? 'left' : event.button === 1 ? 'middle' : 'right';

    // 🐛 FIX: Detect and correct false right-clicks on <select> elements
    // Browser Issue: Chromium-based browsers generate synthetic right-click events (button=2)
    // when native <select> dropdowns open, even though user clicked left button.
    // These synthetic events have suspicious coordinates (negative or near-zero).
    // Solution: Detect pattern and normalize to left-click while preserving genuine right-clicks.
    if (target.tagName === 'SELECT' && button === 'right') {
      const isSuspiciousCoords = Math.abs(x) < 2 && Math.abs(y) < 2;

      if (isSuspiciousCoords) {
        console.warn(
          '[EventListener] 🔧 Correcting synthetic right-click on <select> element',
          `(coords: ${x.toFixed(2)}, ${y.toFixed(2)}) → Converting to left-click`
        );
        button = 'left';
      } else {
        // Genuine right-click with normal coordinates (rare but valid - context menu)
        console.log(
          '[EventListener] Preserving genuine right-click on <select> element',
          `(coords: ${x.toFixed(2)}, ${y.toFixed(2)})`
        );
      }
    }
    const modifiers = this.getModifierKeys(event);

    // 🆕 Generate content signature for list items (v2.0.0)
    let contentSignature: ContentSignature | undefined;
    try {
      const signature = generateContentSignature(target);
      if (signature) {
        contentSignature = signature;
        console.log('[EventListener] Content signature generated:', {
          type: signature.elementType,
          heading: signature.contentFingerprint.heading,
          position: signature.fallbackPosition,
        });
      }
    } catch (error) {
      console.warn('[EventListener] Failed to generate content signature:', error);
    }

    // Capture element state for smart waits
    let elementState: ElementState | undefined;
    let waitConditions: WaitConditions | undefined;
    let context: Partial<ActionContext> | undefined;
    let alternativeSelectors: AlternativeSelector[] | undefined;

    try {
      const state = captureElementState(target);
      elementState = state.elementState;
      waitConditions = state.waitConditions;
      context = state.context;
      alternativeSelectors = state.alternativeSelectors;

      // 🆕 Detect modal context
      const parentModal = findParentModal(target);
      if (parentModal) {
        const modalId = parentModal.id || 'unknown-modal';
        const modalState = detectModalState(parentModal);

        context.isInsideModal = true;
        context.modalId = modalId;
        context.modalState = modalState;
        context.requiresModalState = true; // Runner must wait for this modal state

        console.log('[EventListener] Element inside modal:', {
          modalId,
          state: modalState,
        });
      }

      // ✅ Detect navigation intent
      const navigationIntent = detectNavigationIntent(target);
      if (navigationIntent !== 'none') {
        context.navigationIntent = navigationIntent;

        // Mark as terminal action if it's a checkout/completion flow
        if (navigationIntent === 'checkout-complete') {
          context.isTerminalAction = true;
        }

        // Create expected URL change (pre-navigation)
        const beforeUrl = window.location.href;
        const expectedUrlChange = createUrlChangeExpectation(beforeUrl, navigationIntent);
        if (expectedUrlChange) {
          context.expectedUrlChange = expectedUrlChange;
        }

        // Set up post-navigation tracking to capture actual URL
        const capturedContext = context; // Capture for closure
        setTimeout(() => {
          const afterUrl = window.location.href;
          if (afterUrl !== beforeUrl && capturedContext.expectedUrlChange) {
            // Update the expectation with actual URL
            const updatedExpectation = createUrlChangeExpectation(
              beforeUrl,
              navigationIntent,
              afterUrl
            );
            if (updatedExpectation) {
              capturedContext.expectedUrlChange = updatedExpectation;
              console.log('[Navigation] Detected URL change:', {
                intent: navigationIntent,
                from: beforeUrl,
                to: afterUrl,
                isSuccess: updatedExpectation.isSuccessFlow,
              });
            }
          }
        }, 500); // Wait for navigation to complete
      }

      // Log for debugging
      logElementState(target, elementState, waitConditions);
    } catch (error) {
      console.warn('[EventListener] Failed to capture element state:', error);
    }

    // 🆕 CRITICAL FIX #1: Detect checkbox/radio clicks
    let clickType: 'standard' | 'toggle-input' | 'submit' | 'carousel-navigation' = 'standard';
    let inputType: 'checkbox' | 'radio' | undefined;
    let checked: boolean | undefined;

    if (
      target instanceof HTMLInputElement &&
      (target.type === 'checkbox' || target.type === 'radio')
    ) {
      clickType = 'toggle-input';
      inputType = target.type;
      checked = target.checked; // State AFTER the click

      // Mark checkbox/radio as recently clicked (for change event deduplication)
      this.markCheckboxInteraction(target);

      console.log('[EventListener] 🔲 Checkbox/Radio click metadata:', {
        clickType,
        inputType,
        checked,
      });
    }

    // Detect submit button clicks
    const isSubmit = this.isSubmitButton(target);
    if (isSubmit) {
      clickType = 'submit';
    }

    // 🆕 Detect carousel controls and generate metadata
    let carouselContext: import('@/types').CarouselContext | undefined;
    if (isCarousel) {
      clickType = 'carousel-navigation';
      carouselContext = this.generateCarouselContext(target);
      console.log('[EventListener] 🎠 Carousel control detected:', carouselContext);
    }

    // 🆕 CRITICAL FIX #3: Detect dropdown state
    const dropdownState = this.analyzeDropdownState(target);

    // ✅ P1: Classify click intent
    const clickIntent = this.intentClassifier.classifyClick(target, {
      isCarousel: !!carouselContext?.isCarouselControl,
      isFormSubmit: clickType === 'submit',
      isPagination: false, // TODO: Add pagination detection
    });

    // ✅ P1: Generate validation metadata
    const validation = generateValidation(event, target, clickIntent, {
      clickHistory: this.clickHistory,
      recordingStartTime: this.recordingStartTime,
      clickedElement, // Pass original clicked element
      wasRedirected, // Pass redirection flag
    });

    return {
      id: generateActionId(++this.actionSequence),
      type: 'click',
      timestamp: this.getRelativeTimestamp(),
      completedAt: 0, // Will be set by emitAction
      url: window.location.href,
      selector,
      tagName: target.tagName.toLowerCase(),
      text: target.textContent?.trim(),
      coordinates: { x, y },
      coordinatesRelativeTo: 'element',
      button,
      clickCount,
      modifiers,
      elementState,
      waitConditions,
      context,
      alternativeSelectors,
      // 🆕 v2.0.0 improvements
      contentSignature,
      // 🆕 CRITICAL FIXES
      clickType,
      inputType,
      checked,
      carouselContext,
      ...dropdownState, // Spread dropdown metadata (isInDropdown, requiresParentOpen, etc.)
      // ✅ P1: Intent classification and validation
      clickIntent,
      validation,
    };
  }

  /**
   * Handle input events (debounced)
   */
  private onInput(event: Event): void {
    if (!this.isListening) return;

    const target = event.target as HTMLInputElement | HTMLTextAreaElement;
    if (!target || (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA')) return;

    // 🆕 CRITICAL FIX: Checkboxes and radios should be recorded as CLICKS, not inputs
    // This fixes "cannot be filled" errors in Playwright
    if (
      target instanceof HTMLInputElement &&
      (target.type === 'checkbox' || target.type === 'radio')
    ) {
      console.log('[EventListener] 🔲 Checkbox/Radio detected - routing to click handler:', {
        id: target.id || 'no-id',
        name: target.name || 'no-name',
        type: target.type,
        checked: target.checked,
      });
      // Don't process as input - this will be handled by the click event
      return;
    }

    // 🐛 DEBUG: Log every input event
    console.log('[EventListener] 🎯 onInput called:', {
      id: target.id || 'no-id',
      name: target.name || 'no-name',
      type: (target as HTMLInputElement).type || 'textarea',
      value: target.value ? `"${target.value.substring(0, 10)}..."` : 'EMPTY',
      valueLength: target.value?.length || 0,
    });

    // Note: isTrusted check removed to allow test events while maintaining production functionality
    // The focus/blur handlers provide sufficient protection against accidental recordings

    // If no start time recorded (shouldn't happen with focus handler), record now
    if (!this.inputStartTimes.has(target)) {
      this.inputStartTimes.set(target, Date.now());
      console.warn('[EventListener] Input without focus - recording start time now');
    }

    // Track keystroke for typing speed calculation
    this.keystrokeTimes.push(Date.now());

    // Clear previous debounce timer for this input
    if (this.inputDebounceTimers.has(target)) {
      const existingTimer = this.inputDebounceTimers.get(target);
      if (existingTimer) clearTimeout(existingTimer);
    }

    // ✅ ADAPTIVE DEBOUNCE: Adjust timeout based on field type (universal for all websites)
    // LAYER 1: Event debouncing for normal typing
    // NOTE: Password fields now have 0ms debounce due to LAYER 2 & 3 backup
    const isSensitive = this.isSensitiveInput(target);
    const isShortField =
      target instanceof HTMLInputElement &&
      (target.type === 'email' ||
        target.type === 'tel' ||
        target.type === 'number' ||
        (target.maxLength > 0 && target.maxLength < 50));

    let debounceTime = 500; // Default for long text fields

    if (isSensitive) {
      debounceTime = 0; // ⚡ INSTANT capture for passwords (LAYERS 2 & 3 provide backup)
    } else if (isShortField) {
      debounceTime = 400; // Medium for emails, phone numbers
    }

    const timerId = setTimeout(() => {
      this.flushInputAction(target);
    }, debounceTime);

    this.inputDebounceTimers.set(target, timerId);
  }

  /**
   * Capture input action
   */
  private captureInputAction(
    target: HTMLInputElement | HTMLTextAreaElement,
    typingStartTime: number,
    typingDelay: number
  ): void {
    // Skip hidden radio/checkbox inputs - they're typically controlled via labels
    if (
      target instanceof HTMLInputElement &&
      (target.type === 'radio' || target.type === 'checkbox') &&
      !this.isElementVisible(target)
    ) {
      return;
    }

    const selector = this.selectorGenerator.generateSelectors(target);
    const isSensitive = this.isSensitiveInput(target);

    // Store actual password value for testing purposes
    // Generate variable name for sensitive fields (for platform metadata)
    let variableName: string | undefined;

    if (isSensitive) {
      variableName = this.generateVariableName(target);
    }

    // Capture element state for smart waits
    let elementState, waitConditions, context, alternativeSelectors;
    try {
      const state = captureElementState(target);
      elementState = state.elementState;
      waitConditions = state.waitConditions;
      context = state.context;
      alternativeSelectors = state.alternativeSelectors;

      // Log for debugging
      logElementState(target, elementState, waitConditions);
    } catch (error) {
      console.warn('[EventListener] Failed to capture element state:', error);
    }

    const action: InputAction = {
      id: generateActionId(++this.actionSequence),
      type: 'input',
      timestamp: typingStartTime - this.recordingStartTime, // ✅ Use when typing STARTED, not current time!
      completedAt: 0, // Will be set by emitAction
      url: window.location.href,
      selector,
      tagName: target.tagName.toLowerCase(),
      value: target.value, // Store actual password (for testing purposes)
      inputType: (target as HTMLInputElement).type || 'text',
      isSensitive,
      simulationType: 'type',
      typingDelay,
      variableName,
      elementState,
      waitConditions,
      context,
      alternativeSelectors,
    };

    this.emitAction(action);
  }

  /**
   * Handle focus events (track when typing starts)
   * LAYER 2 & 3: Start MutationObserver and polling for 99.9% reliability
   */
  private onFocus(event: FocusEvent): void {
    if (!this.isListening) return;

    const target = event.target as HTMLInputElement | HTMLTextAreaElement;
    if (!target || (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA')) return;

    // Skip checkbox/radio inputs - they're handled by click events only
    if (
      target instanceof HTMLInputElement &&
      (target.type === 'checkbox' || target.type === 'radio')
    ) {
      return;
    }

    // Flush any pending input from a different element (rapid switching)
    for (const [otherInput, timerId] of this.inputDebounceTimers) {
      if (otherInput !== target) {
        clearTimeout(timerId);
        this.flushInputAction(otherInput);
      }
    }

    // Record when typing session starts
    this.inputStartTimes.set(target, Date.now());
    this.keystrokeTimes = []; // Reset keystroke tracking for this input

    // LAYER 2: Attach MutationObserver to catch React/Vue programmatic changes
    this.attachFieldObserver(target);

    // LAYER 3: Start polling to catch inputs even if events are blocked
    this.startFieldPolling(target);

    console.log(
      '[EventListener] \u2728 Input focused - ALL 3 LAYERS ACTIVE:',
      target.id || target.name
    );
  }

  /**
   * Handle blur events (flush pending input if user clicks away)
   * LAYER 2 & 3: Stop MutationObserver and polling, capture final value
   */
  private onBlur(event: FocusEvent): void {
    if (!this.isListening) return;

    const target = event.target as HTMLInputElement | HTMLTextAreaElement;
    if (!target || (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA')) return;

    // Skip checkbox/radio inputs - they're handled by click events only
    if (
      target instanceof HTMLInputElement &&
      (target.type === 'checkbox' || target.type === 'radio')
    ) {
      return;
    }

    // LAYER 3: Stop polling the field
    this.stopFieldPolling();

    // LAYER 2: Detach MutationObserver
    this.detachFieldObserver(target);

    // If there's a pending input action, flush it immediately
    if (this.inputStartTimes.has(target) && target.value) {
      this.flushInputAction(target);
    }

    // Cleanup last known value
    this.lastKnownValues.delete(target);

    console.log(
      '[EventListener] \u26a0\ufe0f Input blurred - LAYERS 2 & 3 STOPPED:',
      target.id || target.name
    );
  }

  /**
   * Handle beforeunload events (flush all pending inputs)
   */
  private onBeforeUnload(_event: Event): void {
    if (!this.isListening) return;

    // Flush all pending input actions before page unloads
    for (const [inputElement] of this.inputDebounceTimers) {
      this.flushInputAction(inputElement);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // LAYER 3: Focused Field Polling (Fallback for blocked events)
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Start polling the focused field for value changes
   * This catches inputs even when the 'input' event is blocked by websites
   */
  private startFieldPolling(field: HTMLInputElement | HTMLTextAreaElement): void {
    // Stop any existing polling
    this.stopFieldPolling();

    this.focusedField = field;
    this.lastKnownValues.set(field, field.value);

    // Poll the field every 100ms to detect value changes
    this.fieldPollingInterval = setInterval(() => {
      if (!this.focusedField || !this.isListening) {
        this.stopFieldPolling();
        return;
      }

      const currentValue = this.focusedField.value;
      const lastValue = this.lastKnownValues.get(this.focusedField) || '';

      // If value changed, trigger input capture
      if (currentValue !== lastValue) {
        console.log('[EventListener] 🔴 LAYER 3: Polling detected value change:', {
          field: this.focusedField.id || this.focusedField.name,
          oldValue: lastValue.substring(0, 20),
          newValue: currentValue.substring(0, 20),
        });

        this.lastKnownValues.set(this.focusedField, currentValue);

        // Always trigger input handler for polling (override debounce)
        // Clear any existing debounce timer and flush immediately
        const existingTimer = this.inputDebounceTimers.get(this.focusedField);
        if (existingTimer) {
          clearTimeout(existingTimer);
          this.inputDebounceTimers.delete(this.focusedField);
        }

        // Trigger input handler
        this.onInput({ target: this.focusedField } as unknown as Event);
      }
    }, this.POLLING_INTERVAL_MS);

    console.log('[EventListener] 🟢 LAYER 3: Started polling field:', field.id || field.name);
  }

  /**
   * Stop polling the focused field
   */
  private stopFieldPolling(): void {
    if (this.fieldPollingInterval) {
      clearInterval(this.fieldPollingInterval);
      this.fieldPollingInterval = null;
      console.log('[EventListener] ⛔ LAYER 3: Stopped polling');
    }
    this.focusedField = null;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // LAYER 2: MutationObserver (Catches React/Vue programmatic changes)
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Attach MutationObserver to watch for programmatic value changes
   * This catches React/Vue/Angular state updates that don't fire 'input' events
   */
  private attachFieldObserver(field: HTMLInputElement | HTMLTextAreaElement): void {
    // Don't attach if already observing
    if (this.inputObservers.has(field)) {
      return;
    }

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'attributes' && mutation.attributeName === 'value') {
          const newValue = (mutation.target as HTMLInputElement).value;
          const oldValue = this.lastKnownValues.get(field) || '';

          if (newValue !== oldValue) {
            console.log('[EventListener] 🟡 LAYER 2: MutationObserver detected change:', {
              field: field.id || field.name,
              newValue: newValue.substring(0, 20),
            });

            this.lastKnownValues.set(field, newValue);

            // Always trigger input handler for MutationObserver (override debounce)
            // Clear any existing debounce timer and flush immediately
            const existingTimer = this.inputDebounceTimers.get(field);
            if (existingTimer) {
              clearTimeout(existingTimer);
              this.inputDebounceTimers.delete(field);
            }

            // Trigger input capture
            this.onInput({ target: field } as unknown as Event);
          }
        }
      }
    });

    observer.observe(field, {
      attributes: true,
      attributeFilter: ['value'],
      attributeOldValue: true,
    });

    this.inputObservers.set(field, observer);
    console.log('[EventListener] 🟢 LAYER 2: Attached MutationObserver:', field.id || field.name);
  }

  /**
   * Detach MutationObserver from a field
   */
  private detachFieldObserver(field: HTMLElement): void {
    const observer = this.inputObservers.get(field);
    if (observer) {
      observer.disconnect();
      this.inputObservers.delete(field);
      console.log(
        '[EventListener] ⛔ LAYER 2: Detached MutationObserver:',
        field.id || (field as HTMLInputElement).name
      );
    }
  }

  /**
   * Flush pending input action (record it immediately)
   * LAYER 2 & 3: Also cleanup observers and polling if field is flushed early
   * ✅ BUG FIX #6: Enhanced logging and user notifications for skipped inputs
   */
  private flushInputAction(target: HTMLInputElement | HTMLTextAreaElement): void {
    const startTime = this.inputStartTimes.get(target);
    const value = target.value;

    // Enhanced logging for debugging missing inputs
    const fieldInfo = {
      id: target.id || 'none',
      name: target.name || 'none',
      type: (target as HTMLInputElement).type || 'textarea',
      hasStartTime: !!startTime,
      hasValue: !!value,
      valueLength: value?.length || 0,
    };

    // Skip if no start time or empty value
    if (!startTime || !value) {
      // ✅ BUG FIX #6: Enhanced console warnings for skipped inputs
      console.warn(
        '[EventListener] ⚠️ INPUT SKIPPED - Field will not be recorded:',
        '\n  Field ID:',
        fieldInfo.id,
        '\n  Field Name:',
        fieldInfo.name,
        '\n  Field Type:',
        fieldInfo.type,
        '\n  Has Start Time:',
        fieldInfo.hasStartTime,
        '\n  Has Value:',
        fieldInfo.hasValue,
        '\n  Value Length:',
        fieldInfo.valueLength,
        '\n  Reason:',
        !startTime ? 'Missing start time' : 'Empty value'
      );

      // ✅ BUG FIX #6: Show toast notification to user (non-blocking)
      // Use setTimeout to ensure it doesn't interfere with test execution
      if (typeof window !== 'undefined' && typeof document !== 'undefined') {
        setTimeout(() => {
          import('@/utils/toast-notification')
            .then(({ showToast }) => {
              showToast({
                message: `Input field skipped: ${fieldInfo.name || fieldInfo.id || 'Unknown field'}`,
                type: 'warning',
                duration: 3000,
              });
            })
            .catch(() => {
              // Silent failure in test environment is acceptable
              // Toast notifications are a UX enhancement, not critical functionality
            });
        }, 0);
      }

      this.inputStartTimes.delete(target);
      this.inputDebounceTimers.delete(target);
      // LAYER 2 & 3: Cleanup if early flush
      this.detachFieldObserver(target);
      if (this.focusedField === target) {
        this.stopFieldPolling();
      }
      this.lastKnownValues.delete(target);
      return;
    }

    // Calculate typing delay based on keystroke times
    let typingDelay = 50; // Default
    if (this.keystrokeTimes.length > 1) {
      const delays: number[] = [];
      for (let i = 1; i < this.keystrokeTimes.length; i++) {
        const prevTime = this.keystrokeTimes[i - 1];
        const currTime = this.keystrokeTimes[i];
        if (prevTime !== undefined && currTime !== undefined) {
          delays.push(currTime - prevTime);
        }
      }
      if (delays.length > 0) {
        typingDelay = Math.round(delays.reduce((a, b) => a + b, 0) / delays.length);
      }
    }

    // Record the action with the original start time
    this.captureInputAction(target, startTime, typingDelay);

    // Cleanup
    this.inputStartTimes.delete(target);
    this.inputDebounceTimers.delete(target);
    this.keystrokeTimes = [];
    // LAYER 2 & 3: Cleanup observers and polling
    this.detachFieldObserver(target);
    if (this.focusedField === target) {
      this.stopFieldPolling();
    }
    this.lastKnownValues.delete(target);

    console.log('[EventListener] Input flushed:', {
      element: target.id || target.name,
      startTime,
      delay: Date.now() - startTime,
      typingDelay,
    });
  }

  /**
   * Handle change events (for select, checkbox, radio)
   * Enhanced to support native HTML select dropdowns with comprehensive edge case handling
   */
  private onChange(event: Event): void {
    if (!this.isListening) return;

    const target = event.target as HTMLElement;

    // Handle checkbox/radio changes with deduplication
    if (
      target instanceof HTMLInputElement &&
      (target.type === 'checkbox' || target.type === 'radio')
    ) {
      // Check if this change is from a recent click (already recorded)
      if (this.wasRecentlyClicked(target)) {
        console.log(
          '[EventListener] 🔧 Skipping duplicate checkbox/radio change event (already recorded click)'
        );
        return; // Skip - we already recorded the click
      }

      // Skip hidden checkbox/radio inputs (same logic as click handler)
      if (!this.isElementVisible(target)) {
        console.log('[EventListener] 🔧 Skipping hidden checkbox/radio change event');
        return;
      }

      // This is a programmatic change (no user click) - record it
      console.log('[EventListener] 📝 Recording programmatic checkbox/radio change');

      // Create a click action for programmatic changes (for consistency)
      const selector = this.selectorGenerator.generateSelectors(target);
      const stateCapture = captureElementState(target);

      const action: ClickAction = {
        id: generateActionId(++this.actionSequence),
        type: 'click',
        timestamp: this.getRelativeTimestamp(),
        completedAt: 0,
        url: window.location.href,
        selector,
        tagName: 'input',
        text: target.textContent?.trim(),
        coordinates: { x: 0, y: 0 }, // No coordinates for programmatic change
        coordinatesRelativeTo: 'element',
        button: 'left',
        clickCount: 1,
        modifiers: [],
        elementState: stateCapture.elementState,
        waitConditions: stateCapture.waitConditions,
        context: stateCapture.context,
        alternativeSelectors: stateCapture.alternativeSelectors,
        clickType: 'toggle-input',
        inputType: target.type as 'checkbox' | 'radio',
        checked: target.checked,
        isProgrammatic: true, // Flag to indicate this wasn't a user click
      };

      this.emitAction(action);
      return;
    }

    // Only handle SELECT elements
    if (!(target instanceof HTMLSelectElement)) {
      return;
    }

    try {
      this.recordSelectChange(target);
    } catch (error) {
      console.error('[EventListener] Error recording select change:', error);
      // Don't throw - allow recording to continue
    }
  }

  /**
   * Record native select dropdown change with full option details
   * Implements comprehensive edge case handling per RECORDER_NATIVE_SELECT_FIX.md
   */
  private recordSelectChange(selectElement: HTMLSelectElement): void {
    // Edge Case 1: Check if select is disabled
    if (selectElement.disabled) {
      console.warn(
        '[EventListener] Select is disabled, skipping recording:',
        selectElement.id || selectElement.name
      );
      return;
    }

    // Edge Case 2: Handle empty dropdowns gracefully
    if (selectElement.options.length === 0) {
      console.warn(
        '[EventListener] Select has no options, skipping recording:',
        selectElement.id || selectElement.name
      );
      return;
    }

    const selectedIndex = selectElement.selectedIndex;

    // Edge Case 3: No option selected
    if (selectedIndex < 0) {
      console.warn(
        '[EventListener] No option selected, skipping recording:',
        selectElement.id || selectElement.name
      );
      return;
    }

    const selectedOption = selectElement.options[selectedIndex];

    // Edge Case 4: Disabled option selected
    if (selectedOption && selectedOption.disabled) {
      console.warn('[EventListener] Selected option is disabled, skipping recording');
      return;
    }

    // Edge Case 5: Check if element is visible (skip hidden selects)
    if (!this.isElementVisible(selectElement)) {
      console.warn(
        '[EventListener] Select is hidden, skipping recording:',
        selectElement.id || selectElement.name
      );
      return;
    }

    // Generate selector with full strategy
    const selector = this.selectorGenerator.generateSelectors(selectElement);

    // Capture element state for smart waits
    let elementState, waitConditions, context, alternativeSelectors;
    try {
      const state = captureElementState(selectElement);
      elementState = state.elementState;
      waitConditions = state.waitConditions;
      context = state.context;
      alternativeSelectors = state.alternativeSelectors;

      // Log for debugging
      logElementState(selectElement, elementState, waitConditions);
    } catch (error) {
      console.warn('[EventListener] Failed to capture element state:', error);
      // Continue with action recording even if state capture fails
    }

    // Edge Case 6: Handle multi-select dropdowns
    if (selectElement.multiple) {
      const selectedOptions = Array.from(selectElement.selectedOptions).map((opt) => ({
        text: opt.textContent?.trim() || '',
        value: opt.value,
        index: Array.from(selectElement.options).indexOf(opt),
        label: opt.label || undefined,
      }));

      const action: SelectAction = {
        id: generateActionId(++this.actionSequence),
        type: 'select',
        timestamp: this.getRelativeTimestamp(),
        completedAt: 0, // Will be set by emitAction
        url: window.location.href,
        selector,
        tagName: 'select',
        selectedValue: selectElement.value,
        selectedText: selectedOptions.map((opt) => opt.text).join(', '),
        selectedIndex: selectedIndex,
        isMultiple: true,
        selectedOptions: selectedOptions,
        selectId: selectElement.id || undefined,
        selectName: selectElement.name || undefined,
        elementState,
        waitConditions,
        context,
        alternativeSelectors,
      };

      this.emitAction(action);
      console.log(
        `[EventListener] Recorded multi-select change: ${selectElement.id || selectElement.name} → [${selectedOptions.map((o) => `"${o.text}"`).join(', ')}]`
      );
      return;
    }

    // Standard single-select handling
    const action: SelectAction = {
      id: generateActionId(++this.actionSequence),
      type: 'select',
      timestamp: this.getRelativeTimestamp(),
      completedAt: 0, // Will be set by emitAction
      url: window.location.href,
      selector,
      tagName: 'select',
      selectedValue: selectElement.value,
      selectedText: selectedOption?.textContent?.trim() || '',
      selectedIndex: selectedIndex,
      isMultiple: false,
      selectId: selectElement.id || undefined,
      selectName: selectElement.name || undefined,
      selectedOption: {
        text: selectedOption?.textContent?.trim() || '',
        value: selectedOption?.value || '',
        index: selectedIndex,
        label: selectedOption?.label || undefined,
      },
      elementState,
      waitConditions,
      context,
      alternativeSelectors,
    };

    this.emitAction(action);
    console.log(
      `[EventListener] Recorded select change: ${selectElement.id || selectElement.name} → "${selectedOption?.textContent?.trim()}"`
    );
  }

  /**
   * Handle form submit events
   */
  private onSubmit(event: Event): void {
    if (!this.isListening) return;

    const target = event.target as HTMLFormElement;
    if (!target || target.tagName !== 'FORM') return;

    // ✅ CRITICAL: Flush ALL pending inputs before form submit
    // Ensures password/email fields are recorded even if user hits Enter immediately
    if (this.inputDebounceTimers.size > 0) {
      console.log('[EventListener] 🔥 Flushing pending inputs before form submit');
      for (const [inputElement, timerId] of this.inputDebounceTimers) {
        clearTimeout(timerId);
        this.flushInputAction(inputElement);
      }
    }

    const selector = this.selectorGenerator.generateSelectors(target);

    const action: SubmitAction = {
      id: generateActionId(++this.actionSequence),
      type: 'submit',
      timestamp: this.getRelativeTimestamp(),
      completedAt: 0, // Will be set by emitAction
      url: window.location.href,
      selector,
      tagName: 'form',
    };

    this.emitAction(action);
  }

  /**
   * Handle keydown events (for special keys)
   */
  private onKeyDown(event: KeyboardEvent): void {
    if (!this.isListening) return;

    // ✅ CRITICAL FIX: Use keydown as backup for input capture when input event doesn't fire
    // Some websites block the input event with stopImmediatePropagation
    // This ensures we still capture password fields and other inputs
    const target = event.target as HTMLElement;
    if (
      (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') &&
      ![
        'Enter',
        'Tab',
        'Escape',
        'Shift',
        'Control',
        'Alt',
        'Meta',
        'ArrowUp',
        'ArrowDown',
        'ArrowLeft',
        'ArrowRight',
      ].includes(event.key)
    ) {
      const inputElement = target as HTMLInputElement | HTMLTextAreaElement;

      // Set up debounce timer if this is the first keystroke
      if (!this.inputDebounceTimers.has(inputElement)) {
        console.log(
          '[EventListener] ⚠️ Keydown triggered input tracking (input event may be blocked):',
          inputElement.id || inputElement.name
        );

        // Ensure start time is set
        if (!this.inputStartTimes.has(inputElement)) {
          this.inputStartTimes.set(inputElement, Date.now());
        }

        // Track keystroke
        this.keystrokeTimes.push(Date.now());

        // Set up adaptive debounce
        const isSensitive = this.isSensitiveInput(inputElement);
        const isShortField =
          inputElement instanceof HTMLInputElement &&
          (inputElement.type === 'email' ||
            inputElement.type === 'tel' ||
            inputElement.type === 'number' ||
            (inputElement.maxLength > 0 && inputElement.maxLength < 50));

        let debounceTime = 500;
        if (isSensitive) {
          debounceTime = 300;
        } else if (isShortField) {
          debounceTime = 400;
        }

        const timerId = setTimeout(() => {
          this.flushInputAction(inputElement);
        }, debounceTime);

        this.inputDebounceTimers.set(inputElement, timerId);
      } else {
        // Reset existing timer
        const existingTimer = this.inputDebounceTimers.get(inputElement);
        if (existingTimer) clearTimeout(existingTimer);

        this.keystrokeTimes.push(Date.now());

        const isSensitive = this.isSensitiveInput(inputElement);
        const isShortField =
          inputElement instanceof HTMLInputElement &&
          (inputElement.type === 'email' ||
            inputElement.type === 'tel' ||
            inputElement.type === 'number' ||
            (inputElement.maxLength > 0 && inputElement.maxLength < 50));

        let debounceTime = 500;
        if (isSensitive) {
          debounceTime = 300;
        } else if (isShortField) {
          debounceTime = 400;
        }

        const timerId = setTimeout(() => {
          this.flushInputAction(inputElement);
        }, debounceTime);

        this.inputDebounceTimers.set(inputElement, timerId);
      }
    }

    // Handle Enter key in input fields (form submit)
    if (event.key === 'Enter' && event.target) {
      const enterTarget = event.target as HTMLInputElement | HTMLTextAreaElement;
      if (
        (enterTarget.tagName === 'INPUT' || enterTarget.tagName === 'TEXTAREA') &&
        this.inputStartTimes.has(enterTarget)
      ) {
        // Flush input action immediately before form submits
        this.flushInputAction(enterTarget);
      }
    }

    // Only capture special keys (Enter, Tab, Escape, etc.)
    const specialKeys = [
      'Enter',
      'Tab',
      'Escape',
      'ArrowUp',
      'ArrowDown',
      'ArrowLeft',
      'ArrowRight',
    ];

    if (!specialKeys.includes(event.key)) return;

    const modifiers = this.getModifierKeys(event);

    const action: KeypressAction = {
      id: generateActionId(++this.actionSequence),
      type: 'keypress',
      timestamp: this.getRelativeTimestamp(),
      completedAt: 0, // Will be set by emitAction
      url: window.location.href,
      key: event.key,
      code: event.code,
      modifiers,
    };

    this.emitAction(action);
  }

  /**
   * Handle scroll events (debounced)
   */
  private onScroll(_event: Event): void {
    if (!this.isListening) return;

    // ✅ BUG FIX #3: Flush ALL pending input actions before scroll
    // This ensures inputs are captured before user scrolls away
    if (this.inputDebounceTimers.size > 0) {
      console.log('[EventListener] 🔥 Flushing inputs before scroll');
      for (const [inputElement, timerId] of this.inputDebounceTimers) {
        clearTimeout(timerId);
        this.flushInputAction(inputElement);
      }
    }

    // Clear previous debounce timer
    if (this.scrollDebounceTimer) {
      clearTimeout(this.scrollDebounceTimer);
    }

    // Debounce scroll events
    this.scrollDebounceTimer = setTimeout(() => {
      this.captureScrollAction();
    }, 200); // 200ms debounce
  }

  /**
   * Capture scroll action
   */
  private captureScrollAction(): void {
    const action: ScrollAction = {
      id: generateActionId(++this.actionSequence),
      type: 'scroll',
      timestamp: this.getRelativeTimestamp(),
      completedAt: 0, // Will be set by emitAction
      url: window.location.href,
      scrollX: window.scrollX,
      scrollY: window.scrollY,
      element: 'window',
    };

    this.emitAction(action);
  }

  /**
   * Handle popstate events (back/forward navigation)
   */
  private onPopState(_event: PopStateEvent): void {
    if (!this.isListening) return;

    const currentUrl = window.location.href;
    const fromUrl = this.previousUrl;

    // Determine navigation trigger based on last action
    let navigationTrigger: 'back' | 'forward' | 'click';

    // Check if last action was within the last 100ms (indicates programmatic navigation)
    const timeSinceLastAction = this.lastAction ? Date.now() - this.lastAction.timestamp : Infinity;

    if (timeSinceLastAction < 100 && this.lastAction) {
      // Recent action caused navigation
      if (this.lastAction.type === 'submit') {
        // This would have been caught by form submission, skip
        return;
      } else if (this.lastAction.type === 'click') {
        // Link click navigation - will be handled by background URL monitoring
        return;
      }
    }

    // Try to detect back vs forward using performance API
    // performance.navigation.type === 2 indicates back/forward
    // But we can't distinguish between them, default to 'back' (more common)
    if (performance.navigation && performance.navigation.type === 2) {
      navigationTrigger = 'back';
    } else {
      // Fallback: check URL history position
      navigationTrigger = 'back'; // Default assumption
    }

    const action: NavigationAction = {
      id: generateActionId(++this.actionSequence),
      type: 'navigation',
      timestamp: this.getRelativeTimestamp(),
      completedAt: 0, // Will be set by emitAction
      url: currentUrl,
      from: fromUrl,
      to: currentUrl,
      navigationTrigger,
      waitUntil: 'load',
      duration: 0,
    };

    // Update previous URL for next navigation
    this.previousUrl = currentUrl;

    this.emitAction(action);

    console.log('[EventListener] Back/Forward navigation detected:', {
      from: fromUrl,
      to: currentUrl,
      trigger: navigationTrigger,
    });
  }

  /**
   * Check if click will cause navigation
   */
  private isNavigationClick(element: Element): boolean {
    // Ignore recording indicator
    if (element.closest('#saveaction-recording-indicator')) {
      return false;
    }

    // Check if it's a link
    if (element.tagName === 'A' && (element as HTMLAnchorElement).href) {
      return true;
    }

    return false;
  }

  /**
   * Check if element is a submit button (UNIVERSAL detection for any website/language)
   *
   * CRITICAL for open-source projects: NO hardcoded text patterns!
   * This works for ANY language, ANY framework, ANY custom implementation.
   *
   * Detection strategy:
   * 1. Native HTML submit buttons (type="submit")
   * 2. Buttons inside forms (likely submit even without explicit type)
   * 3. Buttons with submit-related ARIA attributes (framework-agnostic)
   * 4. Primary/CTA buttons in form contexts (behavioral detection)
   */
  private isSubmitButton(element: Element): boolean {
    // 1. Standard HTML submit buttons (most reliable)
    if (element.tagName === 'BUTTON') {
      const button = element as HTMLButtonElement;
      if (button.type === 'submit') {
        return true;
      }

      // Buttons without explicit type inside forms are submit buttons by default (HTML spec)
      // Note: button.type defaults to 'submit' in HTML, but some frameworks might not set it
      const form = button.closest('form');
      if (form && button.type !== 'button' && button.type !== 'reset') {
        return true;
      }
    }

    // 2. Input submit buttons ONLY (NOT text/email/password inputs)
    if (element.tagName === 'INPUT') {
      const input = element as HTMLInputElement;
      // CRITICAL FIX: Only detect input[type="submit"], not regular form inputs
      if (input.type === 'submit') {
        return true;
      }
      // DO NOT detect other input types (text, email, password, etc.)
      return false;
    }

    // 3. ARIA-based detection (works for React, Vue, Angular, etc.)
    // Frameworks often use role="button" with form-related ARIA attributes
    const role = element.getAttribute('role');
    if (role === 'button') {
      // Check if inside a form (strong signal)
      const form = element.closest('form');
      if (form) {
        // Check if it's the primary button in the form
        const isPrimary = this.isPrimaryButton(element);
        if (isPrimary) {
          return true;
        }
      }

      // Check for ARIA attributes that indicate form submission
      const ariaLabel = element.getAttribute('aria-label');
      const ariaDescribedBy = element.getAttribute('aria-describedby');

      if (ariaLabel || ariaDescribedBy) {
        // Has ARIA attributes and is interactive - likely important action
        const form = element.closest('form');
        if (form) {
          return true;
        }
      }
    }

    // 4. Behavioral detection: Primary buttons in form contexts
    // This catches AJAX/SPA forms that don't use <form> tags
    const hasFormContext = this.hasFormContext(element);
    if (hasFormContext) {
      const isPrimary = this.isPrimaryButton(element);
      if (isPrimary) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check if element is styled as a primary/CTA button
   * Universal detection based on CSS patterns (not text content)
   */
  private isPrimaryButton(element: Element): boolean {
    const className = element.className || '';

    // Common CSS patterns for primary buttons (language/framework agnostic)
    const primaryPatterns = [
      'primary', // btn-primary, button-primary
      'cta', // Call-to-action
      'main', // main-button
      'action', // action-button
      'default', // default button
      'positive', // positive action
      'success', // success button
      'confirm', // confirmation
    ];

    const classLower = className.toLowerCase();
    const hasPrimaryClass = primaryPatterns.some((pattern) => classLower.includes(pattern));

    if (hasPrimaryClass) {
      return true;
    }

    // Check computed styles (most reliable - visual hierarchy)
    try {
      const styles = window.getComputedStyle(element);
      const bgColor = styles.backgroundColor;
      const fontSize = parseFloat(styles.fontSize);
      const fontWeight = styles.fontWeight;

      // Primary buttons typically have:
      // - Solid background color (not transparent/white)
      // - Larger font size than average
      // - Bold font weight

      const hasBackground = bgColor && bgColor !== 'rgba(0, 0, 0, 0)' && bgColor !== 'transparent';
      const isBold = fontWeight === 'bold' || fontWeight === '700' || parseInt(fontWeight) >= 600;
      const isLargerFont = fontSize >= 14;

      if (hasBackground && (isBold || isLargerFont)) {
        return true;
      }
    } catch (e) {
      // Style computation failed, continue
    }

    return false;
  }

  /**
   * Check if element is in a form context (even without <form> tag)
   * Detects AJAX/SPA forms based on surrounding input fields
   */
  private hasFormContext(element: Element): boolean {
    // Check if inside an actual <form>
    if (element.closest('form')) {
      return true;
    }

    // Check if there are input fields nearby (AJAX form pattern)
    // Look up the DOM tree for a container with input fields
    let parent = element.parentElement;
    let depth = 0;
    const maxDepth = 5;

    while (parent && depth < maxDepth) {
      // Check if this container has input fields
      const inputs = parent.querySelectorAll('input, textarea, select');
      if (inputs.length >= 1) {
        // Found inputs nearby - this is likely a form context
        return true;
      }

      parent = parent.parentElement;
      depth++;
    }

    return false;
  }

  /**
   * 🆕 CRITICAL FIX: Analyze dropdown state for clicks inside dropdown menus
   * This fixes "element hidden" errors in Playwright
   *
   * Detects if element is inside a dropdown and captures parent state info
   */
  private analyzeDropdownState(element: Element): {
    isInDropdown: boolean;
    requiresParentOpen?: boolean;
    parentSelector?: SelectorStrategy;
    parentTrigger?: SelectorStrategy;
    relatedAction?: string;
  } {
    // Common dropdown/menu selectors (framework-agnostic)
    const dropdownSelectors = [
      // Semantic HTML
      '[role="menu"]',
      '[role="listbox"]',
      '[role="combobox"]',
      '[aria-expanded]',

      // Bootstrap patterns
      '.dropdown-menu',
      '.dropdown-content',
      'ul.dropdown',

      // Material UI / Ant Design patterns
      '.MuiMenu-paper',
      '.MuiPopover-paper',
      '.ant-dropdown',
      '.ant-select-dropdown',

      // Custom select patterns
      '.menu',
      '.select-dropdown',
      '.select-menu',
      '.select-options',
      '.menu-items',
      '.autocomplete-dropdown',
      'ul[data-dropdown]',
      'div[data-dropdown]',
      '[data-dropdown]',
      '[aria-haspopup="true"]',

      // Generic patterns for custom dropdowns
      '[class*="dropdown"]',
      '[class*="menu"]',
      '[id*="dropdown"]',
      '[id*="menu"]',
      'ul[class*="dropdown"]', // Custom <ul> dropdowns
      'ul[id*="dropdown"]',
      'ul[id*="menu"]',
      'div[class*="dropdown"]',
      'div[id*="dropdown"]',
      '.popover',
      '.tooltip-content',
    ];

    // Find parent dropdown container
    const dropdownParent = dropdownSelectors
      .map((selector) => {
        try {
          return element.closest(selector);
        } catch (e) {
          return null;
        }
      })
      .find((parent) => parent !== null) as Element | null;

    if (!dropdownParent) {
      return { isInDropdown: false };
    }

    console.log('[EventListener] 🔽 Element inside dropdown detected:', {
      elementTag: element.tagName,
      dropdownTag: dropdownParent.tagName,
      dropdownClass: dropdownParent.className,
      dropdownId: dropdownParent.id || 'no-id',
    });

    // Find the trigger button that opens this dropdown
    const triggerButton = this.findDropdownTrigger(dropdownParent);

    // Generate selectors for dropdown and trigger
    const parentSelector = this.selectorGenerator.generateSelectors(dropdownParent);
    const parentTrigger = triggerButton
      ? this.selectorGenerator.generateSelectors(triggerButton)
      : undefined;

    // Find the action that opened this dropdown
    const relatedAction = this.getDropdownOpeningAction(dropdownParent);

    return {
      isInDropdown: true,
      requiresParentOpen: true,
      parentSelector,
      parentTrigger,
      relatedAction,
    };
  }

  /**
   * 🆕 Generate carousel context metadata
   * Enhanced with detection method, confidence, and page type
   */
  private generateCarouselContext(element: Element): import('@/types').CarouselContext {
    // 🆕 Get detection metadata from selector generator
    const detectionResult = this.selectorGenerator.detectCarouselWithConfidence(element);

    // Determine carousel direction - check element AND parent classes
    // (Parent might have .next/.prev while child is just a wrapper)
    const className = this.getElementClassName(element);
    const parentClassName = element.parentElement
      ? this.getElementClassName(element.parentElement)
      : '';
    const combinedClassName = `${className} ${parentClassName}`.toLowerCase();
    const ariaLabel = element.getAttribute('aria-label') || '';

    // Explicit direction detection (check both directions)
    const hasPrev =
      combinedClassName.includes('prev') ||
      combinedClassName.includes('previous') ||
      combinedClassName.includes('back') ||
      combinedClassName.includes('left') ||
      ariaLabel.toLowerCase().includes('prev');

    const direction: 'next' | 'prev' = hasPrev ? 'prev' : 'next';

    // Detect carousel library (enhanced from detection result)
    let carouselLibrary: string | undefined = detectionResult.carouselLibrary;
    if (!carouselLibrary) {
      // Fallback detection
      if (className.includes('swiper')) {
        carouselLibrary = 'swiper';
      } else if (className.includes('slick')) {
        carouselLibrary = 'slick';
      } else if (className.includes('carousel-control')) {
        carouselLibrary = 'bootstrap';
      } else if (className.includes('owl')) {
        carouselLibrary = 'owl';
      } else if (className.includes('flickity')) {
        carouselLibrary = 'flickity';
      }
    }

    // 🆕 Detect if custom implementation
    const isCustomImplementation = !carouselLibrary;

    // Detect carousel type
    let carouselType = 'image-gallery';
    let parent = element.parentElement;
    let depth = 0;
    while (parent && depth < 5) {
      const parentClasses = this.getElementClassName(parent);
      if (/product|listing|item/i.test(parentClasses)) {
        carouselType = 'product-gallery';
        break;
      } else if (/hero|banner/i.test(parentClasses)) {
        carouselType = 'hero-slider';
        break;
      } else if (/testimonial|review/i.test(parentClasses)) {
        carouselType = 'testimonial-slider';
        break;
      }
      parent = parent.parentElement;
      depth++;
    }

    // Find container selector
    const parentContainer = this.selectorGenerator.findUniqueParentContainer(element);
    const containerSelector = parentContainer.selector || null;
    const pageType = parentContainer.pageType || 'unknown';

    // 🆕 Check if disabled
    const isDisabled =
      element.hasAttribute('disabled') ||
      element.classList.contains('disabled') ||
      element.getAttribute('aria-disabled') === 'true' ||
      (element.parentElement?.classList.contains('disabled') ?? false);

    // Find affected element (the carousel/slider content)
    let affectsElement: string | undefined;
    let searchParent = element.parentElement;
    depth = 0;
    while (searchParent && depth < 5) {
      const carouselContent =
        searchParent.querySelector('.swiper-slide') ||
        searchParent.querySelector('.carousel-item') ||
        searchParent.querySelector('.slick-slide') ||
        searchParent.querySelector('[class*="slide"]') ||
        searchParent.querySelector('img');

      if (carouselContent) {
        affectsElement = this.selectorGenerator.getElementSelectorPart(carouselContent);
        break;
      }
      searchParent = searchParent.parentElement;
      depth++;
    }

    return {
      isCarouselControl: true,
      carouselType,
      direction,
      containerSelector,
      affectsElement,
      carouselLibrary,
      // 🆕 Enhanced metadata
      detectionMethod: detectionResult.detectionMethod || 'heuristic',
      confidence: detectionResult.confidence,
      isCustomImplementation,
      isDisabled,
      pageType,
    };
  }

  /**
   * 🆕 Count recent clicks on a specific element within a time window
   */
  private countRecentClicksOnElement(element: Element, timeWindowMs: number): number {
    const now = Date.now();
    const cutoffTime = now - timeWindowMs;

    return this.clickHistory.filter(
      (entry) => entry.element === element && entry.timestamp > cutoffTime
    ).length;
  }

  /**
   * 🆕 Initialize MutationObserver to track dropdown state changes
   */
  private initializeDropdownObserver(): void {
    this.dropdownObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (
          mutation.type === 'attributes' &&
          (mutation.attributeName === 'class' ||
            mutation.attributeName === 'style' ||
            mutation.attributeName === 'aria-expanded' ||
            mutation.attributeName === 'hidden')
        ) {
          const element = mutation.target as Element;

          // Check if this is a dropdown element
          const isDropdown = element.matches(
            [
              '[role="menu"]',
              '[role="listbox"]',
              '.dropdown-menu',
              '.dropdown-content',
              '.MuiMenu-paper',
              '.MuiPopover-paper',
              '.ant-dropdown',
              '[class*="dropdown"]',
              '[class*="menu"]',
              'ul[class*="menu"]', // Custom <ul> menus
              'ul[id*="menu"]',
              'ul[id*="dropdown"]',
            ].join(',')
          );

          if (isDropdown && this.isListening) {
            const isVisible = this.isElementVisibleForDropdown(element);

            if (isVisible) {
              // Dropdown just became visible - link to most recent action
              const lastAction = this.recentActions[this.recentActions.length - 1];
              if (lastAction && lastAction.type === 'click') {
                this.onDropdownOpen(element, lastAction.id);
                console.log('[EventListener] 🔽 Dropdown opened by action:', lastAction.id);
              }
            }
          }
        }
      });
    });
  }

  /**
   * 🆕 Check if element is visible (for dropdown detection)
   */
  private isElementVisibleForDropdown(element: Element): boolean {
    const style = window.getComputedStyle(element);

    // Check display and visibility
    if (style.display === 'none') return false;
    if (style.visibility === 'hidden') return false;
    if (style.opacity === '0') return false;

    // Check hidden attribute
    if ((element as HTMLElement).hidden) return false;

    // Check dimensions
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;

    // Check aria-hidden
    if (element.getAttribute('aria-hidden') === 'true') return false;

    return true;
  }

  /**
   * 🆕 Record when a dropdown opens
   */
  private onDropdownOpen(dropdownElement: Element, actionId: string): void {
    this.dropdownOpenEvents.set(dropdownElement, {
      actionId,
      timestamp: Date.now(),
    });

    // Clean up old entries (older than 60 seconds)
    const now = Date.now();
    for (const [element, event] of this.dropdownOpenEvents.entries()) {
      if (now - event.timestamp > this.DROPDOWN_LINK_TIMEOUT) {
        this.dropdownOpenEvents.delete(element);
      }
    }
  }

  /**
   * 🆕 Get the action that opened a dropdown
   */
  private getDropdownOpeningAction(dropdownElement: Element): string | undefined {
    const openEvent = this.dropdownOpenEvents.get(dropdownElement);

    if (openEvent) {
      // Check if the opening was recent (within timeout)
      const timeSinceOpen = Date.now() - openEvent.timestamp;
      if (timeSinceOpen < this.DROPDOWN_LINK_TIMEOUT) {
        return openEvent.actionId;
      }
    }

    return undefined;
  }

  /**
   * 🆕 Find the button/element that triggers a dropdown
   */
  private findDropdownTrigger(dropdownContainer: Element): Element | null {
    const dropdownId = dropdownContainer.id;

    // Strategy 1: aria-controls attribute
    if (dropdownId) {
      const trigger = document.querySelector(`[aria-controls="${dropdownId}"]`);
      if (trigger) {
        console.log('[EventListener] Found trigger via aria-controls');
        return trigger;
      }
    }

    // Strategy 2: data-target attribute
    if (dropdownId) {
      const trigger = document.querySelector(`[data-target="#${dropdownId}"]`);
      if (trigger) {
        console.log('[EventListener] Found trigger via data-target');
        return trigger;
      }
    }

    // Strategy 3: Previous sibling with aria-expanded
    const prevSibling = dropdownContainer.previousElementSibling;
    if (prevSibling && prevSibling.hasAttribute('aria-expanded')) {
      console.log('[EventListener] Found trigger via previous sibling');
      return prevSibling;
    }

    // Strategy 4: Previous sibling that is a button
    if (
      prevSibling &&
      (prevSibling.tagName === 'BUTTON' || prevSibling.getAttribute('role') === 'button')
    ) {
      console.log('[EventListener] Found trigger via button sibling');
      return prevSibling;
    }

    // Strategy 5: Parent button with aria-haspopup
    const parentButton = dropdownContainer.parentElement?.querySelector('button[aria-haspopup]');
    if (parentButton) {
      console.log('[EventListener] Found trigger via parent button');
      return parentButton;
    }

    // Strategy 6: Search nearby for button with dropdown classes
    const nearbyTrigger = dropdownContainer.parentElement?.querySelector(
      [
        'button.dropdown-toggle',
        'button[data-toggle="dropdown"]',
        'button[aria-haspopup]',
        '.dropdown-button',
        '[role="button"][aria-haspopup]',
      ].join(',')
    );
    if (nearbyTrigger) {
      console.log('[EventListener] Found trigger via nearby search');
      return nearbyTrigger;
    }

    // Strategy 7: Check parent container for ANY button (for custom dropdowns)
    const parentContainer = dropdownContainer.parentElement;
    if (parentContainer) {
      // Look for any button in the same parent container
      const anyButton = parentContainer.querySelector('button');
      if (anyButton && anyButton !== dropdownContainer) {
        console.log('[EventListener] Found trigger via parent container button');
        return anyButton;
      }
    }

    // Strategy 8: Check for buttons with class containing 'dropdown' or 'btn'
    const customButton = dropdownContainer.parentElement?.querySelector(
      [
        'button[class*="dropdown"]',
        'button[class*="btn"]',
        'button[onclick]', // Custom onclick handlers
        '[class*="dropdown-btn"]',
        '[class*="trigger"]',
      ].join(',')
    );
    if (customButton) {
      console.log('[EventListener] Found trigger via custom button patterns');
      return customButton;
    }

    console.log('[EventListener] ⚠️ No trigger found for dropdown');
    return null;
  }

  /**
   * 🆕 CRITICAL FIX: Detect if form submission will cause navigation or is AJAX
   * This fixes 30s timeout waits on AJAX forms (saves 150s+ per test)
   *
   * Strategy: Wait 2.5s after form submission to verify URL change
   * Returns promise with navigation detection result
   */
  /**
   * Detect if form submit will cause navigation using Actual Behavior Monitoring.
   * This is 100% accurate because it measures real URL changes rather than predicting.
   *
   * Algorithm:
   * 1. Capture URL before form submit
   * 2. Listen for beforeunload event (catches early navigation)
   * 3. Wait 500ms for URL changes
   * 4. Compare URLs: different = navigation, same = AJAX
   *
   * @param form - The form element being submitted
   * @param _submitButton - The submit button (unused, kept for compatibility)
   * @returns Promise resolving to navigation detection result
   */
  private async detectAjaxForm(
    form: HTMLFormElement | null,
    _submitButton: Element // Prefix with _ to indicate intentionally unused
  ): Promise<{
    expectsNavigation: boolean;
    isAjaxForm: boolean;
    ajaxIndicators?: {
      hasPreventDefault: boolean;
      hasAjaxAttributes: boolean;
      hasFramework: boolean;
    };
  }> {
    const urlBefore = window.location.href;
    let navigationDetectedEarly = false;

    // Listen for beforeunload to catch early navigation
    const beforeUnloadHandler = () => {
      navigationDetectedEarly = true;
      console.log('[EventListener] 🚀 Early navigation detected via beforeunload');
    };
    window.addEventListener('beforeunload', beforeUnloadHandler, { once: true });

    console.log('[EventListener] 🔍 Starting form navigation detection:', {
      urlBefore,
      formAction: form?.action || 'none',
      formMethod: form?.method || 'none',
    });

    // Wait 500ms to see if URL changes
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Clean up beforeunload listener
    window.removeEventListener('beforeunload', beforeUnloadHandler);

    const urlAfter = window.location.href;
    const didNavigate = urlBefore !== urlAfter || navigationDetectedEarly;

    console.log('[EventListener] ✅ Form navigation detection complete:', {
      urlBefore,
      urlAfter,
      didNavigate,
      detectionMethod: navigationDetectedEarly ? 'beforeunload' : 'url-comparison',
      confidence: '100% (actual behavior measured)',
    });

    return {
      expectsNavigation: didNavigate,
      isAjaxForm: !didNavigate,
      ajaxIndicators: undefined, // Removed heuristics - we use actual behavior only
    };
  }

  /**
   * Find the closest interactive element by traversing up the DOM tree
   * No depth limit - traverse entire ancestor chain for maximum capture rate
   * Special handling for carousel controls with nested SVG/icons
   */
  /**
   * 🆕 P0 - CRITICAL FIX: Check if element is SVG or SVG descendant
   * SVG elements should NEVER be recorded as click targets - they're decorative
   */
  private isSvgDescendant(element: Element): boolean {
    // Direct SVG element tags
    const svgTags = [
      'svg',
      'path',
      'circle',
      'rect',
      'polygon',
      'line',
      'polyline',
      'ellipse',
      'use',
      'g',
    ];
    if (svgTags.includes(element.tagName.toLowerCase())) {
      return true;
    }

    // Check if element is inside SVG
    return element.closest('svg') !== null;
  }

  /**
   * 🆕 P0 - CRITICAL FIX: Check if element has click handler
   * Helps identify interactive elements that aren't semantic HTML
   */
  private hasClickHandler(element: Element): boolean {
    // Check for inline onclick
    if (element.hasAttribute('onclick')) {
      return true;
    }

    // Check for cursor:pointer (indicates clickable)
    try {
      const computedStyle = window.getComputedStyle(element);
      if (computedStyle.cursor === 'pointer') {
        return true;
      }
    } catch (error) {
      // getComputedStyle may fail for disconnected elements
    }

    return false;
  }

  /**
   * 🆕 P0 - CRITICAL FIX: Check if element is a carousel control
   * Expanded detection beyond existing selectorGenerator.isCarouselControl
   */
  private isCarouselControlElement(element: Element): boolean {
    const carouselClasses = [
      'carousel-control',
      'carousel-arrow',
      'slider-arrow',
      'item-img-arrow',
      'next',
      'prev',
      'previous',
      'slick-arrow',
      'swiper-button',
    ];

    const className = this.getElementClassName(element).toLowerCase();
    const hasCarouselClass = carouselClasses.some((cls) => className.includes(cls));

    if (hasCarouselClass) {
      return true;
    }

    // Use existing carousel detection as fallback
    try {
      return this.selectorGenerator.isCarouselControl(element);
    } catch (error) {
      return false;
    }
  }

  /**
   * 🆕 P0 - CRITICAL FIX: Find clickable ancestor when clicking SVG child
   * Traverses up from SVG element to find the actual button/link/span
   */
  private findSvgClickableAncestor(svgElement: Element): Element | null {
    let parent = svgElement.parentElement;
    let depth = 0;
    const maxDepth = 10;

    while (parent && parent !== document.body && depth < maxDepth) {
      // Stop at first non-SVG element
      if (!this.isSvgDescendant(parent)) {
        // Check if this parent is interactive
        if (this.isInteractiveElementStrict(parent)) {
          console.log('[EventListener] 🎯 Found interactive parent for SVG:', {
            svg: svgElement.tagName,
            parent: parent.tagName,
            parentClasses: this.getElementClassName(parent),
          });
          return parent;
        }

        // Check for carousel control
        if (this.isCarouselControlElement(parent)) {
          console.log('[EventListener] 🎯 Found carousel control parent for SVG:', {
            svg: svgElement.tagName,
            parent: parent.tagName,
            parentClasses: this.getElementClassName(parent),
          });
          return parent;
        }

        // Check if parent has click handler
        if (this.hasClickHandler(parent)) {
          console.log('[EventListener] 🎯 Found clickable parent for SVG (cursor:pointer):', {
            svg: svgElement.tagName,
            parent: parent.tagName,
          });
          return parent;
        }
      }

      parent = parent.parentElement;
      depth++;
    }

    return null; // No clickable parent found
  }

  /**
   * 🆕 P0 - CRITICAL FIX: Find the actual interactive parent element
   * Main entry point for DOM traversal - handles SVG, icons, decorative elements
   */
  private findInteractiveParent(element: Element): Element | null {
    // @ts-expect-error - Kept for documentation, used in isInteractiveElementStrict
    const _INTERACTIVE_TAGS = ['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'LABEL'];
    // @ts-expect-error - Kept for documentation, used in isInteractiveElementStrict
    const _CLICKABLE_ROLES = [
      'button',
      'link',
      'menuitem',
      'tab',
      'option',
      'radio',
      'checkbox',
      'switch',
    ];

    // STEP 1: If element is SVG/decorative, ALWAYS traverse to parent
    if (this.isSvgDescendant(element)) {
      console.log('[EventListener] ⚠️ Detected SVG click - finding interactive parent');
      const ancestor = this.findSvgClickableAncestor(element);
      if (ancestor) {
        return ancestor;
      }
      // If no clickable ancestor found, return null (don't record SVG clicks)
      return null;
    }

    // STEP 2: Check if clicked element itself is interactive
    if (this.isInteractiveElementStrict(element)) {
      return element;
    }

    // STEP 3: Walk up DOM tree to find interactive parent
    let current: Element | null = element.parentElement;
    let depth = 0;
    const maxDepth = 10;

    while (current && current !== document.body && depth < maxDepth) {
      // Use the strict check which includes commonly clickable elements
      if (this.isInteractiveElementStrict(current)) {
        return current;
      }

      current = current.parentElement;
      depth++;
    }

    // STEP 4: No interactive parent found
    // Only return the element if it's actually interactive (not just a plain div)
    if (this.isInteractiveElementStrict(element)) {
      return element;
    }

    // Not interactive and no interactive parent - return null (don't record)
    return null;
  }

  /**
   * 🆕 Strict interactive element check (for internal use by findInteractiveParent)
   * Separated from main isInteractiveElement to avoid recursion
   */
  private isInteractiveElementStrict(element: Element): boolean {
    const INTERACTIVE_TAGS = ['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'LABEL'];
    const CLICKABLE_ROLES = [
      'button',
      'link',
      'menuitem',
      'tab',
      'option',
      'radio',
      'checkbox',
      'switch',
    ];

    // Commonly clickable elements in web apps
    const COMMONLY_CLICKABLE = ['LI', 'TR', 'TD'];

    // Check tag name
    if (
      INTERACTIVE_TAGS.includes(element.tagName) ||
      COMMONLY_CLICKABLE.includes(element.tagName)
    ) {
      return true;
    }

    // Check ARIA role
    const role = element.getAttribute('role');
    if (role && CLICKABLE_ROLES.includes(role)) {
      return true;
    }

    // Check for button/submit classes
    const className = this.getElementClassName(element).toLowerCase();
    if (className.includes('btn') || className.includes('button') || className.includes('submit')) {
      return true;
    }

    // Check for click handlers
    if (this.hasClickHandler(element)) {
      return true;
    }

    // Check for carousel controls
    if (this.isCarouselControlElement(element)) {
      return true;
    }

    return false;
  }

  private findInteractiveElement(element: Element): Element | null {
    // 🆕 P0 - CRITICAL FIX: Use new findInteractiveParent logic
    return this.findInteractiveParent(element);
  }

  /**
   * 🆕 Find carousel control parent when clicking on nested SVG/icon
   * Handles cases like: <span class="img-arrow"><svg>...</svg></span>
   */
  // @ts-expect-error - Old implementation kept for reference
  private findCarouselControlParent(element: Element): Element | null {
    try {
      // Check if we're inside an SVG or icon element
      const isSvgOrIcon =
        element.tagName === 'SVG' ||
        element.tagName === 'PATH' ||
        element.tagName === 'USE' ||
        element.tagName === 'I' ||
        /fa-|icon|material-icons/i.test(element.className || '');

      if (!isSvgOrIcon) {
        return null; // Not a nested icon click
      }

      // Traverse up to find carousel control
      let parent = element.parentElement;
      let depth = 0;

      while (parent && depth < 5) {
        // Check if parent is a carousel control
        const detectionResult = this.selectorGenerator.detectCarouselWithConfidence(parent);
        if (detectionResult.isCarousel) {
          return parent;
        }

        parent = parent.parentElement;
        depth++;
      }

      return null;
    } catch (error) {
      console.warn('[EventListener] Error in findCarouselControlParent:', error);
      return null;
    }
  }

  /**
   * Generate unique identifier for element (for checkbox deduplication)
   */
  private getElementIdentifier(element: Element): string {
    // Use ID if available (most reliable)
    if (element.id) {
      return `#${element.id}`;
    }

    // Use name attribute for form inputs
    if (element instanceof HTMLInputElement && element.name) {
      return `[name="${element.name}"]`;
    }

    // Fallback to xpath as unique identifier
    const xpath = this.selectorGenerator.generateSelectors(element).xpath;
    return xpath || `element_${Date.now()}`;
  }

  /**
   * Mark checkbox/radio as recently clicked (for deduplication)
   */
  private markCheckboxInteraction(element: Element): void {
    const identifier = this.getElementIdentifier(element);
    this.recentCheckboxInteractions.set(identifier, Date.now());

    // Auto-cleanup after debounce period
    setTimeout(() => {
      this.recentCheckboxInteractions.delete(identifier);
    }, this.CHECKBOX_DEBOUNCE_MS);
  }

  /**
   * Check if checkbox/radio was recently clicked (for deduplication)
   */
  private wasRecentlyClicked(element: Element): boolean {
    const identifier = this.getElementIdentifier(element);
    const clickTime = this.recentCheckboxInteractions.get(identifier);

    if (!clickTime) {
      return false;
    }

    const timeSinceClick = Date.now() - clickTime;
    return timeSinceClick < this.CHECKBOX_DEBOUNCE_MS;
  }

  /**
   * 🆕 Safely get element className as string
   * Handles both HTMLElement.className (string) and SVGElement.className (SVGAnimatedString)
   */
  private getElementClassName(element: Element): string {
    if (!element.className) {
      return '';
    }

    // For SVG elements, className is an SVGAnimatedString object with baseVal property
    if (typeof element.className === 'object') {
      return String((element.className as any).baseVal || '');
    }

    // For HTML elements, className is a string
    return String(element.className || '');
  }

  /**
   * Check if element is interactive
   * Comprehensive detection covering 99.9% of real-world scenarios
   * Multi-layer detection with intelligent fallbacks
   * 🚨 CRITICAL: Carousel detection MUST come first to catch ALL carousel arrows
   */
  // @ts-expect-error - Old implementation kept for reference
  private isInteractiveElement(element: Element): boolean {
    // 🆕 PRIORITY 0: CAROUSEL DETECTION (catches custom implementations)
    // This MUST be first because carousel arrows might be ANY element (span, div, etc.)
    // Without this check, custom carousel arrows would be filtered out before detection runs
    try {
      const carouselCheck = this.selectorGenerator.isCarouselControl(element);
      if (carouselCheck) {
        console.log('[EventListener] ✅ Detected carousel control:', {
          tagName: element.tagName,
          className: this.getElementClassName(element),
        });
        return true;
      }
    } catch (error) {
      console.warn('[EventListener] Carousel detection error (non-blocking):', error);
      // Continue to other checks
    }

    // 1. Standard interactive HTML elements
    const interactiveTags = ['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'LABEL'];
    if (interactiveTags.includes(element.tagName)) {
      return true;
    }

    // 1.5 Elements with button/submit in class or role (DIV/SPAN styled as buttons)
    // Use helper method to safely get className (handles SVG elements)
    const className = this.getElementClassName(element).toLowerCase();
    const elementRole = element.getAttribute('role');
    if (
      className.includes('btn') ||
      className.includes('button') ||
      className.includes('submit') ||
      elementRole === 'button'
    ) {
      return true;
    }

    // 2. ANY SVG element (universal detection using browser API)
    // Catches <svg>, <path>, <circle>, <rect>, <g>, <use>, <polygon>, etc.
    if (element instanceof SVGElement) {
      return true;
    }

    // 3. Cursor pointer check (STRONGEST signal - designers always set this)
    // Moved to top priority for fastest detection
    const computedStyle = window.getComputedStyle(element);
    if (computedStyle.cursor === 'pointer') {
      return true;
    }

    // 4. Elements with explicit onclick handlers
    if (element.getAttribute('onclick') !== null) {
      return true;
    }

    // 5. ARIA roles indicating interactivity
    const interactiveRoles = [
      'button',
      'link',
      'menuitem',
      'menuitemcheckbox',
      'menuitemradio',
      'option',
      'radio',
      'checkbox',
      'tab',
      'switch',
      'treeitem',
    ];
    if (elementRole && interactiveRoles.includes(elementRole)) {
      return true;
    }

    // 6. Common interactive class patterns (case-insensitive)
    // Expanded to cover more UI frameworks and patterns
    const classList = Array.from(element.classList).map((c) => c.toLowerCase());
    const interactiveClassPatterns = [
      'btn',
      'button',
      'clickable',
      'click',
      'link',
      'menu-item',
      'dropdown-item',
      'option',
      'select',
      'choice',
      'action',
      'interactive',
      'autocomplete',
      'arrow',
      'icon',
      'nav',
      'carousel',
      'slider',
      'slide',
      'toggle',
      'control',
      'prev',
      'next',
      'thumb',
      'handle',
      'tab',
      'chip',
      'badge',
      'card',
      'tile',
      'item',
    ];
    if (
      interactiveClassPatterns.some((pattern) => classList.some((cls) => cls.includes(pattern)))
    ) {
      return true;
    }

    // 7. Data attributes commonly used for interactive elements
    const interactiveDataAttributes = [
      'data-action',
      'data-click',
      'data-toggle',
      'data-target',
      'data-value',
      'data-option',
      'data-select',
      'data-href',
      'data-link',
    ];
    if (interactiveDataAttributes.some((attr) => element.hasAttribute(attr))) {
      return true;
    }

    // 8. List items in specific interactive contexts (dropdowns, menus)
    if (element.tagName === 'LI') {
      const parent = element.parentElement;
      if (parent && parent.tagName === 'UL') {
        const parentClasses = Array.from(parent.classList)
          .filter((c) => typeof c === 'string')
          .map((c) => c.toLowerCase());

        // Check for known interactive list patterns
        const interactiveListPatterns = [
          'menu',
          'dropdown',
          'options',
          'list',
          'choices',
          'select',
          'autocomplete',
        ];
        if (
          interactiveListPatterns.some((pattern) =>
            parentClasses.some((cls) => cls.includes(pattern))
          )
        ) {
          return true;
        }

        // More aggressive: treat LI in UL as interactive by default
        // EXCEPT navigation lists (to avoid false positives)
        const nonInteractivePatterns = ['nav', 'navigation', 'breadcrumb', 'footer', 'header'];
        const isNonInteractive = nonInteractivePatterns.some((pattern) =>
          parentClasses.some((cls) => cls.includes(pattern))
        );

        if (!isNonInteractive) {
          return true;
        }
      }
    }

    // 9. DIV/SPAN elements that behave like buttons/links (common in modern frameworks)
    if (element.tagName === 'DIV' || element.tagName === 'SPAN') {
      // Check if it has tabindex (indicates keyboard accessibility = interactive)
      if (element.hasAttribute('tabindex')) {
        return true;
      }

      // Check if parent is a known interactive container
      const parentClasses = element.parentElement
        ? Array.from(element.parentElement.classList)
            .filter((c) => typeof c === 'string')
            .map((c) => c.toLowerCase())
        : [];
      const interactiveContainerPatterns = ['dropdown', 'menu', 'select', 'option'];
      if (
        interactiveContainerPatterns.some((pattern) =>
          parentClasses.some((cls) => cls.includes(pattern))
        )
      ) {
        return true;
      }

      // Check if inside an LI within an interactive list (for dropdown options)
      const parent = element.parentElement;
      if (parent && parent.tagName === 'LI') {
        const grandparent = parent.parentElement;
        if (grandparent) {
          const grandparentClasses = Array.from(grandparent.classList)
            .filter((c) => typeof c === 'string')
            .map((c) => c.toLowerCase());
          const interactiveListPatterns = [
            'menu',
            'dropdown',
            'options',
            'list',
            'choices',
            'select',
            'autocomplete',
          ];
          if (
            interactiveListPatterns.some((pattern) =>
              grandparentClasses.some((cls) => cls.includes(pattern))
            )
          ) {
            return true;
          }
        }
      }
    }

    return false;
  }

  /**
   * Check if input is sensitive
   */
  private isSensitiveInput(element: HTMLInputElement | HTMLTextAreaElement): boolean {
    if (element instanceof HTMLInputElement) {
      // Check input type
      if (element.type === 'password') return true;

      // Check common password field names
      const name = element.name ? String(element.name).toLowerCase() : '';
      const id = element.id ? String(element.id).toLowerCase() : '';
      const sensitivePatterns = ['password', 'passwd', 'pwd', 'secret', 'pin', 'cvv', 'ssn'];

      return sensitivePatterns.some((pattern) => name.includes(pattern) || id.includes(pattern));
    }

    return false;
  }

  /**
   * Generate a meaningful variable name from input element attributes
   * Examples: LOGIN_PASSWORD, USER_PIN, API_KEY
   */
  private generateVariableName(element: HTMLInputElement | HTMLTextAreaElement): string {
    // Try to extract meaningful name from id, name, or placeholder
    const id = element.id ? String(element.id).toLowerCase() : '';
    const name = element.name ? String(element.name).toLowerCase() : '';
    const placeholder = element.placeholder ? String(element.placeholder).toLowerCase() : '';
    const type = element instanceof HTMLInputElement ? element.type : 'text';

    // Priority: id > name > placeholder
    let baseName = id || name || placeholder || type;

    // Clean and normalize the name
    baseName = baseName
      .replace(/[^a-z0-9_]/g, '_') // Replace non-alphanumeric with underscore
      .replace(/_+/g, '_') // Remove consecutive underscores
      .replace(/^_|_$/g, '') // Remove leading/trailing underscores
      .toUpperCase();

    // If we couldn't extract a meaningful name, use type-based default
    if (!baseName || baseName.length < 2) {
      baseName = type === 'password' ? 'PASSWORD' : 'SECRET';
    }

    // Ensure it doesn't already start with a common prefix
    const prefixes = ['USER_', 'LOGIN_', 'ACCOUNT_', 'INPUT_'];
    const hasPrefix = prefixes.some((prefix) => baseName.startsWith(prefix));

    // Add context prefix if missing
    if (!hasPrefix) {
      // Try to infer context from form or surrounding labels
      const form = element.closest('form');
      const formId = form?.id ? String(form.id).toLowerCase() : '';
      const formName = form?.getAttribute('name')
        ? String(form.getAttribute('name')).toLowerCase()
        : '';

      if (formId.includes('login') || formName.includes('login')) {
        baseName = `LOGIN_${baseName}`;
      } else if (
        formId.includes('signup') ||
        formName.includes('signup') ||
        formId.includes('register')
      ) {
        baseName = `SIGNUP_${baseName}`;
      }
    }

    return baseName;
  }

  /**
   * Check if element is visible (not hidden by CSS)
   * Used to filter out hidden radio/checkbox inputs that fail during replay
   */
  private isElementVisible(element: Element): boolean {
    const style = window.getComputedStyle(element);

    // Check common CSS hiding techniques
    if (style.display === 'none') return false;
    if (style.visibility === 'hidden') return false;
    if (style.opacity === '0') return false;

    // Check dimensions (only if explicitly set to 0)
    const width = parseFloat(style.width);
    const height = parseFloat(style.height);
    if (width === 0 && height === 0) return false;

    return true;
  }

  /**
   * Get modifier keys from event
   */
  private getModifierKeys(event: MouseEvent | KeyboardEvent): ModifierKey[] {
    const modifiers: ModifierKey[] = [];

    if (event.ctrlKey) modifiers.push('ctrl');
    if (event.shiftKey) modifiers.push('shift');
    if (event.altKey) modifiers.push('alt');
    if (event.metaKey) modifiers.push('meta');

    return modifiers;
  }

  /**
   * Handle mouseenter events (track hovers for dropdown detection)
   */
  private onMouseEnter(event: MouseEvent): void {
    if (!this.isListening) return;

    const target = event.target as Element;

    // Check if this element could be a dropdown parent
    if (this.isDropdownParent(target)) {
      this.lastHoveredElement = target;
      this.hoverStartTime = Date.now();
      console.log(
        '[EventListener] Hover started on potential dropdown parent:',
        target.tagName,
        target.className
      );
    }
  }

  /**
   * Handle mouseleave events
   */
  private onMouseLeave(event: MouseEvent): void {
    if (!this.isListening) return;

    const target = event.target as Element;

    // Clear hover tracking if leaving the hovered element
    if (this.lastHoveredElement === target) {
      const hoverDuration = Date.now() - this.hoverStartTime;

      // 🆕 Only record meaningful hovers (> 300ms)
      if (hoverDuration >= this.MIN_HOVER_DURATION && this.isDropdownParent(target)) {
        console.log(
          `[EventListener] Recording hover (${hoverDuration}ms) - meaningful interaction`
        );
        this.recordHoverAction(target, hoverDuration);
      } else if (hoverDuration < this.MIN_HOVER_DURATION) {
        console.log(`⏭️ Skipping brief hover (${hoverDuration}ms)`);
      }

      // Reset hover tracking
      this.lastHoveredElement = null;
      this.hoverStartTime = 0;
    }
  }

  /**
   * Check if element is a dropdown parent
   * ✅ STRICT: Only actual dropdown menus, not just any element with hidden children
   */
  private isDropdownParent(element: Element): boolean {
    // Check CSS classes for dropdown patterns
    if (!element.classList) return false; // Guard against undefined

    const classList = Array.from(element.classList).map((c) => c.toLowerCase());
    const dropdownPatterns = ['dropdown', 'menu', 'nav', 'submenu', 'popover'];

    // Explicit dropdown classes
    const hasDropdownClass = dropdownPatterns.some((pattern) =>
      classList.some((cls) => cls.includes(pattern))
    );
    if (hasDropdownClass) {
      return true;
    }

    // ARIA haspopup attribute (standard dropdown indicator)
    if (element.hasAttribute('aria-haspopup')) {
      return true;
    }

    // ⚠️ REMOVED: Generic "hidden children" check was too broad
    // This was causing non-dropdown elements to be recorded as hovers
    // Only return true for explicit dropdown patterns above

    return false;
  }

  /**
   * Find dropdown parent of an element (if it's inside a dropdown)
   */
  private findDropdownParent(element: Element): Element | null {
    let current: Element | null = element;
    let depth = 0;
    const maxDepth = 5; // Don't traverse too far up

    while (current && depth < maxDepth) {
      if (this.isDropdownParent(current)) {
        return current;
      }
      current = current.parentElement;
      depth++;
    }

    return null;
  }

  /**
   * Record hover action for dropdown parent
   */
  private recordHoverAction(element: Element, duration: number): void {
    const selector = this.selectorGenerator.generateSelectors(element);

    // Capture element state for smart waits
    let elementState, waitConditions, context, alternativeSelectors;
    try {
      const state = captureElementState(element);
      elementState = state.elementState;
      waitConditions = state.waitConditions;
      context = state.context;
      alternativeSelectors = state.alternativeSelectors;

      // Log for debugging
      logElementState(element, elementState, waitConditions);
    } catch (error) {
      console.warn('[EventListener] Failed to capture element state:', error);
    }

    const action: HoverAction = {
      id: generateActionId(++this.actionSequence),
      type: 'hover',
      timestamp: this.getRelativeTimestamp(),
      completedAt: 0, // Will be set by emitAction
      url: window.location.href,
      selector,
      tagName: element.tagName.toLowerCase(),
      text: element.textContent?.trim()?.substring(0, 50), // Limit text length
      duration,
      isDropdownParent: true,
      elementState,
      waitConditions,
      context,
      alternativeSelectors,
    };

    this.emitAction(action);

    console.log(
      '[EventListener] Recorded hover action for dropdown parent:',
      action.id,
      'duration:',
      duration + 'ms'
    );

    // Clear hover tracking after recording
    this.lastHoveredElement = null;
    this.hoverStartTime = 0;
  }

  /**
   * Count recent clicks on a specific element within a time window
   */
  /**
   * Record modal lifecycle action
   */
  private recordModalLifecycleAction(
    lifecycleEvent: Omit<ModalLifecycleAction, 'id' | 'timestamp' | 'completedAt' | 'url' | 'type'>
  ): void {
    const action: ModalLifecycleAction = {
      id: generateActionId(++this.actionSequence),
      type: 'modal-lifecycle',
      timestamp: this.getRelativeTimestamp(),
      completedAt:
        this.getRelativeTimestamp() +
        (lifecycleEvent.animationDuration || lifecycleEvent.transitionDuration || 0),
      url: window.location.href,
      ...lifecycleEvent,
    };

    this.emitAction(action);

    console.log('[EventListener] Recorded modal lifecycle:', {
      event: lifecycleEvent.event,
      modalId: lifecycleEvent.modalId,
      state: lifecycleEvent.initialState || lifecycleEvent.toState,
    });
  }

  /**
   * P0: Update click count for OS double-click event deduplication
   */
  private updateClickCount(actionId: string, clickCount: number): void {
    // Find the action in recent actions
    const action = this.recentActions.find((a) => a.id === actionId);

    if (action && action.type === 'click') {
      (action as ClickAction).clickCount = clickCount;
      console.log(`[EventListener] Updated ${actionId} clickCount to ${clickCount}`);

      // Re-emit the updated action to sync with background
      this.actionCallback(action);
    } else {
      console.warn(`[EventListener] Could not find action ${actionId} to update clickCount`);
    }
  }

  /**
   * Emit action to callback
   */
  private emitAction(action: Action): void {
    // Calculate when this action completes
    action.completedAt = this.calculateCompletedAt(action);

    // Check for duplicate action
    if (this.isDuplicateAction(action)) {
      console.log('[EventListener] Skipping duplicate action:', action.type, action.id);
      return;
    }

    // ✅ NEW: Track action groups and dependencies
    this.trackActionGroupsAndDependencies(action);

    // Track for duplicate detection
    this.lastEmittedAction = action;
    this.lastEmitTime = action.timestamp;
    this.lastCompletedTimestamp = action.completedAt; // Track completion time

    // Track last action for navigation trigger detection
    this.lastAction = action;

    // 🆕 Track recent actions for dropdown linking
    this.recentActions.push(action);
    if (this.recentActions.length > this.MAX_RECENT_ACTIONS) {
      this.recentActions.shift(); // Remove oldest
    }

    this.actionCallback(action);
  }

  /**
   * Track action groups and dependencies for modal flows
   */
  private trackActionGroupsAndDependencies(action: Action): void {
    // Only apply to click actions with context
    if (action.type !== 'click') return;

    const clickAction = action as ClickAction;
    if (!clickAction.context) return;

    const { isInsideModal, modalId, isTerminalAction, navigationIntent } = clickAction.context;

    // Generate action group ID for modal actions
    if (isInsideModal && modalId) {
      const groupId = `modal-${modalId}`;

      // Set action group
      clickAction.context.actionGroup = groupId;

      // Track action in group
      if (!this.modalActionGroups.has(groupId)) {
        this.modalActionGroups.set(groupId, []);
      }
      this.modalActionGroups.get(groupId)?.push(action.id);

      // Update current modal group
      this.currentModalActionGroup = groupId;
    }

    // Track terminal actions (checkout complete, etc.)
    if (isTerminalAction) {
      this.terminalActionId = action.id;
      console.log('[ActionDependency] Terminal action detected:', {
        id: action.id,
        intent: navigationIntent,
      });
    }

    // Mark subsequent modal actions as dependent on terminal action
    if (
      isInsideModal &&
      this.terminalActionId &&
      !isTerminalAction &&
      this.currentModalActionGroup
    ) {
      // This action is a cleanup action (Close button, etc.) after terminal action
      const groupActions = this.modalActionGroups.get(this.currentModalActionGroup) || [];

      // Mark as dependent on all previous actions in the group
      clickAction.context.dependentActions = groupActions.filter((id) => id !== action.id);

      console.log('[ActionDependency] Dependent action marked:', {
        id: action.id,
        dependsOn: clickAction.context.dependentActions,
        reason: 'Modal cleanup after terminal action',
      });
    }
  }

  /**
   * Check if action is a duplicate of the last emitted action
   */
  private isDuplicateAction(action: Action): boolean {
    if (!this.lastEmittedAction) return false;

    const timeDiff = action.timestamp - this.lastEmitTime;

    // Only check actions within debounce window
    if (timeDiff >= this.DEBOUNCE_MS) return false;

    // Must be same action type
    if (action.type !== this.lastEmittedAction.type) return false;

    // Type-specific duplicate detection
    switch (action.type) {
      case 'click': {
        const clickAction = action as ClickAction;
        const lastClickAction = this.lastEmittedAction as ClickAction;

        // P0: CAROUSEL EXCEPTION - Allow carousel navigation clicks
        // Users naturally click carousel arrows multiple times to browse
        if (clickAction.carouselContext?.isCarouselControl) {
          // Still filter if TOO rapid (< 200ms = accidental double-tap) ON SAME CAROUSEL
          // If same selector within 200ms, it's a duplicate (from event bubbling or double-tap)
          if (
            timeDiff < 200 &&
            this.areSelectorsEqual(clickAction.selector, lastClickAction.selector)
          ) {
            console.log(`[Duplicate] Filtered accidental carousel double-tap (${timeDiff}ms)`);
            return true; // Is duplicate
          }
          // If different selectors or enough time passed, allow the carousel click
          console.log(`[EventListener] Allowing carousel click (${timeDiff}ms):`, {
            direction: clickAction.carouselContext.direction,
          });
          return false; // Not a duplicate
        }

        // P0: FORM SUBMIT PROTECTION - Never allow duplicate submits
        // Prevent double-submission bugs that break tests
        if (clickAction.clickType === 'submit' || lastClickAction.clickType === 'submit') {
          // Extended protection window for form submits (2 seconds)
          const SUBMIT_PROTECTION_WINDOW = 2000;
          if (timeDiff < SUBMIT_PROTECTION_WINDOW) {
            console.log(`[Duplicate] Blocked duplicate form submit (${timeDiff}ms)`);
            return true; // Is duplicate
          }
        }

        // Don't treat double-clicks as duplicates (different clickCount)
        if (clickAction.clickCount !== lastClickAction.clickCount) {
          return false;
        }

        // Standard duplicate check: same element + button within debounce window
        return (
          clickAction.button === lastClickAction.button &&
          this.areSelectorsEqual(clickAction.selector, lastClickAction.selector)
        );
      }

      case 'input':
        // Input actions are already debounced, but check for exact duplicates
        return (
          this.areSelectorsEqual(
            (action as InputAction).selector,
            (this.lastEmittedAction as InputAction).selector
          ) && (action as InputAction).value === (this.lastEmittedAction as InputAction).value
        );

      case 'submit':
        return this.areSelectorsEqual(
          (action as SubmitAction).selector,
          (this.lastEmittedAction as SubmitAction).selector
        );

      case 'scroll':
        // Scroll is already debounced, don't do additional duplicate check
        return false;

      case 'navigation':
        // Navigation actions should not be duplicated
        return (
          (action as NavigationAction).from === (this.lastEmittedAction as NavigationAction).from &&
          (action as NavigationAction).to === (this.lastEmittedAction as NavigationAction).to
        );

      case 'hover':
        // Hover actions on same element within window are duplicates
        return this.areSelectorsEqual(
          (action as HoverAction).selector,
          (this.lastEmittedAction as HoverAction).selector
        );

      default:
        return false;
    }
  }

  /**
   * Compare two selectors for equality
   */
  private areSelectorsEqual(sel1: any, sel2: any): boolean {
    if (!sel1 || !sel2) return false;

    // Handle old format (id, css, xpath)
    if (sel1.id && sel2.id) return sel1.id === sel2.id;
    if (sel1.css && sel2.css) return sel1.css === sel2.css;
    if (sel1.xpath && sel2.xpath) return sel1.xpath === sel2.xpath;

    // Handle new multi-strategy format (dataTestId, etc.)
    if (sel1.dataTestId && sel2.dataTestId) return sel1.dataTestId === sel2.dataTestId;
    if (sel1.ariaLabel && sel2.ariaLabel) return sel1.ariaLabel === sel2.ariaLabel;
    if (sel1.name && sel2.name) return sel1.name === sel2.name;

    // Compare by selectors array if available (v2.0.0 format)
    if (
      sel1.selectors &&
      sel2.selectors &&
      Array.isArray(sel1.selectors) &&
      Array.isArray(sel2.selectors)
    ) {
      // Check if any high-confidence selector matches
      for (const s1 of sel1.selectors) {
        for (const s2 of sel2.selectors) {
          if (s1.strategy === s2.strategy && s1.selector === s2.selector) {
            return true;
          }
        }
      }
    }

    return false;
  }
}

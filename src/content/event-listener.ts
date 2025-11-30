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
  ModifierKey,
} from '@/types';
import { generateActionId } from '@/types';
import { SelectorGenerator } from './selector-generator';

/**
 * EventListener - Captures user interactions on the page
 * Implements smart filtering and debouncing for reliable recording
 */
export class EventListener {
  private isListening = false;
  private selectorGenerator: SelectorGenerator;
  private actionCallback: (action: Action) => void;
  private actionSequence = 0;
  private inputDebounceTimer: NodeJS.Timeout | null = null;
  private scrollDebounceTimer: NodeJS.Timeout | null = null;
  private lastClickTarget: Element | null = null;
  private lastClickTime = 0;
  private pendingInputElement: HTMLInputElement | HTMLTextAreaElement | null = null;
  private typingStartTime = 0;
  private keyCount = 0;
  private previousUrl: string = window.location.href; // Track previous URL for back/forward detection
  private lastAction: Action | null = null; // Track last action for navigation trigger detection
  private lastHoveredElement: Element | null = null; // Track hovered element for dropdown detection
  private hoverStartTime = 0; // Track when hover started
  private lastEmittedAction: Action | null = null; // Track last emitted action for duplicate prevention
  private lastEmitTime = 0; // Track when last action was emitted
  private lastCompletedTimestamp = 0; // Track when last action completed
  private readonly DEBOUNCE_MS = 500; // Duplicate detection threshold
  private recordingStartTime: number = 0; // Track recording start time for relative timestamps

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

  constructor(actionCallback: (action: Action) => void) {
    this.actionCallback = actionCallback;
    this.selectorGenerator = new SelectorGenerator();

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
   */
  private getRelativeTimestamp(): number {
    if (this.recordingStartTime === 0) {
      // Fallback to absolute timestamp if start time not set
      return Date.now();
    }
    const now = Date.now() - this.recordingStartTime;
    // Ensure action doesn't start before previous action completed
    return Math.max(now, this.lastCompletedTimestamp);
  }

  /**
   * Calculate when action completes based on action type
   */
  private calculateCompletedAt(action: Action): number {
    switch (action.type) {
      case 'hover': {
        // Hover completes after its duration
        const hoverAction = action as HoverAction;
        return action.timestamp + (hoverAction.duration || 0);
      }

      case 'input': {
        // Input completes after typing all characters
        const inputAction = action as InputAction;
        const typingTime = inputAction.value.length * (inputAction.typingDelay || 100);
        return action.timestamp + typingTime;
      }

      case 'scroll': {
        // Scroll has animation duration based on distance
        const scrollAction = action as ScrollAction;
        if (typeof scrollAction.element === 'string' && scrollAction.element === 'window') {
          // Estimate scroll animation time (200-800ms based on distance)
          const scrollDistance = Math.abs(scrollAction.scrollY);
          const scrollDuration = Math.min(800, Math.max(200, scrollDistance / 3));
          return action.timestamp + scrollDuration;
        }
        // Element scrolls are typically faster
        return action.timestamp + 200;
      }

      case 'click': {
        // Clicks have brief animation/feedback time
        return action.timestamp + 50;
      }

      case 'select': {
        // Dropdown selection has brief animation
        return action.timestamp + 100;
      }

      case 'keypress': {
        // Key presses are instant
        return action.timestamp;
      }

      case 'submit': {
        // Form submit triggers navigation, instant action itself
        return action.timestamp + 50;
      }

      case 'navigation': {
        // Navigation completes after its duration
        const navAction = action as NavigationAction;
        return action.timestamp + (navAction.duration || 0);
      }

      case 'checkpoint': {
        // Checkpoints are instant
        return action.timestamp;
      }

      default: {
        // Exhaustive check - should never reach here
        const _exhaustiveCheck: never = action;
        return (_exhaustiveCheck as Action).timestamp;
      }
    }
  }

  /**
   * Start listening to events
   */
  public start(): void {
    if (this.isListening) return;

    this.isListening = true;
    this.attachEventListeners();
  }

  /**
   * Stop listening to events
   */
  public stop(): void {
    if (!this.isListening) return;

    this.isListening = false;
    this.removeEventListeners();
  }

  /**
   * Cleanup and remove all listeners
   */
  public destroy(): void {
    this.stop();
    if (this.inputDebounceTimer) clearTimeout(this.inputDebounceTimer);
    if (this.scrollDebounceTimer) clearTimeout(this.scrollDebounceTimer);
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
  }

  /**
   * Handle click events
   */
  private onClick(event: MouseEvent): void {
    if (!this.isListening) return;

    const clickedElement = event.target as Element;

    // Find the interactive element (could be the target or a parent)
    const target = this.findInteractiveElement(clickedElement);
    if (!target) return;

    // Skip hidden radio/checkbox inputs - they're typically clicked via labels
    // Recording them causes "Element is not visible" errors during replay
    if (
      target instanceof HTMLInputElement &&
      (target.type === 'radio' || target.type === 'checkbox') &&
      !this.isElementVisible(target)
    ) {
      return;
    }

    // Check for double-click
    const now = Date.now();
    const isDoubleClick = target === this.lastClickTarget && now - this.lastClickTime < 500;

    this.lastClickTarget = target;
    this.lastClickTime = now;

    // Skip if this is part of a double-click (handled by dblclick event)
    if (isDoubleClick) return;

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

    if (willNavigate) {
      // Prevent default temporarily to ensure action is captured
      event.preventDefault();
      event.stopPropagation();

      const action = this.createClickAction(event, target, 1);
      this.emitAction(action);

      // Update previous URL before navigation happens
      this.previousUrl = window.location.href;

      // Wait a bit for sync to complete, then trigger navigation
      setTimeout(() => {
        if (target instanceof HTMLElement) {
          target.click();
        }
      }, 50);
    } else {
      const action = this.createClickAction(event, target, 1);
      this.emitAction(action);
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
    const action = this.createClickAction(event, target, 1);
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

    const action = this.createClickAction(event, target, 2);
    this.emitAction(action);
  }

  /**
   * Create click action
   */
  private createClickAction(event: MouseEvent, target: Element, clickCount: number): ClickAction {
    const selector = this.selectorGenerator.generateSelectors(target);
    const rect = target.getBoundingClientRect();

    // Calculate coordinates relative to element
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    const button = event.button === 0 ? 'left' : event.button === 1 ? 'middle' : 'right';
    const modifiers = this.getModifierKeys(event);

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
    };
  }

  /**
   * Handle input events (debounced)
   */
  private onInput(event: Event): void {
    if (!this.isListening) return;

    const target = event.target as HTMLInputElement | HTMLTextAreaElement;
    if (!target || (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA')) return;

    // Track typing timing
    const now = Date.now();
    if (!this.typingStartTime) {
      this.typingStartTime = now;
      this.keyCount = 0;
    }
    this.keyCount++;

    // Clear previous debounce timer
    if (this.inputDebounceTimer) {
      clearTimeout(this.inputDebounceTimer);
    }

    this.pendingInputElement = target;

    // Debounce input events
    this.inputDebounceTimer = setTimeout(() => {
      if (this.pendingInputElement) {
        this.captureInputAction(this.pendingInputElement);
        this.pendingInputElement = null;
        this.typingStartTime = 0;
        this.keyCount = 0;
      }
    }, 500); // 500ms debounce
  }

  /**
   * Capture input action
   */
  private captureInputAction(target: HTMLInputElement | HTMLTextAreaElement): void {
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

    // Calculate average typing delay
    const typingDuration = Date.now() - this.typingStartTime;
    const typingDelay = this.keyCount > 1 ? Math.round(typingDuration / this.keyCount) : 50;

    const action: InputAction = {
      id: generateActionId(++this.actionSequence),
      type: 'input',
      timestamp: this.getRelativeTimestamp(),
      completedAt: 0, // Will be set by emitAction
      url: window.location.href,
      selector,
      tagName: target.tagName.toLowerCase(),
      value: isSensitive ? '***MASKED***' : target.value,
      inputType: (target as HTMLInputElement).type || 'text',
      isSensitive,
      simulationType: 'type',
      typingDelay,
    };

    this.emitAction(action);
  }

  /**
   * Handle change events (for select, checkbox, radio)
   */
  private onChange(event: Event): void {
    if (!this.isListening) return;

    const target = event.target as HTMLElement;

    if (target instanceof HTMLSelectElement) {
      this.captureSelectAction(target);
    }
  }

  /**
   * Capture select action
   */
  private captureSelectAction(target: HTMLSelectElement): void {
    const selector = this.selectorGenerator.generateSelectors(target);
    const selectedOption = target.options[target.selectedIndex];

    const action: SelectAction = {
      id: generateActionId(++this.actionSequence),
      type: 'select',
      timestamp: this.getRelativeTimestamp(),
      completedAt: 0, // Will be set by emitAction
      url: window.location.href,
      selector,
      tagName: 'select',
      selectedValue: target.value,
      selectedText: selectedOption?.textContent?.trim() || '',
      selectedIndex: target.selectedIndex,
    };

    this.emitAction(action);
  }

  /**
   * Handle form submit events
   */
  private onSubmit(event: Event): void {
    if (!this.isListening) return;

    const target = event.target as HTMLFormElement;
    if (!target || target.tagName !== 'FORM') return;

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

    // Check if it's a submit button
    if (element.tagName === 'BUTTON') {
      const button = element as HTMLButtonElement;
      if (button.type === 'submit' || !button.type) {
        return true;
      }
    }

    // Check if it's a submit input
    if (element.tagName === 'INPUT') {
      const input = element as HTMLInputElement;
      if (input.type === 'submit') {
        return true;
      }
    }

    return false;
  }

  /**
   * Find the closest interactive element by traversing up the DOM tree
   */
  private findInteractiveElement(element: Element): Element | null {
    let current: Element | null = element;

    // Traverse up the DOM tree until we find an interactive element or reach body
    while (current && current !== document.body) {
      // Skip the recording indicator
      if (
        current.id === 'saveaction-recording-indicator' ||
        current.closest('#saveaction-recording-indicator')
      ) {
        return null;
      }

      if (this.isInteractiveElement(current)) {
        return current;
      }

      current = current.parentElement;
    }

    return null;
  }

  /**
   * Check if element is interactive
   * Comprehensive detection covering 99% of real-world scenarios
   */
  private isInteractiveElement(element: Element): boolean {
    // 1. Standard interactive HTML elements
    const interactiveTags = ['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'LABEL'];
    if (interactiveTags.includes(element.tagName)) {
      return true;
    }

    // 2. Elements with explicit onclick handlers
    if (element.getAttribute('onclick') !== null) {
      return true;
    }

    // 3. ARIA roles indicating interactivity
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
    const role = element.getAttribute('role');
    if (role && interactiveRoles.includes(role)) {
      return true;
    }

    // 4. Common interactive class patterns (case-insensitive)
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
    ];
    if (
      interactiveClassPatterns.some((pattern) => classList.some((cls) => cls.includes(pattern)))
    ) {
      return true;
    }

    // 5. Data attributes commonly used for interactive elements
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

    // 6. Elements with cursor: pointer (strong indicator of interactivity)
    const computedStyle = window.getComputedStyle(element);
    if (computedStyle.cursor === 'pointer') {
      return true;
    }

    // 7. List items in specific interactive contexts (dropdowns, menus)
    if (element.tagName === 'LI') {
      const parent = element.parentElement;
      if (parent && parent.tagName === 'UL') {
        const parentClasses = Array.from(parent.classList).map((c) => c.toLowerCase());

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

    // 8. DIV/SPAN elements that behave like buttons/links (common in modern frameworks)
    if (element.tagName === 'DIV' || element.tagName === 'SPAN') {
      // Check if it has tabindex (indicates keyboard accessibility = interactive)
      if (element.hasAttribute('tabindex')) {
        return true;
      }

      // Check if parent is a known interactive container
      const parentClasses = element.parentElement
        ? Array.from(element.parentElement.classList).map((c) => c.toLowerCase())
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
          const grandparentClasses = Array.from(grandparent.classList).map((c) => c.toLowerCase());
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
      const name = element.name?.toLowerCase() || '';
      const id = element.id?.toLowerCase() || '';
      const sensitivePatterns = ['password', 'passwd', 'pwd', 'secret', 'pin', 'cvv', 'ssn'];

      return sensitivePatterns.some((pattern) => name.includes(pattern) || id.includes(pattern));
    }

    return false;
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
      // Don't clear immediately - might be moving to child element
      // Let onClick handle the hover recording if needed
    }
  }

  /**
   * Check if element is a dropdown parent
   */
  private isDropdownParent(element: Element): boolean {
    // Check CSS classes for dropdown patterns
    if (!element.classList) return false; // Guard against undefined

    const classList = Array.from(element.classList).map((c) => c.toLowerCase());
    const dropdownPatterns = ['dropdown', 'menu', 'nav', 'submenu', 'popover'];

    if (dropdownPatterns.some((pattern) => classList.some((cls) => cls.includes(pattern)))) {
      return true;
    }

    // Check aria attributes
    if (element.hasAttribute('aria-haspopup')) {
      return true;
    }

    // Check if element has children that might be hidden (dropdown items)
    const hasHiddenChildren = Array.from(element.children).some((child) => {
      const style = window.getComputedStyle(child);
      return style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0';
    });

    if (hasHiddenChildren) {
      return true;
    }

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

    // Track for duplicate detection
    this.lastEmittedAction = action;
    this.lastEmitTime = action.timestamp;
    this.lastCompletedTimestamp = action.completedAt; // Track completion time

    // Track last action for navigation trigger detection
    this.lastAction = action;
    this.actionCallback(action);
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

        // Don't treat double-clicks as duplicates
        if (clickAction.clickCount !== lastClickAction.clickCount) {
          return false;
        }

        // Check selector and button match
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

    // Compare primary selectors (id, css, xpath)
    if (sel1.id && sel2.id) return sel1.id === sel2.id;
    if (sel1.css && sel2.css) return sel1.css === sel2.css;
    if (sel1.xpath && sel2.xpath) return sel1.xpath === sel2.xpath;

    return false;
  }
}

import type {
  Action,
  ClickAction,
  InputAction,
  SelectAction,
  NavigationAction,
  ScrollAction,
  KeypressAction,
  SubmitAction,
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

    // Check for double-click
    const now = Date.now();
    const isDoubleClick = target === this.lastClickTarget && now - this.lastClickTime < 500;

    this.lastClickTarget = target;
    this.lastClickTime = now;

    // Skip if this is part of a double-click (handled by dblclick event)
    if (isDoubleClick) return;

    // Check if this click might cause navigation
    const willNavigate = this.isNavigationClick(target);

    if (willNavigate) {
      // Prevent default temporarily to ensure action is captured
      event.preventDefault();
      event.stopPropagation();

      const action = this.createClickAction(event, target, 1);
      this.emitAction(action);

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
      timestamp: Date.now(),
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
    const selector = this.selectorGenerator.generateSelectors(target);
    const isSensitive = this.isSensitiveInput(target);

    // Calculate average typing delay
    const typingDuration = Date.now() - this.typingStartTime;
    const typingDelay = this.keyCount > 1 ? Math.round(typingDuration / this.keyCount) : 50;

    const action: InputAction = {
      id: generateActionId(++this.actionSequence),
      type: 'input',
      timestamp: Date.now(),
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
      timestamp: Date.now(),
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
      timestamp: Date.now(),
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
      timestamp: Date.now(),
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
      timestamp: Date.now(),
      url: window.location.href,
      scrollX: window.scrollX,
      scrollY: window.scrollY,
      element: 'window',
    };

    this.emitAction(action);
  }

  /**
   * Handle popstate events (navigation)
   */
  private onPopState(_event: PopStateEvent): void {
    if (!this.isListening) return;

    const action: NavigationAction = {
      id: generateActionId(++this.actionSequence),
      type: 'navigation',
      timestamp: Date.now(),
      url: window.location.href,
      from: document.referrer || window.location.href,
      to: window.location.href,
      navigationTrigger: 'back',
      waitUntil: 'load',
      duration: 0,
    };

    this.emitAction(action);
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
   * Emit action to callback
   */
  private emitAction(action: Action): void {
    this.actionCallback(action);
  }
}

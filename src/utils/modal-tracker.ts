import type { ModalLifecycleAction } from '@/types';

interface BaseValLike {
  baseVal?: unknown;
}

const MODAL_CONTAINER_TAGS = new Set(['DIV', 'DIALOG', 'SECTION', 'ASIDE', 'ARTICLE', 'FORM']);

function getStringValue(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
  }

  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }

  const baseVal =
    typeof value === 'object' && value !== null && 'baseVal' in value
      ? (value as BaseValLike).baseVal
      : undefined;

  if (typeof baseVal === 'string') {
    const trimmed = baseVal.trim();
    return trimmed ? trimmed : undefined;
  }

  return undefined;
}

function getElementIdValue(element: Element): string {
  return (
    getStringValue(element.getAttribute('id')) ||
    getStringValue((element as Element & { id?: unknown }).id) ||
    ''
  );
}

function getElementClassName(element: Element): string {
  return (
    getStringValue(element.getAttribute('class')) ||
    getStringValue((element as Element & { className?: unknown }).className) ||
    ''
  );
}

function isInteractiveControlElement(element: Element): boolean {
  const tagName = element.tagName.toUpperCase();
  const role = element.getAttribute('role');

  if (
    ['A', 'BUTTON', 'INPUT', 'LABEL', 'OPTION', 'SELECT', 'SUMMARY', 'TEXTAREA'].includes(tagName)
  ) {
    return true;
  }

  return !!role && ['button', 'link', 'menuitem', 'option', 'switch', 'tab'].includes(role);
}

function isLikelyModalContainer(element: Element): boolean {
  const role = element.getAttribute('role');
  if (role === 'dialog' || role === 'alertdialog') {
    return true;
  }

  if (MODAL_CONTAINER_TAGS.has(element.tagName.toUpperCase())) {
    return true;
  }

  if (isInteractiveControlElement(element)) {
    return false;
  }

  return element.children.length > 0;
}

function isModalSubsection(text: string): boolean {
  return /(?:^|[\s_-]|__)(close|header|footer)(?:$|[\s_-]|__)/.test(text);
}

function findPreferredContainedModal(element: Element): Element | null {
  const candidates = element.querySelectorAll(
    '[role="dialog"], [role="alertdialog"], .popup__body, [class*="modal-body"], [class*="popup-body"], [class*="dialog-body"], [class*="modal-content"], [class*="dialog-content"], [id*="modal-body"], [id*="popup-body"]'
  );

  for (const candidate of candidates) {
    if (!(candidate instanceof Element) || candidate === element) {
      continue;
    }

    const candidateIdentity =
      `${getElementIdValue(candidate).toLowerCase()} ${getElementClassName(candidate).toLowerCase()}`.trim();
    if (candidateIdentity && isModalSubsection(candidateIdentity)) {
      continue;
    }

    if (isLikelyModalContainer(candidate)) {
      return candidate;
    }
  }

  return null;
}

/**
 * Modal detection and lifecycle tracking utilities
 */

/**
 * Check if an element is a modal/dialog
 */
export function isModal(element: Element): boolean {
  const idValue = getElementIdValue(element);

  // Exclude extension's own UI elements from modal detection
  if (idValue.startsWith('saveaction-')) {
    return false;
  }

  // Check role attribute
  const role = element.getAttribute('role');
  if (role === 'dialog' || role === 'alertdialog') {
    return true;
  }

  const className = getElementClassName(element).toLowerCase();
  const modalIdentity = `${idValue.toLowerCase()} ${className}`.trim();
  if (modalIdentity && isModalSubsection(modalIdentity)) {
    return false;
  }

  const isContainerLike = isLikelyModalContainer(element);
  if (!isContainerLike) {
    return false;
  }

  // Check common modal ID patterns
  const id = idValue.toLowerCase();
  const modalIdPatterns = /modal|dialog|popup|overlay|lightbox/i;
  if (modalIdPatterns.test(id)) {
    return true;
  }

  // Check class names
  const modalClassPatterns = /modal|dialog|popup|overlay|sweet-?alert|swal|lightbox/i;
  if (modalClassPatterns.test(className)) {
    return true;
  }

  // Check for specific modal frameworks
  // Bootstrap modals
  if (element.classList.contains('modal')) {
    return true;
  }

  // Material UI modals
  if (element.hasAttribute('data-mui-portal')) {
    return true;
  }

  // Check for backdrop (common modal pattern)
  const hasBackdrop = element.querySelector('[class*="backdrop"], [class*="overlay"]');
  if (hasBackdrop) {
    // Also check z-index (modals usually have high z-index)
    const zIndex = parseInt(window.getComputedStyle(element).zIndex, 10);
    if (zIndex > 1000) {
      return true;
    }
  }

  // Check z-index alone for high values with modal-like positioning
  // Safety check for window availability (can be undefined during test teardown)
  if (typeof window === 'undefined') {
    return false;
  }

  const style = window.getComputedStyle(element);
  const zIndex = parseInt(style.zIndex, 10);
  const position = style.position;

  if (zIndex > 1000 && (position === 'fixed' || position === 'absolute')) {
    // Check if it covers a significant portion of the screen
    const rect = element.getBoundingClientRect();
    const viewport = {
      width: window.innerWidth,
      height: window.innerHeight,
    };

    const coverageX = rect.width / viewport.width;
    const coverageY = rect.height / viewport.height;

    // Modal-like if covers significant screen space
    if (coverageX > 0.3 && coverageY > 0.3) {
      return true;
    }
  }

  return false;
}

/**
 * Generate unique modal ID from element
 */
export function generateModalId(element: Element): string {
  // Use existing ID if available
  const elementId = getElementIdValue(element);
  if (elementId) {
    return elementId;
  }

  // Generate from class names
  const classes = Array.from(element.classList)
    .filter((cls) => /modal|dialog|popup/i.test(cls))
    .join('-');

  if (classes) {
    return `modal-${classes}`;
  }

  // Fallback: generate a deterministic ID from geometry so repeated lookups
  // within the same modal session stay stable.
  const rect = element.getBoundingClientRect();
  return `modal-${element.tagName.toLowerCase()}-${Math.round(rect.top)}-${Math.round(rect.left)}-${Math.round(rect.width)}x${Math.round(rect.height)}`;
}

/**
 * Detect current state of a modal
 */
export function detectModalState(modalElement: Element): string {
  // Check data attributes for state
  const dataState =
    modalElement.getAttribute('data-state') ||
    modalElement.getAttribute('data-step') ||
    modalElement.getAttribute('data-modal-state') ||
    modalElement.getAttribute('data-phase');

  if (dataState) {
    return dataState;
  }

  // Check for visible sections/panels
  const sections = modalElement.querySelectorAll(
    '[class*="step"], [class*="state"], [class*="panel"], [class*="phase"], [class*="stage"]'
  );

  for (const section of sections) {
    const style = window.getComputedStyle(section);
    if (style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0') {
      // Extract state from class name
      const classList = Array.from(section.classList);
      for (const className of classList) {
        const match = className.match(/(?:step|state|panel|phase|stage)[-_]?(\w+)/i);
        if (match && match[1]) {
          return match[1];
        }
      }

      // Extract from ID
      if (section.id) {
        const idMatch = section.id.match(/(?:step|state|panel|phase|stage)[-_]?(\w+)/i);
        if (idMatch && idMatch[1]) {
          return idMatch[1];
        }
      }
    }
  }

  // Check for active tab/navigation
  const activeTab = modalElement.querySelector('[class*="active"], [aria-selected="true"]');
  if (activeTab) {
    const text = activeTab.textContent?.trim();
    if (text) {
      return text.toLowerCase().replace(/\s+/g, '-');
    }
  }

  // Fallback: check visible content for state indicators
  const visibleContent = Array.from(modalElement.children).find((child) => {
    const style = window.getComputedStyle(child);
    return style.display !== 'none' && style.visibility !== 'hidden';
  });

  if (visibleContent) {
    // Safely get className (handles both HTML and SVG elements)
    const getClassName = (el: Element): string => {
      if (!el.className) return '';
      if (typeof el.className === 'object') {
        return String((el.className as any).baseVal || '');
      }
      return String(el.className || '');
    };

    const classNameStr = getClassName(visibleContent);
    return (
      visibleContent.id || (classNameStr ? classNameStr.split(' ')[0] : 'default') || 'default'
    );
  }

  return 'default';
}

/**
 * Estimate modal animation duration from CSS
 */
export function estimateAnimationDuration(element: Element): number {
  const style = window.getComputedStyle(element);

  // Check transition duration
  const transitionDuration = style.transitionDuration;
  if (transitionDuration && transitionDuration !== '0s') {
    const duration = parseFloat(transitionDuration) * 1000; // Convert to ms
    return Math.round(duration);
  }

  // Check animation duration
  const animationDuration = style.animationDuration;
  if (animationDuration && animationDuration !== '0s') {
    const duration = parseFloat(animationDuration) * 1000;
    return Math.round(duration);
  }

  // Default modal animation duration
  return 300;
}

/**
 * Check if modal is currently visible
 */
export function isModalVisible(element: Element): boolean {
  const style = window.getComputedStyle(element);

  return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
}

/**
 * Find modal containing an element
 */
export function findParentModal(element: Element): Element | null {
  let current: Element | null = element;

  while (current && current !== document.body) {
    const currentIdentity =
      `${getElementIdValue(current).toLowerCase()} ${getElementClassName(current).toLowerCase()}`.trim();
    if (currentIdentity && isModalSubsection(currentIdentity)) {
      const associatedModal = findPreferredContainedModal(current.parentElement || current);
      if (associatedModal) {
        return associatedModal;
      }
    }

    if (isModal(current)) {
      const containedModal = findPreferredContainedModal(current);
      if (containedModal) {
        return containedModal;
      }

      return current;
    }
    current = current.parentElement;
  }

  return null;
}

/**
 * Generate CSS selector for modal element
 */
export function generateModalSelector(element: Element): string {
  const tagName = element.tagName.toLowerCase();
  const elementId = getElementIdValue(element);

  if (elementId) {
    return `${tagName}#${elementId}`;
  }

  const classes = Array.from(element.classList)
    .filter((cls) => /modal|dialog|popup/i.test(cls))
    .slice(0, 2);

  if (classes.length > 0) {
    return `${tagName}.${classes.join('.')}`;
  }

  // Fallback to role
  const role = element.getAttribute('role');
  if (role) {
    return `${tagName}[role="${role}"]`;
  }

  return tagName;
}

/**
 * Modal tracking state manager
 */
export class ModalTracker {
  private trackedModals: Map<string, string> = new Map(); // modalId -> current state
  private modalObserver: MutationObserver | null = null;
  private modalStateObserver: MutationObserver | null = null;

  constructor(
    private onModalLifecycle: (
      event: Omit<ModalLifecycleAction, 'id' | 'timestamp' | 'completedAt' | 'url' | 'type'>
    ) => void
  ) {}

  /**
   * Start tracking modals
   */
  public start(): void {
    console.log('[ModalTracker] 🚀 Started modal tracking');

    // Observer for modal appearance/disappearance
    this.modalObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        // Check added nodes
        for (const node of mutation.addedNodes) {
          if (node.nodeType === 1) {
            const element = node as Element;
            // Stronger check: must be modal AND visible AND not already tracked
            if (isModal(element) && isModalVisible(element)) {
              const modalId = generateModalId(element);
              if (!this.trackedModals.has(modalId)) {
                this.handleModalOpened(element);
              }
            }
          }
        }

        // Check removed nodes
        for (const node of mutation.removedNodes) {
          if (node.nodeType === 1) {
            const element = node as Element;
            const modalId = generateModalId(element);
            // Only handle if we were tracking this modal
            if (isModal(element) && this.trackedModals.has(modalId)) {
              this.handleModalClosed(element);
            }
          }
        }
      }
    });

    this.modalObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });

    // Observer for modal state changes
    this.modalStateObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        const modal = (mutation.target as Element).closest(
          '[id*="modal"], [class*="modal"], [role="dialog"]'
        );

        if (!modal || !isModal(modal)) continue;

        const modalId = generateModalId(modal);
        const currentState = detectModalState(modal);
        const previousState = this.trackedModals.get(modalId);

        if (previousState && currentState !== previousState) {
          this.handleModalStateChanged(modal, previousState, currentState);
        }
      }
    });

    this.modalStateObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ['class', 'data-state', 'data-step', 'style'],
      subtree: true,
    });
  }

  /**
   * Stop tracking modals
   */
  public stop(): void {
    this.modalObserver?.disconnect();
    this.modalStateObserver?.disconnect();
    this.trackedModals.clear();
  }

  /**
   * Handle modal opened event
   */
  private handleModalOpened(element: Element): void {
    const modalId = generateModalId(element);
    const initialState = detectModalState(element);

    this.trackedModals.set(modalId, initialState);

    console.log('[ModalTracker] 🔔 Modal opened:', {
      modalId,
      element: element.tagName,
      className: element.className,
      role: element.getAttribute('role'),
      initialState,
    });

    this.onModalLifecycle({
      event: 'modal-opened',
      modalId,
      modalSelector: generateModalSelector(element),
      initialState,
      animationDuration: estimateAnimationDuration(element),
    });
  }

  /**
   * Handle modal closed event
   */
  private handleModalClosed(element: Element): void {
    const modalId = generateModalId(element);

    console.log('[ModalTracker] ❌ Modal closed:', {
      modalId,
      element: element.tagName,
      className: element.className,
    });

    this.trackedModals.delete(modalId);

    this.onModalLifecycle({
      event: 'modal-closed',
      modalId,
      modalSelector: generateModalSelector(element),
    });
  }

  /**
   * Handle modal state change event
   */
  private handleModalStateChanged(element: Element, fromState: string, toState: string): void {
    const modalId = generateModalId(element);

    console.log('[ModalTracker] 🔄 Modal state changed:', {
      modalId,
      fromState,
      toState,
    });

    this.trackedModals.set(modalId, toState);

    this.onModalLifecycle({
      event: 'modal-state-changed',
      modalId,
      modalSelector: generateModalSelector(element),
      fromState,
      toState,
      transitionDuration: 500, // Estimate
    });
  }
}

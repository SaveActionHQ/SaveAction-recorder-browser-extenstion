import type { SelectorStrategy } from './selectors';

/**
 * Element state captured when user interacts (for smart waits)
 */
export interface ElementState {
  visible?: boolean; // Element is visible in viewport
  enabled?: boolean; // Element is not disabled
  imageComplete?: boolean; // For <img>: image.complete
  imageNaturalWidth?: number; // For <img>: naturalWidth (0 if not loaded)
  imageNaturalHeight?: number; // For <img>: naturalHeight
  inViewport?: boolean; // Element is in current viewport
  opacity?: string; // CSS opacity value
  display?: string; // CSS display value
  zIndex?: string; // CSS z-index value
}

/**
 * Wait conditions detected for platform to wait before executing action
 */
export interface WaitConditions {
  imageLoaded?: boolean; // Wait for image to load
  elementVisible?: boolean; // Wait for element visibility
  elementStable?: boolean; // Wait for position to stabilize
  networkIdle?: boolean; // Wait for network idle
  parentVisible?: boolean; // Wait for parent container to be visible
  modalStateChanged?: boolean; // Wait for modal state transition
}

/**
 * Additional context about the interaction
 */
export interface ActionContext {
  modalId?: string; // ID of modal container if inside modal
  modalState?: string; // Current modal state (e.g., 'order-checkout-status')
  isInsideModal?: boolean; // Element is inside a modal/dialog
  requiresModalState?: boolean; // Runner must wait for this specific modal state
  parentContainer?: string; // CSS selector of parent container
  isLazyLoaded?: boolean; // Element uses lazy loading
  isDropdownItem?: boolean; // Element is a dropdown menu item

  // ✅ NEW: Navigation intent detection (Phase 1 implementation)
  navigationIntent?: NavigationIntent; // Detected navigation intent
  expectedUrlChange?: UrlChangeExpectation; // Expected URL change pattern
  actionGroup?: string; // Group ID for related actions (e.g., 'checkout-modal-1')
  isTerminalAction?: boolean; // True if action completes a flow (checkout, etc.)
  dependentActions?: string[]; // Action IDs that depend on this action's success
}

/**
 * Alternative selector strategies (fallback options)
 */
export interface AlternativeSelector {
  css?: string; // CSS selector
  xpath?: string; // XPath selector
  dataAttribute?: string; // data-* attribute selector
  ariaLabel?: string; // aria-label selector
  text?: string; // Text content selector
  priority: number; // Lower = try first
}

/**
 * Content signature for intelligent element matching in dynamic lists/cards
 */
export interface ContentSignature {
  elementType: 'list-item' | 'card' | 'table-row' | 'grid-item';
  listContainer: {
    selector: string; // Selector for parent container (ul, div.grid, etc.)
    itemSelector: string; // Selector for individual items
  };
  contentFingerprint: {
    heading?: string; // Primary heading/title
    subheading?: string; // Secondary text (location, description)
    imageAlt?: string; // Image alt text
    imageSrc?: string; // Image source URL
    linkHref?: string; // Link destination
    price?: string; // Price/cost if present
    rating?: string; // Rating if present
    buttonText?: string; // Button/CTA text
    dataId?: string; // data-id or similar unique identifier
    [key: string]: string | undefined; // Allow additional properties
  };
  visualHints?: {
    hasImage?: boolean;
    hasButton?: boolean;
    hasLink?: boolean;
    hasPrice?: boolean;
    hasRating?: boolean;
  };
  fallbackPosition: number; // Position in list (0-based)
}

/**
 * Selector with confidence score for intelligent fallback
 */
export interface SelectorWithConfidence {
  strategy: string; // 'data-testid', 'aria-label', 'text-content', etc.
  value: string; // Selector value
  context?: string; // Additional context (parent class, etc.)
  priority: number; // Lower = higher priority (1 = highest)
  confidence: number; // 0-100 confidence score
}

/**
 * Navigation intent detected from button/action
 */
export type NavigationIntent =
  | 'submit-form' // Form submission
  | 'checkout-complete' // Complete purchase/checkout
  | 'close-modal-and-redirect' // Close modal with navigation
  | 'navigate-to-page' // Link/button navigation
  | 'logout' // User logout
  | 'none'; // No navigation expected

/**
 * Expected URL change pattern after action
 */
export interface UrlChangeExpectation {
  type: 'success' | 'redirect' | 'same-page' | 'error';
  patterns: string[]; // URL patterns to match (/account/, /orders/, etc.)
  isSuccessFlow: boolean; // True if this is a successful completion flow
  beforeUrl?: string; // URL before action
  afterUrl?: string; // URL after action (captured post-navigation)
}

/**
 * Base interface for all action types
 */
export interface BaseAction {
  id: string; // Unique action ID (act_xxx)
  type: ActionType;
  timestamp: number; // When action started (ms since recording start)
  completedAt: number; // When action completed (ms since recording start)
  url: string; // Current page URL
  frameId?: string; // iFrame identifier if in frame
  frameUrl?: string; // iFrame URL if in frame
  frameSelector?: string; // Selector to target frame

  // ✅ NEW: Optional metadata for smart waits (backward compatible)
  elementState?: ElementState; // Element state when action recorded
  waitConditions?: WaitConditions; // Conditions to wait for before executing
  context?: ActionContext; // Additional context about interaction
  alternativeSelectors?: AlternativeSelector[]; // Fallback selector strategies

  // ✅ NEW: Content signature for dynamic list items (v2.0.0)
  contentSignature?: ContentSignature; // Semantic content for intelligent matching

  // ✅ NEW: Multi-strategy selectors with confidence (v2.0.0)
  selectors?: SelectorWithConfidence[]; // Prioritized selector strategies
}

/**
 * Click action (left, right, middle, double-click)
 */
export interface ClickAction extends BaseAction {
  type: 'click';
  selector: SelectorStrategy; // Multi-strategy selector object
  tagName: string;
  text?: string; // Button/link text content
  coordinates: { x: number; y: number };
  coordinatesRelativeTo: 'element' | 'viewport' | 'document';
  button: 'left' | 'right' | 'middle';
  clickCount: number; // 1 = single, 2 = double
  modifiers: ModifierKey[]; // ['ctrl', 'shift', 'alt', 'meta']

  // 🆕 Checkbox/Radio support
  clickType?: 'standard' | 'toggle-input' | 'submit'; // Differentiate click types
  inputType?: 'checkbox' | 'radio'; // For toggle-input clicks
  checked?: boolean; // Final state after toggle (for checkbox/radio)
  isProgrammatic?: boolean; // TRUE if change was triggered programmatically (not user click)

  // 🆕 AJAX form detection
  expectsNavigation?: boolean; // TRUE = wait for nav, FALSE = don't wait
  isAjaxForm?: boolean; // TRUE = form submits via AJAX without navigation
  ajaxIndicators?: {
    hasPreventDefault: boolean;
    hasAjaxAttributes: boolean;
    hasFramework: boolean;
  };

  // 🆕 Dropdown state management
  isInDropdown?: boolean; // TRUE if element is inside a dropdown/menu
  requiresParentOpen?: boolean; // TRUE if parent must be opened first
  parentSelector?: SelectorStrategy; // Selector for dropdown container
  parentTrigger?: SelectorStrategy; // Selector for button that opens dropdown
  relatedAction?: string; // ID of action that opened the dropdown (action linking)
}

/**
 * Input action (text, email, password, etc.)
 */
export interface InputAction extends BaseAction {
  type: 'input';
  selector: SelectorStrategy;
  tagName: string;
  value: string; // Masked if sensitive or variable placeholder (e.g., ${PASSWORD})
  inputType: string; // text, email, password, etc.
  isSensitive: boolean; // True for passwords/cards
  simulationType: 'type' | 'setValue'; // Keystroke vs instant
  typingDelay?: number; // Delay between keystrokes (ms)
  variableName?: string; // Variable name for sensitive fields (e.g., 'PASSWORD')
}

/**
 * Select dropdown action
 * Enhanced to support native HTML select dropdowns with full option details
 */
export interface SelectAction extends BaseAction {
  type: 'select';
  selector: SelectorStrategy;
  tagName: 'select';

  // Single select fields
  selectedValue: string;
  selectedText: string;
  selectedIndex: number;

  // Multi-select support
  isMultiple?: boolean; // True for <select multiple>
  selectedOptions?: Array<{
    // For multi-select dropdowns
    text: string;
    value: string;
    index: number;
    label?: string;
  }>;

  // Select element metadata
  selectId?: string | undefined; // id attribute
  selectName?: string | undefined; // name attribute

  // Option metadata
  selectedOption?: {
    text: string;
    value: string;
    index: number;
    label?: string;
  };
}

/**
 * Navigation action (page transitions)
 * 🔧 FIXED: Added relatedAction to link navigation to triggering action
 */
export interface NavigationAction extends BaseAction {
  type: 'navigation';
  from: string;
  to: string;
  navigationTrigger: 'click' | 'form-submit' | 'manual' | 'redirect' | 'back' | 'forward';
  relatedAction?: string; // ID of action that triggered navigation (form submit, link click, etc.)
  waitUntil: 'load' | 'domcontentloaded' | 'networkidle';
  duration: number; // Navigation duration in ms
}

/**
 * Scroll action (window or element)
 */
export interface ScrollAction extends BaseAction {
  type: 'scroll';
  scrollX: number;
  scrollY: number;
  element: 'window' | SelectorStrategy; // Window or specific element
}

/**
 * Keypress action (Enter, Tab, Escape, etc.)
 */
export interface KeypressAction extends BaseAction {
  type: 'keypress';
  key: string; // 'Enter', 'Escape', 'Tab', etc.
  code: string; // KeyboardEvent.code
  modifiers: ModifierKey[];
}

/**
 * Form submit action
 */
export interface SubmitAction extends BaseAction {
  type: 'submit';
  selector: SelectorStrategy; // Form selector
  tagName: 'form';
  formData?: Record<string, string>; // Sanitized form data
}

/**
 * Auto-generated checkpoint for validation
 */
export interface CheckpointAction extends BaseAction {
  type: 'checkpoint';
  checkType: 'urlMatch' | 'elementVisible' | 'elementText' | 'pageLoad';
  expectedUrl?: string;
  actualUrl?: string;
  selector?: SelectorStrategy;
  expectedValue?: string;
  actualValue?: string;
  passed: boolean;
}

/**
 * Hover action (mouseenter/mouseover for dropdowns)
 */
export interface HoverAction extends BaseAction {
  type: 'hover';
  selector: SelectorStrategy;
  tagName: string;
  text?: string;
  duration?: number; // How long mouse was over element (ms)
  isDropdownParent?: boolean; // True if this is a dropdown parent element
}

/**
 * Modal lifecycle action (open, close, state-change)
 */
export interface ModalLifecycleAction extends BaseAction {
  type: 'modal-lifecycle';
  event: 'modal-opened' | 'modal-closed' | 'modal-state-changed';
  modalId: string; // Unique identifier for the modal
  modalSelector: string; // CSS selector for modal element
  initialState?: string; // State when modal opened
  fromState?: string; // Previous state (for state-changed)
  toState?: string; // New state (for state-changed)
  animationDuration?: number; // Estimated animation duration (ms)
  transitionDuration?: number; // State transition duration (ms)
  triggeringAction?: string; // Action ID that triggered this lifecycle event
}

/**
 * Modifier keys (Ctrl, Shift, Alt, Meta/Cmd)
 */
export type ModifierKey = 'ctrl' | 'shift' | 'alt' | 'meta';

/**
 * All possible action types
 */
export type ActionType =
  | 'click'
  | 'input'
  | 'select'
  | 'navigation'
  | 'scroll'
  | 'keypress'
  | 'submit'
  | 'checkpoint'
  | 'hover'
  | 'modal-lifecycle';

/**
 * Union type of all actions
 */
export type Action =
  | ClickAction
  | InputAction
  | SelectAction
  | NavigationAction
  | ScrollAction
  | KeypressAction
  | SubmitAction
  | CheckpointAction
  | HoverAction
  | ModalLifecycleAction;

/**
 * Type guard for ClickAction
 */
export function isClickAction(action: Action): action is ClickAction {
  return action.type === 'click';
}

/**
 * Type guard for InputAction
 */
export function isInputAction(action: Action): action is InputAction {
  return action.type === 'input';
}

/**
 * Type guard for NavigationAction
 */
export function isNavigationAction(action: Action): action is NavigationAction {
  return action.type === 'navigation';
}

/**
 * Type guard for ModalLifecycleAction
 */
export function isModalLifecycleAction(action: Action): action is ModalLifecycleAction {
  return action.type === 'modal-lifecycle';
}

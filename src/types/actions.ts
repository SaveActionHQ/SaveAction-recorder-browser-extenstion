import type { SelectorStrategy } from './selectors';

/**
 * Base interface for all action types
 */
export interface BaseAction {
  id: string; // Unique action ID (act_xxx)
  type: ActionType;
  timestamp: number; // Unix timestamp in milliseconds
  url: string; // Current page URL
  frameId?: string; // iFrame identifier if in frame
  frameUrl?: string; // iFrame URL if in frame
  frameSelector?: string; // Selector to target frame
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
}

/**
 * Input action (text, email, password, etc.)
 */
export interface InputAction extends BaseAction {
  type: 'input';
  selector: SelectorStrategy;
  tagName: string;
  value: string; // Masked if sensitive
  inputType: string; // text, email, password, etc.
  isSensitive: boolean; // True for passwords/cards
  simulationType: 'type' | 'setValue'; // Keystroke vs instant
  typingDelay?: number; // Delay between keystrokes (ms)
}

/**
 * Select dropdown action
 */
export interface SelectAction extends BaseAction {
  type: 'select';
  selector: SelectorStrategy;
  tagName: 'select';
  selectedValue: string;
  selectedText: string;
  selectedIndex: number;
}

/**
 * Navigation action (page transitions)
 */
export interface NavigationAction extends BaseAction {
  type: 'navigation';
  from: string;
  to: string;
  navigationTrigger: 'click' | 'form-submit' | 'manual' | 'redirect' | 'back' | 'forward';
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
  | 'checkpoint';

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
  | CheckpointAction;

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

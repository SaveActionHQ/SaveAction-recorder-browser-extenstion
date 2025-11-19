/**
 * Selector strategy with multiple fallback options for reliable element identification
 */
export interface SelectorStrategy {
  // Primary selectors (ordered by stability)
  id?: string; // Highest priority: element ID
  dataTestId?: string; // Second: data-testid attribute
  ariaLabel?: string; // Third: ARIA label
  name?: string; // Fourth: name attribute (forms)

  // Fallback selectors
  css?: string; // Combined CSS selector
  xpath?: string; // XPath (relative preferred)
  xpathAbsolute?: string; // Absolute XPath (last resort)

  // Content-based selectors
  text?: string; // Exact text content
  textContains?: string; // Partial text match

  // Position-based selector (least stable)
  position?: {
    parent: string; // Parent element selector
    index: number; // nth-child index
  };

  // Selector priority order for playback
  priority: SelectorType[];
}

/**
 * Types of selectors available
 */
export type SelectorType =
  | 'id'
  | 'dataTestId'
  | 'ariaLabel'
  | 'name'
  | 'css'
  | 'xpath'
  | 'xpathAbsolute'
  | 'text'
  | 'textContains'
  | 'position';

/**
 * Configuration for selector generation
 */
export interface SelectorConfig {
  preferStableSelectors: boolean; // Prioritize ID, data-testid
  includeXPath: boolean; // Generate XPath
  includeText: boolean; // Include text-based selectors
  includePosition: boolean; // Include position (fallback only)
  maxCssDepth: number; // Max CSS selector nesting depth
}

/**
 * Default selector configuration
 */
export const DEFAULT_SELECTOR_CONFIG: SelectorConfig = {
  preferStableSelectors: true,
  includeXPath: true,
  includeText: true,
  includePosition: true,
  maxCssDepth: 5,
};

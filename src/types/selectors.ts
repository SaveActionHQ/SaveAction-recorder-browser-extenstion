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

  // 🆕 Validation metadata for uniqueness and stability
  validation?: SelectorValidation;

  // 🆕 Fallback metadata for when primary selectors fail
  fallback?: FallbackMetadata;
}

/**
 * Validation metadata for selector uniqueness and reliability
 */
export interface SelectorValidation {
  cssMatches: number; // Number of elements matching CSS selector
  xpathMatches?: number; // Number of elements matching XPath selector
  strategy: string; // Strategy used to generate the selector (e.g., 'id', 'nth-child-with-parent')
  isUnique: boolean; // True if selector matches exactly one element
  verifiedAt: number; // Timestamp when validation occurred
  warnings?: string[]; // Any warnings about selector stability
  errors?: string[]; // Any errors encountered during validation
}

/**
 * Fallback metadata for element identification
 */
export interface FallbackMetadata {
  visualPosition?: {
    x: number; // Absolute X coordinate
    y: number; // Absolute Y coordinate
    viewportX: number; // X relative to viewport
    viewportY: number; // Y relative to viewport
  };
  textContent?: string; // Element's text content (trimmed)
  siblingIndex?: number; // Index among siblings
  parentId?: string; // Parent element's ID
  uniqueParent?: string; // Selector for unique parent container
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

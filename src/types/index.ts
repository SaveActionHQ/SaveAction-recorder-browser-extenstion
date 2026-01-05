/**
 * Central export point for all TypeScript types
 */

// Actions
export * from './actions';

// Selectors
export * from './selectors';

// Recording
export * from './recording';

// Messages
export * from './messages';

// Re-export specific types for easier access
export type {
  CarouselContext,
  ClickIntent,
  ActionValidation,
  ActionGroup,
  NavigationIntent,
  UrlChangeExpectation,
} from './actions';

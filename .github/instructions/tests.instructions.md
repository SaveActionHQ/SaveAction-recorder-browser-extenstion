---
applyTo: 'tests/**/*.test.ts'
---

# Testing Instructions

Write comprehensive unit tests with Vitest following these guidelines.

## Test Structure

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('ComponentName', () => {
  beforeEach(() => {
    // Reset mocks and state before each test
    vi.clearAllMocks();
  });

  describe('methodName', () => {
    it('should handle normal case', () => {
      // Arrange
      const input = 'test';

      // Act
      const result = component.method(input);

      // Assert
      expect(result).toBe('expected');
    });

    it('should handle edge case', () => {
      // Test boundary conditions
    });

    it('should throw error for invalid input', () => {
      expect(() => component.method(null)).toThrow();
    });
  });
});
```

## Mocking Chrome APIs

```typescript
// Mock chrome.storage
const mockStorage = {
  session: {
    get: vi.fn(),
    set: vi.fn(),
  },
  local: {
    get: vi.fn(),
    set: vi.fn(),
  },
};

global.chrome = {
  storage: mockStorage,
  runtime: {
    sendMessage: vi.fn(),
    onMessage: { addListener: vi.fn() },
  },
} as any;
```

## Coverage Requirements

- **Lines:** 81%+
- **Statements:** 81%+
- **Functions:** 88%+
- **Branches:** 77%+

Files excluded from coverage:

- `src/background/index.ts` (integration-heavy)
- `src/content/index.ts` (entry point)
- `src/popup/popup.ts` (UI component)
- `src/content/recording-indicator.ts` (DOM manipulation)
- `src/content/variable-marker.ts` (DOM manipulation)

## Test Categories

### Unit Tests

Test individual functions and classes in isolation.

- Mock all external dependencies
- Test public API behavior, not implementation
- Use descriptive test names: `should <expected behavior> when <condition>`

### Integration Tests

Test interaction between components (not currently implemented).

### E2E Tests

Test complete user workflows (not currently implemented).

## What to Test

✅ **DO test:**

- Public methods and functions
- Error handling and edge cases
- Input validation
- Data transformations
- Business logic
- State management
- Selector generation accuracy
- iframe frame context detection (frameUrl, frameId, frameSelector)
- Action type coverage (click, input, scroll, checkpoint, dialog, file-upload, etc.)

❌ **DON'T test:**

- Private methods (test through public API)
- Implementation details
- Chrome API internals
- UI components requiring DOM (use E2E instead)
- Third-party library internals

## iframe Testing Pattern

When testing iframe-related functionality, mock the window context:

```typescript
// Simulate iframe environment
Object.defineProperty(window, 'self', { value: {} });
Object.defineProperty(window, 'top', { value: { different: true } });
Object.defineProperty(window, 'frameElement', {
  value: { id: 'my-iframe', tagName: 'IFRAME' },
});
Object.defineProperty(window, 'location', {
  value: { href: 'https://iframe-content.example.com/' },
});

// Note: CSS.escape is not available in jsdom — use a polyfill
```

## Common Patterns

### Testing Async Functions

```typescript
it('should handle async operation', async () => {
  const promise = asyncFunction();
  await expect(promise).resolves.toBe('result');
});
```

### Testing Error Handling

```typescript
it('should throw for invalid input', () => {
  expect(() => function(null)).toThrow('Expected error message');
});
```

### Testing Callbacks

```typescript
it('should call callback with result', () => {
  const callback = vi.fn();
  component.withCallback(callback);
  expect(callback).toHaveBeenCalledWith('expected');
});
```

## Running Tests

```bash
npm test              # Run all tests once
npm run test:watch   # Watch mode for development
npm run test:coverage # Generate coverage report
```

## Test File Location

Each source file should have a corresponding test file:

- `src/utils/exporter.ts` → `tests/unit/exporter.test.ts`
- `src/content/action-recorder.ts` → `tests/unit/action-recorder.test.ts`

## Debugging Tests

1. Add `console.log` statements (they will show in test output)
2. Use `it.only()` to run a single test
3. Use `describe.only()` to run a test suite
4. Check `tests/setup.ts` for global test configuration

## When Adding New Features

1. Write failing tests first (TDD)
2. Implement the feature
3. Ensure tests pass
4. Run full test suite
5. Check coverage hasn't dropped
6. Commit with `test:` prefix if only adding tests

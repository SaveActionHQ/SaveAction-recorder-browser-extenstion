import { describe, it, expect } from 'vitest';
import { isTabAction, type TabAction, type Action, type ClickAction } from '@/types/actions';
import { validateAction } from '@/utils/validator';

/**
 * Helper to create a valid TabAction for testing
 */
function createTabAction(overrides: Partial<TabAction> = {}): TabAction {
  return {
    id: 'act_001',
    type: 'tab',
    timestamp: 1000,
    completedAt: 1000,
    url: '',
    tabOperation: 'open',
    tabIndex: 0,
    newTabIndex: 1,
    triggerUrl: 'https://example.com/new',
    triggerType: 'target_blank',
    ...overrides,
  };
}

describe('Multi-Tab Support', () => {
  describe('isTabAction type guard', () => {
    it('should return true for tab actions', () => {
      const action = createTabAction();
      expect(isTabAction(action)).toBe(true);
    });

    it('should return false for non-tab actions', () => {
      const action: ClickAction = {
        id: 'act_002',
        type: 'click',
        timestamp: 1000,
        completedAt: 1000,
        url: 'http://example.com',
        selector: { priority: ['id'], id: 'btn' },
        tagName: 'button',
        coordinates: { x: 100, y: 50 },
        coordinatesRelativeTo: 'element',
        button: 'left',
        clickCount: 1,
        modifiers: [],
      };

      expect(isTabAction(action as Action)).toBe(false);
    });
  });

  describe('TabAction type', () => {
    it('should support open operation with newTabIndex', () => {
      const action = createTabAction({
        tabOperation: 'open',
        tabIndex: 0,
        newTabIndex: 1,
        triggerType: 'target_blank',
        triggerUrl: 'https://example.com/new-page',
      });

      expect(action.tabOperation).toBe('open');
      expect(action.tabIndex).toBe(0);
      expect(action.newTabIndex).toBe(1);
      expect(action.triggerType).toBe('target_blank');
      expect(action.triggerUrl).toBe('https://example.com/new-page');
    });

    it('should support switch operation between tabs', () => {
      const action = createTabAction({
        tabOperation: 'switch',
        tabIndex: 0,
        newTabIndex: 1,
      });

      expect(action.tabOperation).toBe('switch');
      expect(action.tabIndex).toBe(0);
      expect(action.newTabIndex).toBe(1);
    });

    it('should support close operation', () => {
      const action = createTabAction({
        tabOperation: 'close',
        tabIndex: 1,
        newTabIndex: undefined,
      });

      expect(action.tabOperation).toBe('close');
      expect(action.tabIndex).toBe(1);
    });

    it('should support all trigger types', () => {
      const targetBlank = createTabAction({ triggerType: 'target_blank' });
      const windowOpen = createTabAction({ triggerType: 'window_open' });
      const popup = createTabAction({ triggerType: 'popup' });

      expect(targetBlank.triggerType).toBe('target_blank');
      expect(windowOpen.triggerType).toBe('window_open');
      expect(popup.triggerType).toBe('popup');
    });
  });

  describe('tabIndex on BaseAction', () => {
    it('should allow tabIndex on click actions', () => {
      const action: ClickAction = {
        id: 'act_001',
        type: 'click',
        timestamp: 1000,
        completedAt: 1000,
        url: 'http://example.com',
        selector: { priority: ['id'], id: 'btn' },
        tagName: 'button',
        coordinates: { x: 100, y: 50 },
        coordinatesRelativeTo: 'element',
        button: 'left',
        clickCount: 1,
        modifiers: [],
        tabIndex: 0,
      };

      expect(action.tabIndex).toBe(0);
    });

    it('should default tabIndex to undefined if not set', () => {
      const action: ClickAction = {
        id: 'act_001',
        type: 'click',
        timestamp: 1000,
        completedAt: 1000,
        url: 'http://example.com',
        selector: { priority: ['id'], id: 'btn' },
        tagName: 'button',
        coordinates: { x: 100, y: 50 },
        coordinatesRelativeTo: 'element',
        button: 'left',
        clickCount: 1,
        modifiers: [],
      };

      expect(action.tabIndex).toBeUndefined();
    });
  });

  describe('Tab Action Validation', () => {
    it('should validate a valid tab open action', () => {
      const action = createTabAction({
        tabOperation: 'open',
        tabIndex: 0,
        newTabIndex: 1,
      });

      const result = validateAction(action as Action);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate a valid tab switch action', () => {
      const action = createTabAction({
        tabOperation: 'switch',
        tabIndex: 0,
        newTabIndex: 1,
      });

      const result = validateAction(action as Action);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate a valid tab close action', () => {
      const action = createTabAction({
        tabOperation: 'close',
        tabIndex: 1,
        newTabIndex: undefined,
      });

      const result = validateAction(action as Action);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail if tabOperation is missing', () => {
      const action = createTabAction({
        tabOperation: undefined as any,
      });

      const result = validateAction(action as Action);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          field: 'action.tabOperation',
        })
      );
    });

    it('should fail if tabOperation is invalid', () => {
      const action = createTabAction({
        tabOperation: 'invalid' as any,
      });

      const result = validateAction(action as Action);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          field: 'action.tabOperation',
        })
      );
    });

    it('should fail if tabIndex is missing', () => {
      const action = createTabAction({
        tabIndex: undefined as any,
      });

      const result = validateAction(action as Action);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          field: 'action.tabIndex',
        })
      );
    });

    it('should fail if tabIndex is negative', () => {
      const action = createTabAction({
        tabIndex: -1,
      });

      const result = validateAction(action as Action);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          field: 'action.tabIndex',
        })
      );
    });

    it('should fail if tab open action is missing newTabIndex', () => {
      const action = createTabAction({
        tabOperation: 'open',
        newTabIndex: undefined,
      });

      const result = validateAction(action as Action);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          field: 'action.newTabIndex',
        })
      );
    });

    it('should fail if tab open action has newTabIndex of 0', () => {
      const action = createTabAction({
        tabOperation: 'open',
        newTabIndex: 0,
      });

      const result = validateAction(action as Action);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          field: 'action.newTabIndex',
          message: 'Tab open action must have a newTabIndex >= 1',
        })
      );
    });

    it('should fail if tab switch action is missing newTabIndex', () => {
      const action = createTabAction({
        tabOperation: 'switch',
        newTabIndex: undefined,
      });

      const result = validateAction(action as Action);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          field: 'action.newTabIndex',
        })
      );
    });

    it('should accept tab switch action with newTabIndex of 0', () => {
      const action = createTabAction({
        tabOperation: 'switch',
        tabIndex: 1,
        newTabIndex: 0,
      });

      const result = validateAction(action as Action);
      expect(result.isValid).toBe(true);
    });

    it('should accept tab close action without newTabIndex', () => {
      const action = createTabAction({
        tabOperation: 'close',
        tabIndex: 2,
        newTabIndex: undefined,
      });

      const result = validateAction(action as Action);
      expect(result.isValid).toBe(true);
    });

    it('should allow tabIndex of 0 (original tab)', () => {
      const action = createTabAction({
        tabOperation: 'open',
        tabIndex: 0,
        newTabIndex: 1,
      });

      const result = validateAction(action as Action);
      expect(result.isValid).toBe(true);
    });

    it('should allow high tabIndex values', () => {
      const action = createTabAction({
        tabOperation: 'switch',
        tabIndex: 5,
        newTabIndex: 10,
      });

      const result = validateAction(action as Action);
      expect(result.isValid).toBe(true);
    });
  });
});

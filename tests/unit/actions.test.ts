import { describe, it, expect } from 'vitest';
import {
  isClickAction,
  isInputAction,
  isNavigationAction,
  isModalLifecycleAction,
  type ClickAction,
  type InputAction,
  type NavigationAction,
  type ModalLifecycleAction,
  type Action,
} from '@/types/actions';

describe('Action Type Guards', () => {
  describe('isClickAction', () => {
    it('should return true for click actions', () => {
      const action: ClickAction = {
        id: 'act_001',
        type: 'click',
        timestamp: 1000,
        completedAt: 0,
        url: 'http://example.com',
        selector: { priority: ['id'], id: 'btn' },
        tagName: 'button',
        coordinates: { x: 100, y: 50 },
        coordinatesRelativeTo: 'element',
        button: 'left',
        clickCount: 1,
        modifiers: [],
      };

      expect(isClickAction(action)).toBe(true);
    });

    it('should return false for non-click actions', () => {
      const action: InputAction = {
        id: 'act_002',
        type: 'input',
        timestamp: 2000,
        completedAt: 0,
        url: 'http://example.com',
        selector: { priority: ['id'], id: 'input' },
        tagName: 'input',
        value: 'test',
        inputType: 'text',
        isSensitive: false,
        simulationType: 'type',
      };

      expect(isClickAction(action as Action)).toBe(false);
    });
  });

  describe('isInputAction', () => {
    it('should return true for input actions', () => {
      const action: InputAction = {
        id: 'act_002',
        type: 'input',
        timestamp: 2000,
        completedAt: 0,
        url: 'http://example.com',
        selector: { priority: ['id'], id: 'input' },
        tagName: 'input',
        value: 'test',
        inputType: 'text',
        isSensitive: false,
        simulationType: 'type',
      };

      expect(isInputAction(action)).toBe(true);
    });

    it('should return false for non-input actions', () => {
      const action: ClickAction = {
        id: 'act_001',
        type: 'click',
        timestamp: 1000,
        completedAt: 0,
        url: 'http://example.com',
        selector: { priority: ['id'], id: 'btn' },
        tagName: 'button',
        coordinates: { x: 100, y: 50 },
        coordinatesRelativeTo: 'element',
        button: 'left',
        clickCount: 1,
        modifiers: [],
      };

      expect(isInputAction(action as Action)).toBe(false);
    });
  });

  describe('isNavigationAction', () => {
    it('should return true for navigation actions', () => {
      const action: NavigationAction = {
        id: 'act_003',
        type: 'navigation',
        timestamp: 3000,
        completedAt: 0,
        url: 'http://example.com',
        from: 'http://example.com',
        to: 'http://example.com/page',
        navigationTrigger: 'click',
        waitUntil: 'load',
        duration: 1000,
      };

      expect(isNavigationAction(action)).toBe(true);
    });

    it('should return false for non-navigation actions', () => {
      const action: ClickAction = {
        id: 'act_001',
        type: 'click',
        timestamp: 1000,
        completedAt: 0,
        url: 'http://example.com',
        selector: { priority: ['id'], id: 'btn' },
        tagName: 'button',
        coordinates: { x: 100, y: 50 },
        coordinatesRelativeTo: 'element',
        button: 'left',
        clickCount: 1,
        modifiers: [],
      };

      expect(isNavigationAction(action as Action)).toBe(false);
    });
  });

  describe('isModalLifecycleAction', () => {
    it('should return true for modal lifecycle actions', () => {
      const action: ModalLifecycleAction = {
        id: 'act_004',
        type: 'modal-lifecycle',
        timestamp: 4000,
        completedAt: 4500,
        url: 'http://example.com',
        event: 'modal-opened',
        modalId: 'checkout-modal',
        modalSelector: '#checkout-modal',
      };

      expect(isModalLifecycleAction(action)).toBe(true);
    });

    it('should return false for non-modal lifecycle actions', () => {
      const action: ClickAction = {
        id: 'act_001',
        type: 'click',
        timestamp: 1000,
        completedAt: 0,
        url: 'http://example.com',
        selector: { priority: ['id'], id: 'btn' },
        tagName: 'button',
        coordinates: { x: 100, y: 50 },
        coordinatesRelativeTo: 'element',
        button: 'left',
        clickCount: 1,
        modifiers: [],
      };

      expect(isModalLifecycleAction(action as Action)).toBe(false);
    });
  });
});

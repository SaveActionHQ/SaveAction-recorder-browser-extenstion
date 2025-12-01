import { describe, it, expect } from 'vitest';
import {
  validateRecording,
  validateAction,
  validateSelector,
  ValidationError,
} from '@/utils/validator';
import type { Recording, Action, SelectorStrategy } from '@/types';

// Helper for dimension data
const mockDimensions = {
  viewport: { width: 1920, height: 1080 },
  windowSize: { width: 1920, height: 1179 },
  screenSize: { width: 1920, height: 1080 },
  devicePixelRatio: 1,
};

describe('Validator', () => {
  describe('Selector Validation', () => {
    it('should validate valid selector with ID', () => {
      const selector: SelectorStrategy = {
        priority: ['id'],
        id: 'test-button',
      };

      const result = validateSelector(selector);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate selector with multiple strategies', () => {
      const selector: SelectorStrategy = {
        priority: ['id', 'css', 'xpath'],
        id: 'btn',
        css: 'button.primary',
        xpath: '//button[@id="btn"]',
      };

      const result = validateSelector(selector);
      expect(result.isValid).toBe(true);
    });

    it('should fail if priority array is empty', () => {
      const selector: SelectorStrategy = {
        priority: [],
        id: 'test',
      };

      const result = validateSelector(selector);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          field: 'selector.priority',
          message: 'Priority array cannot be empty',
        })
      );
    });

    it('should fail if priority references missing selector', () => {
      const selector: SelectorStrategy = {
        priority: ['id', 'css'],
        id: 'test',
        // Missing css
      };

      const result = validateSelector(selector);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          field: 'selector.css',
          message: 'Priority references "css" but selector is not defined',
        })
      );
    });

    it('should fail if no selectors are provided', () => {
      const selector: SelectorStrategy = {
        priority: ['id'],
        // No actual selectors
      };

      const result = validateSelector(selector);
      expect(result.isValid).toBe(false);
    });
  });

  describe('Action Validation', () => {
    it('should validate valid click action', () => {
      const action: Action = {
        id: 'act_001',
        type: 'click',
        timestamp: Date.now(),
        completedAt: Date.now() + 50,
        url: 'http://example.com',
        selector: { priority: ['id'], id: 'btn' },
        tagName: 'button',
        coordinates: { x: 100, y: 50 },
        coordinatesRelativeTo: 'element',
        button: 'left',
        clickCount: 1,
        modifiers: [],
      };

      const result = validateAction(action);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate valid input action', () => {
      const action: Action = {
        id: 'act_001',
        type: 'input',
        timestamp: Date.now(),
        completedAt: Date.now() + 400,
        url: 'http://example.com',
        selector: { priority: ['id'], id: 'username' },
        tagName: 'input',
        value: 'test',
        inputType: 'text',
        isSensitive: false,
        simulationType: 'type',
      };

      const result = validateAction(action);
      expect(result.isValid).toBe(true);
    });

    it('should fail if action ID is missing', () => {
      const action = {
        type: 'click',
        timestamp: Date.now(),
        url: 'http://example.com',
        selector: { priority: ['id'], id: 'btn' },
      } as any;

      const result = validateAction(action);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          field: 'action.id',
          message: 'Action ID is required',
        })
      );
    });

    it('should fail if action type is missing', () => {
      const action = {
        id: 'act_001',
        timestamp: Date.now(),
        url: 'http://example.com',
      } as any;

      const result = validateAction(action);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          field: 'action.type',
          message: 'Action type is required',
        })
      );
    });

    it('should fail if timestamp is invalid', () => {
      const action = {
        id: 'act_001',
        type: 'click',
        timestamp: -1,
        url: 'http://example.com',
        selector: { priority: ['id'], id: 'btn' },
      } as any;

      const result = validateAction(action);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          field: 'action.timestamp',
          message: 'Timestamp must be a positive number',
        })
      );
    });

    it('should fail if URL is missing', () => {
      const action = {
        id: 'act_001',
        type: 'click',
        timestamp: Date.now(),
        selector: { priority: ['id'], id: 'btn' },
      } as any;

      const result = validateAction(action);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          field: 'action.url',
          message: 'Action URL is required',
        })
      );
    });

    it('should fail if click action missing selector', () => {
      const action = {
        id: 'act_001',
        type: 'click',
        timestamp: Date.now(),
        url: 'http://example.com',
        tagName: 'button',
        coordinates: { x: 100, y: 50 },
        coordinatesRelativeTo: 'element',
        button: 'left',
        clickCount: 1,
        modifiers: [],
      } as any;

      const result = validateAction(action);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          field: 'action.selector',
          message: 'Click action must have a selector',
        })
      );
    });

    it('should fail if input action missing value', () => {
      const action = {
        id: 'act_001',
        type: 'input',
        timestamp: Date.now(),
        url: 'http://example.com',
        selector: { priority: ['id'], id: 'input' },
        tagName: 'input',
        inputType: 'text',
        isSensitive: false,
        simulationType: 'type',
      } as any;

      const result = validateAction(action);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          field: 'action.value',
          message: 'Input action must have a value',
        })
      );
    });

    it('should validate navigation action', () => {
      const action: Action = {
        id: 'act_001',
        type: 'navigation',
        timestamp: Date.now(),
        completedAt: Date.now() + 500,
        url: 'http://example.com/page2',
        from: 'http://example.com/page1',
        to: 'http://example.com/page2',
        navigationTrigger: 'click',
        waitUntil: 'load',
        duration: 500,
      };

      const result = validateAction(action);
      expect(result.isValid).toBe(true);
    });

    it('should fail if navigation action missing from/to', () => {
      const action = {
        id: 'act_001',
        type: 'navigation',
        timestamp: Date.now(),
        url: 'http://example.com',
        navigationTrigger: 'click',
        waitUntil: 'load',
        duration: 500,
      } as any;

      const result = validateAction(action);
      expect(result.isValid).toBe(false);
    });
  });

  describe('Recording Validation', () => {
    it('should validate valid recording', () => {
      const recording: Recording = {
        id: 'rec_123',
        version: '1.0.0',
        testName: 'Test Login',
        url: 'http://example.com',
        startTime: '2024-01-01T00:00:00.000Z',
        endTime: '2024-01-01T00:01:00.000Z',
        ...mockDimensions,
        userAgent: 'Test Agent',
        actions: [
          {
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
          },
        ],
      };

      const result = validateRecording(recording);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail if recording ID is missing', () => {
      const recording = {
        version: '1.0.0',
        testName: 'Test',
        url: 'http://example.com',
        startTime: '2024-01-01T00:00:00.000Z',
        ...mockDimensions,
        userAgent: 'Test Agent',
        actions: [],
      } as any;

      const result = validateRecording(recording);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          field: 'recording.id',
          message: 'Recording ID is required',
        })
      );
    });

    it('should fail if version is missing', () => {
      const recording = {
        id: 'rec_123',
        testName: 'Test',
        url: 'http://example.com',
        startTime: '2024-01-01T00:00:00.000Z',
        ...mockDimensions,
        userAgent: 'Test Agent',
        actions: [],
      } as any;

      const result = validateRecording(recording);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          field: 'recording.version',
          message: 'Schema version is required',
        })
      );
    });

    it('should fail if testName is empty', () => {
      const recording = {
        id: 'rec_123',
        version: '1.0.0',
        testName: '',
        url: 'http://example.com',
        startTime: '2024-01-01T00:00:00.000Z',
        ...mockDimensions,
        userAgent: 'Test Agent',
        actions: [],
      } as any;

      const result = validateRecording(recording);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          field: 'recording.testName',
          message: 'Test name cannot be empty',
        })
      );
    });

    it('should fail if URL is invalid', () => {
      const recording = {
        id: 'rec_123',
        version: '1.0.0',
        testName: 'Test',
        url: 'not-a-url',
        startTime: '2024-01-01T00:00:00.000Z',
        ...mockDimensions,
        userAgent: 'Test Agent',
        actions: [],
      } as any;

      const result = validateRecording(recording);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          field: 'recording.url',
          message: 'Invalid URL format',
        })
      );
    });

    it('should fail if startTime is invalid ISO 8601', () => {
      const recording = {
        id: 'rec_123',
        version: '1.0.0',
        testName: 'Test',
        url: 'http://example.com',
        startTime: 'invalid-date',
        ...mockDimensions,
        userAgent: 'Test Agent',
        actions: [],
      } as any;

      const result = validateRecording(recording);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          field: 'recording.startTime',
          message: 'Start time must be valid ISO 8601 format',
        })
      );
    });

    it('should fail if viewport dimensions are invalid', () => {
      const recording = {
        id: 'rec_123',
        version: '1.0.0',
        testName: 'Test',
        url: 'http://example.com',
        startTime: '2024-01-01T00:00:00.000Z',
        viewport: { width: 0, height: -100 },
        windowSize: { width: 1920, height: 1179 },
        screenSize: { width: 1920, height: 1080 },
        devicePixelRatio: 1,
        userAgent: 'Test Agent',
        actions: [],
      } as any;

      const result = validateRecording(recording);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          field: 'recording.viewport',
          message: 'Viewport width and height must be positive numbers',
        })
      );
    });

    it('should fail if actions array is not provided', () => {
      const recording = {
        id: 'rec_123',
        version: '1.0.0',
        testName: 'Test',
        url: 'http://example.com',
        startTime: '2024-01-01T00:00:00.000Z',
        ...mockDimensions,
        userAgent: 'Test Agent',
      } as any;

      const result = validateRecording(recording);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          field: 'recording.actions',
          message: 'Actions array is required',
        })
      );
    });

    it('should validate recording with invalid actions', () => {
      const recording: Recording = {
        id: 'rec_123',
        version: '1.0.0',
        testName: 'Test',
        url: 'http://example.com',
        startTime: '2024-01-01T00:00:00.000Z',
        ...mockDimensions,
        userAgent: 'Test Agent',
        actions: [
          {
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
          },
          {
            // Invalid action - missing required fields
            id: 'act_002',
            timestamp: 2000,
            completedAt: 0,
          } as any,
        ],
      };

      const result = validateRecording(recording);
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should allow empty actions array', () => {
      const recording: Recording = {
        id: 'rec_123',
        version: '1.0.0',
        testName: 'Test',
        url: 'http://example.com',
        startTime: '2024-01-01T00:00:00.000Z',
        ...mockDimensions,
        userAgent: 'Test Agent',
        actions: [],
      };

      const result = validateRecording(recording);
      expect(result.isValid).toBe(true);
    });
  });

  describe('ValidationResult', () => {
    it('should format error messages correctly', () => {
      const error: ValidationError = {
        field: 'test.field',
        message: 'Test error message',
      };

      expect(error.field).toBe('test.field');
      expect(error.message).toBe('Test error message');
    });
  });

  describe('Edge Cases', () => {
    it('should validate recording without viewport', () => {
      const recording = {
        id: 'rec_123',
        version: '1.0.0',
        testName: 'Test',
        url: 'http://example.com',
        startTime: '2024-01-01T00:00:00.000Z',
        userAgent: 'Test Agent',
        actions: [],
      } as any;

      const result = validateRecording(recording);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          field: 'recording.viewport',
          message: 'Viewport is required',
        })
      );
    });

    it('should validate recording with invalid viewport dimensions', () => {
      const recording: Recording = {
        id: 'rec_123',
        version: '1.0.0',
        testName: 'Test',
        url: 'http://example.com',
        startTime: '2024-01-01T00:00:00.000Z',
        viewport: { width: 0, height: -100 },
        windowSize: { width: 1920, height: 1179 },
        screenSize: { width: 1920, height: 1080 },
        devicePixelRatio: 1,
        userAgent: 'Test Agent',
        actions: [],
      };

      const result = validateRecording(recording);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          field: 'recording.viewport',
          message: 'Viewport width and height must be positive numbers',
        })
      );
    });

    it('should validate recording without userAgent', () => {
      const recording = {
        id: 'rec_123',
        version: '1.0.0',
        testName: 'Test',
        url: 'http://example.com',
        startTime: '2024-01-01T00:00:00.000Z',
        ...mockDimensions,
        actions: [],
      } as any;

      const result = validateRecording(recording);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          field: 'recording.userAgent',
          message: 'User agent is required',
        })
      );
    });

    it('should validate recording with non-array actions', () => {
      const recording = {
        id: 'rec_123',
        version: '1.0.0',
        testName: 'Test',
        url: 'http://example.com',
        startTime: '2024-01-01T00:00:00.000Z',
        ...mockDimensions,
        userAgent: 'Test Agent',
        actions: 'not-an-array',
      } as any;

      const result = validateRecording(recording);
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should validate recording with invalid windowSize dimensions', () => {
      const recording: Recording = {
        id: 'rec_123',
        version: '1.0.0',
        testName: 'Test',
        url: 'http://example.com',
        startTime: '2024-01-01T00:00:00.000Z',
        viewport: { width: 1920, height: 1080 },
        windowSize: { width: -100, height: 0 },
        screenSize: { width: 1920, height: 1080 },
        devicePixelRatio: 1,
        userAgent: 'Test Agent',
        actions: [],
      };

      const result = validateRecording(recording);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          field: 'recording.windowSize',
          message: 'WindowSize width and height must be positive numbers',
        })
      );
    });

    it('should validate recording with invalid screenSize dimensions', () => {
      const recording: Recording = {
        id: 'rec_123',
        version: '1.0.0',
        testName: 'Test',
        url: 'http://example.com',
        startTime: '2024-01-01T00:00:00.000Z',
        viewport: { width: 1920, height: 1080 },
        windowSize: { width: 1920, height: 1179 },
        screenSize: { width: 0, height: -50 },
        devicePixelRatio: 1,
        userAgent: 'Test Agent',
        actions: [],
      };

      const result = validateRecording(recording);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          field: 'recording.screenSize',
          message: 'ScreenSize width and height must be positive numbers',
        })
      );
    });

    it('should validate recording with invalid devicePixelRatio', () => {
      const recording: Recording = {
        id: 'rec_123',
        version: '1.0.0',
        testName: 'Test',
        url: 'http://example.com',
        startTime: '2024-01-01T00:00:00.000Z',
        viewport: { width: 1920, height: 1080 },
        windowSize: { width: 1920, height: 1179 },
        screenSize: { width: 1920, height: 1080 },
        devicePixelRatio: -1,
        userAgent: 'Test Agent',
        actions: [],
      };

      const result = validateRecording(recording);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          field: 'recording.devicePixelRatio',
          message: 'DevicePixelRatio must be a positive number',
        })
      );
    });
  });
});

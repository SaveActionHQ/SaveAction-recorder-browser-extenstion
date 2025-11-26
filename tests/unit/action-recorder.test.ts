/* eslint-disable @typescript-eslint/await-thenable */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ActionRecorder } from '@/content/action-recorder';
import { EventListener } from '@/content/event-listener';
import type { Action } from '@/types';

// Mock EventListener
vi.mock('@/content/event-listener', () => ({
  EventListener: vi.fn().mockImplementation(() => ({
    start: vi.fn(),
    stop: vi.fn(),
    destroy: vi.fn(),
    setActionSequence: vi.fn(),
    setRecordingStartTime: vi.fn(),
  })),
}));

describe('ActionRecorder', () => {
  let recorder: ActionRecorder;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Initialization', () => {
    it('should initialize with idle state', () => {
      recorder = new ActionRecorder();
      expect(recorder.getState()).toBe('idle');
      expect(recorder.isRecording()).toBe(false);
    });

    it('should initialize EventListener on construction', () => {
      recorder = new ActionRecorder();
      expect(EventListener).toHaveBeenCalledWith(expect.any(Function));
    });
  });

  describe('Test Name Validation', () => {
    it('should require test name before starting recording', async () => {
      recorder = new ActionRecorder();
      await expect(async () => await recorder.startRecording('')).rejects.toThrow(
        'Test name is required to start recording'
      );
    });

    it('should accept valid test name', async () => {
      recorder = new ActionRecorder();
      await recorder.startRecording('My Test');
      expect(recorder.getState()).toBe('recording');
    });

    it('should trim whitespace from test name', async () => {
      recorder = new ActionRecorder();
      await recorder.startRecording('  My Test  ');
      const metadata = recorder.getMetadata();
      expect(metadata?.testName).toBe('My Test');
    });

    it('should reject test name with only whitespace', async () => {
      recorder = new ActionRecorder();
      await expect(async () => await recorder.startRecording('   ')).rejects.toThrow(
        'Test name is required to start recording'
      );
    });
  });

  describe('Recording Lifecycle', () => {
    it('should start recording and capture metadata', async () => {
      recorder = new ActionRecorder();
      await recorder.startRecording('Test Suite 1');

      expect(recorder.getState()).toBe('recording');
      expect(recorder.isRecording()).toBe(true);

      const metadata = recorder.getMetadata();
      expect(metadata).toBeDefined();
      expect(metadata?.testName).toBe('Test Suite 1');
      expect(metadata?.url).toBe(window.location.href);
      expect(metadata?.startTime).toBeDefined();
      expect(metadata?.viewport).toEqual({
        width: window.innerWidth,
        height: window.innerHeight,
      });
      expect(metadata?.userAgent).toBe(navigator.userAgent);
    });

    it('should not start recording if already recording', async () => {
      recorder = new ActionRecorder();
      await recorder.startRecording('Test 1');
      await expect(async () => await recorder.startRecording('Test 2')).rejects.toThrow(
        'Recording is already in progress'
      );
    });

    it('should pause recording', async () => {
      recorder = new ActionRecorder();
      await recorder.startRecording('Test 1');
      recorder.pauseRecording();
      expect(recorder.getState()).toBe('paused');
      expect(recorder.isRecording()).toBe(false);
    });

    it('should not pause if not recording', () => {
      recorder = new ActionRecorder();
      expect(() => recorder.pauseRecording()).toThrow('Cannot pause: not currently recording');
    });

    it('should resume from paused state', async () => {
      recorder = new ActionRecorder();
      await recorder.startRecording('Test 1');
      recorder.pauseRecording();
      recorder.resumeRecording();
      expect(recorder.getState()).toBe('recording');
      expect(recorder.isRecording()).toBe(true);
    });

    it('should not resume if not paused', async () => {
      recorder = new ActionRecorder();
      await recorder.startRecording('Test 1');
      expect(() => recorder.resumeRecording()).toThrow('Cannot resume: recording is not paused');
    });

    it('should stop recording and return final recording', async () => {
      recorder = new ActionRecorder();
      await recorder.startRecording('Test 1');

      const recording = await recorder.stopRecording();

      expect(recorder.getState()).toBe('idle');
      expect(recorder.isRecording()).toBe(false);
      expect(recording).toBeDefined();
      expect(recording.testName).toBe('Test 1');
      expect(recording.endTime).toBeDefined();
      expect(recording.version).toBe('1.0.0');
      expect(recording.id).toBeDefined();
      expect(recording.id).toMatch(/^rec_\d+$/);
    });

    it('should not stop if not recording', async () => {
      recorder = new ActionRecorder();
      await expect(async () => await recorder.stopRecording()).rejects.toThrow(
        'Cannot stop: no active recording'
      );
    });

    it('should allow new recording after stopping', async () => {
      recorder = new ActionRecorder();
      await recorder.startRecording('Test 1');
      await recorder.stopRecording();
      await recorder.startRecording('Test 2');
      expect(recorder.getState()).toBe('recording');
    });
  });

  describe('Action Collection', () => {
    it('should collect actions during recording', async () => {
      recorder = new ActionRecorder();
      await recorder.startRecording('Test 1');

      // Simulate EventListener calling onAction callback
      const mockAction: Action = {
        id: 'act_001',
        type: 'click',
        timestamp: Date.now(),
        url: 'http://example.com',
        selector: { priority: ['id'], id: 'btn-submit' },
        tagName: 'button',
        coordinates: { x: 100, y: 50 },
        coordinatesRelativeTo: 'element',
        button: 'left',
        clickCount: 1,
        modifiers: [],
      };

      // Access the onAction callback passed to EventListener
      const eventListenerConstructor = vi.mocked(EventListener);
      const onActionCallback = eventListenerConstructor.mock.calls[0]?.[0];
      onActionCallback?.(mockAction);

      const recording = await recorder.stopRecording();
      expect(recording.actions).toHaveLength(1);
      expect(recording.actions[0]).toEqual(mockAction);
    });

    it('should not collect actions when paused', async () => {
      recorder = new ActionRecorder();
      await recorder.startRecording('Test 1');
      recorder.pauseRecording();

      const mockAction: Action = {
        id: 'act_001',
        type: 'click',
        timestamp: Date.now(),
        url: 'http://example.com',
        selector: { priority: ['id'], id: 'btn' },
        tagName: 'button',
        coordinates: { x: 100, y: 50 },
        coordinatesRelativeTo: 'element',
        button: 'left',
        clickCount: 1,
        modifiers: [],
      };

      const eventListenerConstructor = vi.mocked(EventListener);
      const onActionCallback = eventListenerConstructor.mock.calls[0]?.[0];
      onActionCallback?.(mockAction);

      recorder.resumeRecording();
      const recording = await recorder.stopRecording();
      expect(recording.actions).toHaveLength(0);
    });

    it('should not collect actions when idle', async () => {
      recorder = new ActionRecorder();

      const mockAction: Action = {
        id: 'act_001',
        type: 'click',
        timestamp: Date.now(),
        url: 'http://example.com',
        selector: { priority: ['id'], id: 'btn' },
        tagName: 'button',
        coordinates: { x: 100, y: 50 },
        coordinatesRelativeTo: 'element',
        button: 'left',
        clickCount: 1,
        modifiers: [],
      };

      const eventListenerConstructor = vi.mocked(EventListener);
      const onActionCallback = eventListenerConstructor.mock.calls[0]?.[0];
      onActionCallback?.(mockAction);

      await recorder.startRecording('Test 1');
      const recording = await recorder.stopRecording();
      expect(recording.actions).toHaveLength(0);
    });

    it('should maintain action sequence order', async () => {
      recorder = new ActionRecorder();
      await recorder.startRecording('Test 1');

      const actions: Action[] = [
        {
          id: 'act_001',
          type: 'click',
          timestamp: 1000,
          url: 'http://example.com',
          selector: { priority: ['id'], id: 'btn1' },
          tagName: 'button',
          coordinates: { x: 100, y: 50 },
          coordinatesRelativeTo: 'element',
          button: 'left',
          clickCount: 1,
          modifiers: [],
        },
        {
          id: 'act_002',
          type: 'input',
          timestamp: 2000,
          url: 'http://example.com',
          selector: { priority: ['id'], id: 'input1' },
          tagName: 'input',
          value: 'test',
          inputType: 'text',
          isSensitive: false,
          simulationType: 'type',
        },
        {
          id: 'act_003',
          type: 'click',
          timestamp: 3000,
          url: 'http://example.com',
          selector: { priority: ['id'], id: 'btn2' },
          tagName: 'button',
          coordinates: { x: 200, y: 100 },
          coordinatesRelativeTo: 'element',
          button: 'left',
          clickCount: 1,
          modifiers: [],
        },
      ];

      const eventListenerConstructor = vi.mocked(EventListener);
      const onActionCallback = eventListenerConstructor.mock.calls[0]?.[0];

      actions.forEach((action) => onActionCallback?.(action));

      const recording = await recorder.stopRecording();
      expect(recording.actions).toHaveLength(3);
      expect(recording.actions[0]?.timestamp).toBe(1000);
      expect(recording.actions[1]?.timestamp).toBe(2000);
      expect(recording.actions[2]?.timestamp).toBe(3000);
    });

    it('should handle multiple action types', async () => {
      recorder = new ActionRecorder();
      await recorder.startRecording('Test 1');

      const actions: Action[] = [
        {
          id: 'act_001',
          type: 'click',
          timestamp: 1000,
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
          id: 'act_002',
          type: 'input',
          timestamp: 2000,
          url: 'http://example.com',
          selector: { priority: ['id'], id: 'input' },
          tagName: 'input',
          value: 'test',
          inputType: 'text',
          isSensitive: false,
          simulationType: 'type',
        },
        {
          id: 'act_003',
          type: 'select',
          timestamp: 3000,
          url: 'http://example.com',
          selector: { priority: ['id'], id: 'dropdown' },
          tagName: 'select',
          selectedValue: 'option1',
          selectedText: 'Option 1',
          selectedIndex: 0,
        },
        {
          id: 'act_004',
          type: 'navigation',
          timestamp: 4000,
          url: 'http://example.com/page2',
          from: 'http://example.com/page1',
          to: 'http://example.com/page2',
          navigationTrigger: 'click',
          waitUntil: 'load',
          duration: 500,
        },
        {
          id: 'act_005',
          type: 'scroll',
          timestamp: 5000,
          url: 'http://example.com',
          scrollX: 0,
          scrollY: 500,
          element: 'window',
        },
        {
          id: 'act_006',
          type: 'keypress',
          timestamp: 6000,
          url: 'http://example.com',
          key: 'Enter',
          code: 'Enter',
          modifiers: [],
        },
        {
          id: 'act_007',
          type: 'submit',
          timestamp: 7000,
          url: 'http://example.com',
          selector: { priority: ['id'], id: 'form' },
          tagName: 'form',
        },
      ];

      const eventListenerConstructor = vi.mocked(EventListener);
      const onActionCallback = eventListenerConstructor.mock.calls[0]?.[0];

      actions.forEach((action) => onActionCallback?.(action));

      const recording = await recorder.stopRecording();
      expect(recording.actions).toHaveLength(7);
      expect(recording.actions.map((a: Action) => a.type)).toEqual([
        'click',
        'input',
        'select',
        'navigation',
        'scroll',
        'keypress',
        'submit',
      ]);
    });
  });

  describe('EventListener Integration', () => {
    it('should start EventListener when recording starts', async () => {
      recorder = new ActionRecorder();
      await recorder.startRecording('Test 1');

      const eventListenerConstructor = vi.mocked(EventListener);
      const eventListenerInstance = eventListenerConstructor.mock.results[0]?.value;
      expect(eventListenerInstance?.start).toHaveBeenCalledTimes(1);
    });

    it('should stop EventListener when recording stops', async () => {
      recorder = new ActionRecorder();
      await recorder.startRecording('Test 1');
      await recorder.stopRecording();

      const eventListenerConstructor = vi.mocked(EventListener);
      const eventListenerInstance = eventListenerConstructor.mock.results[0]?.value;
      expect(eventListenerInstance?.stop).toHaveBeenCalledTimes(1);
    });

    it('should stop EventListener when paused', async () => {
      recorder = new ActionRecorder();
      await recorder.startRecording('Test 1');
      recorder.pauseRecording();

      const eventListenerConstructor = vi.mocked(EventListener);
      const eventListenerInstance = eventListenerConstructor.mock.results[0]?.value;
      expect(eventListenerInstance?.stop).toHaveBeenCalled();
    });

    it('should restart EventListener when resumed', async () => {
      recorder = new ActionRecorder();
      await recorder.startRecording('Test 1');
      recorder.pauseRecording();
      recorder.resumeRecording();

      const eventListenerConstructor = vi.mocked(EventListener);
      const eventListenerInstance = eventListenerConstructor.mock.results[0]?.value;
      expect(eventListenerInstance?.start).toHaveBeenCalledTimes(2);
    });

    it('should cleanup EventListener on destroy', () => {
      recorder = new ActionRecorder();
      recorder.destroy();

      const eventListenerConstructor = vi.mocked(EventListener);
      const eventListenerInstance = eventListenerConstructor.mock.results[0]?.value;
      expect(eventListenerInstance?.destroy).toHaveBeenCalledTimes(1);
    });
  });

  describe('State Queries', () => {
    it('should return current state', async () => {
      recorder = new ActionRecorder();
      expect(recorder.getState()).toBe('idle');

      await recorder.startRecording('Test 1');
      expect(recorder.getState()).toBe('recording');

      recorder.pauseRecording();
      expect(recorder.getState()).toBe('paused');

      recorder.resumeRecording();
      expect(recorder.getState()).toBe('recording');

      await recorder.stopRecording();
      expect(recorder.getState()).toBe('idle');
    });

    it('should return metadata when recording', async () => {
      recorder = new ActionRecorder();
      expect(recorder.getMetadata()).toBeNull();

      await recorder.startRecording('Test 1');
      const metadata = recorder.getMetadata();
      expect(metadata).toBeDefined();
      expect(metadata?.testName).toBe('Test 1');
    });

    it('should return null metadata after stopping', async () => {
      recorder = new ActionRecorder();
      await recorder.startRecording('Test 1');
      await recorder.stopRecording();
      expect(recorder.getMetadata()).toBeNull();
    });

    it('should return action count', async () => {
      recorder = new ActionRecorder();
      expect(recorder.getActionCount()).toBe(0);

      await recorder.startRecording('Test 1');

      const actions: Action[] = [
        {
          id: 'act_001',
          type: 'click',
          timestamp: 1000,
          url: 'http://example.com',
          selector: { priority: ['id'], id: 'btn1' },
          tagName: 'button',
          coordinates: { x: 100, y: 50 },
          coordinatesRelativeTo: 'element',
          button: 'left',
          clickCount: 1,
          modifiers: [],
        },
        {
          id: 'act_002',
          type: 'click',
          timestamp: 2000,
          url: 'http://example.com',
          selector: { priority: ['id'], id: 'btn2' },
          tagName: 'button',
          coordinates: { x: 150, y: 75 },
          coordinatesRelativeTo: 'element',
          button: 'left',
          clickCount: 1,
          modifiers: [],
        },
      ];

      const eventListenerConstructor = vi.mocked(EventListener);
      const onActionCallback = eventListenerConstructor.mock.calls[0]?.[0];

      actions.forEach((action) => onActionCallback?.(action));

      expect(recorder.getActionCount()).toBe(2);

      await recorder.stopRecording();
      expect(recorder.getActionCount()).toBe(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle rapid start/stop cycles', async () => {
      recorder = new ActionRecorder();

      await recorder.startRecording('Test 1');
      await recorder.stopRecording();

      await recorder.startRecording('Test 2');
      await recorder.stopRecording();

      await recorder.startRecording('Test 3');
      const recording = await recorder.stopRecording();

      expect(recording.testName).toBe('Test 3');
      expect(recorder.getState()).toBe('idle');
    });

    it('should handle pause/resume cycles', async () => {
      recorder = new ActionRecorder();
      await recorder.startRecording('Test 1');

      recorder.pauseRecording();
      recorder.resumeRecording();

      recorder.pauseRecording();
      recorder.resumeRecording();

      expect(recorder.getState()).toBe('recording');
    });

    it('should clear actions between recordings', async () => {
      recorder = new ActionRecorder();
      await recorder.startRecording('Test 1');

      const mockAction: Action = {
        id: 'act_001',
        type: 'click',
        timestamp: 1000,
        url: 'http://example.com',
        selector: { priority: ['id'], id: 'btn' },
        tagName: 'button',
        coordinates: { x: 100, y: 50 },
        coordinatesRelativeTo: 'element',
        button: 'left',
        clickCount: 1,
        modifiers: [],
      };

      const eventListenerConstructor = vi.mocked(EventListener);
      const onActionCallback = eventListenerConstructor.mock.calls[0]?.[0];
      onActionCallback?.(mockAction);

      let recording = await recorder.stopRecording();
      expect(recording.actions).toHaveLength(1);

      await recorder.startRecording('Test 2');
      recording = await recorder.stopRecording();
      expect(recording.actions).toHaveLength(0);
    });
  });
});

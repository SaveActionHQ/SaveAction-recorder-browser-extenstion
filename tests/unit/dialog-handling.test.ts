import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DIALOG_MESSAGE_TYPE } from '@/content/dialog-interceptor';
import type { DialogAction } from '@/types';
import { isDialogAction } from '@/types';
import { validateAction } from '@/utils/validator';

describe('DialogAction type', () => {
  it('should support alert dialog', () => {
    const action: DialogAction = {
      id: 'act_001',
      type: 'dialog',
      timestamp: 1000,
      completedAt: 1000,
      url: 'http://example.com',
      dialogType: 'alert',
      message: 'Hello!',
      response: 'accept',
    };
    expect(action.type).toBe('dialog');
    expect(action.dialogType).toBe('alert');
    expect(action.response).toBe('accept');
    expect(action.promptValue).toBeUndefined();
  });

  it('should support confirm dialog with accept', () => {
    const action: DialogAction = {
      id: 'act_002',
      type: 'dialog',
      timestamp: 1000,
      completedAt: 1000,
      url: 'http://example.com',
      dialogType: 'confirm',
      message: 'Are you sure?',
      response: 'accept',
    };
    expect(action.dialogType).toBe('confirm');
    expect(action.response).toBe('accept');
  });

  it('should support confirm dialog with dismiss', () => {
    const action: DialogAction = {
      id: 'act_003',
      type: 'dialog',
      timestamp: 1000,
      completedAt: 1000,
      url: 'http://example.com',
      dialogType: 'confirm',
      message: 'Delete this?',
      response: 'dismiss',
    };
    expect(action.response).toBe('dismiss');
  });

  it('should support prompt dialog with accepted value', () => {
    const action: DialogAction = {
      id: 'act_004',
      type: 'dialog',
      timestamp: 1000,
      completedAt: 1000,
      url: 'http://example.com',
      dialogType: 'prompt',
      message: 'Enter name:',
      response: 'accept',
      promptValue: 'John',
    };
    expect(action.dialogType).toBe('prompt');
    expect(action.response).toBe('accept');
    expect(action.promptValue).toBe('John');
  });

  it('should support prompt dialog with dismiss (no value)', () => {
    const action: DialogAction = {
      id: 'act_005',
      type: 'dialog',
      timestamp: 1000,
      completedAt: 1000,
      url: 'http://example.com',
      dialogType: 'prompt',
      message: 'Enter name:',
      response: 'dismiss',
    };
    expect(action.response).toBe('dismiss');
    expect(action.promptValue).toBeUndefined();
  });
});

describe('isDialogAction type guard', () => {
  it('should return true for dialog actions', () => {
    const action: DialogAction = {
      id: 'act_001',
      type: 'dialog',
      timestamp: 1000,
      completedAt: 1000,
      url: 'http://example.com',
      dialogType: 'alert',
      message: 'Test',
      response: 'accept',
    };
    expect(isDialogAction(action)).toBe(true);
  });

  it('should return false for non-dialog actions', () => {
    const action: DialogAction = {
      id: 'act_001',
      type: 'dialog',
      timestamp: 1000,
      completedAt: 1000,
      url: 'http://example.com',
      dialogType: 'alert',
      message: 'Test',
      response: 'accept',
    };
    // Verify it IS a dialog action
    expect(isDialogAction(action)).toBe(true);

    // Manually create a non-dialog to check guard returns false
    const nonDialog = { ...action, type: 'click' as const } as unknown as DialogAction;
    expect(isDialogAction(nonDialog as any)).toBe(false);
  });
});

describe('Dialog validator', () => {
  it('should validate a valid dialog action', () => {
    const action = {
      id: 'act_001',
      type: 'dialog',
      timestamp: 1000,
      completedAt: 1000,
      url: 'http://example.com',
      dialogType: 'alert',
      message: 'Hello',
      response: 'accept',
    };
    const result = validateAction(action as any);
    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should reject dialog action without dialogType', () => {
    const action = {
      id: 'act_001',
      type: 'dialog',
      timestamp: 1000,
      completedAt: 1000,
      url: 'http://example.com',
      message: 'Hello',
      response: 'accept',
    };
    const result = validateAction(action as any);
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.field === 'action.dialogType')).toBe(true);
  });

  it('should reject dialog action with invalid response', () => {
    const action = {
      id: 'act_001',
      type: 'dialog',
      timestamp: 1000,
      completedAt: 1000,
      url: 'http://example.com',
      dialogType: 'confirm',
      message: 'Test',
      response: 'invalid',
    };
    const result = validateAction(action as any);
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.field === 'action.response')).toBe(true);
  });
});

describe('EventListener dialog handling', () => {
  let eventListener: any;
  let capturedActions: any[];
  let mockCallback: (action: any) => void;

  beforeEach(async () => {
    window.scrollTo = vi.fn() as any;
    capturedActions = [];
    mockCallback = vi.fn((action: any) => {
      capturedActions.push(action);
    });
    const { EventListener } = await import('@/content/event-listener');
    eventListener = new EventListener(mockCallback);
    eventListener.setRecordingStartTime(Date.now() - 5000);
  });

  afterEach(() => {
    eventListener.destroy();
    capturedActions = [];
  });

  it('should record alert dialog from postMessage', () => {
    eventListener.start();

    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          type: DIALOG_MESSAGE_TYPE,
          dialogType: 'alert',
          message: 'Hello World',
          response: 'accept',
        },
        source: window,
      })
    );

    expect(capturedActions).toHaveLength(1);
    const action = capturedActions[0];
    expect(action.type).toBe('dialog');
    expect(action.dialogType).toBe('alert');
    expect(action.message).toBe('Hello World');
    expect(action.response).toBe('accept');
  });

  it('should record confirm dialog accept', () => {
    eventListener.start();

    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          type: DIALOG_MESSAGE_TYPE,
          dialogType: 'confirm',
          message: 'Are you sure?',
          response: 'accept',
        },
        source: window,
      })
    );

    expect(capturedActions).toHaveLength(1);
    const action = capturedActions[0];
    expect(action.type).toBe('dialog');
    expect(action.dialogType).toBe('confirm');
    expect(action.response).toBe('accept');
  });

  it('should record confirm dialog dismiss', () => {
    eventListener.start();

    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          type: DIALOG_MESSAGE_TYPE,
          dialogType: 'confirm',
          message: 'Delete item?',
          response: 'dismiss',
        },
        source: window,
      })
    );

    expect(capturedActions).toHaveLength(1);
    expect(capturedActions[0].response).toBe('dismiss');
  });

  it('should record prompt dialog with value', () => {
    eventListener.start();

    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          type: DIALOG_MESSAGE_TYPE,
          dialogType: 'prompt',
          message: 'Enter name:',
          response: 'accept',
          promptValue: 'John',
        },
        source: window,
      })
    );

    expect(capturedActions).toHaveLength(1);
    const action = capturedActions[0];
    expect(action.type).toBe('dialog');
    expect(action.dialogType).toBe('prompt');
    expect(action.response).toBe('accept');
    expect(action.promptValue).toBe('John');
  });

  it('should record prompt dialog dismiss without promptValue', () => {
    eventListener.start();

    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          type: DIALOG_MESSAGE_TYPE,
          dialogType: 'prompt',
          message: 'Enter name:',
          response: 'dismiss',
        },
        source: window,
      })
    );

    expect(capturedActions).toHaveLength(1);
    const action = capturedActions[0];
    expect(action.response).toBe('dismiss');
    expect(action.promptValue).toBeUndefined();
  });

  it('should ignore messages when not listening', () => {
    // Don't call start()
    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          type: DIALOG_MESSAGE_TYPE,
          dialogType: 'alert',
          message: 'Ignored',
          response: 'accept',
        },
        source: window,
      })
    );

    expect(capturedActions).toHaveLength(0);
  });

  it('should ignore non-dialog messages', () => {
    eventListener.start();

    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          type: 'some-other-message',
          payload: 'data',
        },
        source: window,
      })
    );

    expect(capturedActions).toHaveLength(0);
  });

  it('should ignore messages from other sources', () => {
    eventListener.start();

    // MessageEvent with no source (simulates cross-origin)
    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          type: DIALOG_MESSAGE_TYPE,
          dialogType: 'alert',
          message: 'Test',
          response: 'accept',
        },
        // source defaults to null
      })
    );

    expect(capturedActions).toHaveLength(0);
  });

  it('should ignore invalid dialogType', () => {
    eventListener.start();

    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          type: DIALOG_MESSAGE_TYPE,
          dialogType: 'invalid',
          message: 'Test',
          response: 'accept',
        },
        source: window,
      })
    );

    expect(capturedActions).toHaveLength(0);
  });

  it('should assign sequential action IDs', () => {
    eventListener.start();

    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          type: DIALOG_MESSAGE_TYPE,
          dialogType: 'alert',
          message: 'First',
          response: 'accept',
        },
        source: window,
      })
    );

    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          type: DIALOG_MESSAGE_TYPE,
          dialogType: 'confirm',
          message: 'Second',
          response: 'dismiss',
        },
        source: window,
      })
    );

    expect(capturedActions).toHaveLength(2);
    expect(capturedActions[0].id).toMatch(/^act_\d+$/);
    expect(capturedActions[1].id).toMatch(/^act_\d+$/);
    // IDs should be different
    expect(capturedActions[0].id).not.toBe(capturedActions[1].id);
  });

  it('should stop recording dialogs after stop()', () => {
    eventListener.start();

    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          type: DIALOG_MESSAGE_TYPE,
          dialogType: 'alert',
          message: 'Before stop',
          response: 'accept',
        },
        source: window,
      })
    );

    expect(capturedActions).toHaveLength(1);

    eventListener.stop();

    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          type: DIALOG_MESSAGE_TYPE,
          dialogType: 'alert',
          message: 'After stop',
          response: 'accept',
        },
        source: window,
      })
    );

    expect(capturedActions).toHaveLength(1);
  });

  it('should handle empty message gracefully', () => {
    eventListener.start();

    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          type: DIALOG_MESSAGE_TYPE,
          dialogType: 'alert',
          message: '',
          response: 'accept',
        },
        source: window,
      })
    );

    expect(capturedActions).toHaveLength(1);
    expect(capturedActions[0].message).toBe('');
  });

  it('should handle prompt with empty string value', () => {
    eventListener.start();

    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          type: DIALOG_MESSAGE_TYPE,
          dialogType: 'prompt',
          message: 'Enter:',
          response: 'accept',
          promptValue: '',
        },
        source: window,
      })
    );

    expect(capturedActions).toHaveLength(1);
    expect(capturedActions[0].promptValue).toBe('');
  });
});

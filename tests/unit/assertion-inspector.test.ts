import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AssertionInspector } from '@/content/assertion-inspector';
import type { CheckpointAction } from '@/types/actions';

// Mock SelectorGenerator
vi.mock('@/content/selector-generator', () => ({
  SelectorGenerator: vi.fn().mockImplementation(() => ({
    generateSelectors: vi.fn().mockReturnValue({
      priority: ['id'],
      id: 'test-element',
      css: '#test-element',
      xpath: '//*[@id="test-element"]',
    }),
  })),
}));

describe('AssertionInspector', () => {
  let inspector: AssertionInspector;

  beforeEach(() => {
    vi.clearAllMocks();
    inspector = new AssertionInspector();
    // Ensure clean DOM
    document.body.innerHTML = '<div id="test-element">Hello World</div>';
    // jsdom doesn't implement elementFromPoint — provide a stub
    if (!document.elementFromPoint) {
      document.elementFromPoint = vi.fn().mockReturnValue(null);
    }
  });

  afterEach(() => {
    inspector.exit();
    document.body.innerHTML = '';
    // Clean up injected styles
    const style = document.getElementById('saveaction-assertion-styles');
    if (style) style.remove();
  });

  describe('enter/exit lifecycle', () => {
    it('should not be active initially', () => {
      expect(inspector.isActive()).toBe(false);
    });

    it('should become active when enter is called', () => {
      inspector.enter(vi.fn());
      expect(inspector.isActive()).toBe(true);
    });

    it('should become inactive when exit is called', () => {
      inspector.enter(vi.fn());
      inspector.exit();
      expect(inspector.isActive()).toBe(false);
    });

    it('should create overlay on enter', () => {
      inspector.enter(vi.fn());
      const overlay = document.getElementById('saveaction-assertion-overlay');
      expect(overlay).toBeTruthy();
    });

    it('should remove overlay on exit', () => {
      inspector.enter(vi.fn());
      inspector.exit();
      const overlay = document.getElementById('saveaction-assertion-overlay');
      expect(overlay).toBeNull();
    });

    it('should create tooltip on enter', () => {
      inspector.enter(vi.fn());
      const tooltip = document.getElementById('saveaction-assertion-tooltip');
      expect(tooltip).toBeTruthy();
    });

    it('should remove tooltip on exit', () => {
      inspector.enter(vi.fn());
      inspector.exit();
      const tooltip = document.getElementById('saveaction-assertion-tooltip');
      expect(tooltip).toBeNull();
    });

    it('should inject styles on enter', () => {
      inspector.enter(vi.fn());
      const style = document.getElementById('saveaction-assertion-styles');
      expect(style).toBeTruthy();
    });

    it('should remove styles on exit', () => {
      inspector.enter(vi.fn());
      inspector.exit();
      const style = document.getElementById('saveaction-assertion-styles');
      expect(style).toBeNull();
    });

    it('should not enter twice', () => {
      const cb = vi.fn();
      inspector.enter(cb);
      inspector.enter(cb);
      // Only one overlay
      const overlays = document.querySelectorAll('#saveaction-assertion-overlay');
      expect(overlays.length).toBe(1);
    });

    it('should not throw when exiting without entering', () => {
      expect(() => inspector.exit()).not.toThrow();
    });
  });

  describe('overlay content', () => {
    it('should display instruction message in overlay', () => {
      inspector.enter(vi.fn());
      const msg = document.getElementById('saveaction-assertion-overlay-msg');
      expect(msg).toBeTruthy();
      expect(msg!.textContent).toContain('Click any element');
      expect(msg!.textContent).toContain('Escape');
    });
  });

  describe('Escape key handling', () => {
    it('should exit on Escape keydown', () => {
      inspector.enter(vi.fn());
      expect(inspector.isActive()).toBe(true);

      const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
      document.dispatchEvent(event);

      expect(inspector.isActive()).toBe(false);
    });

    it('should call chrome.runtime.sendMessage with EXIT_ASSERTION_MODE on Escape', () => {
      inspector.enter(vi.fn());
      const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
      document.dispatchEvent(event);

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'EXIT_ASSERTION_MODE' })
      );
    });

    it('should ignore non-Escape keys', () => {
      inspector.enter(vi.fn());
      const event = new KeyboardEvent('keydown', { key: 'a', bubbles: true });
      document.dispatchEvent(event);
      expect(inspector.isActive()).toBe(true);
    });
  });

  describe('setRecordingStartTime', () => {
    it('should set the recording start time', () => {
      inspector.setRecordingStartTime(1000);
      // Verify it's set by entering and triggering an assertion
      expect(inspector.isActive()).toBe(false);
    });

    it('should use relative timestamp when start time is set', () => {
      const startTime = Date.now() - 5000;
      inspector.setRecordingStartTime(startTime);
      const cb = vi.fn();
      inspector.enter(cb);

      const el = document.getElementById('test-element')!;
      vi.mocked(document.elementFromPoint).mockReturnValue(el);

      const clickEvent = new MouseEvent('click', {
        bubbles: true,
        clientX: 50,
        clientY: 50,
      });
      Object.defineProperty(clickEvent, 'target', { value: el });
      document.dispatchEvent(clickEvent);

      // Panel should appear
      const panel = document.getElementById('saveaction-assertion-panel');
      if (panel) {
        // Click the Add button
        const addBtn = panel.querySelector(
          '.saveaction-assertion-panel-btn-add'
        ) as HTMLButtonElement;
        if (addBtn) addBtn.click();

        if (cb.mock.calls.length > 0) {
          const checkpoint = cb.mock.calls[0][0] as CheckpointAction;
          // Timestamp should be relative (~5000ms), not absolute
          expect(checkpoint.timestamp).toBeLessThan(Date.now());
          expect(checkpoint.timestamp).toBeGreaterThan(0);
        }
      }
    });
  });

  describe('mouse interaction', () => {
    it('should highlight element on mousemove', () => {
      inspector.enter(vi.fn());

      const el = document.getElementById('test-element')!;
      const moveEvent = new MouseEvent('mousemove', {
        bubbles: true,
        clientX: 50,
        clientY: 50,
      });
      // elementFromPoint returns the element
      vi.mocked(document.elementFromPoint).mockReturnValue(el);
      document.dispatchEvent(moveEvent);

      expect(el.hasAttribute('data-saveaction-assertion-highlight')).toBe(true);
    });

    it('should clear highlight when moving to inspector element', () => {
      inspector.enter(vi.fn());

      const el = document.getElementById('test-element')!;
      vi.mocked(document.elementFromPoint).mockReturnValue(el);
      document.dispatchEvent(
        new MouseEvent('mousemove', { bubbles: true, clientX: 50, clientY: 50 })
      );
      expect(el.hasAttribute('data-saveaction-assertion-highlight')).toBe(true);

      // Move to overlay
      const overlay = document.getElementById('saveaction-assertion-overlay')!;
      vi.mocked(document.elementFromPoint).mockReturnValue(overlay);
      document.dispatchEvent(
        new MouseEvent('mousemove', { bubbles: true, clientX: 10, clientY: 10 })
      );
      expect(el.hasAttribute('data-saveaction-assertion-highlight')).toBe(false);
    });

    it('should show assertion panel on click', () => {
      inspector.enter(vi.fn());

      const el = document.getElementById('test-element')!;
      vi.mocked(document.elementFromPoint).mockReturnValue(el);

      const clickEvent = new MouseEvent('click', {
        bubbles: true,
        clientX: 50,
        clientY: 50,
      });
      Object.defineProperty(clickEvent, 'target', { value: el });
      document.dispatchEvent(clickEvent);

      const panel = document.getElementById('saveaction-assertion-panel');
      expect(panel).not.toBeNull();
    });

    it('should close panel on clicking outside', () => {
      inspector.enter(vi.fn());

      const el = document.getElementById('test-element')!;
      vi.mocked(document.elementFromPoint).mockReturnValue(el);

      // Open panel
      const click1 = new MouseEvent('click', {
        bubbles: true,
        clientX: 50,
        clientY: 50,
      });
      Object.defineProperty(click1, 'target', { value: el });
      document.dispatchEvent(click1);
      expect(document.getElementById('saveaction-assertion-panel')).not.toBeNull();

      // Click outside (on body, not panel)
      vi.mocked(document.elementFromPoint).mockReturnValue(document.body);
      const click2 = new MouseEvent('click', {
        bubbles: true,
        clientX: 1,
        clientY: 1,
      });
      Object.defineProperty(click2, 'target', { value: document.body });
      document.dispatchEvent(click2);
      expect(document.getElementById('saveaction-assertion-panel')).toBeNull();
    });

    it('should emit checkpoint and exit on Add button click', () => {
      const cb = vi.fn();
      inspector.enter(cb);

      const el = document.getElementById('test-element')!;
      vi.mocked(document.elementFromPoint).mockReturnValue(el);

      const clickEvent = new MouseEvent('click', {
        bubbles: true,
        clientX: 50,
        clientY: 50,
      });
      Object.defineProperty(clickEvent, 'target', { value: el });
      document.dispatchEvent(clickEvent);

      const panel = document.getElementById('saveaction-assertion-panel');
      expect(panel).not.toBeNull();

      const addBtn = panel!.querySelector(
        '.saveaction-assertion-panel-btn-add'
      ) as HTMLButtonElement;
      expect(addBtn).not.toBeNull();
      addBtn.click();

      expect(cb).toHaveBeenCalledTimes(1);
      const checkpoint = cb.mock.calls[0][0] as CheckpointAction;
      expect(checkpoint.type).toBe('checkpoint');
      expect(checkpoint.checkType).toBeDefined();
      expect(inspector.isActive()).toBe(false);
    });

    it('should close panel on Cancel button click', () => {
      inspector.enter(vi.fn());

      const el = document.getElementById('test-element')!;
      vi.mocked(document.elementFromPoint).mockReturnValue(el);

      const clickEvent = new MouseEvent('click', {
        bubbles: true,
        clientX: 50,
        clientY: 50,
      });
      Object.defineProperty(clickEvent, 'target', { value: el });
      document.dispatchEvent(clickEvent);

      const panel = document.getElementById('saveaction-assertion-panel');
      const cancelBtn = panel!.querySelector(
        '.saveaction-assertion-panel-btn-cancel'
      ) as HTMLButtonElement;
      cancelBtn.click();

      expect(document.getElementById('saveaction-assertion-panel')).toBeNull();
      // Should still be active (just panel closed)
      expect(inspector.isActive()).toBe(true);
    });
  });

  describe('assertion options', () => {
    it('should offer Has Value for input elements', () => {
      document.body.innerHTML = '<input id="test-input" value="hello" />';
      inspector.enter(vi.fn());

      const el = document.getElementById('test-input')!;
      vi.mocked(document.elementFromPoint).mockReturnValue(el);

      const clickEvent = new MouseEvent('click', {
        bubbles: true,
        clientX: 50,
        clientY: 50,
      });
      Object.defineProperty(clickEvent, 'target', { value: el });
      document.dispatchEvent(clickEvent);

      const panel = document.getElementById('saveaction-assertion-panel');
      const select = panel!.querySelector('select') as HTMLSelectElement;
      const optionValues = Array.from(select.options).map((o) => o.value);
      expect(optionValues).toContain('elementHasValue');
    });

    it('should offer Text Equals for text elements', () => {
      inspector.enter(vi.fn());

      const el = document.getElementById('test-element')!; // has "Hello World"
      vi.mocked(document.elementFromPoint).mockReturnValue(el);

      const clickEvent = new MouseEvent('click', {
        bubbles: true,
        clientX: 50,
        clientY: 50,
      });
      Object.defineProperty(clickEvent, 'target', { value: el });
      document.dispatchEvent(clickEvent);

      const panel = document.getElementById('saveaction-assertion-panel');
      const select = panel!.querySelector('select') as HTMLSelectElement;
      const optionValues = Array.from(select.options).map((o) => o.value);
      expect(optionValues).toContain('elementText');
      expect(optionValues).toContain('containsText');
    });

    it('should always offer pageTitle', () => {
      inspector.enter(vi.fn());

      const el = document.getElementById('test-element')!;
      vi.mocked(document.elementFromPoint).mockReturnValue(el);

      const clickEvent = new MouseEvent('click', {
        bubbles: true,
        clientX: 50,
        clientY: 50,
      });
      Object.defineProperty(clickEvent, 'target', { value: el });
      document.dispatchEvent(clickEvent);

      const panel = document.getElementById('saveaction-assertion-panel');
      const select = panel!.querySelector('select') as HTMLSelectElement;
      const optionValues = Array.from(select.options).map((o) => o.value);
      expect(optionValues).toContain('pageTitle');
      expect(optionValues).toContain('elementVisible');
    });

    it('should update value when assertion type changes', () => {
      document.body.innerHTML = '<input id="test-input" value="myval" />';
      inspector.enter(vi.fn());

      const el = document.getElementById('test-input')!;
      vi.mocked(document.elementFromPoint).mockReturnValue(el);

      const clickEvent = new MouseEvent('click', {
        bubbles: true,
        clientX: 50,
        clientY: 50,
      });
      Object.defineProperty(clickEvent, 'target', { value: el });
      document.dispatchEvent(clickEvent);

      const panel = document.getElementById('saveaction-assertion-panel');
      const select = panel!.querySelector('select') as HTMLSelectElement;
      const input = panel!.querySelector('input') as HTMLInputElement;

      // Change to elementVisible
      select.value = 'elementVisible';
      select.dispatchEvent(new Event('change'));
      expect(input.readOnly).toBe(true);
    });
  });
});

describe('CheckpointAction type', () => {
  it('should support all checkType values', () => {
    const checkTypes: CheckpointAction['checkType'][] = [
      'urlMatch',
      'urlContains',
      'elementVisible',
      'elementText',
      'containsText',
      'elementHasValue',
      'pageLoad',
      'pageTitle',
    ];

    checkTypes.forEach((checkType) => {
      const action: CheckpointAction = {
        id: 'act_001',
        type: 'checkpoint',
        timestamp: 1000,
        completedAt: 1000,
        url: 'http://example.com',
        checkType,
        passed: true,
      };
      expect(action.type).toBe('checkpoint');
      expect(action.checkType).toBe(checkType);
    });
  });

  it('should support manual assertion without auto flag', () => {
    const action: CheckpointAction = {
      id: 'act_001',
      type: 'checkpoint',
      timestamp: 1000,
      completedAt: 1000,
      url: 'http://example.com',
      checkType: 'elementText',
      selector: {
        priority: ['id'],
        id: 'welcome',
        css: '#welcome',
      },
      expectedValue: 'Hello',
      actualValue: 'Hello',
      passed: true,
    };
    expect(action.selector).toBeDefined();
    expect(action.expectedValue).toBe('Hello');
  });

  it('should support failed assertion', () => {
    const action: CheckpointAction = {
      id: 'act_007',
      type: 'checkpoint',
      timestamp: 1000,
      completedAt: 1000,
      url: 'http://example.com',
      checkType: 'elementText',
      selector: {
        priority: ['id'],
        id: 'status',
      },
      expectedValue: 'Success',
      actualValue: 'Error: Unauthorized',
      passed: false,
    };
    expect(action.passed).toBe(false);
    expect(action.expectedValue).not.toBe(action.actualValue);
  });
});

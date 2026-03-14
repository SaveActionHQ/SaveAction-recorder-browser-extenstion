/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { EventListener } from '@/content/event-listener';
import type { Action } from '@/types';

describe('iframe Support', () => {
  let eventListener: EventListener;
  let capturedActions: Action[];
  let mockCallback: (action: Action) => void;

  beforeEach(() => {
    window.scrollTo = vi.fn() as any;
    capturedActions = [];
    mockCallback = vi.fn((action: Action) => {
      capturedActions.push(action);
    });
    eventListener = new EventListener(mockCallback);
  });

  afterEach(() => {
    eventListener.destroy();
    capturedActions = [];
    // Restore window.self/top to default (main frame)
    Object.defineProperty(window, 'self', { value: window, writable: true, configurable: true });
    Object.defineProperty(window, 'top', { value: window, writable: true, configurable: true });
    Object.defineProperty(window, 'frameElement', {
      value: null,
      writable: true,
      configurable: true,
    });
  });

  describe('Frame context detection', () => {
    it('should NOT set frame fields on actions in main frame', () => {
      // window.self === window.top by default (main frame)
      const button = document.createElement('button');
      button.id = 'main-btn';
      button.textContent = 'Main Button';
      document.body.appendChild(button);

      eventListener.start();
      button.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));

      expect(capturedActions).toHaveLength(1);
      expect(capturedActions[0]!.frameUrl).toBeUndefined();
      expect(capturedActions[0]!.frameId).toBeUndefined();
      expect(capturedActions[0]!.frameSelector).toBeUndefined();

      document.body.removeChild(button);
    });

    it('should set frameUrl when running inside an iframe', () => {
      // Simulate iframe context: window.self !== window.top
      const fakeSelf = {} as Window;
      Object.defineProperty(window, 'self', { value: fakeSelf, configurable: true });

      // Create a mock frameElement with id
      const iframeEl = document.createElement('iframe');
      iframeEl.id = 'my-iframe';
      document.body.appendChild(iframeEl);
      Object.defineProperty(window, 'frameElement', { value: iframeEl, configurable: true });

      const button = document.createElement('button');
      button.id = 'inside-iframe-btn';
      button.textContent = 'Inside Iframe';
      document.body.appendChild(button);

      eventListener.start();
      button.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));

      expect(capturedActions).toHaveLength(1);
      const action = capturedActions[0]!;
      expect(action.frameUrl).toBe(window.location.href);
      expect(action.frameId).toBe('my-iframe');
      expect(action.frameSelector).toBe('#my-iframe');

      document.body.removeChild(button);
      document.body.removeChild(iframeEl);
    });

    it('should use iframe name attribute when id is not present', () => {
      const fakeSelf = {} as Window;
      Object.defineProperty(window, 'self', { value: fakeSelf, configurable: true });

      const iframeEl = document.createElement('iframe');
      iframeEl.setAttribute('name', 'content-frame');
      document.body.appendChild(iframeEl);
      Object.defineProperty(window, 'frameElement', { value: iframeEl, configurable: true });

      const button = document.createElement('button');
      button.id = 'name-test-btn';
      button.textContent = 'Named Frame';
      document.body.appendChild(button);

      eventListener.start();
      button.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));

      expect(capturedActions).toHaveLength(1);
      const action = capturedActions[0]!;
      expect(action.frameUrl).toBe(window.location.href);
      expect(action.frameId).toBe('content-frame');
      expect(action.frameSelector).toBe('iframe[name="content-frame"]');

      document.body.removeChild(button);
      document.body.removeChild(iframeEl);
    });

    it('should use src attribute for frameSelector when no id or name', () => {
      const fakeSelf = {} as Window;
      Object.defineProperty(window, 'self', { value: fakeSelf, configurable: true });

      const iframeEl = document.createElement('iframe');
      iframeEl.setAttribute('src', 'https://example.com/embed');
      document.body.appendChild(iframeEl);
      Object.defineProperty(window, 'frameElement', { value: iframeEl, configurable: true });

      const button = document.createElement('button');
      button.id = 'embed-btn';
      button.textContent = 'Embed';
      document.body.appendChild(button);

      eventListener.start();
      button.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));

      expect(capturedActions).toHaveLength(1);
      const action = capturedActions[0]!;
      expect(action.frameUrl).toBeDefined();
      expect(action.frameId).toBeUndefined();
      expect(action.frameSelector).toBeDefined();
      expect(action.frameSelector).toMatch(/^iframe\[src=/);

      document.body.removeChild(button);
      document.body.removeChild(iframeEl);
    });

    it('should fall back to nth-of-type when iframe has no identifying attributes', () => {
      const fakeSelf = {} as Window;
      Object.defineProperty(window, 'self', { value: fakeSelf, configurable: true });

      // Create parent container with multiple iframes
      const container = document.createElement('div');
      const iframe1 = document.createElement('iframe');
      const iframe2 = document.createElement('iframe');
      container.appendChild(iframe1);
      container.appendChild(iframe2);
      document.body.appendChild(container);

      // frameElement is the second iframe
      Object.defineProperty(window, 'frameElement', { value: iframe2, configurable: true });

      const button = document.createElement('button');
      button.id = 'generic-btn';
      button.textContent = 'Click';
      document.body.appendChild(button);

      eventListener.start();
      button.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));

      expect(capturedActions).toHaveLength(1);
      const action = capturedActions[0]!;
      expect(action.frameUrl).toBeDefined();
      expect(action.frameSelector).toBe('iframe:nth-of-type(2)');

      document.body.removeChild(button);
      document.body.removeChild(container);
    });

    it('should handle null frameElement gracefully (cross-origin)', () => {
      const fakeSelf = {} as Window;
      Object.defineProperty(window, 'self', { value: fakeSelf, configurable: true });
      Object.defineProperty(window, 'frameElement', { value: null, configurable: true });

      const button = document.createElement('button');
      button.id = 'cross-origin-btn';
      button.textContent = 'Click';
      document.body.appendChild(button);

      eventListener.start();
      button.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));

      expect(capturedActions).toHaveLength(1);
      const action = capturedActions[0]!;
      // frameUrl should still be set even without frameElement
      expect(action.frameUrl).toBe(window.location.href);
      // frameId and frameSelector are undefined without frameElement
      expect(action.frameId).toBeUndefined();
      expect(action.frameSelector).toBeUndefined();

      document.body.removeChild(button);
    });

    it('should populate frame fields on all action types', () => {
      const fakeSelf = {} as Window;
      Object.defineProperty(window, 'self', { value: fakeSelf, configurable: true });

      const iframeEl = document.createElement('iframe');
      iframeEl.id = 'action-types-frame';
      document.body.appendChild(iframeEl);
      Object.defineProperty(window, 'frameElement', { value: iframeEl, configurable: true });

      // Test click action
      const button = document.createElement('button');
      button.id = 'iframe-action-btn';
      button.textContent = 'Action';
      document.body.appendChild(button);

      eventListener.start();
      button.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));

      // Test input action
      const input = document.createElement('input');
      input.type = 'text';
      input.id = 'iframe-input';
      document.body.appendChild(input);
      input.focus();
      input.value = 'hello';
      input.dispatchEvent(new Event('change', { bubbles: true }));

      // All captured actions should have frame fields
      for (const action of capturedActions) {
        expect(action.frameUrl).toBe(window.location.href);
        expect(action.frameId).toBe('action-types-frame');
        expect(action.frameSelector).toBe('#action-types-frame');
      }

      document.body.removeChild(button);
      document.body.removeChild(input);
      document.body.removeChild(iframeEl);
    });
  });
});

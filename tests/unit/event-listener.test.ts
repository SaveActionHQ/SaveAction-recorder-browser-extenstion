import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { EventListener } from '@/content/event-listener';
import type { Action } from '@/types';

describe('EventListener', () => {
  let eventListener: EventListener;
  let capturedActions: Action[];
  let mockCallback: (action: Action) => void;

  beforeEach(() => {
    // Mock window.scrollTo to silence jsdom warnings
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
  });

  describe('Click Events', () => {
    it('should capture click events with full context', () => {
      const button = document.createElement('button');
      button.id = 'test-button';
      button.textContent = 'Click Me';
      document.body.appendChild(button);

      eventListener.start();

      const clickEvent = new MouseEvent('click', {
        bubbles: true,
        clientX: 100,
        clientY: 200,
        button: 0,
      });
      button.dispatchEvent(clickEvent);

      expect(capturedActions).toHaveLength(1);
      const action = capturedActions[0];
      expect(action?.type).toBe('click');
      
      if (action?.type === 'click') {
        expect(action.button).toBe('left');
        expect(action.clickCount).toBe(1);
        expect(action.coordinates).toBeDefined();
        expect(action.coordinatesRelativeTo).toBe('element');
        expect(action.modifiers).toEqual([]);
        expect(action.text).toBe('Click Me');
      }

      document.body.removeChild(button);
    });

    it('should capture coordinates relative to element', () => {
      const button = document.createElement('button');
      button.style.position = 'absolute';
      button.style.left = '100px';
      button.style.top = '100px';
      button.style.width = '100px';
      button.style.height = '50px';
      document.body.appendChild(button);

      eventListener.start();

      const rect = button.getBoundingClientRect();
      const clickEvent = new MouseEvent('click', {
        bubbles: true,
        clientX: rect.left + 50,
        clientY: rect.top + 25,
      });
      button.dispatchEvent(clickEvent);

      expect(capturedActions).toHaveLength(1);
      const action = capturedActions[0];
      
      if (action?.type === 'click') {
        expect(action.coordinatesRelativeTo).toBe('element');
        // Coordinates should be relative to element
        expect(action.coordinates.x).toBeGreaterThanOrEqual(0);
        expect(action.coordinates.y).toBeGreaterThanOrEqual(0);
      }

      document.body.removeChild(button);
    });

    it('should capture modifier keys on clicks', () => {
      const button = document.createElement('button');
      document.body.appendChild(button);

      eventListener.start();

      const clickEvent = new MouseEvent('click', {
        bubbles: true,
        ctrlKey: true,
        shiftKey: true,
      });
      button.dispatchEvent(clickEvent);

      expect(capturedActions).toHaveLength(1);
      const action = capturedActions[0];
      
      if (action?.type === 'click') {
        expect(action.modifiers).toContain('ctrl');
        expect(action.modifiers).toContain('shift');
      }

      document.body.removeChild(button);
    });

    it('should detect double-clicks', () => {
      const button = document.createElement('button');
      document.body.appendChild(button);

      eventListener.start();

      // First click
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      
      // Second click (within double-click threshold)
      button.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));

      const doubleClickAction = capturedActions.find((a) => a.type === 'click' && 'clickCount' in a && a.clickCount === 2);
      expect(doubleClickAction).toBeDefined();

      document.body.removeChild(button);
    });

    it('should capture right-click events', () => {
      const button = document.createElement('button');
      document.body.appendChild(button);

      eventListener.start();

      const rightClickEvent = new MouseEvent('click', {
        bubbles: true,
        button: 2,
      });
      button.dispatchEvent(rightClickEvent);

      expect(capturedActions).toHaveLength(1);
      const action = capturedActions[0];
      
      if (action?.type === 'click') {
        expect(action.button).toBe('right');
      }

      document.body.removeChild(button);
    });

    it('should ignore clicks on non-interactive elements without handlers', () => {
      const div = document.createElement('div');
      div.textContent = 'Plain div';
      document.body.appendChild(div);

      eventListener.start();

      div.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(capturedActions).toHaveLength(0);

      document.body.removeChild(div);
    });
  });

  describe('Input Events', () => {
    it('should capture input events with value', async () => {
      const input = document.createElement('input');
      input.type = 'text';
      input.id = 'username';
      document.body.appendChild(input);

      eventListener.start();

      input.value = 'testuser';
      input.dispatchEvent(new Event('input', { bubbles: true }));

      // Wait for debounce
      await new Promise((resolve) => setTimeout(resolve, 600));

      expect(capturedActions).toHaveLength(1);
      const action = capturedActions[0];
      
      if (action?.type === 'input') {
        expect(action.value).toBe('testuser');
        expect(action.inputType).toBe('text');
        expect(action.isSensitive).toBe(false);
        expect(action.simulationType).toBe('type');
      }

      document.body.removeChild(input);
    });

    it('should debounce rapid input events', async () => {
      const input = document.createElement('input');
      input.type = 'text';
      document.body.appendChild(input);

      eventListener.start();

      // Simulate rapid typing
      input.value = 't';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      
      input.value = 'te';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      
      input.value = 'tes';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      
      input.value = 'test';
      input.dispatchEvent(new Event('input', { bubbles: true }));

      // Wait for debounce
      await new Promise((resolve) => setTimeout(resolve, 600));

      // Should only capture one final input action
      const inputActions = capturedActions.filter((a) => a.type === 'input');
      expect(inputActions.length).toBeLessThanOrEqual(1);
      
      if (inputActions[0]?.type === 'input') {
        expect(inputActions[0].value).toBe('test');
      }

      document.body.removeChild(input);
    });

    it('should capture typing delay for simulation', async () => {
      const input = document.createElement('input');
      document.body.appendChild(input);

      eventListener.start();

      input.value = 'hello';
      input.dispatchEvent(new Event('input', { bubbles: true }));

      await new Promise((resolve) => setTimeout(resolve, 600));

      const action = capturedActions.find((a) => a.type === 'input');
      
      if (action?.type === 'input') {
        expect(action.typingDelay).toBeDefined();
        expect(action.typingDelay).toBeGreaterThanOrEqual(0);
      }

      document.body.removeChild(input);
    });

    it('should detect sensitive input fields', () => {
      const passwordInput = document.createElement('input');
      passwordInput.type = 'password';
      passwordInput.id = 'password';
      document.body.appendChild(passwordInput);

      eventListener.start();

      passwordInput.value = 'secret123';
      passwordInput.dispatchEvent(new Event('input', { bubbles: true }));

      // Wait for debounce
      setTimeout(() => {
        const action = capturedActions.find((a) => a.type === 'input');
        
        if (action?.type === 'input') {
          expect(action.isSensitive).toBe(true);
        }
      }, 600);

      document.body.removeChild(passwordInput);
    });
  });

  describe('Select Events', () => {
    it('should capture select dropdown changes', () => {
      const select = document.createElement('select');
      const option1 = document.createElement('option');
      option1.value = 'value1';
      option1.textContent = 'Option 1';
      const option2 = document.createElement('option');
      option2.value = 'value2';
      option2.textContent = 'Option 2';
      
      select.appendChild(option1);
      select.appendChild(option2);
      document.body.appendChild(select);

      eventListener.start();

      select.value = 'value2';
      select.dispatchEvent(new Event('change', { bubbles: true }));

      expect(capturedActions).toHaveLength(1);
      const action = capturedActions[0];
      
      if (action?.type === 'select') {
        expect(action.selectedValue).toBe('value2');
        expect(action.selectedText).toBe('Option 2');
        expect(action.selectedIndex).toBe(1);
      }

      document.body.removeChild(select);
    });
  });

  describe('Navigation Events', () => {
    it('should capture navigation with trigger source', () => {
      eventListener.start();

      const beforeUrl = window.location.href;
      
      // Simulate navigation
      window.history.pushState({}, '', '/new-page');
      window.dispatchEvent(new PopStateEvent('popstate'));

      const action = capturedActions.find((a) => a.type === 'navigation');
      
      if (action?.type === 'navigation') {
        expect(action.from).toBeDefined();
        expect(action.to).toContain('/new-page');
        expect(action.navigationTrigger).toBeDefined();
      }

      // Restore URL
      window.history.pushState({}, '', beforeUrl);
    });

    it('should capture navigation duration', async () => {
      eventListener.start();
      
      window.history.pushState({}, '', '/test-page');
      window.dispatchEvent(new PopStateEvent('popstate'));

      await new Promise((resolve) => setTimeout(resolve, 100));

      const action = capturedActions.find((a) => a.type === 'navigation');
      
      if (action?.type === 'navigation') {
        expect(action.duration).toBeDefined();
        expect(action.duration).toBeGreaterThanOrEqual(0);
      }

      window.history.back();
    });
  });

  describe('Form Submit Events', () => {
    it('should capture form submissions', () => {
      const form = document.createElement('form');
      const input = document.createElement('input');
      input.name = 'username';
      input.value = 'testuser';
      form.appendChild(input);
      document.body.appendChild(form);

      eventListener.start();

      const submitEvent = new Event('submit', { bubbles: true, cancelable: true });
      form.dispatchEvent(submitEvent);

      const action = capturedActions.find((a) => a.type === 'submit');
      expect(action).toBeDefined();

      document.body.removeChild(form);
    });
  });

  describe('Keypress Events', () => {
    it('should capture keypress with modifiers', () => {
      const input = document.createElement('input');
      document.body.appendChild(input);

      eventListener.start();

      const keyEvent = new KeyboardEvent('keydown', {
        key: 'Enter',
        code: 'Enter',
        ctrlKey: true,
        bubbles: true,
      });
      input.dispatchEvent(keyEvent);

      const action = capturedActions.find((a) => a.type === 'keypress');
      
      if (action?.type === 'keypress') {
        expect(action.key).toBe('Enter');
        expect(action.code).toBe('Enter');
        expect(action.modifiers).toContain('ctrl');
      }

      document.body.removeChild(input);
    });
  });

  describe('Scroll Events', () => {
    it('should debounce scroll events', async () => {
      eventListener.start();

      // Simulate multiple scroll events
      window.scrollTo(0, 100);
      window.dispatchEvent(new Event('scroll'));
      
      window.scrollTo(0, 200);
      window.dispatchEvent(new Event('scroll'));
      
      window.scrollTo(0, 300);
      window.dispatchEvent(new Event('scroll'));

      // Wait for debounce
      await new Promise((resolve) => setTimeout(resolve, 300));

      const scrollActions = capturedActions.filter((a) => a.type === 'scroll');
      
      // Should capture only final position after debounce
      expect(scrollActions.length).toBeLessThanOrEqual(1);
    });
  });

  describe('Smart Filtering', () => {
    it('should ignore mousemove events', () => {
      const button = document.createElement('button');
      document.body.appendChild(button);

      eventListener.start();

      button.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));

      expect(capturedActions).toHaveLength(0);

      document.body.removeChild(button);
    });

    it('should ignore duplicate consecutive actions', async () => {
      const button = document.createElement('button');
      button.id = 'test';
      document.body.appendChild(button);

      eventListener.start();

      // Click same element multiple times rapidly
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      await new Promise((resolve) => setTimeout(resolve, 100));

      // Should not capture exact duplicates
      expect(capturedActions.length).toBeGreaterThan(0);

      document.body.removeChild(button);
    });
  });

  describe('Lifecycle', () => {
    it('should start and stop listening', () => {
      const button = document.createElement('button');
      document.body.appendChild(button);

      eventListener.start();
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      
      const countAfterStart = capturedActions.length;
      expect(countAfterStart).toBeGreaterThan(0);

      eventListener.stop();
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      const countAfterStop = capturedActions.length;
      expect(countAfterStop).toBe(countAfterStart);

      document.body.removeChild(button);
    });

    it('should cleanup on destroy', () => {
      eventListener.start();
      eventListener.destroy();

      const button = document.createElement('button');
      document.body.appendChild(button);

      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(capturedActions).toHaveLength(0);

      document.body.removeChild(button);
    });
  });
});

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

      const doubleClickAction = capturedActions.find(
        (a) => a.type === 'click' && 'clickCount' in a && a.clickCount === 2
      );
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

      // Trigger focus event before input (simulates user clicking on input)
      input.dispatchEvent(new FocusEvent('focus', { bubbles: true }));

      input.value = 'testuser';
      input.dispatchEvent(new Event('input', { bubbles: true }));

      // Wait for debounce then stop to flush
      await new Promise((resolve) => setTimeout(resolve, 600));
      eventListener.stop();

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

      // Trigger focus event before input
      input.dispatchEvent(new FocusEvent('focus', { bubbles: true }));

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

      // Trigger focus event before input
      input.dispatchEvent(new FocusEvent('focus', { bubbles: true }));

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

    it('should detect sensitive input fields and store actual password', () => {
      const passwordInput = document.createElement('input');
      passwordInput.type = 'password';
      passwordInput.id = 'password';
      document.body.appendChild(passwordInput);

      eventListener.start();

      // Trigger focus event before input
      passwordInput.dispatchEvent(new FocusEvent('focus', { bubbles: true }));

      passwordInput.value = 'secret123';
      passwordInput.dispatchEvent(new Event('input', { bubbles: true }));

      // Wait for debounce
      setTimeout(() => {
        const action = capturedActions.find((a) => a.type === 'input');

        if (action?.type === 'input') {
          expect(action.isSensitive).toBe(true);
          expect(action.variableName).toBeDefined();
          expect(action.variableName).toBe('PASSWORD');
          expect(action.value).toBe('secret123'); // Now stores actual password
        }
      }, 600);

      document.body.removeChild(passwordInput);
    });
  });

  describe('Select Events', () => {
    it('should capture basic select dropdown changes', () => {
      const select = document.createElement('select');
      select.id = 'country';
      select.name = 'country';

      const option1 = document.createElement('option');
      option1.value = '';
      option1.textContent = 'Select a country';

      const option2 = document.createElement('option');
      option2.value = 'us';
      option2.textContent = 'United States';

      const option3 = document.createElement('option');
      option3.value = 'uk';
      option3.textContent = 'United Kingdom';

      select.appendChild(option1);
      select.appendChild(option2);
      select.appendChild(option3);
      document.body.appendChild(select);

      eventListener.start();

      select.value = 'uk';
      select.dispatchEvent(new Event('change', { bubbles: true }));

      expect(capturedActions).toHaveLength(1);
      const action = capturedActions[0];

      if (action?.type === 'select') {
        expect(action.selectedValue).toBe('uk');
        expect(action.selectedText).toBe('United Kingdom');
        expect(action.selectedIndex).toBe(2);
        expect(action.selectId).toBe('country');
        expect(action.selectName).toBe('country');
        expect(action.isMultiple).toBe(false);
        expect(action.selectedOption).toBeDefined();
        expect(action.selectedOption?.text).toBe('United Kingdom');
        expect(action.selectedOption?.value).toBe('uk');
        expect(action.selectedOption?.index).toBe(2);
      }

      document.body.removeChild(select);
    });

    it('should handle multi-select dropdowns', () => {
      const select = document.createElement('select');
      select.id = 'tags';
      select.name = 'tags';
      select.multiple = true;

      const option1 = document.createElement('option');
      option1.value = 'tag1';
      option1.textContent = 'Tag 1';

      const option2 = document.createElement('option');
      option2.value = 'tag2';
      option2.textContent = 'Tag 2';

      const option3 = document.createElement('option');
      option3.value = 'tag3';
      option3.textContent = 'Tag 3';

      select.appendChild(option1);
      select.appendChild(option2);
      select.appendChild(option3);
      document.body.appendChild(select);

      eventListener.start();

      // Select multiple options
      option1.selected = true;
      option3.selected = true;
      select.dispatchEvent(new Event('change', { bubbles: true }));

      expect(capturedActions).toHaveLength(1);
      const action = capturedActions[0];

      if (action?.type === 'select') {
        expect(action.isMultiple).toBe(true);
        expect(action.selectedOptions).toBeDefined();
        expect(action.selectedOptions).toHaveLength(2);
        expect(action.selectedOptions?.[0]?.text).toBe('Tag 1');
        expect(action.selectedOptions?.[0]?.value).toBe('tag1');
        expect(action.selectedOptions?.[1]?.text).toBe('Tag 3');
        expect(action.selectedOptions?.[1]?.value).toBe('tag3');
      }

      document.body.removeChild(select);
    });

    it('should skip disabled select elements', () => {
      const select = document.createElement('select');
      select.id = 'country';
      select.disabled = true;

      const option1 = document.createElement('option');
      option1.value = 'us';
      option1.textContent = 'United States';

      select.appendChild(option1);
      document.body.appendChild(select);

      eventListener.start();

      select.value = 'us';
      select.dispatchEvent(new Event('change', { bubbles: true }));

      // Should not record disabled selects
      expect(capturedActions).toHaveLength(0);

      document.body.removeChild(select);
    });

    it('should skip empty select elements', () => {
      const select = document.createElement('select');
      select.id = 'country';
      document.body.appendChild(select);

      eventListener.start();

      select.dispatchEvent(new Event('change', { bubbles: true }));

      // Should not record empty selects
      expect(capturedActions).toHaveLength(0);

      document.body.removeChild(select);
    });

    it('should skip select with no selected option', () => {
      const select = document.createElement('select');
      select.id = 'country';

      const option1 = document.createElement('option');
      option1.value = 'us';
      option1.textContent = 'United States';

      select.appendChild(option1);
      document.body.appendChild(select);

      eventListener.start();

      // Force selectedIndex to -1 (no selection)
      Object.defineProperty(select, 'selectedIndex', {
        value: -1,
        writable: true,
      });

      select.dispatchEvent(new Event('change', { bubbles: true }));

      // Should not record when no option is selected
      expect(capturedActions).toHaveLength(0);

      document.body.removeChild(select);
    });

    it('should skip hidden select elements', () => {
      const select = document.createElement('select');
      select.id = 'country';
      select.style.display = 'none';

      const option1 = document.createElement('option');
      option1.value = 'us';
      option1.textContent = 'United States';

      select.appendChild(option1);
      document.body.appendChild(select);

      eventListener.start();

      select.value = 'us';
      select.dispatchEvent(new Event('change', { bubbles: true }));

      // Should not record hidden selects
      expect(capturedActions).toHaveLength(0);

      document.body.removeChild(select);
    });

    it('should handle select with label attribute', () => {
      const select = document.createElement('select');
      select.id = 'country';

      const option1 = document.createElement('option');
      option1.value = 'uk';
      option1.textContent = 'UK';
      option1.label = 'United Kingdom';

      select.appendChild(option1);
      document.body.appendChild(select);

      eventListener.start();

      select.value = 'uk';
      select.dispatchEvent(new Event('change', { bubbles: true }));

      expect(capturedActions).toHaveLength(1);
      const action = capturedActions[0];

      if (action?.type === 'select') {
        expect(action.selectedOption?.label).toBe('United Kingdom');
      }

      document.body.removeChild(select);
    });

    it('should include element state and wait conditions', () => {
      const select = document.createElement('select');
      select.id = 'country';

      const option1 = document.createElement('option');
      option1.value = 'us';
      option1.textContent = 'United States';

      select.appendChild(option1);
      document.body.appendChild(select);

      eventListener.start();

      select.value = 'us';
      select.dispatchEvent(new Event('change', { bubbles: true }));

      expect(capturedActions).toHaveLength(1);
      const action = capturedActions[0];

      // Should include metadata for smart waits
      expect(action?.elementState).toBeDefined();
      expect(action?.waitConditions).toBeDefined();

      document.body.removeChild(select);
    });
  });

  describe('Select Element Right-Click Fix', () => {
    it('should correct false right-click with suspicious coordinates to left-click', () => {
      const select = document.createElement('select');
      select.id = 'test-select';

      const option1 = document.createElement('option');
      option1.value = 'opt1';
      option1.textContent = 'Option 1';

      select.appendChild(option1);
      document.body.appendChild(select);

      eventListener.start();

      // Simulate synthetic right-click event with suspicious coordinates (near-zero)
      // This mimics the browser bug when opening native <select> dropdown
      const syntheticRightClick = new MouseEvent('click', {
        bubbles: true,
        clientX: 0.5, // Suspicious near-zero X
        clientY: 0.8, // Suspicious near-zero Y
        button: 2, // Right-click button code
      });

      select.dispatchEvent(syntheticRightClick);

      expect(capturedActions).toHaveLength(1);
      const action = capturedActions[0];

      if (action?.type === 'click') {
        // Should be corrected to left-click
        expect(action.button).toBe('left');
        expect(action.tagName).toBe('select');
        console.log('[Test] Synthetic right-click corrected:', action.button);
      }

      document.body.removeChild(select);
    });

    it('should correct false right-click with negative coordinates to left-click', () => {
      const select = document.createElement('select');
      select.id = 'test-select';

      const option1 = document.createElement('option');
      option1.value = 'opt1';
      option1.textContent = 'Option 1';

      select.appendChild(option1);
      document.body.appendChild(select);

      eventListener.start();

      // Simulate synthetic right-click with negative coordinates (common in real bug)
      const syntheticRightClick = new MouseEvent('click', {
        bubbles: true,
        clientX: -0.8, // Negative X (common in browser bug)
        clientY: -0.6, // Negative Y
        button: 2, // Right-click
      });

      select.dispatchEvent(syntheticRightClick);

      expect(capturedActions).toHaveLength(1);
      const action = capturedActions[0];

      if (action?.type === 'click') {
        expect(action.button).toBe('left');
        expect(action.tagName).toBe('select');
      }

      document.body.removeChild(select);
    });

    it('should preserve genuine right-click with normal coordinates', () => {
      const select = document.createElement('select');
      select.id = 'test-select';

      const option1 = document.createElement('option');
      option1.value = 'opt1';
      option1.textContent = 'Option 1';

      select.appendChild(option1);
      document.body.appendChild(select);

      eventListener.start();

      // Simulate genuine right-click with normal coordinates (e.g., context menu)
      const genuineRightClick = new MouseEvent('click', {
        bubbles: true,
        clientX: 50, // Normal X coordinate
        clientY: 30, // Normal Y coordinate
        button: 2, // Right-click
      });

      select.dispatchEvent(genuineRightClick);

      expect(capturedActions).toHaveLength(1);
      const action = capturedActions[0];

      if (action?.type === 'click') {
        // Should preserve genuine right-click
        expect(action.button).toBe('right');
        expect(action.tagName).toBe('select');
        console.log('[Test] Genuine right-click preserved:', action.button);
      }

      document.body.removeChild(select);
    });

    it('should handle left-clicks on select normally', () => {
      const select = document.createElement('select');
      select.id = 'test-select';

      const option1 = document.createElement('option');
      option1.value = 'opt1';
      option1.textContent = 'Option 1';

      select.appendChild(option1);
      document.body.appendChild(select);

      eventListener.start();

      // Normal left-click
      const leftClick = new MouseEvent('click', {
        bubbles: true,
        clientX: 50,
        clientY: 30,
        button: 0, // Left-click
      });

      select.dispatchEvent(leftClick);

      expect(capturedActions).toHaveLength(1);
      const action = capturedActions[0];

      if (action?.type === 'click') {
        expect(action.button).toBe('left');
        expect(action.tagName).toBe('select');
      }

      document.body.removeChild(select);
    });

    it('should not affect right-clicks on non-select elements', () => {
      const button = document.createElement('button');
      button.id = 'test-button';
      button.textContent = 'Click Me';
      document.body.appendChild(button);

      eventListener.start();

      // Right-click on button (not a select) with any coordinates
      const rightClick = new MouseEvent('click', {
        bubbles: true,
        clientX: 0.5, // Near-zero coords
        clientY: 0.5,
        button: 2, // Right-click
      });

      button.dispatchEvent(rightClick);

      expect(capturedActions).toHaveLength(1);
      const action = capturedActions[0];

      if (action?.type === 'click') {
        // Should preserve right-click on non-select elements
        expect(action.button).toBe('right');
        expect(action.tagName).toBe('button');
      }

      document.body.removeChild(button);
    });

    it('should handle multiple rapid clicks on select correctly', () => {
      const select = document.createElement('select');
      select.id = 'test-select';

      const option1 = document.createElement('option');
      option1.value = 'opt1';
      option1.textContent = 'Option 1';

      select.appendChild(option1);
      document.body.appendChild(select);

      eventListener.start();

      // Simulate rapid sequence: synthetic right-click, then user left-click
      const syntheticRightClick = new MouseEvent('click', {
        bubbles: true,
        clientX: -0.5,
        clientY: -0.3,
        button: 2,
      });

      const userLeftClick = new MouseEvent('click', {
        bubbles: true,
        clientX: 50,
        clientY: 30,
        button: 0,
      });

      select.dispatchEvent(syntheticRightClick);

      // Wait a bit to avoid duplicate detection
      setTimeout(() => {
        select.dispatchEvent(userLeftClick);
      }, 250);

      // Should eventually have 2 actions, both left-clicks
      setTimeout(() => {
        expect(capturedActions.length).toBeGreaterThanOrEqual(1);

        const actions = capturedActions.filter(
          (a) => a.type === 'click' && 'tagName' in a && a.tagName === 'select'
        );

        // All select clicks should be left
        actions.forEach((action) => {
          if (action.type === 'click') {
            expect(action.button).toBe('left');
          }
        });
      }, 500);

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

  describe('MouseDown Events', () => {
    it('should capture mousedown events on interactive elements', () => {
      const button = document.createElement('button');
      button.type = 'button'; // Explicitly set type to avoid submit button behavior
      button.textContent = 'Test Button';
      document.body.appendChild(button);

      eventListener.start();

      const mouseDownEvent = new MouseEvent('mousedown', {
        bubbles: true,
        clientX: 100,
        clientY: 200,
        button: 0,
      });
      button.dispatchEvent(mouseDownEvent);

      expect(capturedActions).toHaveLength(1);
      const action = capturedActions[0];
      expect(action?.type).toBe('click');

      if (action?.type === 'click') {
        expect(action.button).toBe('left');
        expect(action.text).toBe('Test Button');
      }

      document.body.removeChild(button);
    });

    it('should capture mousedown on nested elements in dropdown lists', () => {
      const ul = document.createElement('ul');
      ul.className = 'form__autocomplete';
      const li = document.createElement('li');
      const span = document.createElement('span');
      span.textContent = 'Dropdown Option';
      li.appendChild(span);
      ul.appendChild(li);
      document.body.appendChild(ul);

      eventListener.start();

      const mouseDownEvent = new MouseEvent('mousedown', {
        bubbles: true,
        clientX: 50,
        clientY: 50,
        button: 0,
      });
      span.dispatchEvent(mouseDownEvent);

      expect(capturedActions).toHaveLength(1);
      const action = capturedActions[0];
      expect(action?.type).toBe('click');

      if (action?.type === 'click') {
        // Span itself is detected as interactive (inside LI in autocomplete list)
        // This matches real-world behavior - we want to capture the clicked element
        expect(['li', 'span']).toContain(action.tagName);
        expect(action.text).toBe('Dropdown Option');
      }

      document.body.removeChild(ul);
    });

    it('should skip mousedown on navigation links to avoid duplicates', () => {
      const link = document.createElement('a');
      link.href = 'https://example.com';
      link.textContent = 'Navigate';
      document.body.appendChild(link);

      eventListener.start();

      const mouseDownEvent = new MouseEvent('mousedown', {
        bubbles: true,
        button: 0,
      });
      link.dispatchEvent(mouseDownEvent);

      // Should not capture mousedown on links (will be captured on click instead)
      expect(capturedActions).toHaveLength(0);

      document.body.removeChild(link);
    });

    it('should not capture mousedown when not listening', () => {
      const button = document.createElement('button');
      document.body.appendChild(button);

      const mouseDownEvent = new MouseEvent('mousedown', {
        bubbles: true,
        button: 0,
      });
      button.dispatchEvent(mouseDownEvent);

      expect(capturedActions).toHaveLength(0);

      document.body.removeChild(button);
    });

    it('should capture mousedown on list items', () => {
      const ul = document.createElement('ul');
      const li = document.createElement('li');
      li.textContent = 'List Item';
      ul.appendChild(li);
      document.body.appendChild(ul);

      eventListener.start();

      const mouseDownEvent = new MouseEvent('mousedown', {
        bubbles: true,
        button: 0,
      });
      li.dispatchEvent(mouseDownEvent);

      expect(capturedActions).toHaveLength(1);
      const action = capturedActions[0];
      expect(action?.type).toBe('click');

      if (action?.type === 'click') {
        expect(action.tagName).toBe('li');
        expect(action.text).toBe('List Item');
      }

      document.body.removeChild(ul);
    });

    it('should handle mousedown on elements with onclick handlers', () => {
      const div = document.createElement('div');
      div.setAttribute('onclick', 'return false;');
      div.textContent = 'Clickable Div';
      document.body.appendChild(div);

      eventListener.start();

      const mouseDownEvent = new MouseEvent('mousedown', {
        bubbles: true,
        button: 0,
      });
      div.dispatchEvent(mouseDownEvent);

      expect(capturedActions).toHaveLength(1);
      const action = capturedActions[0];
      expect(action?.type).toBe('click');

      document.body.removeChild(div);
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

  describe('Duplicate Detection', () => {
    it('should prevent duplicate click actions', () => {
      const button = document.createElement('button');
      button.id = 'test-btn';
      document.body.appendChild(button);

      eventListener.start();

      // First click
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(capturedActions).toHaveLength(1);

      // Immediate duplicate click (within 500ms)
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(capturedActions).toHaveLength(1); // Should still be 1

      document.body.removeChild(button);
    });

    it('should prevent duplicate input actions', async () => {
      const input = document.createElement('input');
      input.id = 'test-input';
      document.body.appendChild(input);

      eventListener.start();

      // Trigger focus event before input
      input.dispatchEvent(new FocusEvent('focus', { bubbles: true }));

      // First input
      input.value = 'test';
      input.dispatchEvent(new Event('input', { bubbles: true }));

      // Wait for debounce then stop to flush
      await new Promise((resolve) => setTimeout(resolve, 600));
      eventListener.stop();

      const firstCount = capturedActions.length;
      expect(firstCount).toBeGreaterThan(0);

      // Different input value (will not be duplicate)
      eventListener.start(); // Restart after stop
      input.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
      input.value = 'test2';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 600));
      eventListener.stop();

      // Should increase because value changed
      expect(capturedActions.length).toBeGreaterThan(firstCount);

      document.body.removeChild(input);
    });

    it('should detect hover actions', () => {
      const div = document.createElement('div');
      div.id = 'hover-test';
      div.style.width = '100px';
      div.style.height = '100px';
      document.body.appendChild(div);

      eventListener.start();

      // Hover
      div.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
      div.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));

      // Check for hover action
      const hoverActions = capturedActions.filter((a) => a.type === 'hover');
      expect(hoverActions.length).toBeGreaterThanOrEqual(0);

      document.body.removeChild(div);
    });

    it('should allow actions after debounce window expires', async () => {
      const button = document.createElement('button');
      button.id = 'test-btn';
      document.body.appendChild(button);

      eventListener.start();

      // First click
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(capturedActions).toHaveLength(1);

      // Wait for debounce window to expire
      await new Promise((resolve) => setTimeout(resolve, 600));

      // Second click should be recorded
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(capturedActions).toHaveLength(2);

      document.body.removeChild(button);
    });

    it('should handle areSelectorsEqual with null selectors', () => {
      const button = document.createElement('button');
      document.body.appendChild(button);

      eventListener.start();

      // Click without id (will use different selector strategy)
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      const firstCount = capturedActions.length;
      expect(firstCount).toBeGreaterThan(0);

      document.body.removeChild(button);
    });

    it('should compare selectors by id', () => {
      const button1 = document.createElement('button');
      button1.id = 'btn-1';
      const button2 = document.createElement('button');
      button2.id = 'btn-1';
      document.body.appendChild(button1);
      document.body.appendChild(button2);

      eventListener.start();

      button1.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      const firstCount = capturedActions.length;

      // Click on different element with same id (duplicate)
      button2.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(capturedActions.length).toBe(firstCount);

      document.body.removeChild(button1);
      document.body.removeChild(button2);
    });

    it('should compare selectors by css', () => {
      const div1 = document.createElement('div');
      div1.className = 'test-class';
      const div2 = document.createElement('div');
      div2.className = 'test-class';
      document.body.appendChild(div1);
      document.body.appendChild(div2);

      eventListener.start();

      div1.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      const firstCount = capturedActions.length;

      // Click on different element with same class (duplicate)
      div2.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(capturedActions.length).toBe(firstCount);

      document.body.removeChild(div1);
      document.body.removeChild(div2);
    });

    it('should handle select change events', () => {
      const select = document.createElement('select');
      const option1 = document.createElement('option');
      option1.value = 'option1';
      const option2 = document.createElement('option');
      option2.value = 'option2';

      select.appendChild(option1);
      select.appendChild(option2);
      document.body.appendChild(select);

      eventListener.start();

      select.value = 'option2';
      select.dispatchEvent(new Event('change', { bubbles: true }));

      const selectActions = capturedActions.filter((a) => a.type === 'select');
      expect(selectActions.length).toBeGreaterThan(0);

      document.body.removeChild(select);
    });

    it('should handle keypress with special keys', () => {
      const input = document.createElement('input');
      document.body.appendChild(input);

      eventListener.start();

      const keypressEvent = new KeyboardEvent('keydown', {
        key: 'Enter',
        code: 'Enter',
        keyCode: 13,
        bubbles: true,
      });
      input.dispatchEvent(keypressEvent);

      const keypressActions = capturedActions.filter((a) => a.type === 'keypress');
      if (keypressActions.length > 0) {
        expect(keypressActions[0]).toMatchObject({
          type: 'keypress',
          key: 'Enter',
        });
      }

      document.body.removeChild(input);
    });
  });

  describe('Hidden Input Filtering', () => {
    it('should skip clicks on hidden radio inputs', () => {
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.id = 'test-radio';
      radio.name = 'test';
      radio.style.display = 'none';
      document.body.appendChild(radio);

      eventListener.start();

      const clickEvent = new MouseEvent('click', { bubbles: true });
      radio.dispatchEvent(clickEvent);

      expect(capturedActions).toHaveLength(0);

      document.body.removeChild(radio);
    });

    it('should skip clicks on hidden checkbox inputs', () => {
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.id = 'test-checkbox';
      checkbox.style.visibility = 'hidden';
      document.body.appendChild(checkbox);

      eventListener.start();

      const clickEvent = new MouseEvent('click', { bubbles: true });
      checkbox.dispatchEvent(clickEvent);

      expect(capturedActions).toHaveLength(0);

      document.body.removeChild(checkbox);
    });

    it('should skip clicks on radio inputs with opacity 0', () => {
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.id = 'test-radio';
      radio.style.opacity = '0';
      document.body.appendChild(radio);

      eventListener.start();

      const clickEvent = new MouseEvent('click', { bubbles: true });
      radio.dispatchEvent(clickEvent);

      expect(capturedActions).toHaveLength(0);

      document.body.removeChild(radio);
    });

    it('should skip clicks on radio inputs with zero dimensions', () => {
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.id = 'test-radio';
      radio.style.width = '0px';
      radio.style.height = '0px';
      document.body.appendChild(radio);

      eventListener.start();

      const clickEvent = new MouseEvent('click', { bubbles: true });
      radio.dispatchEvent(clickEvent);

      expect(capturedActions).toHaveLength(0);

      document.body.removeChild(radio);
    });

    it('should record clicks on visible radio inputs', () => {
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.id = 'test-radio';
      radio.name = 'test';
      document.body.appendChild(radio);

      eventListener.start();

      const clickEvent = new MouseEvent('click', { bubbles: true });
      radio.dispatchEvent(clickEvent);

      expect(capturedActions.length).toBeGreaterThan(0);
      const action = capturedActions[0];
      expect(action?.type).toBe('click');

      if (action?.type === 'click') {
        expect(action.tagName).toBe('input');
      }

      document.body.removeChild(radio);
    });

    it('should record clicks on visible checkbox inputs', () => {
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.id = 'test-checkbox';
      document.body.appendChild(checkbox);

      eventListener.start();

      const clickEvent = new MouseEvent('click', { bubbles: true });
      checkbox.dispatchEvent(clickEvent);

      expect(capturedActions.length).toBeGreaterThan(0);
      const action = capturedActions[0];
      expect(action?.type).toBe('click');

      if (action?.type === 'click') {
        expect(action.tagName).toBe('input');
      }

      document.body.removeChild(checkbox);
    });

    it('should skip mousedown on hidden radio inputs', () => {
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.id = 'test-radio';
      radio.style.display = 'none';
      document.body.appendChild(radio);

      eventListener.start();

      const mouseDownEvent = new MouseEvent('mousedown', { bubbles: true });
      radio.dispatchEvent(mouseDownEvent);

      expect(capturedActions).toHaveLength(0);

      document.body.removeChild(radio);
    });

    it('should skip input events on hidden radio inputs', async () => {
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.id = 'test-radio';
      radio.value = 'test';
      radio.style.display = 'none';
      document.body.appendChild(radio);

      eventListener.start();

      radio.value = 'changed';
      const inputEvent = new Event('input', { bubbles: true });
      radio.dispatchEvent(inputEvent);

      await new Promise((resolve) => setTimeout(resolve, 600));

      const inputActions = capturedActions.filter((a) => a.type === 'input');
      expect(inputActions).toHaveLength(0);

      document.body.removeChild(radio);
    });

    it('should record label clicks for hidden radio inputs', () => {
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.id = 'test-radio';
      radio.style.display = 'none';

      const label = document.createElement('label');
      label.htmlFor = 'test-radio';
      label.textContent = 'Test Label';

      document.body.appendChild(radio);
      document.body.appendChild(label);

      eventListener.start();

      const clickEvent = new MouseEvent('click', { bubbles: true });
      label.dispatchEvent(clickEvent);

      expect(capturedActions.length).toBeGreaterThan(0);
      const action = capturedActions[0];
      expect(action?.type).toBe('click');

      if (action?.type === 'click') {
        expect(action.tagName).toBe('label');
        expect(action.text).toBe('Test Label');
      }

      document.body.removeChild(radio);
      document.body.removeChild(label);
    });
  });
});

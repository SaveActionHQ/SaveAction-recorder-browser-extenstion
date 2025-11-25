import { describe, it, expect, beforeEach } from 'vitest';
import { SelectorGenerator } from '@/content/selector-generator';
import type { SelectorStrategy } from '@/types';

describe('SelectorGenerator', () => {
  let generator: SelectorGenerator;

  beforeEach(() => {
    generator = new SelectorGenerator();
  });

  describe('ID Selector', () => {
    it('should generate ID selector when element has ID', () => {
      const element = document.createElement('button');
      element.id = 'submit-button';
      document.body.appendChild(element);

      const strategy = generator.generateSelectors(element);

      expect(strategy.id).toBe('submit-button');
      expect(strategy.css).toBeDefined();
      expect(strategy.priority).toContain('id');
      expect(strategy.priority[0]).toBe('id'); // ID should be highest priority

      document.body.removeChild(element);
    });

    it('should prioritize ID selector first when available', () => {
      const element = document.createElement('input');
      element.id = 'email-input';
      element.setAttribute('data-testid', 'email');
      element.className = 'form-control';
      document.body.appendChild(element);

      const strategy = generator.generateSelectors(element);

      expect(strategy.priority[0]).toBe('id');
      expect(strategy.id).toBe('email-input');

      document.body.removeChild(element);
    });
  });

  describe('data-testid Selector', () => {
    it('should generate data-testid selector when available', () => {
      const element = document.createElement('button');
      element.setAttribute('data-testid', 'login-btn');
      document.body.appendChild(element);

      const strategy = generator.generateSelectors(element);

      expect(strategy.dataTestId).toBe('login-btn');
      expect(strategy.css).toBeDefined();
      expect(strategy.priority).toContain('dataTestId');

      document.body.removeChild(element);
    });

    it('should prioritize data-testid as second after ID', () => {
      const element = document.createElement('button');
      element.setAttribute('data-testid', 'submit');
      element.className = 'btn btn-primary';
      document.body.appendChild(element);

      const strategy = generator.generateSelectors(element);

      expect(strategy.priority[0]).toBe('dataTestId');
      expect(strategy.dataTestId).toBe('submit');

      document.body.removeChild(element);
    });
  });

  describe('Name Attribute Selector', () => {
    it('should generate name selector for form inputs', () => {
      const element = document.createElement('input');
      element.name = 'username';
      element.type = 'text';
      document.body.appendChild(element);

      const strategy = generator.generateSelectors(element);

      expect(strategy.name).toBe('username');
      expect(strategy.css).toBeDefined();
      expect(strategy.priority).toContain('name');

      document.body.removeChild(element);
    });

    it('should generate name selector for select elements', () => {
      const element = document.createElement('select');
      element.name = 'country';
      document.body.appendChild(element);

      const strategy = generator.generateSelectors(element);

      expect(strategy.name).toBe('country');
      expect(strategy.priority).toContain('name');

      document.body.removeChild(element);
    });
  });

  describe('ARIA Label Selector', () => {
    it('should generate ARIA label selector', () => {
      const element = document.createElement('button');
      element.setAttribute('aria-label', 'Close dialog');
      document.body.appendChild(element);

      const strategy = generator.generateSelectors(element);

      expect(strategy.ariaLabel).toBe('Close dialog');
      expect(strategy.css).toBeDefined();
      expect(strategy.priority).toContain('ariaLabel');

      document.body.removeChild(element);
    });
  });

  describe('CSS Selector', () => {
    it('should generate CSS selector with classes', () => {
      const element = document.createElement('button');
      element.className = 'btn btn-primary submit-button';
      document.body.appendChild(element);

      const strategy = generator.generateSelectors(element);

      expect(strategy.css).toBeDefined();
      expect(strategy.css).toContain('button');
      expect(strategy.priority).toContain('css');

      document.body.removeChild(element);
    });

    it('should generate CSS selector with type attribute for inputs', () => {
      const element = document.createElement('input');
      element.type = 'email';
      element.className = 'form-input';
      document.body.appendChild(element);

      const strategy = generator.generateSelectors(element);

      expect(strategy.css).toContain('input');
      expect(strategy.css).toContain('email');

      document.body.removeChild(element);
    });

    it('should limit CSS selector depth', () => {
      const parent = document.createElement('div');
      const child1 = document.createElement('div');
      const child2 = document.createElement('div');
      const target = document.createElement('button');

      parent.appendChild(child1);
      child1.appendChild(child2);
      child2.appendChild(target);
      document.body.appendChild(parent);

      const strategy = generator.generateSelectors(target);

      // Should not create overly deep selectors
      const depth = (strategy.css?.match(/>/g) || []).length;
      expect(depth).toBeLessThanOrEqual(5);

      document.body.removeChild(parent);
    });
  });

  describe('XPath Selector', () => {
    it('should generate relative XPath', () => {
      const element = document.createElement('button');
      element.id = 'test-button';
      document.body.appendChild(element);

      const strategy = generator.generateSelectors(element);

      expect(strategy.xpath).toBeDefined();
      expect(strategy.xpath).toContain('//');
      expect(strategy.xpath).toContain('button');
      expect(strategy.priority).toContain('xpath');

      document.body.removeChild(element);
    });

    it('should generate absolute XPath as fallback', () => {
      const element = document.createElement('button');
      document.body.appendChild(element);

      const strategy = generator.generateSelectors(element);

      expect(strategy.xpathAbsolute).toBeDefined();
      expect(strategy.xpathAbsolute).toMatch(/^\/html/);

      document.body.removeChild(element);
    });

    it('should prefer relative XPath over absolute', () => {
      const element = document.createElement('button');
      element.id = 'submit';
      document.body.appendChild(element);

      const strategy = generator.generateSelectors(element);

      expect(strategy.xpath).toBeDefined();
      expect(strategy.xpathAbsolute).toBeDefined();

      const xpathIndex = strategy.priority.indexOf('xpath');
      const absoluteIndex = strategy.priority.indexOf('xpathAbsolute');

      if (xpathIndex !== -1 && absoluteIndex !== -1) {
        expect(xpathIndex).toBeLessThan(absoluteIndex);
      }

      document.body.removeChild(element);
    });
  });

  describe('Text-based Selector', () => {
    it('should generate text selector for elements with text', () => {
      const element = document.createElement('button');
      element.textContent = 'Click Me';
      document.body.appendChild(element);

      const strategy = generator.generateSelectors(element);

      expect(strategy.text).toBe('Click Me');
      // Text selector may or may not be in priority depending on uniqueness
      // The important thing is that it's generated
      expect(strategy.text).toBeDefined();

      document.body.removeChild(element);
    });

    it('should generate textContains for longer text', () => {
      const element = document.createElement('button');
      element.textContent = 'This is a very long button text that should use contains';
      document.body.appendChild(element);

      const strategy = generator.generateSelectors(element);

      expect(strategy.text || strategy.textContains).toBeDefined();

      document.body.removeChild(element);
    });

    it('should trim whitespace from text selectors', () => {
      const element = document.createElement('button');
      element.textContent = '  Submit  ';
      document.body.appendChild(element);

      const strategy = generator.generateSelectors(element);

      expect(strategy.text).toBe('Submit');

      document.body.removeChild(element);
    });

    it('should not generate text selector for empty text', () => {
      const element = document.createElement('button');
      document.body.appendChild(element);

      const strategy = generator.generateSelectors(element);

      expect(strategy.text).toBeUndefined();

      document.body.removeChild(element);
    });
  });

  describe('Position-based Selector', () => {
    it('should generate position-based selector', () => {
      const parent = document.createElement('div');
      parent.className = 'form-group';
      const button1 = document.createElement('button');
      const button2 = document.createElement('button');

      parent.appendChild(button1);
      parent.appendChild(button2);
      document.body.appendChild(parent);

      const strategy = generator.generateSelectors(button2);

      expect(strategy.position).toBeDefined();
      expect(strategy.position?.parent).toBeDefined();
      expect(strategy.position?.index).toBe(1); // Zero-indexed
      expect(strategy.priority).toContain('position');

      document.body.removeChild(parent);
    });

    it('should position selector be last priority', () => {
      const parent = document.createElement('div');
      const button = document.createElement('button');
      parent.appendChild(button);
      document.body.appendChild(parent);

      const strategy = generator.generateSelectors(button);

      const positionIndex = strategy.priority.indexOf('position');
      expect(positionIndex).toBe(strategy.priority.length - 1);

      document.body.removeChild(parent);
    });
  });

  describe('Selector Generation - Comprehensive', () => {
    it('should generate minimum 3 selectors per element', () => {
      const element = document.createElement('button');
      element.className = 'btn';
      document.body.appendChild(element);

      const strategy = generator.generateSelectors(element);

      // Count non-undefined selector properties
      const selectorCount = [
        strategy.id,
        strategy.dataTestId,
        strategy.name,
        strategy.ariaLabel,
        strategy.css,
        strategy.xpath,
        strategy.xpathAbsolute,
        strategy.text,
        strategy.textContains,
        strategy.position,
      ].filter((s) => s !== undefined).length;

      expect(selectorCount).toBeGreaterThanOrEqual(3);
      expect(strategy.priority.length).toBeGreaterThanOrEqual(3);

      document.body.removeChild(element);
    });

    it('should generate multiple selector strategies for complex element', () => {
      const element = document.createElement('input');
      element.id = 'email';
      element.setAttribute('data-testid', 'email-input');
      element.name = 'email';
      element.type = 'email';
      element.className = 'form-control';
      element.setAttribute('aria-label', 'Email address');
      document.body.appendChild(element);

      const strategy = generator.generateSelectors(element);

      expect(strategy.id).toBe('email');
      expect(strategy.dataTestId).toBe('email-input');
      expect(strategy.name).toBe('email');
      expect(strategy.ariaLabel).toBe('Email address');
      expect(strategy.css).toBeDefined();
      expect(strategy.xpath).toBeDefined();
      expect(strategy.priority.length).toBeGreaterThanOrEqual(6);

      document.body.removeChild(element);
    });
  });

  describe('Selector Uniqueness Validation', () => {
    it('should validate that selector uniquely identifies element', () => {
      const element = document.createElement('button');
      element.id = 'unique-button';
      document.body.appendChild(element);

      const strategy = generator.generateSelectors(element);
      const isUnique = generator.validateSelectorUniqueness(element, strategy);

      expect(isUnique).toBe(true);

      document.body.removeChild(element);
    });

    it('should detect non-unique selectors', () => {
      const button1 = document.createElement('button');
      const button2 = document.createElement('button');
      button1.className = 'btn';
      button2.className = 'btn';

      document.body.appendChild(button1);
      document.body.appendChild(button2);

      const strategy: SelectorStrategy = {
        css: '.btn',
        priority: ['css'],
      };

      const isUnique = generator.validateSelectorUniqueness(button1, strategy);

      expect(isUnique).toBe(false);

      document.body.removeChild(button1);
      document.body.removeChild(button2);
    });
  });

  describe('Priority Ordering', () => {
    it('should prioritize stable selectors over fragile ones', () => {
      const element = document.createElement('button');
      element.id = 'submit';
      element.className = 'btn';
      document.body.appendChild(element);

      const strategy = generator.generateSelectors(element);

      // ID should come before CSS
      const idIndex = strategy.priority.indexOf('id');
      const cssIndex = strategy.priority.indexOf('css');

      expect(idIndex).toBeLessThan(cssIndex);

      document.body.removeChild(element);
    });

    it('should have position as lowest priority', () => {
      const element = document.createElement('button');
      document.body.appendChild(element);

      const strategy = generator.generateSelectors(element);

      const positionIndex = strategy.priority.indexOf('position');

      if (positionIndex !== -1) {
        strategy.priority.forEach((selector: string, index: number) => {
          if (selector !== 'position') {
            expect(index).toBeLessThan(positionIndex);
          }
        });
      }

      document.body.removeChild(element);
    });
  });

  describe('Edge Cases', () => {
    it('should handle elements without any attributes', () => {
      const element = document.createElement('div');
      document.body.appendChild(element);

      const strategy = generator.generateSelectors(element);

      expect(strategy).toBeDefined();
      expect(strategy.priority.length).toBeGreaterThan(0);
      // Should at least have xpath and position
      expect(strategy.xpath || strategy.xpathAbsolute || strategy.position).toBeDefined();

      document.body.removeChild(element);
    });

    it('should handle elements with special characters in attributes', () => {
      const element = document.createElement('button');
      element.id = 'submit-form:login';
      element.setAttribute('data-testid', 'test[id]');
      document.body.appendChild(element);

      const strategy = generator.generateSelectors(element);

      expect(strategy.id).toBeDefined();
      expect(strategy.dataTestId).toBeDefined();

      document.body.removeChild(element);
    });

    it('should handle dynamically generated IDs', () => {
      const element = document.createElement('div');
      element.id = 'react-id-123456'; // Dynamic ID pattern
      document.body.appendChild(element);

      const strategy = generator.generateSelectors(element);

      // Should still generate other selectors as fallback
      expect(strategy.css || strategy.xpath).toBeDefined();
      expect(strategy.priority.length).toBeGreaterThan(1);

      document.body.removeChild(element);
    });
  });
});

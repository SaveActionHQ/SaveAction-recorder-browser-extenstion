import { describe, it, expect, beforeEach } from 'vitest';
import { SelectorGenerator } from '@/content/selector-generator';

describe('Universal Selector Validation', () => {
  let generator: SelectorGenerator;
  let testContainer: HTMLDivElement;

  beforeEach(() => {
    generator = new SelectorGenerator();

    // Create clean test container
    testContainer = document.createElement('div');
    testContainer.id = 'test-container';
    document.body.appendChild(testContainer);
  });

  afterEach(() => {
    // Cleanup
    if (testContainer && testContainer.parentNode) {
      testContainer.parentNode.removeChild(testContainer);
    }
  });

  describe('Universal Validation Application', () => {
    it('should add validation metadata to EVERY element type', () => {
      testContainer.innerHTML = `
        <button id="btn">Button</button>
        <a href="#" class="link">Link</a>
        <input type="text" name="email" />
        <select id="country"><option>US</option></select>
        <div class="card">Card</div>
        <span class="icon">Icon</span>
      `;

      const elements = [
        testContainer.querySelector('#btn'),
        testContainer.querySelector('.link'),
        testContainer.querySelector('input[name="email"]'),
        testContainer.querySelector('#country'),
        testContainer.querySelector('.card'),
        testContainer.querySelector('.icon'),
      ];

      elements.forEach((el) => {
        if (!el) return;

        const selectors = generator.generateSelectors(el);

        // CRITICAL: Every element MUST have validation metadata
        expect(selectors.validation).toBeDefined();
        expect(selectors.validation?.cssMatches).toBeGreaterThanOrEqual(0);
        expect(selectors.validation?.verifiedAt).toBeGreaterThan(0);
        expect(selectors.validation?.strategy).toBeDefined();
        expect(typeof selectors.validation?.isUnique).toBe('boolean');

        // CRITICAL: Every element MUST have fallback metadata
        expect(selectors.fallback).toBeDefined();
        expect(selectors.fallback?.visualPosition).toBeDefined();
        expect(selectors.fallback?.siblingIndex).toBeGreaterThanOrEqual(0);
      });
    });

    it('should validate carousel controls universally', () => {
      testContainer.innerHTML = `
        <div id="carousel-1" class="carousel">
          <span class="arrow next">→</span>
        </div>
        <div id="carousel-2" class="carousel">
          <span class="arrow next">→</span>
        </div>
      `;

      const arrow1 = testContainer.querySelector('#carousel-1 .arrow') as Element;
      const arrow2 = testContainer.querySelector('#carousel-2 .arrow') as Element;

      const selectors1 = generator.generateSelectors(arrow1);
      const selectors2 = generator.generateSelectors(arrow2);

      // Both carousel arrows must have validation
      expect(selectors1.validation).toBeDefined();
      expect(selectors2.validation).toBeDefined();

      // Both must have unique selectors
      expect(selectors1.validation?.isUnique).toBe(true);
      expect(selectors2.validation?.isUnique).toBe(true);

      // Both must have fallback metadata
      expect(selectors1.fallback).toBeDefined();
      expect(selectors2.fallback).toBeDefined();
    });

    it('should validate product grid buttons universally', () => {
      testContainer.innerHTML = `
        <div class="products">
          <div class="card"><button class="add-cart">Add</button></div>
          <div class="card"><button class="add-cart">Add</button></div>
          <div class="card"><button class="add-cart">Add</button></div>
        </div>
      `;

      const buttons = testContainer.querySelectorAll('.add-cart');

      buttons.forEach((btn) => {
        const selectors = generator.generateSelectors(btn as Element);

        // Every button must have validation
        expect(selectors.validation).toBeDefined();
        expect(selectors.validation?.cssMatches).toBeGreaterThanOrEqual(1);
        expect(selectors.validation?.isUnique).toBe(true);

        // Every button must have fallback
        expect(selectors.fallback).toBeDefined();
      });
    });

    it('should validate form inputs universally', () => {
      testContainer.innerHTML = `
        <form id="signup">
          <input type="email" name="email" />
          <input type="password" name="password" />
          <button type="submit">Submit</button>
        </form>
      `;

      const email = testContainer.querySelector('input[name="email"]') as Element;
      const password = testContainer.querySelector('input[name="password"]') as Element;
      const submit = testContainer.querySelector('button[type="submit"]') as Element;

      [email, password, submit].forEach((el) => {
        const selectors = generator.generateSelectors(el);

        expect(selectors.validation).toBeDefined();
        expect(selectors.validation?.isUnique).toBe(true);
        expect(selectors.fallback).toBeDefined();
      });
    });

    it('should detect non-unique selectors and warn', () => {
      testContainer.innerHTML = `
        <button class="btn">Button 1</button>
        <button class="btn">Button 2</button>
        <button class="btn">Button 3</button>
      `;

      const button2 = testContainer.querySelectorAll('.btn')[1] as Element;
      const selectors = generator.generateSelectors(button2);

      // Should have validation
      expect(selectors.validation).toBeDefined();

      // Should be unique (using nth-child enhancement)
      expect(selectors.validation?.isUnique).toBe(true);
      expect(selectors.css).toContain('nth-child');
    });
  });

  describe('Selector Quality Gates', () => {
    it('should validate selector quality for unique selectors', () => {
      testContainer.innerHTML = `<button id="unique-btn">Click</button>`;
      const button = testContainer.querySelector('#unique-btn') as Element;

      const selectors = generator.generateSelectors(button);
      const quality = generator.validateSelectorQuality(button, selectors);

      expect(quality.canRecord).toBe(true);
      expect(quality.shouldWarn).toBe(false);
    });

    it('should warn about ambiguous selectors', () => {
      testContainer.innerHTML = `
        <button class="btn">Button 1</button>
        <button class="btn">Button 2</button>
      `;

      const button1 = testContainer.querySelectorAll('.btn')[0] as Element;

      // Create a selector strategy with ambiguous CSS
      const ambiguousStrategy = generator.generateSelectors(button1);

      // Force ambiguous CSS for testing
      ambiguousStrategy.css = 'button.btn'; // This matches 2 elements
      ambiguousStrategy.validation = {
        cssMatches: 2,
        xpathMatches: 0,
        strategy: 'css',
        isUnique: false,
        verifiedAt: Date.now(),
      };

      const quality = generator.validateSelectorQuality(button1, ambiguousStrategy);

      expect(quality.canRecord).toBe(true); // Still allow recording
      expect(quality.shouldWarn).toBe(true); // But warn
      expect(quality.message).toContain('ambiguous');
    });

    it('should block recording when no selector works', () => {
      testContainer.innerHTML = `<div class="test">Test</div>`;
      const div = testContainer.querySelector('.test') as Element;

      // Create a strategy with no working selectors
      const brokenStrategy: any = {
        css: null,
        xpath: null,
        id: null,
        dataTestId: null,
        ariaLabel: null,
        name: null,
        validation: {
          cssMatches: 0,
          xpathMatches: 0,
          strategy: 'none',
          isUnique: false,
          verifiedAt: Date.now(),
        },
      };

      const quality = generator.validateSelectorQuality(div, brokenStrategy);

      expect(quality.canRecord).toBe(false);
      expect(quality.shouldWarn).toBe(true);
      expect(quality.message).toContain('Cannot generate reliable selector');
    });
  });

  describe('Validation Metadata Completeness', () => {
    it('should include all validation fields', () => {
      testContainer.innerHTML = `<button id="test-btn">Test</button>`;
      const button = testContainer.querySelector('#test-btn') as Element;

      const selectors = generator.generateSelectors(button);
      const validation = selectors.validation;

      expect(validation).toBeDefined();
      expect(validation?.cssMatches).toBeDefined();
      expect(validation?.xpathMatches).toBeDefined();
      expect(validation?.strategy).toBeDefined();
      expect(validation?.isUnique).toBeDefined();
      expect(validation?.verifiedAt).toBeDefined();
    });

    it('should include all fallback fields', () => {
      testContainer.innerHTML = `<button id="test-btn">Test</button>`;
      const button = testContainer.querySelector('#test-btn') as Element;

      const selectors = generator.generateSelectors(button);
      const fallback = selectors.fallback;

      expect(fallback).toBeDefined();
      expect(fallback?.visualPosition).toBeDefined();
      expect(fallback?.visualPosition?.x).toBeGreaterThanOrEqual(0);
      expect(fallback?.visualPosition?.y).toBeGreaterThanOrEqual(0);
      expect(fallback?.visualPosition?.viewportX).toBeDefined();
      expect(fallback?.visualPosition?.viewportY).toBeDefined();
      expect(fallback?.textContent).toBeDefined();
      expect(fallback?.siblingIndex).toBeGreaterThanOrEqual(0);
    });

    it('should validate that cssMatches always equals 1 for unique selectors', () => {
      testContainer.innerHTML = `
        <button id="btn1">Button 1</button>
        <a href="#" id="link1">Link</a>
        <input type="text" id="input1" />
      `;

      const elements = [
        testContainer.querySelector('#btn1'),
        testContainer.querySelector('#link1'),
        testContainer.querySelector('#input1'),
      ];

      elements.forEach((el) => {
        if (!el) return;

        const selectors = generator.generateSelectors(el);

        expect(selectors.validation?.cssMatches).toBe(1);
        expect(selectors.validation?.isUnique).toBe(true);
      });
    });
  });

  describe('No Element Type Conditionals', () => {
    it('should validate <select> elements', () => {
      testContainer.innerHTML = `<select id="country"><option>US</option></select>`;
      const select = testContainer.querySelector('#country') as Element;

      const selectors = generator.generateSelectors(select);

      expect(selectors.validation).toBeDefined();
      expect(selectors.fallback).toBeDefined();
    });

    it('should validate <span> elements', () => {
      testContainer.innerHTML = `<span id="icon" class="icon">Icon</span>`;
      const span = testContainer.querySelector('#icon') as Element;

      const selectors = generator.generateSelectors(span);

      expect(selectors.validation).toBeDefined();
      expect(selectors.fallback).toBeDefined();
    });

    it('should validate <div> elements', () => {
      testContainer.innerHTML = `<div id="card" class="card">Card</div>`;
      const div = testContainer.querySelector('#card') as Element;

      const selectors = generator.generateSelectors(div);

      expect(selectors.validation).toBeDefined();
      expect(selectors.fallback).toBeDefined();
    });

    it('should validate elements without IDs', () => {
      testContainer.innerHTML = `<button class="btn">No ID</button>`;
      const button = testContainer.querySelector('.btn') as Element;

      const selectors = generator.generateSelectors(button);

      expect(selectors.validation).toBeDefined();
      expect(selectors.fallback).toBeDefined();
    });
  });
});

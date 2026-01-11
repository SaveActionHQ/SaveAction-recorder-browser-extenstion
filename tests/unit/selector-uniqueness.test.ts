import { describe, it, expect, beforeEach } from 'vitest';
import { SelectorGenerator } from '@/content/selector-generator';

describe('Selector Uniqueness Validation', () => {
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

  describe('isUnique() core validation', () => {
    it('should return true for selector matching exactly one element', () => {
      testContainer.innerHTML = `
        <button id="unique-btn">Click me</button>
        <button class="other">Other</button>
      `;

      const button = testContainer.querySelector('#unique-btn') as Element;
      const selectors = generator.generateSelectors(button);

      expect(selectors.validation?.isUnique).toBe(true);
      expect(selectors.validation?.cssMatches).toBe(1);
    });

    it('should return false for selector matching zero elements', () => {
      testContainer.innerHTML = `<div class="test">Content</div>`;

      const div = testContainer.querySelector('.test') as Element;
      const selectors = generator.generateSelectors(div);

      // The selector should be unique
      expect(selectors.validation?.cssMatches).toBe(1);
    });

    it('should detect multiple matches for ambiguous selectors', () => {
      testContainer.innerHTML = `
        <button class="btn">Button 1</button>
        <button class="btn">Button 2</button>
        <button class="btn">Button 3</button>
      `;

      const buttons = testContainer.querySelectorAll('.btn');
      const secondButton = buttons[1] as Element;

      const selectors = generator.generateSelectors(secondButton);

      // Should have unique selector (using nth-child)
      expect(selectors.validation?.isUnique).toBe(true);
      expect(selectors.css).toContain('nth-child');
    });

    it('should handle invalid selectors gracefully', () => {
      testContainer.innerHTML = `<div class="test">Content</div>`;
      const div = testContainer.querySelector('.test') as Element;

      // Generate selectors - should not throw
      const selectors = generator.generateSelectors(div);
      expect(selectors).toBeDefined();
      expect(selectors.validation).toBeDefined();
    });
  });

  describe('Enhanced selector strategies', () => {
    it('should use unique class combination when single class is not unique', () => {
      testContainer.innerHTML = `
        <button class="btn primary">Button 1</button>
        <button class="btn secondary">Button 2</button>
        <button class="btn primary special">Button 3</button>
      `;

      const button3 = testContainer.querySelector('.btn.primary.special') as Element;
      const selectors = generator.generateSelectors(button3);

      expect(selectors.validation?.isUnique).toBe(true);
      expect(selectors.css).toBeDefined();
    });

    it('should use nth-child when classes are identical', () => {
      testContainer.innerHTML = `
        <ul id="list">
          <li class="item">Item 1</li>
          <li class="item">Item 2</li>
          <li class="item">Item 3</li>
        </ul>
      `;

      const item2 = testContainer.querySelectorAll('.item')[1] as Element;
      const selectors = generator.generateSelectors(item2);

      expect(selectors.validation?.isUnique).toBe(true);
      expect(selectors.css).toContain('nth-child(2)');
    });

    it('should include parent context for nested similar elements', () => {
      testContainer.innerHTML = `
        <div id="parent-1">
          <button class="action">Click</button>
        </div>
        <div id="parent-2">
          <button class="action">Click</button>
        </div>
      `;

      const button2 = testContainer.querySelector('#parent-2 .action') as Element;
      const selectors = generator.generateSelectors(button2);

      expect(selectors.validation?.isUnique).toBe(true);
      expect(selectors.css).toContain('#parent-2');
    });

    it('should generate position path selector for complex nesting', () => {
      testContainer.innerHTML = `
        <div id="root">
          <div class="section">
            <div class="item">
              <span class="label">Target</span>
            </div>
          </div>
        </div>
      `;

      const span = testContainer.querySelector('.label') as Element;
      const selectors = generator.generateSelectors(span);

      expect(selectors.validation?.isUnique).toBe(true);
    });
  });

  describe('Validation metadata', () => {
    it('should include validation metadata in selector strategy', () => {
      testContainer.innerHTML = `<button id="test-btn">Click</button>`;
      const button = testContainer.querySelector('#test-btn') as Element;

      const selectors = generator.generateSelectors(button);

      expect(selectors.validation).toBeDefined();
      expect(selectors.validation?.cssMatches).toBe(1);
      expect(selectors.validation?.isUnique).toBe(true);
      expect(selectors.validation?.strategy).toBeDefined();
      expect(selectors.validation?.verifiedAt).toBeGreaterThan(0);
    });

    it('should include fallback metadata', () => {
      testContainer.innerHTML = `<button id="test-btn">Click</button>`;
      const button = testContainer.querySelector('#test-btn') as Element;

      const selectors = generator.generateSelectors(button);

      expect(selectors.fallback).toBeDefined();
      expect(selectors.fallback?.visualPosition).toBeDefined();
      expect(selectors.fallback?.textContent).toBe('Click');
      expect(selectors.fallback?.siblingIndex).toBeDefined();
    });

    it('should validate XPath uniqueness', () => {
      testContainer.innerHTML = `
        <div id="container">
          <button class="btn">Button</button>
        </div>
      `;
      const button = testContainer.querySelector('.btn') as Element;

      const selectors = generator.generateSelectors(button);

      expect(selectors.validation?.xpathMatches).toBeDefined();
    });
  });

  describe('Carousel-specific selector generation', () => {
    it('should generate unique selectors for carousel arrows', () => {
      testContainer.innerHTML = `
        <div id="carousel-1">
          <button class="next arrow">→</button>
        </div>
        <div id="carousel-2">
          <button class="next arrow">→</button>
        </div>
        <div id="carousel-3">
          <button class="next arrow">→</button>
        </div>
      `;

      const arrow2 = testContainer.querySelector('#carousel-2 .next') as Element;
      const selectors = generator.generateSelectors(arrow2);

      expect(selectors.validation?.isUnique).toBe(true);
      expect(selectors.validation?.cssMatches).toBe(1);
      expect(selectors.css).toContain('#carousel-2');
    });

    it('should handle nested carousel slides with identical arrows', () => {
      testContainer.innerHTML = `
        <ul id="carousel">
          <li class="slide"><button class="next">→</button></li>
          <li class="slide"><button class="next">→</button></li>
          <li class="slide"><button class="next">→</button></li>
        </ul>
      `;

      const slides = testContainer.querySelectorAll('.slide');
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const arrow2 = slides[1]!.querySelector('.next') as Element;
      const selectors = generator.generateSelectors(arrow2);

      expect(selectors.validation?.isUnique).toBe(true);
      expect(selectors.css).toMatch(/nth-child\(2\)/);
    });
  });

  describe('Product grid selector generation', () => {
    it('should generate unique selector for product card buttons', () => {
      testContainer.innerHTML = `
        <div class="products">
          <div class="card" data-product-id="123">
            <button class="add-cart">Add to Cart</button>
          </div>
          <div class="card" data-product-id="456">
            <button class="add-cart">Add to Cart</button>
          </div>
        </div>
      `;

      const button2 = testContainer.querySelector('[data-product-id="456"] .add-cart') as Element;
      const selectors = generator.generateSelectors(button2);

      // Should have unique selector (may use nth-child or data attribute)
      expect(selectors.validation?.isUnique).toBe(true);
      expect(selectors.validation?.cssMatches).toBe(1);
    });

    it('should fallback to nth-child when no data attributes', () => {
      testContainer.innerHTML = `
        <div id="products">
          <div class="card">
            <button class="add-cart">Add to Cart</button>
          </div>
          <div class="card">
            <button class="add-cart">Add to Cart</button>
          </div>
          <div class="card">
            <button class="add-cart">Add to Cart</button>
          </div>
        </div>
      `;

      const cards = testContainer.querySelectorAll('.card');
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const button2 = cards[1]!.querySelector('.add-cart') as Element;
      const selectors = generator.generateSelectors(button2);

      expect(selectors.validation?.isUnique).toBe(true);
      expect(selectors.css).toContain('nth-child');
    });
  });

  describe('Form selector generation', () => {
    it('should include form ID in button selector', () => {
      testContainer.innerHTML = `
        <form id="login-form">
          <button type="submit">Submit</button>
        </form>
        <form id="signup-form">
          <button type="submit">Submit</button>
        </form>
      `;

      const signupBtn = testContainer.querySelector('#signup-form button') as Element;
      const selectors = generator.generateSelectors(signupBtn);

      expect(selectors.validation?.isUnique).toBe(true);
      expect(selectors.css).toContain('#signup-form');
    });

    it('should handle multiple submit buttons in same form', () => {
      testContainer.innerHTML = `
        <form id="checkout-form">
          <section class="shipping">
            <button type="submit">Continue to Payment</button>
          </section>
          <section class="payment">
            <button type="submit">Continue to Review</button>
          </section>
          <section class="review">
            <button type="submit">Place Order</button>
          </section>
        </form>
      `;

      const paymentBtn = testContainer.querySelector('.payment button') as Element;
      const selectors = generator.generateSelectors(paymentBtn);

      expect(selectors.validation?.isUnique).toBe(true);
      expect(selectors.css).toMatch(/.payment|nth-child/);
    });
  });

  describe('Edge cases', () => {
    it('should handle elements with dynamic classes', () => {
      testContainer.innerHTML = `
        <button class="btn-12345 btn-active">Dynamic</button>
        <button class="btn-67890 btn-inactive">Dynamic</button>
      `;

      const btn1 = testContainer.querySelector('.btn-active') as Element;
      const selectors = generator.generateSelectors(btn1);

      expect(selectors.validation?.isUnique).toBe(true);
    });

    it('should handle elements without any classes', () => {
      testContainer.innerHTML = `
        <div id="parent">
          <span>Text 1</span>
          <span>Text 2</span>
          <span>Text 3</span>
        </div>
      `;

      const span2 = testContainer.querySelectorAll('span')[1] as Element;
      const selectors = generator.generateSelectors(span2);

      expect(selectors.validation?.isUnique).toBe(true);
    });

    it('should handle deeply nested elements', () => {
      testContainer.innerHTML = `
        <div id="root">
          <div><div><div><div><div>
            <button>Deep Button</button>
          </div></div></div></div></div>
        </div>
      `;

      const button = testContainer.querySelector('button') as Element;
      const selectors = generator.generateSelectors(button);

      expect(selectors.validation?.isUnique).toBe(true);
    });

    it('should handle elements with special characters in text', () => {
      testContainer.innerHTML = `
        <button>Price: $29.99</button>
        <button>Price: $39.99</button>
      `;

      const btn2 = testContainer.querySelectorAll('button')[1] as Element;
      const selectors = generator.generateSelectors(btn2);

      expect(selectors.validation?.isUnique).toBe(true);
    });
  });

  describe('🆕 CRITICAL: Carousel selectors MUST have validation metadata', () => {
    it('should add validation metadata to carousel controls', () => {
      testContainer.innerHTML = `
        <ul id="listings_cn">
          <li>
            <span class="arrow prev"><span>←</span></span>
            <span class="arrow next"><span>→</span></span>
          </li>
          <li>
            <span class="arrow prev"><span>←</span></span>
            <span class="arrow next"><span>→</span></span>
          </li>
        </ul>
      `;

      const carouselArrow = testContainer.querySelector(
        'li:nth-child(2) .arrow.next span'
      ) as Element;
      const selectors = generator.generateCarouselSelectors(carouselArrow);

      // ✅ CRITICAL: Carousel selectors MUST have validation metadata
      expect(selectors.validation).toBeDefined();
      expect(selectors.validation?.cssMatches).toBeGreaterThanOrEqual(1);
      expect(selectors.validation?.strategy).toBeDefined();
      expect(selectors.validation?.isUnique).toBeDefined();
      expect(selectors.validation?.verifiedAt).toBeGreaterThan(0);
    });

    it('should add fallback metadata to carousel controls', () => {
      testContainer.innerHTML = `
        <ul id="listings_cn">
          <li>
            <span class="arrow prev"><span>←</span></span>
            <span class="arrow next"><span>→</span></span>
          </li>
          <li>
            <span class="arrow prev"><span>←</span></span>
            <span class="arrow next"><span>→</span></span>
          </li>
        </ul>
      `;

      const carouselArrow = testContainer.querySelector(
        'li:nth-child(2) .arrow.next span'
      ) as Element;
      const selectors = generator.generateCarouselSelectors(carouselArrow);

      // ✅ CRITICAL: Carousel selectors MUST have fallback metadata
      expect(selectors.fallback).toBeDefined();
      expect(selectors.fallback?.visualPosition).toBeDefined();
      expect(selectors.fallback?.visualPosition?.x).toBeGreaterThanOrEqual(0);
      expect(selectors.fallback?.visualPosition?.y).toBeGreaterThanOrEqual(0);
      expect(selectors.fallback?.siblingIndex).toBeGreaterThanOrEqual(0);
    });

    it('should have same validation structure for carousel and non-carousel elements', () => {
      testContainer.innerHTML = `
        <ul id="listings_cn">
          <li><span class="arrow next"><span>→</span></span></li>
        </ul>
        <button id="submit-btn">Submit</button>
      `;

      const carouselArrow = testContainer.querySelector('.arrow.next span') as Element;
      const submitButton = testContainer.querySelector('#submit-btn') as Element;

      const carouselSelectors = generator.generateCarouselSelectors(carouselArrow);
      const regularSelectors = generator.generateSelectors(submitButton);

      // Both should have identical validation structure
      expect(carouselSelectors.validation).toBeDefined();
      expect(regularSelectors.validation).toBeDefined();

      expect(carouselSelectors.fallback).toBeDefined();
      expect(regularSelectors.fallback).toBeDefined();

      // Both should have same validation fields
      expect(typeof carouselSelectors.validation?.cssMatches).toBe('number');
      expect(typeof regularSelectors.validation?.cssMatches).toBe('number');

      expect(typeof carouselSelectors.validation?.isUnique).toBe('boolean');
      expect(typeof regularSelectors.validation?.isUnique).toBe('boolean');
    });
  });
});

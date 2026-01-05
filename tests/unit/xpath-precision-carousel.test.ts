/**
 * XPath Precision Fix - P0 Critical
 * Tests that XPath selectors for carousel navigation buttons are precise
 * and don't cause cross-carousel interference
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SelectorGenerator } from '@/content/selector-generator';

describe('XPath Precision for Carousel Controls', () => {
  let selectorGenerator: SelectorGenerator;
  let testContainer: HTMLElement;

  beforeEach(() => {
    // Create DOM with multiple carousels visible simultaneously
    testContainer = document.createElement('div');
    testContainer.innerHTML = `
      <section id="search-results">
        <ul id="listings_cn">
          <!-- Carousel 1 (li[3]) -->
          <li>
            <div class="content__body__item-img">
              <div class="content__body__item-img__wrapper">
                <span class="content__body__item-img-arrow prev">
                  <span id="carousel-1-prev">
                    <svg><path/></svg>
                  </span>
                </span>
                <span class="content__body__item-img-arrow next">
                  <span id="carousel-1-next">
                    <svg><path/></svg>
                  </span>
                </span>
              </div>
            </div>
          </li>
          
          <!-- Carousel 2 (li[4]) -->
          <li>
            <div class="content__body__item-img">
              <div class="content__body__item-img__wrapper">
                <span class="content__body__item-img-arrow prev">
                  <span id="carousel-2-prev">
                    <svg><path/></svg>
                  </span>
                </span>
                <span class="content__body__item-img-arrow next">
                  <span id="carousel-2-next">
                    <svg><path/></svg>
                  </span>
                </span>
              </div>
            </div>
          </li>
          
          <!-- Carousel 3 (li[5]) -->
          <li>
            <div class="content__body__item-img">
              <div class="content__body__item-img__wrapper">
                <span class="content__body__item-img-arrow prev">
                  <span id="carousel-3-prev">
                    <svg><path/></svg>
                  </span>
                </span>
                <span class="content__body__item-img-arrow next">
                  <span id="carousel-3-next">
                    <svg><path/></svg>
                  </span>
                </span>
              </div>
            </div>
          </li>
        </ul>
      </section>
    `;
    document.body.appendChild(testContainer);

    selectorGenerator = new SelectorGenerator();
  });

  afterEach(() => {
    if (testContainer && testContainer.parentNode) {
      document.body.removeChild(testContainer);
    }
  });

  describe('Precise XPath Generation', () => {
    it('should generate precise XPath with parent arrow class AND direction class for carousel 1 next', () => {
      const element = document.getElementById('carousel-1-next') as Element;
      expect(element).toBeTruthy();

      const selectors = selectorGenerator.generateCarouselSelectors(element);
      const xpath = selectors.xpath || '';

      // Verify XPath includes BOTH arrow class AND direction class
      expect(xpath).toContain("contains(@class, 'content__body__item-img-arrow')");
      expect(xpath).toContain("contains(@class, 'next')");

      // Verify XPath includes list index
      expect(xpath).toContain('li[1]'); // First li element

      // Verify XPath selects child span (the clicked element)
      expect(xpath).toContain('/span[1]');

      // Expected pattern: //ul[@id='listings_cn']/li[1]//span[...arrow... and ...next...]/span[1]
      expect(xpath).toMatch(/\/\/ul\[@id='listings_cn'\]\/li\[1\]\/\/span\[.*and.*\]\/span\[1\]/);
    });

    it('should generate precise XPath for carousel 2 next (different from carousel 1)', () => {
      const element = document.getElementById('carousel-2-next') as Element;
      expect(element).toBeTruthy();

      const selectors = selectorGenerator.generateCarouselSelectors(element);
      const xpath = selectors.xpath || '';

      // Should have li[2] (second carousel)
      expect(xpath).toContain('li[2]');
      expect(xpath).toContain("contains(@class, 'next')");

      // Should NOT have li[1]
      expect(xpath).not.toContain('li[1]');
    });

    it('should generate precise XPath for carousel 3 prev', () => {
      const element = document.getElementById('carousel-3-prev') as Element;
      expect(element).toBeTruthy();

      const selectors = selectorGenerator.generateCarouselSelectors(element);
      const xpath = selectors.xpath || '';

      // Should have li[3] (third carousel)
      expect(xpath).toContain('li[3]');
      expect(xpath).toContain("contains(@class, 'prev')");
    });

    it('should NOT use broad descendant:: pattern without constraints', () => {
      const element = document.getElementById('carousel-1-next') as Element;
      const selectors = selectorGenerator.generateCarouselSelectors(element);
      const xpath = selectors.xpath || '';

      // Old broken pattern: //ul#listings_cn/li[1]/descendant::span[contains(@class, 'next')]
      // This matches ANY descendant span with 'next'
      const brokenPattern = /\/descendant::span\[contains\(@class, 'next'\)\]$/;
      expect(xpath).not.toMatch(brokenPattern);
    });
  });

  describe('XPath Uniqueness Validation', () => {
    it('should validate that carousel 1 next XPath matches exactly 1 element', () => {
      const element = document.getElementById('carousel-1-next') as Element;
      const selectors = selectorGenerator.generateCarouselSelectors(element);
      const xpath = selectors.xpath || '';

      expect(xpath).toBeTruthy();

      // Evaluate XPath
      const result = document.evaluate(
        xpath,
        document,
        null,
        XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
        null
      );

      expect(result.snapshotLength).toBe(1);
      expect(result.snapshotItem(0)).toBe(element);
    });

    it('should validate that carousel 2 next XPath matches exactly 1 element (not carousel 1)', () => {
      const element = document.getElementById('carousel-2-next') as Element;
      const selectors = selectorGenerator.generateCarouselSelectors(element);
      const xpath = selectors.xpath || '';

      expect(xpath).toBeTruthy();

      const result = document.evaluate(
        xpath,
        document,
        null,
        XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
        null
      );

      expect(result.snapshotLength).toBe(1);
      expect(result.snapshotItem(0)).toBe(element);

      // Verify it's NOT carousel 1's element
      const carousel1Next = document.getElementById('carousel-1-next');
      expect(result.snapshotItem(0)).not.toBe(carousel1Next);
    });

    it('should validate that all 6 carousel buttons have unique XPaths', () => {
      const elements = [
        'carousel-1-prev',
        'carousel-1-next',
        'carousel-2-prev',
        'carousel-2-next',
        'carousel-3-prev',
        'carousel-3-next',
      ];

      const xpaths: string[] = [];

      elements.forEach((id) => {
        const element = document.getElementById(id) as Element;
        const selectors = selectorGenerator.generateCarouselSelectors(element);
        const xpath = selectors.xpath || '';

        expect(xpath).toBeTruthy();

        // Each XPath should be unique
        expect(xpaths).not.toContain(xpath);
        xpaths.push(xpath);

        // Each XPath should match exactly 1 element
        const result = document.evaluate(
          xpath,
          document,
          null,
          XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
          null
        );

        expect(result.snapshotLength).toBe(1);
        expect(result.snapshotItem(0)).toBe(element);
      });

      // Verify we have 6 unique XPaths
      expect(new Set(xpaths).size).toBe(6);
    });
  });

  describe('Cross-Carousel Interference Prevention', () => {
    it('should NOT match carousel 1 button when XPath is for carousel 2', () => {
      const carousel2Next = document.getElementById('carousel-2-next') as Element;
      const carousel1Next = document.getElementById('carousel-1-next') as Element;

      const selectors = selectorGenerator.generateCarouselSelectors(carousel2Next);
      const xpath = selectors.xpath || '';

      expect(xpath).toBeTruthy();

      // Evaluate XPath
      const result = document.evaluate(
        xpath,
        document,
        null,
        XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
        null
      );

      // Should match only carousel 2, not carousel 1
      expect(result.snapshotLength).toBe(1);
      expect(result.snapshotItem(0)).toBe(carousel2Next);
      expect(result.snapshotItem(0)).not.toBe(carousel1Next);
    });

    it('should distinguish between prev and next buttons in the same carousel', () => {
      const carousel1Prev = document.getElementById('carousel-1-prev') as Element;
      const carousel1Next = document.getElementById('carousel-1-next') as Element;

      const prevSelectors = selectorGenerator.generateCarouselSelectors(carousel1Prev);
      const nextSelectors = selectorGenerator.generateCarouselSelectors(carousel1Next);

      const prevXPath = prevSelectors.xpath || '';
      const nextXPath = nextSelectors.xpath || '';

      // XPaths should be different
      expect(prevXPath).not.toBe(nextXPath);
      expect(prevXPath).toBeTruthy();
      expect(nextXPath).toBeTruthy();

      // Prev XPath should match only prev button
      const prevResult = document.evaluate(
        prevXPath,
        document,
        null,
        XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
        null
      );
      expect(prevResult.snapshotLength).toBe(1);
      expect(prevResult.snapshotItem(0)).toBe(carousel1Prev);

      // Next XPath should match only next button
      const nextResult = document.evaluate(
        nextXPath,
        document,
        null,
        XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
        null
      );
      expect(nextResult.snapshotLength).toBe(1);
      expect(nextResult.snapshotItem(0)).toBe(carousel1Next);
    });
  });

  describe('Old vs New XPath Comparison', () => {
    it('should demonstrate why old broad XPath pattern is broken', () => {
      // Simulate old broken XPath: //ul#listings_cn/li[2]/descendant::span[contains(@class, 'next')]
      const brokenXPath =
        "//ul[@id='listings_cn']/li[2]/descendant::span[contains(@class, 'next')]";

      const result = document.evaluate(
        brokenXPath,
        document,
        null,
        XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
        null
      );

      // This broken XPath matches the PARENT span with class 'next', not the child span
      // In real-world scenario with complex nesting, this could match multiple elements
      expect(result.snapshotLength).toBeGreaterThanOrEqual(1);

      // The matched element might be the parent arrow span, not the clicked child span
      const matched = result.snapshotItem(0) as Element;
      expect(matched?.classList.contains('content__body__item-img-arrow')).toBe(true);
    });

    it('should demonstrate new precise XPath pattern is correct', () => {
      const carousel2Next = document.getElementById('carousel-2-next') as Element;
      const selectors = selectorGenerator.generateCarouselSelectors(carousel2Next);
      const xpath = selectors.xpath || '';

      expect(xpath).toBeTruthy();

      // New XPath: //ul[@id='listings_cn']/li[2]//span[contains(@class, 'arrow') and contains(@class, 'next')]/span[1]
      const result = document.evaluate(
        xpath,
        document,
        null,
        XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
        null
      );

      // Matches exactly 1 element
      expect(result.snapshotLength).toBe(1);

      // Matches the EXACT clicked element (the child span, not parent)
      expect(result.snapshotItem(0)).toBe(carousel2Next);
      expect((result.snapshotItem(0) as Element).id).toBe('carousel-2-next');
    });
  });
});

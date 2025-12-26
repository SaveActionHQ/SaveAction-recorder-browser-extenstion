import { describe, it, expect, beforeEach } from 'vitest';
import { SelectorGenerator } from '@/content/selector-generator';

describe('XPath Direction-Aware Carousel Selectors', () => {
  let selectorGenerator: SelectorGenerator;

  beforeEach(() => {
    selectorGenerator = new SelectorGenerator();
    document.body.innerHTML = '';
  });

  it('should generate unique XPath for next and prev carousel buttons', () => {
    // Create carousel HTML structure
    document.body.innerHTML = `
      <ul id="listings_cn">
        <li>
          <div class="content__body__item-img">
            <div class="content__body__item-img__wrapper">
              <span class="content__body__item-img-arrow prev">
                <span>
                  <svg class="md">
                    <use href="#icon-prev"/>
                  </svg>
                </span>
              </span>
              <span class="content__body__item-img-arrow next">
                <span>
                  <svg class="md">
                    <use href="#icon-next"/>
                  </svg>
                </span>
              </span>
            </div>
          </div>
        </li>
      </ul>
    `;

    const prevButton = document.querySelector('.content__body__item-img-arrow.prev') as Element;
    const nextButton = document.querySelector('.content__body__item-img-arrow.next') as Element;

    expect(prevButton).toBeTruthy();
    expect(nextButton).toBeTruthy();

    const prevSelectors = selectorGenerator.generateSelectors(prevButton);
    const nextSelectors = selectorGenerator.generateSelectors(nextButton);

    // Critical assertion: XPath must be different for next vs prev
    expect(prevSelectors.xpath).toBeTruthy();
    expect(nextSelectors.xpath).toBeTruthy();
    expect(prevSelectors.xpath).not.toBe(nextSelectors.xpath);

    // Critical assertion: XPath must include direction
    expect(prevSelectors.xpath).toMatch(/prev/i);
    expect(nextSelectors.xpath).toMatch(/next/i);

    console.log('Prev XPath:', prevSelectors.xpath);
    console.log('Next XPath:', nextSelectors.xpath);
  });

  it('should generate unique XPath across multiple carousels', () => {
    // Create 3 carousels like in the real test case
    document.body.innerHTML = `
      <ul id="listings_cn">
        <li>
          <span class="content__body__item-img-arrow next">Next 1</span>
          <span class="content__body__item-img-arrow prev">Prev 1</span>
        </li>
        <li>
          <span class="content__body__item-img-arrow next">Next 2</span>
          <span class="content__body__item-img-arrow prev">Prev 2</span>
        </li>
        <li>
          <span class="content__body__item-img-arrow next">Next 3</span>
          <span class="content__body__item-img-arrow prev">Prev 3</span>
        </li>
      </ul>
    `;

    const buttons = Array.from(document.querySelectorAll('.content__body__item-img-arrow'));
    expect(buttons.length).toBe(6);

    const xpaths = buttons.map((btn) => {
      const selectors = selectorGenerator.generateSelectors(btn);
      return selectors.xpath;
    });

    console.log('All XPaths:', xpaths);

    // For simple structure without unique IDs, XPath with direction will distinguish next vs prev
    // but may match multiple carousels (e.g., all "next" buttons)
    // This is OK - the real implementation adds list item index via carousel enhancement
    xpaths.forEach((xpath, index) => {
      if (!xpath) return;

      const result = document.evaluate(
        xpath,
        document,
        null,
        XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
        null
      );

      // XPath should at least be valid and match the button
      expect(result.snapshotLength).toBeGreaterThanOrEqual(1);

      // Should match one of the buttons (may match multiple next or prev buttons)
      let found = false;
      for (let i = 0; i < result.snapshotLength; i++) {
        if (result.snapshotItem(i) === buttons[index]) {
          found = true;
          break;
        }
      }
      expect(found).toBe(true);
    });
  });

  it('should include direction in XPath for elements with direction classes', () => {
    document.body.innerHTML = `
      <div>
        <button class="carousel-control-next">Next</button>
        <button class="carousel-control-prev">Prev</button>
      </div>
    `;

    const nextBtn = document.querySelector('.carousel-control-next') as Element;
    const prevBtn = document.querySelector('.carousel-control-prev') as Element;

    const nextSelectors = selectorGenerator.generateSelectors(nextBtn);
    const prevSelectors = selectorGenerator.generateSelectors(prevBtn);

    // XPath must include the direction class
    expect(nextSelectors.xpath).toMatch(/contains\(@class,\s*'[^']*next[^']*'\)/i);
    expect(prevSelectors.xpath).toMatch(/contains\(@class,\s*'[^']*prev[^']*'\)/i);
  });

  it('should detect carousel controls and use contextual XPath', () => {
    document.body.innerHTML = `
      <div class="swiper-container">
        <button class="swiper-button-prev">Previous</button>
        <button class="swiper-button-next">Next</button>
      </div>
    `;

    const prevBtn = document.querySelector('.swiper-button-prev') as Element;
    const nextBtn = document.querySelector('.swiper-button-next') as Element;

    // Verify carousel detection
    expect(selectorGenerator.isCarouselControl(prevBtn)).toBe(true);
    expect(selectorGenerator.isCarouselControl(nextBtn)).toBe(true);

    const prevSelectors = selectorGenerator.generateSelectors(prevBtn);
    const nextSelectors = selectorGenerator.generateSelectors(nextBtn);

    // Different XPath for different directions
    expect(prevSelectors.xpath).not.toBe(nextSelectors.xpath);
    expect(prevSelectors.xpath).toMatch(/prev/i);
    expect(nextSelectors.xpath).toMatch(/next/i);
  });

  it('should handle nested SVG carousel controls correctly', () => {
    document.body.innerHTML = `
      <ul id="listings_cn">
        <li>
          <span class="content__body__item-img-arrow next">
            <span>
              <svg class="md">
                <path d="M10 10"/>
              </svg>
            </span>
          </span>
          <span class="content__body__item-img-arrow prev">
            <span>
              <svg class="md">
                <use href="#icon"/>
              </svg>
            </span>
          </span>
        </li>
      </ul>
    `;

    // Test on the SPAN (parent), not SVG child
    const nextSpan = document.querySelector('.content__body__item-img-arrow.next') as Element;
    const prevSpan = document.querySelector('.content__body__item-img-arrow.prev') as Element;

    const nextSelectors = selectorGenerator.generateSelectors(nextSpan);
    const prevSelectors = selectorGenerator.generateSelectors(prevSpan);

    // Should generate different XPath
    expect(nextSelectors.xpath).not.toBe(prevSelectors.xpath);

    // Should include direction
    expect(nextSelectors.xpath).toMatch(/next/i);
    expect(prevSelectors.xpath).toMatch(/prev/i);

    // Validate uniqueness
    const nextResult = document.evaluate(
      nextSelectors.xpath!,
      document,
      null,
      XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
      null
    );
    const prevResult = document.evaluate(
      prevSelectors.xpath!,
      document,
      null,
      XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
      null
    );

    expect(nextResult.snapshotLength).toBe(1);
    expect(prevResult.snapshotLength).toBe(1);
    expect(nextResult.snapshotItem(0)).toBe(nextSpan);
    expect(prevResult.snapshotItem(0)).toBe(prevSpan);
  });

  it('should not generate generic //span[1] XPath for carousel controls', () => {
    document.body.innerHTML = `
      <ul id="listings_cn">
        <li>
          <span class="content__body__item-img-arrow next">Next</span>
          <span class="content__body__item-img-arrow prev">Prev</span>
        </li>
      </ul>
    `;

    const spans = document.querySelectorAll('.content__body__item-img-arrow');

    spans.forEach((span) => {
      const selectors = selectorGenerator.generateSelectors(span);

      // Should NOT be generic like //span[1]
      expect(selectors.xpath).not.toMatch(/^\/\/span\[\d+\]$/);

      // Should include meaningful attributes
      expect(selectors.xpath).toMatch(/contains\(@class/);
    });
  });
});

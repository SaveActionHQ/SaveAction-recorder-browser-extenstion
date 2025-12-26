import { describe, it, expect, beforeEach } from 'vitest';
import { SelectorGenerator } from '@/content/selector-generator';

describe('SelectorGenerator - Carousel Detection', () => {
  let generator: SelectorGenerator;

  beforeEach(() => {
    generator = new SelectorGenerator();
    document.body.innerHTML = ''; // Clear DOM
  });

  describe('isCarouselControl', () => {
    it('should detect swiper carousel controls', () => {
      const element = document.createElement('button');
      element.className = 'swiper-button-next';
      document.body.appendChild(element);

      expect(generator.isCarouselControl(element)).toBe(true);
    });

    it('should detect bootstrap carousel controls', () => {
      const element = document.createElement('button');
      element.className = 'carousel-control-next';
      document.body.appendChild(element);

      expect(generator.isCarouselControl(element)).toBe(true);
    });

    it('should detect slick carousel controls', () => {
      const element = document.createElement('button');
      element.className = 'slick-next';
      document.body.appendChild(element);

      expect(generator.isCarouselControl(element)).toBe(true);
    });

    it('should detect custom carousel arrow controls', () => {
      const element = document.createElement('span');
      element.className = 'img-arrow next';
      document.body.appendChild(element);

      expect(generator.isCarouselControl(element)).toBe(true);
    });

    it('should detect carousel controls via aria-label', () => {
      const element = document.createElement('button');
      element.setAttribute('aria-label', 'Next slide');
      document.body.appendChild(element);

      expect(generator.isCarouselControl(element)).toBe(true);
    });

    it('should detect carousel controls via parent container', () => {
      const container = document.createElement('div');
      container.className = 'swiper-container';
      const element = document.createElement('button');
      element.className = 'next-btn';
      container.appendChild(element);
      document.body.appendChild(container);

      expect(generator.isCarouselControl(element)).toBe(true);
    });

    it('should not detect regular buttons as carousel controls', () => {
      const element = document.createElement('button');
      element.className = 'submit-btn';
      document.body.appendChild(element);

      expect(generator.isCarouselControl(element)).toBe(false);
    });

    it('🆕 should NOT detect disabled carousel controls', () => {
      const element = document.createElement('button');
      element.className = 'swiper-button-next disabled';
      document.body.appendChild(element);

      expect(generator.isCarouselControl(element)).toBe(false);
    });

    it('🆕 should detect user custom carousel arrow (content__body__item-img-arrow)', () => {
      const element = document.createElement('span');
      element.className = 'content__body__item-img-arrow next';
      document.body.appendChild(element);

      expect(generator.isCarouselControl(element)).toBe(true);
    });

    it('🆕 should detect user custom carousel arrow (content__body__img-arrow)', () => {
      const element = document.createElement('span');
      element.className = 'content__body__img-arrow prev';
      document.body.appendChild(element);

      expect(generator.isCarouselControl(element)).toBe(true);
    });
  });

  describe('🆕 detectCarouselWithConfidence', () => {
    it('should return high confidence for framework-based carousels', () => {
      const element = document.createElement('button');
      element.className = 'swiper-button-next';
      document.body.appendChild(element);

      const result = generator.detectCarouselWithConfidence(element);

      expect(result.isCarousel).toBe(true);
      expect(result.confidence).toBe(95);
      expect(result.detectionMethod).toBe('framework');
      expect(result.carouselLibrary).toBe('swiper');
    });

    it('should return medium-high confidence for pattern-matched custom carousels', () => {
      const element = document.createElement('span');
      element.className = 'content__body__item-img-arrow next';
      document.body.appendChild(element);

      const result = generator.detectCarouselWithConfidence(element);

      expect(result.isCarousel).toBe(true);
      expect(result.confidence).toBeGreaterThanOrEqual(75);
      expect(result.confidence).toBeLessThanOrEqual(95);
      expect(result.detectionMethod).toBe('pattern');
    });

    it('should return low confidence for heuristic detection', () => {
      const container = document.createElement('div');
      container.className = 'image-gallery';
      const element = document.createElement('button');
      element.className = 'next';
      container.appendChild(element);
      document.body.appendChild(container);

      const result = generator.detectCarouselWithConfidence(element);

      expect(result.isCarousel).toBe(true);
      expect(result.confidence).toBeGreaterThanOrEqual(60);
      expect(result.confidence).toBeLessThan(75);
      expect(result.detectionMethod).toBe('heuristic');
    });

    it('should return zero confidence for disabled carousel controls', () => {
      const element = document.createElement('button');
      element.className = 'swiper-button-next';
      element.setAttribute('disabled', '');
      document.body.appendChild(element);

      const result = generator.detectCarouselWithConfidence(element);

      expect(result.isCarousel).toBe(false);
      expect(result.confidence).toBe(0);
      expect(result.detectionMethod).toBe(null);
    });
  });

  describe('findUniqueParentContainer', () => {
    it('should find parent with ID', () => {
      const container = document.createElement('div');
      container.id = 'listing-123';
      const child = document.createElement('button');
      container.appendChild(child);
      document.body.appendChild(container);

      const result = generator.findUniqueParentContainer(child);

      expect(result.type).toBe('id');
      expect(result.selector).toBe('#listing-123');
      expect(result.element).toBe(container);
    });

    it('should find parent with data-id attribute', () => {
      const container = document.createElement('div');
      container.setAttribute('data-listing-id', '456');
      const child = document.createElement('button');
      container.appendChild(child);
      document.body.appendChild(container);

      const result = generator.findUniqueParentContainer(child);

      expect(result.type).toBe('data-attribute');
      expect(result.selector).toBe('[data-listing-id="456"]');
      expect(result.element).toBe(container);
    });

    it('should find list item with nth-child', () => {
      const ul = document.createElement('ul');
      ul.id = 'listings';

      // Create 3 list items
      for (let i = 0; i < 3; i++) {
        const li = document.createElement('li');
        li.className = 'listing-item';
        ul.appendChild(li);
      }

      const targetLi = ul.children[1] as HTMLElement; // Second item
      const button = document.createElement('button');
      targetLi.appendChild(button);
      document.body.appendChild(ul);

      const result = generator.findUniqueParentContainer(button);

      expect(result.type).toBe('nth-child');
      expect(result.selector).toContain('nth-child(2)');
      expect(result.element).toBe(targetLi);
      expect(result.index).toBe(1);
    });

    it('should find container with item/card class pattern', () => {
      const container = document.createElement('div');
      container.className = 'product-grid';

      const item = document.createElement('div');
      item.className = 'product-item';
      const button = document.createElement('button');
      item.appendChild(button);
      container.appendChild(item);
      document.body.appendChild(container);

      const result = generator.findUniqueParentContainer(button);

      expect(result.type).toBe('nth-child');
      expect(result.selector).toContain('product-item');
      expect(result.element).toBe(item);
    });

    it('should return null for elements without unique containers', () => {
      const button = document.createElement('button');
      document.body.appendChild(button);

      const result = generator.findUniqueParentContainer(button);

      expect(result.type).toBe(null);
      expect(result.selector).toBe(null);
      expect(result.element).toBe(null);
    });
  });

  describe('generateCarouselSelectors', () => {
    it('should generate container-scoped CSS selector for carousel arrows', () => {
      // Setup: Multiple list items with carousel arrows
      const ul = document.createElement('ul');
      ul.id = 'listings_cn';

      for (let i = 0; i < 5; i++) {
        const li = document.createElement('li');
        li.className = 'content__body__item';

        const arrow = document.createElement('span');
        arrow.className = 'content__body__item-img-arrow next';
        li.appendChild(arrow);

        ul.appendChild(li);
      }

      document.body.appendChild(ul);

      // Target the 5th item's arrow
      const targetArrow = ul.children[4]!.querySelector('.next') as Element;
      const strategy = generator.generateCarouselSelectors(targetArrow);

      // Should include parent context in CSS selector
      expect(strategy.css).toContain('nth-child(5)');
      expect(strategy.css).toContain('content__body__item-img-arrow');

      // ✅ FIXED: Priority should be css > xpath > xpathAbsolute > position
      expect(strategy.priority[0]).toBe('css');
      expect(strategy.priority[1]).toBe('xpath');
      expect(strategy.priority[2]).toBe('xpathAbsolute');
      expect(strategy.priority[3]).toBe('position');
    });

    it('should prioritize css then xpath for carousel elements to prevent cross-carousel interference', () => {
      const container = document.createElement('div');
      container.id = 'carousel-123';
      const arrow = document.createElement('button');
      arrow.className = 'swiper-button-next';
      container.appendChild(arrow);
      document.body.appendChild(container);

      const strategy = generator.generateCarouselSelectors(arrow);

      // ✅ FIXED: CSS first (includes direction classes), then precise XPath
      expect(strategy.priority[0]).toBe('css');
      expect(strategy.priority[1]).toBe('xpath');
      expect(strategy.css).toBeDefined();
      expect(strategy.xpath).toBeDefined();
      expect(strategy.xpathAbsolute).toBeDefined();
    });

    it('should include position selector with parent context', () => {
      const container = document.createElement('div');
      container.id = 'product-123';
      const wrapper = document.createElement('div');
      wrapper.className = 'carousel-wrapper';
      const arrow = document.createElement('span');
      arrow.className = 'arrow-next';

      wrapper.appendChild(arrow);
      container.appendChild(wrapper);
      document.body.appendChild(container);

      const strategy = generator.generateCarouselSelectors(arrow);

      expect(strategy.position).toBeDefined();
      expect(strategy.position?.parent).toContain('carousel-wrapper');
    });

    it('should fallback to regular selector if no unique container found', () => {
      const arrow = document.createElement('button');
      arrow.className = 'carousel-arrow next';
      arrow.id = 'unique-arrow';
      document.body.appendChild(arrow);

      const strategy = generator.generateCarouselSelectors(arrow);

      // Should have standard selectors
      expect(strategy.id).toBe('unique-arrow');
      expect(strategy.css).toBeDefined();
    });

    it('should generate unique selectors for each carousel in a list', () => {
      const ul = document.createElement('ul');
      ul.id = 'products';

      // Create 3 products with carousels
      const arrows: Element[] = [];
      for (let i = 0; i < 3; i++) {
        const li = document.createElement('li');
        li.className = 'product-item';

        const arrow = document.createElement('button');
        arrow.className = 'carousel-next';
        li.appendChild(arrow);
        ul.appendChild(li);
        arrows.push(arrow);
      }

      document.body.appendChild(ul);

      // Generate selectors for all arrows
      const strategies = arrows.map((arrow) => generator.generateCarouselSelectors(arrow));

      // Each should have unique CSS selector
      expect(strategies[0]!.css).toContain('nth-child(1)');
      expect(strategies[1]!.css).toContain('nth-child(2)');
      expect(strategies[2]!.css).toContain('nth-child(3)');

      // All should be unique
      const cssSelectors = strategies.map((s) => s.css);
      expect(new Set(cssSelectors).size).toBe(3);
    });
  });

  describe('getElementSelectorPart', () => {
    it('should use ID for selector part', () => {
      const element = document.createElement('div');
      element.id = 'container-123';
      document.body.appendChild(element);

      const part = generator.getElementSelectorPart(element);

      expect(part).toBe('div#container-123');
    });

    it('should use classes for selector part', () => {
      const element = document.createElement('div');
      element.className = 'product-item featured';
      document.body.appendChild(element);

      const part = generator.getElementSelectorPart(element);

      expect(part).toContain('product-item');
      expect(part).toContain('featured');
    });

    it('should use tag name only if no ID or classes', () => {
      const element = document.createElement('div');
      document.body.appendChild(element);

      const part = generator.getElementSelectorPart(element);

      expect(part).toBe('div');
    });

    it('should skip dynamic classes', () => {
      const element = document.createElement('div');
      element.className = 'product-item css-abc123 jss-xyz789';
      document.body.appendChild(element);

      const part = generator.getElementSelectorPart(element);

      expect(part).toContain('product-item');
      expect(part).not.toContain('css-abc123');
      expect(part).not.toContain('jss-xyz789');
    });
  });
});

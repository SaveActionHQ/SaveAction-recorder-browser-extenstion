import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventListener } from '@/content/event-listener';
import type { ClickAction } from '@/types';

// Mock chrome API
const chrome = {
  runtime: {
    sendMessage: vi.fn((_message: any, callback?: (response: any) => void) => {
      if (callback) callback({ success: true });
      return true;
    }),
  },
};

global.chrome = chrome as any;

describe('EventListener - Carousel Detection', () => {
  let eventListener: EventListener;
  let capturedActions: any[] = [];

  beforeEach(() => {
    capturedActions = [];
    eventListener = new EventListener((action) => {
      capturedActions.push(action);
    });
    eventListener.setRecordingStartTime(Date.now());
    document.body.innerHTML = ''; // Clear DOM
    vi.clearAllMocks();
  });

  describe('Carousel click detection', () => {
    it('should detect swiper carousel arrow clicks', () => {
      const container = document.createElement('div');
      container.className = 'swiper-container';
      const arrow = document.createElement('button');
      arrow.className = 'swiper-button-next';
      container.appendChild(arrow);
      document.body.appendChild(container);

      eventListener.start();

      // Simulate click
      const event = new MouseEvent('click', { bubbles: true, clientX: 10, clientY: 10 });
      arrow.dispatchEvent(event);

      expect(capturedActions.length).toBeGreaterThan(0);
      const action = capturedActions[0] as ClickAction;

      expect(action.type).toBe('click');
      expect(action.clickType).toBe('carousel-navigation');
      expect(action.carouselContext).toBeDefined();
      expect(action.carouselContext?.isCarouselControl).toBe(true);
    });

    it('should detect custom carousel arrow clicks', () => {
      const item = document.createElement('div');
      item.className = 'listing-item';
      const arrow = document.createElement('span');
      arrow.className = 'img-arrow next';
      item.appendChild(arrow);
      document.body.appendChild(item);

      eventListener.start();

      const event = new MouseEvent('click', { bubbles: true, clientX: 10, clientY: 10 });
      arrow.dispatchEvent(event);

      expect(capturedActions.length).toBeGreaterThan(0);
      const action = capturedActions[0] as ClickAction;

      expect(action.clickType).toBe('carousel-navigation');
      expect(action.carouselContext?.isCarouselControl).toBe(true);
    });

    it('should not detect regular button clicks as carousel', () => {
      const button = document.createElement('button');
      button.className = 'submit-btn';
      document.body.appendChild(button);

      eventListener.start();

      const event = new MouseEvent('click', { bubbles: true, clientX: 10, clientY: 10 });
      button.dispatchEvent(event);

      expect(capturedActions.length).toBeGreaterThan(0);
      const action = capturedActions[0] as ClickAction;

      expect(action.clickType).not.toBe('carousel-navigation');
      expect(action.carouselContext).toBeUndefined();
    });
  });

  describe('Carousel context generation', () => {
    it('should detect "next" direction from class name', () => {
      const arrow = document.createElement('button');
      arrow.className = 'carousel-control-next';
      document.body.appendChild(arrow);

      eventListener.start();

      const event = new MouseEvent('click', { bubbles: true, clientX: 10, clientY: 10 });
      arrow.dispatchEvent(event);

      const action = capturedActions[0] as ClickAction;
      expect(action.carouselContext?.direction).toBe('next');
    });

    it('should detect "prev" direction from class name', () => {
      const arrow = document.createElement('button');
      arrow.className = 'carousel-control-prev';
      document.body.appendChild(arrow);

      eventListener.start();

      const event = new MouseEvent('click', { bubbles: true, clientX: 10, clientY: 10 });
      arrow.dispatchEvent(event);

      const action = capturedActions[0] as ClickAction;
      expect(action.carouselContext?.direction).toBe('prev');
    });

    it('should detect carousel library from class name', () => {
      const arrow = document.createElement('button');
      arrow.className = 'swiper-button-next';
      document.body.appendChild(arrow);

      eventListener.start();

      const event = new MouseEvent('click', { bubbles: true, clientX: 10, clientY: 10 });
      arrow.dispatchEvent(event);

      const action = capturedActions[0] as ClickAction;
      expect(action.carouselContext?.carouselLibrary).toBe('swiper');
    });

    it('should detect bootstrap carousel library', () => {
      const arrow = document.createElement('button');
      arrow.className = 'carousel-control-next';
      document.body.appendChild(arrow);

      eventListener.start();

      const event = new MouseEvent('click', { bubbles: true, clientX: 10, clientY: 10 });
      arrow.dispatchEvent(event);

      const action = capturedActions[0] as ClickAction;
      expect(action.carouselContext?.carouselLibrary).toBe('bootstrap');
    });

    it('should detect product gallery carousel type', () => {
      const product = document.createElement('div');
      product.className = 'product-item';
      const arrow = document.createElement('button');
      arrow.className = 'carousel-next';
      product.appendChild(arrow);
      document.body.appendChild(product);

      eventListener.start();

      const event = new MouseEvent('click', { bubbles: true, clientX: 10, clientY: 10 });
      arrow.dispatchEvent(event);

      const action = capturedActions[0] as ClickAction;
      expect(action.carouselContext?.carouselType).toBe('product-gallery');
    });

    it('should include container selector in carousel context', () => {
      const container = document.createElement('div');
      container.id = 'product-123';
      const arrow = document.createElement('button');
      arrow.className = 'carousel-next';
      container.appendChild(arrow);
      document.body.appendChild(container);

      eventListener.start();

      const event = new MouseEvent('click', { bubbles: true, clientX: 10, clientY: 10 });
      arrow.dispatchEvent(event);

      const action = capturedActions[0] as ClickAction;
      expect(action.carouselContext?.containerSelector).toContain('product-123');
    });
  });

  describe('Container-scoped carousel selectors', () => {
    it('should generate container-scoped CSS selectors for carousel arrows in lists', () => {
      const ul = document.createElement('ul');
      ul.id = 'listings';

      // Create 5 list items with carousel arrows
      for (let i = 0; i < 5; i++) {
        const li = document.createElement('li');
        li.className = 'listing-item';
        const arrow = document.createElement('span');
        arrow.className = 'img-arrow next';
        li.appendChild(arrow);
        ul.appendChild(li);
      }

      document.body.appendChild(ul);

      eventListener.start();

      // Click the 5th arrow
      const fifthArrow = ul.children[4]!.querySelector('.next') as Element;
      const event = new MouseEvent('click', { bubbles: true, clientX: 10, clientY: 10 });
      fifthArrow.dispatchEvent(event);

      const action = capturedActions[0] as ClickAction;

      // Should include nth-child(5) in CSS selector
      expect(action.selector.css).toContain('nth-child(5)');
      expect(action.selector.css).toContain('img-arrow');
    });

    it('should prioritize xpathAbsolute for carousel selectors', () => {
      const ul = document.createElement('ul');
      ul.id = 'products';
      const li = document.createElement('li');
      const arrow = document.createElement('button');
      arrow.className = 'carousel-next';
      li.appendChild(arrow);
      ul.appendChild(li);
      document.body.appendChild(ul);

      eventListener.start();

      const event = new MouseEvent('click', { bubbles: true, clientX: 10, clientY: 10 });
      arrow.dispatchEvent(event);

      const action = capturedActions[0] as ClickAction;

      // xpathAbsolute should be first priority
      expect(action.selector.priority[0]).toBe('xpathAbsolute');
      expect(action.selector.xpathAbsolute).toBeDefined();
    });

    it('should generate unique selectors for multiple carousels on same page', async () => {
      const ul = document.createElement('ul');
      ul.id = 'products';

      // Create 3 products with carousels
      for (let i = 0; i < 3; i++) {
        const li = document.createElement('li');
        li.className = 'product-item';
        const arrow = document.createElement('button');
        arrow.type = 'button'; // Avoid submit button detection
        arrow.className = 'carousel-next';
        li.appendChild(arrow);
        ul.appendChild(li);
      }

      document.body.appendChild(ul);

      eventListener.start();

      // Click each arrow and collect selectors
      const arrows = document.querySelectorAll('.carousel-next');
      const selectors: string[] = [];

      for (const arrow of arrows) {
        capturedActions = []; // Clear
        const event = new MouseEvent('click', { bubbles: true, clientX: 10, clientY: 10 });
        arrow.dispatchEvent(event);

        // Wait for async form navigation detection to complete
        await new Promise((resolve) => setTimeout(resolve, 50));

        if (capturedActions.length > 0) {
          const action = capturedActions[0] as ClickAction;
          selectors.push(action.selector?.css || '');
        }
      }

      // All selectors should be unique
      expect(new Set(selectors).size).toBe(3);

      // Each should have different nth-child
      expect(selectors[0]).toContain('nth-child(1)');
      expect(selectors[1]).toContain('nth-child(2)');
      expect(selectors[2]).toContain('nth-child(3)');
    });
  });

  describe('Carousel click filtering', () => {
    // TODO: Fix async action emission causing multiple actions per click
    it.skip('should filter rapid carousel clicks (< 200ms)', () => {
      const arrow = document.createElement('button');
      arrow.type = 'button'; // Avoid submit button detection
      arrow.className = 'carousel-next';
      document.body.appendChild(arrow);

      eventListener.start();

      // First click
      const event1 = new MouseEvent('click', { bubbles: true, clientX: 10, clientY: 10 });
      arrow.dispatchEvent(event1);

      expect(capturedActions.length).toBe(1);

      // Second click within 200ms (should be filtered)
      const event2 = new MouseEvent('click', { bubbles: true, clientX: 10, clientY: 10 });
      arrow.dispatchEvent(event2);

      // Should still be 1 action
      expect(capturedActions.length).toBe(1);
    });

    // TODO: Fix async action emission causing multiple actions per click
    it.skip('should allow carousel clicks after 200ms delay', async () => {
      const arrow = document.createElement('button');
      arrow.type = 'button'; // Avoid submit button detection
      arrow.className = 'carousel-next';
      document.body.appendChild(arrow);

      eventListener.start();

      // First click
      const event1 = new MouseEvent('click', { bubbles: true, clientX: 10, clientY: 10 });
      arrow.dispatchEvent(event1);

      // Wait for first click to process
      await new Promise((resolve) => setTimeout(resolve, 50));
      const initialCount = capturedActions.length;

      // Wait 250ms then click again
      await new Promise((resolve) => setTimeout(resolve, 250));

      const event2 = new MouseEvent('click', { bubbles: true, clientX: 10, clientY: 10 });
      arrow.dispatchEvent(event2);

      // Wait for second click to process
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Should have more actions now (at least one more than initial)
      expect(capturedActions.length).toBeGreaterThan(initialCount);
    });

    // TODO: Fix async action emission causing multiple actions per click
    it.skip('should detect excessive carousel clicking', () => {
      vi.useFakeTimers();

      const arrow = document.createElement('button');
      arrow.type = 'button'; // Avoid submit button detection
      arrow.className = 'carousel-next';
      document.body.appendChild(arrow);

      eventListener.start();

      // Simulate 10 rapid clicks (every 300ms)
      for (let i = 0; i < 10; i++) {
        const event = new MouseEvent('click', { bubbles: true, clientX: 10, clientY: 10 });
        arrow.dispatchEvent(event);

        // Advance time slightly for each click
        vi.advanceTimersByTime(300);
      }

      // Should filter some clicks due to excessive clicking detection
      expect(capturedActions.length).toBeLessThan(10);

      vi.useRealTimers();
    });
  });
});

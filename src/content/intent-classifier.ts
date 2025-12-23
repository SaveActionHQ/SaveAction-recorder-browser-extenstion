import type { ClickIntent } from '@/types';

/**
 * IntentClassifier - Classifies user click intent for intelligent duplicate detection
 * P1 Implementation - High Priority
 */
export class IntentClassifier {
  /**
   * Classify click intent based on element properties and context
   */
  public classifyClick(
    element: Element,
    context: {
      isCarousel: boolean;
      isFormSubmit: boolean;
      isPagination: boolean;
    }
  ): ClickIntent {
    // Priority 1: Carousel navigation (highest confidence)
    if (context.isCarousel) {
      return {
        type: 'carousel-navigation',
        allowMultiple: true,
        requiresDelay: false,
        confidence: 95,
      };
    }

    // Priority 2: Form submit (never allow multiples)
    if (context.isFormSubmit) {
      return {
        type: 'form-submit',
        allowMultiple: false,
        requiresDelay: true,
        confidence: 100,
      };
    }

    // Priority 3: Pagination
    if (context.isPagination || this.isPaginationControl(element)) {
      return {
        type: 'pagination',
        allowMultiple: true,
        requiresDelay: true, // Wait for page load
        confidence: 90,
      };
    }

    // Priority 4: Increment/decrement buttons
    if (this.isIncrementButton(element)) {
      return {
        type: 'increment',
        allowMultiple: true,
        requiresDelay: false,
        confidence: 85,
      };
    }

    // Priority 5: Toggle switches/checkboxes
    if (this.isToggleElement(element)) {
      return {
        type: 'toggle',
        allowMultiple: false, // Toggles shouldn't be clicked rapidly
        requiresDelay: false,
        confidence: 90,
      };
    }

    // Priority 6: Navigation links/buttons
    if (this.isNavigationElement(element)) {
      return {
        type: 'navigation',
        allowMultiple: false,
        requiresDelay: true,
        confidence: 80,
      };
    }

    // Default: Generic click
    return {
      type: 'generic-click',
      allowMultiple: false,
      requiresDelay: false,
      confidence: 70,
    };
  }

  /**
   * Detect pagination controls
   */
  private isPaginationControl(element: Element): boolean {
    const className = this.getClassName(element);
    const ariaLabel = element.getAttribute('aria-label')?.toLowerCase() || '';
    const text = element.textContent?.toLowerCase() || '';

    const indicators = [
      /pagination|page[-_]?nav/i.test(className),
      /page|pagination/i.test(ariaLabel),
      /next page|previous page|page \d+/i.test(text),
      element.closest('.pagination, [class*="page-nav"], [class*="pager"]') !== null,
    ];

    return indicators.filter(Boolean).length >= 2;
  }

  /**
   * Detect increment/decrement buttons
   */
  private isIncrementButton(element: Element): boolean {
    const text = (element.textContent || '').trim();
    const ariaLabel = element.getAttribute('aria-label')?.toLowerCase() || '';
    const className = this.getClassName(element);

    return (
      text === '+' ||
      text === '-' ||
      text === '▲' ||
      text === '▼' ||
      /increment|decrement|increase|decrease/i.test(ariaLabel) ||
      /stepper|spinner/i.test(className) ||
      element.closest('[type="number"]') !== null
    );
  }

  /**
   * Detect toggle elements (switches, checkboxes with toggle UI)
   */
  private isToggleElement(element: Element): boolean {
    const className = this.getClassName(element);
    const role = element.getAttribute('role');

    return (
      role === 'switch' ||
      /toggle|switch/i.test(className) ||
      (element.tagName === 'INPUT' && (element as HTMLInputElement).type === 'checkbox')
    );
  }

  /**
   * Detect navigation elements (links, nav buttons)
   */
  private isNavigationElement(element: Element): boolean {
    const tagName = element.tagName.toLowerCase();
    const href = (element as HTMLAnchorElement).href;
    const role = element.getAttribute('role');

    return (
      (tagName === 'a' && !!href && href !== '#' && !href.startsWith('javascript:')) ||
      role === 'link' ||
      element.closest('nav') !== null
    );
  }

  /**
   * Safely get element className (handles SVG elements)
   */
  private getClassName(element: Element): string {
    if (!element.className) {
      return '';
    }

    // SVG elements have className as object
    if (typeof element.className === 'object') {
      return String((element.className as any).baseVal || '');
    }

    return String(element.className || '');
  }
}

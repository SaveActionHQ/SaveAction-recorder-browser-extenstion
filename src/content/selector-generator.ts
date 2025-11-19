import type { SelectorStrategy, SelectorType, SelectorConfig } from '@/types';
import { DEFAULT_SELECTOR_CONFIG } from '@/types';

/**
 * CSS.escape polyfill for environments that don't support it
 */
function cssEscape(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(value);
  }

  // Polyfill implementation
  return value.replace(/([\0-\x1f\x7f]|^-?\d)|^-$|[^\x80-\uFFFF\w-]/g, (match, charCode) => {
    if (charCode) {
      return charCode === '\0'
        ? '\uFFFD'
        : match.slice(0, -1) + '\\' + match.slice(-1).charCodeAt(0).toString(16) + ' ';
    }
    return '\\' + match;
  });
}

/**
 * SelectorGenerator - Generates multiple selector strategies for reliable element identification
 * Follows priority order: ID > data-testid > ARIA > name > CSS > text > XPath > position
 */
export class SelectorGenerator {
  private config: SelectorConfig;

  constructor(config: Partial<SelectorConfig> = {}) {
    this.config = { ...DEFAULT_SELECTOR_CONFIG, ...config };
  }

  /**
   * Generate all possible selectors for an element
   */
  public generateSelectors(element: Element): SelectorStrategy {
    const selectors: Partial<SelectorStrategy> = {};
    const priority: SelectorType[] = [];

    // 1. ID selector (highest priority)
    const id = this.generateIdSelector(element);
    if (id) {
      selectors.id = id;
      priority.push('id');
    }

    // 2. data-testid selector
    const dataTestId = this.generateDataTestIdSelector(element);
    if (dataTestId) {
      selectors.dataTestId = dataTestId;
      priority.push('dataTestId');
    }

    // 3. ARIA label selector
    const ariaLabel = this.generateAriaLabelSelector(element);
    if (ariaLabel) {
      selectors.ariaLabel = ariaLabel;
      priority.push('ariaLabel');
    }

    // 4. Name attribute selector (for form fields)
    const name = this.generateNameSelector(element);
    if (name) {
      selectors.name = name;
      priority.push('name');
    }

    // 5. CSS selector
    const css = this.generateCssSelector(element);
    if (css) {
      selectors.css = css;
      priority.push('css');
    }

    // 6. Text-based selector
    const { text, textContains } = this.generateTextSelector(element);
    if (text) {
      selectors.text = text;
      priority.push('text');
    } else if (textContains) {
      selectors.textContains = textContains;
      priority.push('textContains');
    }

    // 7. XPath selectors
    if (this.config.includeXPath) {
      const xpath = this.generateRelativeXPath(element);
      if (xpath) {
        selectors.xpath = xpath;
        priority.push('xpath');
      }

      const xpathAbsolute = this.generateAbsoluteXPath(element);
      if (xpathAbsolute) {
        selectors.xpathAbsolute = xpathAbsolute;
        priority.push('xpathAbsolute');
      }
    }

    // 8. Position-based selector (last resort)
    if (this.config.includePosition) {
      const position = this.generatePositionSelector(element);
      if (position) {
        selectors.position = position;
        priority.push('position');
      }
    }

    return {
      ...selectors,
      priority,
    } as SelectorStrategy;
  }

  /**
   * Validate that a selector strategy uniquely identifies an element
   */
  public validateSelectorUniqueness(element: Element, strategy: SelectorStrategy): boolean {
    // Try each selector in priority order
    for (const selectorType of strategy.priority) {
      let selector: string | undefined;

      switch (selectorType) {
        case 'id':
          selector = strategy.id ? `#${cssEscape(strategy.id)}` : undefined;
          break;
        case 'dataTestId':
          selector = strategy.dataTestId
            ? `[data-testid="${strategy.dataTestId}"]`
            : undefined;
          break;
        case 'ariaLabel':
          selector = strategy.ariaLabel ? `[aria-label="${strategy.ariaLabel}"]` : undefined;
          break;
        case 'name':
          selector = strategy.name ? `[name="${strategy.name}"]` : undefined;
          break;
        case 'css':
          selector = strategy.css;
          break;
        case 'xpath':
          // XPath validation would require different approach
          continue;
        case 'xpathAbsolute':
          continue;
        case 'text':
          // Text validation would require different approach
          continue;
        case 'textContains':
          continue;
        case 'position':
          // Position validation would require different approach
          continue;
      }

      if (selector) {
        try {
          const elements = document.querySelectorAll(selector);
          if (elements.length === 1 && elements[0] === element) {
            return true;
          }
        } catch {
          // Invalid selector, continue to next
          continue;
        }
      }
    }

    return false;
  }

  /**
   * Generate ID selector
   */
  private generateIdSelector(element: Element): string | undefined {
    const id = element.id;
    if (!id) return undefined;

    // Skip if ID looks dynamically generated
    if (this.isDynamicId(id)) return undefined;

    return id;
  }

  /**
   * Generate data-testid selector
   */
  private generateDataTestIdSelector(element: Element): string | undefined {
    return element.getAttribute('data-testid') || undefined;
  }

  /**
   * Generate ARIA label selector
   */
  private generateAriaLabelSelector(element: Element): string | undefined {
    return element.getAttribute('aria-label') || undefined;
  }

  /**
   * Generate name attribute selector
   */
  private generateNameSelector(element: Element): string | undefined {
    if (element instanceof HTMLInputElement || element instanceof HTMLSelectElement) {
      return element.name || undefined;
    }
    return undefined;
  }

  /**
   * Generate CSS selector
   */
  private generateCssSelector(element: Element): string {
    const parts: string[] = [];

    // Tag name
    parts.push(element.tagName.toLowerCase());

    // Type attribute for inputs
    if (element instanceof HTMLInputElement && element.type) {
      parts.push(`[type="${element.type}"]`);
    }

    // Classes (limit to most specific)
    const classes = Array.from(element.classList)
      .filter((cls) => !this.isDynamicClass(cls))
      .slice(0, 3);

    if (classes.length > 0) {
      parts[0] += classes.map((cls) => `.${cssEscape(cls)}`).join('');
    }

    // Build selector with limited depth
    let currentElement: Element | null = element;
    const selectorParts: string[] = [parts.join('')];
    let depth = 0;

    while (
      currentElement.parentElement &&
      depth < this.config.maxCssDepth &&
      currentElement.parentElement !== document.body
    ) {
      currentElement = currentElement.parentElement;
      const parentPart = this.getElementSelectorPart(currentElement);
      if (parentPart) {
        selectorParts.unshift(parentPart);
        depth++;
      }
    }

    return selectorParts.join(' > ');
  }

  /**
   * Generate text-based selector
   */
  private generateTextSelector(element: Element): {
    text?: string;
    textContains?: string;
  } {
    const text = element.textContent?.trim();
    if (!text) return {};

    // Use exact match for short text
    if (text.length <= 50) {
      return { text };
    }

    // Use contains for longer text
    return { textContains: text.substring(0, 30) };
  }

  /**
   * Generate relative XPath
   */
  private generateRelativeXPath(element: Element): string {
    const tagName = element.tagName.toLowerCase();

    // Try ID-based XPath first
    if (element.id && !this.isDynamicId(element.id)) {
      return `//${tagName}[@id="${element.id}"]`;
    }

    // Try data-testid
    const dataTestId = element.getAttribute('data-testid');
    if (dataTestId) {
      return `//${tagName}[@data-testid="${dataTestId}"]`;
    }

    // Try name attribute
    if (element instanceof HTMLInputElement && element.name) {
      return `//${tagName}[@name="${element.name}"]`;
    }

    // Try class-based
    const classes = Array.from(element.classList);
    if (classes.length > 0) {
      const classConditions = classes
        .filter((cls) => !this.isDynamicClass(cls))
        .slice(0, 2)
        .map((cls) => `contains(@class, "${cls}")`)
        .join(' and ');

      if (classConditions) {
        return `//${tagName}[${classConditions}]`;
      }
    }

    // Fallback to tag with index
    const siblings = Array.from(element.parentElement?.children || []).filter(
      (el) => el.tagName === element.tagName
    );
    const index = siblings.indexOf(element) + 1;

    return `//${tagName}[${index}]`;
  }

  /**
   * Generate absolute XPath
   */
  private generateAbsoluteXPath(element: Element): string {
    const parts: string[] = [];
    let currentElement: Element | null = element;

    while (currentElement && currentElement !== document.documentElement) {
      const tagName = currentElement.tagName.toLowerCase();
      const siblings = Array.from(currentElement.parentElement?.children || []).filter(
        (el) => el.tagName === currentElement?.tagName
      );

      const index = siblings.indexOf(currentElement) + 1;
      parts.unshift(`${tagName}[${index}]`);

      currentElement = currentElement.parentElement;
    }

    return `/html/${parts.join('/')}`;
  }

  /**
   * Generate position-based selector
   */
  private generatePositionSelector(
    element: Element
  ): { parent: string; index: number } | undefined {
    if (!element.parentElement) return undefined;

    const parent = this.getElementSelectorPart(element.parentElement);
    if (!parent) return undefined;

    const siblings = Array.from(element.parentElement.children);
    const index = siblings.indexOf(element);

    return {
      parent,
      index,
    };
  }

  /**
   * Get a simple selector part for an element
   */
  private getElementSelectorPart(element: Element): string {
    const tagName = element.tagName.toLowerCase();

    if (element.id && !this.isDynamicId(element.id)) {
      return `${tagName}#${cssEscape(element.id)}`;
    }

    const classes = Array.from(element.classList)
      .filter((cls) => !this.isDynamicClass(cls))
      .slice(0, 2);

    if (classes.length > 0) {
      return `${tagName}.${classes.map((cls) => cssEscape(cls)).join('.')}`;
    }

    return tagName;
  }

  /**
   * Check if ID looks dynamically generated
   */
  private isDynamicId(id: string): boolean {
    // Common patterns for dynamic IDs
    const dynamicPatterns = [
      /^(react-|vue-|ng-|ember-)/i, // Framework prefixes
      /\d{6,}/i, // Long numbers
      /-\d{13,}/i, // Timestamps
      /^[a-f0-9]{8,}/i, // Hash-like IDs
    ];

    return dynamicPatterns.some((pattern) => pattern.test(id));
  }

  /**
   * Check if class name looks dynamically generated
   */
  private isDynamicClass(className: string): boolean {
    const dynamicPatterns = [
      /^(css-|jss-)/i, // CSS-in-JS
      /^_[a-f0-9]+/i, // Hash-based classes
      /\d{5,}/i, // Long numbers
    ];

    return dynamicPatterns.some((pattern) => pattern.test(className));
  }
}

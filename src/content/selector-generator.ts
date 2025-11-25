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
   * Generate all possible selectors for an element with uniqueness validation
   */
  public generateSelectors(element: Element): SelectorStrategy {
    const strategy = this.generateAllSelectors(element);
    return this.enhanceForUniqueness(element, strategy);
  }

  /**
   * Generate all possible selectors for an element (internal)
   */
  private generateAllSelectors(element: Element): SelectorStrategy {
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
          selector = strategy.dataTestId ? `[data-testid="${strategy.dataTestId}"]` : undefined;
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
   * Generate CSS selector with nth-child support for uniqueness
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
   * Generate CSS selector with nth-child for disambiguation
   */
  private generateCssSelectorWithNthChild(element: Element): string {
    const baseCss = this.generateCssSelector(element);

    // Add nth-child for common ambiguous elements
    if (element.parentElement && this.shouldUseNthChild(element)) {
      const siblings = Array.from(element.parentElement.children);
      const index = siblings.indexOf(element) + 1;

      // Add nth-child to the last part of the selector
      return `${baseCss}:nth-child(${index})`;
    }

    return baseCss;
  }

  /**
   * Check if element should use nth-child (list items, options, etc.)
   */
  private shouldUseNthChild(element: Element): boolean {
    const tagName = element.tagName.toLowerCase();
    const ambiguousTags = ['li', 'option', 'tr', 'td', 'th'];
    return ambiguousTags.includes(tagName);
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
   * Generate relative XPath with text content for better uniqueness
   */
  private generateRelativeXPath(element: Element): string {
    const tagName = element.tagName.toLowerCase();
    const text = element.textContent?.trim();

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

    // Try text-based XPath for specific elements (list items, links, buttons)
    if (text && text.length > 0 && text.length < 100) {
      const shouldUseText = ['li', 'a', 'button', 'option', 'span'].includes(tagName);
      if (shouldUseText && element.parentElement) {
        const escapedText = text.replace(/'/g, "'");
        const parentClasses = Array.from(element.parentElement.classList)
          .filter((cls) => !this.isDynamicClass(cls))
          .slice(0, 1);

        if (parentClasses.length > 0) {
          const parentTag = element.parentElement.tagName.toLowerCase();
          return `//${parentTag}[contains(@class, "${parentClasses[0]}")]/${tagName}[text()='${escapedText}']`;
        }
        return `//${tagName}[text()='${escapedText}']`;
      }
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

  /**
   * Enhance selector strategy for uniqueness
   */
  private enhanceForUniqueness(element: Element, strategy: SelectorStrategy): SelectorStrategy {
    // Check if CSS selector is unique
    if (strategy.css && !this.isSelectorUnique(strategy.css, element)) {
      // Try CSS with nth-child
      const cssWithNthChild = this.generateCssSelectorWithNthChild(element);
      if (this.isSelectorUnique(cssWithNthChild, element)) {
        strategy.css = cssWithNthChild;
      }
    }

    // Reorder priority based on uniqueness and structural preference
    const structuralSelectors: SelectorType[] = []; // id, dataTestId, ariaLabel, name, css
    const contentSelectors: SelectorType[] = []; // text, textContains
    const fallbackSelectors: SelectorType[] = []; // xpath, xpathAbsolute, position

    for (const selectorType of strategy.priority) {
      const selector = this.getSelectorValue(strategy, selectorType);
      const isUnique = selector && this.isSelectorTypeUnique(selector, selectorType, element);

      // Categorize selectors
      if (['id', 'dataTestId', 'ariaLabel', 'name', 'css'].includes(selectorType)) {
        if (isUnique) {
          structuralSelectors.push(selectorType);
        }
      } else if (['text', 'textContains'].includes(selectorType)) {
        if (isUnique) {
          contentSelectors.push(selectorType);
        }
      } else {
        // xpath, xpathAbsolute, position
        fallbackSelectors.push(selectorType);
      }
    }

    // Priority order: structural (unique) > fallback > content (unique)
    // This ensures CSS selector is tried before text, even if both are unique
    strategy.priority = [...structuralSelectors, ...fallbackSelectors, ...contentSelectors];

    return strategy;
  }

  /**
   * Check if a CSS selector uniquely identifies the element
   */
  private isSelectorUnique(selector: string, element: Element): boolean {
    try {
      const matches = document.querySelectorAll(selector);
      return matches.length === 1 && matches[0] === element;
    } catch {
      return false;
    }
  }

  /**
   * Check if a selector of given type is unique
   */
  private isSelectorTypeUnique(
    selector: string,
    selectorType: SelectorType,
    element: Element
  ): boolean {
    try {
      let querySelector: string;

      switch (selectorType) {
        case 'id':
          querySelector = `#${cssEscape(selector)}`;
          break;
        case 'dataTestId':
          querySelector = `[data-testid="${selector}"]`;
          break;
        case 'ariaLabel':
          querySelector = `[aria-label="${selector}"]`;
          break;
        case 'name':
          querySelector = `[name="${selector}"]`;
          break;
        case 'css':
          querySelector = selector;
          break;
        case 'text':
        case 'textContains':
          // Validate text uniqueness by checking all elements with same text
          return this.isTextUnique(selector, element, selectorType === 'textContains');
        case 'xpath':
          // XPath validation is complex, assume unique for now
          // TODO: Implement XPath evaluation for better validation
          return true;
        case 'xpathAbsolute':
          // Absolute XPath should always be unique
          return true;
        case 'position':
          // Position-based selector is always unique within parent
          return true;
        default:
          return true;
      }

      const matches = document.querySelectorAll(querySelector);
      return matches.length === 1 && matches[0] === element;
    } catch {
      return false;
    }
  }

  /**
   * Check if text content uniquely identifies the element
   */
  private isTextUnique(text: string, element: Element, isPartial: boolean): boolean {
    if (!text) return false;

    // Get all elements in the document
    const allElements = document.querySelectorAll('*');
    let matchCount = 0;
    let matchedElement: Element | null = null;

    for (const el of Array.from(allElements)) {
      const elementText = el.textContent?.trim();
      if (!elementText) continue;

      const matches = isPartial ? elementText.includes(text) : elementText === text;

      if (matches) {
        matchCount++;
        matchedElement = el;

        // If we found more than one match, it's not unique
        if (matchCount > 1) {
          return false;
        }
      }
    }

    // Text is unique only if exactly one element matched and it's our target
    return matchCount === 1 && matchedElement === element;
  }

  /**
   * Get selector value by type
   */
  private getSelectorValue(strategy: SelectorStrategy, type: SelectorType): string | undefined {
    switch (type) {
      case 'id':
        return strategy.id;
      case 'dataTestId':
        return strategy.dataTestId;
      case 'ariaLabel':
        return strategy.ariaLabel;
      case 'name':
        return strategy.name;
      case 'css':
        return strategy.css;
      case 'xpath':
        return strategy.xpath;
      case 'xpathAbsolute':
        return strategy.xpathAbsolute;
      case 'text':
        return strategy.text;
      case 'textContains':
        return strategy.textContains;
      default:
        return undefined;
    }
  }
}

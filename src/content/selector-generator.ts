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
   * Generate selectors with confidence scores (v2.0.0)
   * Returns array of selector strategies sorted by confidence
   */
  public generateSelectorsWithConfidence(element: Element): Array<{
    strategy: string;
    value: string;
    context?: string;
    priority: number;
    confidence: number;
  }> {
    const selectors: Array<{
      strategy: string;
      value: string;
      context?: string;
      priority: number;
      confidence: number;
    }> = [];

    // Strategy 1: data-testid (highest confidence)
    const testId =
      element.getAttribute('data-testid') ||
      element.getAttribute('data-test') ||
      element.getAttribute('data-cy');
    if (testId) {
      selectors.push({
        strategy: 'data-testid',
        value: testId,
        priority: 1,
        confidence: 95,
      });
    }

    // Strategy 2: ID (if not auto-generated)
    const id = element.id;
    if (id && !this.isDynamicId(id)) {
      selectors.push({
        strategy: 'id',
        value: id,
        priority: 2,
        confidence: 90,
      });
    }

    // Strategy 3: aria-label
    const ariaLabel = element.getAttribute('aria-label');
    if (ariaLabel && ariaLabel.length > 3) {
      selectors.push({
        strategy: 'aria-label',
        value: ariaLabel,
        priority: 3,
        confidence: 88,
      });
    }

    // Strategy 4: name attribute
    if (element instanceof HTMLInputElement || element instanceof HTMLSelectElement) {
      const name = element.name;
      if (name) {
        selectors.push({
          strategy: 'name',
          value: name,
          priority: 4,
          confidence: 85,
        });
      }
    }

    // Strategy 5: href pattern (for links)
    if (element instanceof HTMLAnchorElement) {
      const href = element.getAttribute('href');
      if (href && href.length > 1 && !href.startsWith('#')) {
        selectors.push({
          strategy: 'href-pattern',
          value: href,
          priority: 5,
          confidence: 82,
        });
      }
    }

    // Strategy 6: src pattern (for images)
    if (element instanceof HTMLImageElement) {
      const src = element.getAttribute('src');
      const alt = element.getAttribute('alt');
      if (src && src.length > 1) {
        selectors.push({
          strategy: 'src-pattern',
          value: src,
          context: alt || undefined,
          priority: 6,
          confidence: 80,
        });
      }
    }

    // Strategy 7: Text content (for buttons, links, list items)
    const textContent = element.textContent?.trim();
    if (textContent && textContent.length > 0 && textContent.length < 100) {
      const shouldUseText = ['li', 'a', 'button', 'span', 'div'].includes(
        element.tagName.toLowerCase()
      );
      if (shouldUseText) {
        const parent = element.closest('[class*="card"], [class*="item"], li, div');
        const parentContext = parent?.className || parent?.tagName.toLowerCase();

        selectors.push({
          strategy: 'text-content',
          value: textContent,
          context: parentContext,
          priority: 7,
          confidence: 75,
        });
      }
    }

    // Strategy 8: CSS semantic (class + text)
    const cssClass = element.className;
    if (cssClass && typeof cssClass === 'string' && textContent && textContent.length < 50) {
      const primaryClass = cssClass.split(' ').filter((c) => !this.isDynamicClass(c))[0];
      if (primaryClass) {
        selectors.push({
          strategy: 'css-semantic',
          value: `.${primaryClass}:has-text('${textContent}')`,
          priority: 8,
          confidence: 70,
        });
      }
    }

    // Strategy 9: CSS selector
    const css = this.generateCssSelector(element);
    if (css) {
      const isUnique = this.isSelectorUnique(css, element);
      selectors.push({
        strategy: 'css',
        value: css,
        priority: 9,
        confidence: isUnique ? 65 : 45,
      });
    }

    // Strategy 10: XPath
    if (this.config.includeXPath) {
      const xpath = this.generateRelativeXPath(element);
      if (xpath) {
        selectors.push({
          strategy: 'xpath',
          value: xpath,
          priority: 10,
          confidence: 55,
        });
      }
    }

    // Strategy 11: Position (lowest confidence)
    if (this.config.includePosition) {
      const position = this.generatePositionSelector(element);
      if (position) {
        selectors.push({
          strategy: 'position',
          value: `${position.parent} > :nth-child(${position.index + 1})`,
          priority: 11,
          confidence: 30,
        });
      }
    }

    return selectors.sort((a, b) => a.priority - b.priority);
  }

  /**
   * Generate all possible selectors for an element (internal)
   */
  private generateAllSelectors(element: Element): SelectorStrategy {
    const selectors: Partial<SelectorStrategy> = {};
    const priority: SelectorType[] = [];

    // Detect dropdown context early (before building priority)
    const isDropdownItem =
      element.tagName === 'LI' || element.tagName === 'OPTION' || element.tagName === 'A';

    // Also check if element is a child of a dropdown item (e.g., <span> inside <li>)
    const isChildOfDropdownItem = (() => {
      const parent = element.parentElement;
      return (
        parent && (parent.tagName === 'LI' || parent.tagName === 'OPTION' || parent.tagName === 'A')
      );
    })();

    const hasDropdownContext = (() => {
      if (!isDropdownItem && !isChildOfDropdownItem) return false;

      let parent = element.parentElement;
      let depth = 0;
      const maxDepth = 15;

      while (parent && parent !== document.body && depth < maxDepth) {
        const parentClasses = Array.from(parent.classList)
          .filter((c) => typeof c === 'string')
          .map((c) => c.toLowerCase());
        const dropdownPatterns = [
          'dropdown',
          'menu',
          'autocomplete',
          'select',
          'options',
          'list',
          'popover',
          'picker',
          'listbox',
          'combobox',
        ];

        if (
          parentClasses.some((cls) => dropdownPatterns.some((pattern) => cls.includes(pattern)))
        ) {
          return true;
        }

        parent = parent.parentElement;
        depth++;
      }
      return false;
    })();

    // Generate all selectors first
    const id = this.generateIdSelector(element);
    if (id) selectors.id = id;

    const dataTestId = this.generateDataTestIdSelector(element);
    if (dataTestId) selectors.dataTestId = dataTestId;

    const ariaLabel = this.generateAriaLabelSelector(element);
    if (ariaLabel) selectors.ariaLabel = ariaLabel;

    const name = this.generateNameSelector(element);
    if (name) selectors.name = name;

    const css = this.generateCssSelector(element);
    if (css) selectors.css = css;

    const { text, textContains } = this.generateTextSelector(element);
    if (text) selectors.text = text;
    if (textContains) selectors.textContains = textContains;

    if (this.config.includeXPath) {
      const xpath = this.generateRelativeXPath(element);
      if (xpath) selectors.xpath = xpath;

      const xpathAbsolute = this.generateAbsoluteXPath(element);
      if (xpathAbsolute) selectors.xpathAbsolute = xpathAbsolute;
    }

    if (this.config.includePosition) {
      const position = this.generatePositionSelector(element);
      if (position) selectors.position = position;
    }

    // ✅ CRITICAL FIX: Build priority array with dropdown-aware ordering
    if ((isDropdownItem || isChildOfDropdownItem) && hasDropdownContext) {
      // For dropdown items AND their children: prioritize TEXT FIRST (most reliable for dynamic lists)
      // Even if text is not globally unique, it's better than nth-child selectors
      if (selectors.text) priority.push('text');
      if (selectors.textContains) priority.push('textContains');

      // Then structural selectors
      if (selectors.id) priority.push('id');
      if (selectors.dataTestId) priority.push('dataTestId');
      if (selectors.ariaLabel) priority.push('ariaLabel');
      if (selectors.name) priority.push('name');

      // CSS last (contains fragile nth-child)
      if (selectors.css) priority.push('css');

      // Fallbacks
      if (selectors.xpath) priority.push('xpath');
      if (selectors.xpathAbsolute) priority.push('xpathAbsolute');
      if (selectors.position) priority.push('position');
    } else {
      // For regular elements: standard priority order
      if (selectors.id) priority.push('id');
      if (selectors.dataTestId) priority.push('dataTestId');
      if (selectors.ariaLabel) priority.push('ariaLabel');
      if (selectors.name) priority.push('name');
      if (selectors.css) priority.push('css');
      if (selectors.text) priority.push('text');
      if (selectors.textContains) priority.push('textContains');
      if (selectors.xpath) priority.push('xpath');
      if (selectors.xpathAbsolute) priority.push('xpathAbsolute');
      if (selectors.position) priority.push('position');
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
    // Check if CSS selector is unique, if not try with nth-child
    if (strategy.css && !this.isSelectorUnique(strategy.css, element)) {
      const cssWithNthChild = this.generateCssSelectorWithNthChild(element);
      if (this.isSelectorUnique(cssWithNthChild, element)) {
        strategy.css = cssWithNthChild;
      }
    }

    // Priority is already set correctly in generateAllSelectors()
    // No need to reorder here - just return the strategy
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
}

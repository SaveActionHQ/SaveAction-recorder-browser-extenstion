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
   * Detect if element is a carousel control
   * Three-tier detection system:
   * 1. Framework detection (known libraries)
   * 2. Pattern matching (custom implementations)
   * 3. Heuristic analysis (structural detection)
   */
  public isCarouselControl(element: Element): boolean {
    const result = this.detectCarouselWithConfidence(element);
    return result.isCarousel;
  }

  /**
   * Detect carousel with confidence scoring and metadata
   */
  public detectCarouselWithConfidence(element: Element): {
    isCarousel: boolean;
    confidence: number;
    detectionMethod: 'framework' | 'pattern' | 'heuristic' | null;
    carouselLibrary?: string;
  } {
    try {
      // Check if disabled - skip disabled carousel controls
      if (this.isDisabledCarouselControl(element)) {
        return { isCarousel: false, confidence: 0, detectionMethod: null };
      }

      // Tier 1: Framework detection (highest confidence)
      const frameworkResult = this.detectKnownFramework(element);
      if (frameworkResult.detected) {
        return {
          isCarousel: true,
          confidence: 95,
          detectionMethod: 'framework',
          carouselLibrary: frameworkResult.library,
        };
      }

      // Tier 2: Pattern matching (high confidence)
      const patternResult = this.detectCarouselPattern(element);
      if (patternResult.detected) {
        return {
          isCarousel: true,
          confidence: patternResult.confidence,
          detectionMethod: 'pattern',
        };
      }

      // Tier 3: Heuristic analysis (medium confidence)
      const heuristicResult = this.detectCarouselByStructure(element);
      if (heuristicResult.detected) {
        return {
          isCarousel: true,
          confidence: heuristicResult.confidence,
          detectionMethod: 'heuristic',
        };
      }

      return { isCarousel: false, confidence: 0, detectionMethod: null };
    } catch (error) {
      console.warn('[SelectorGenerator] Error in detectCarouselWithConfidence:', error);
      // Fallback to simple detection
      return { isCarousel: false, confidence: 0, detectionMethod: null };
    }
  }

  /**
   * Check if carousel control is disabled
   */
  private isDisabledCarouselControl(element: Element): boolean {
    try {
      // Check disabled attribute
      if (element.hasAttribute('disabled')) return true;

      // Check disabled class
      if (element.classList && element.classList.contains('disabled')) return true;

      // Check aria-disabled
      if (element.getAttribute('aria-disabled') === 'true') return true;

      // Check if parent has disabled class (common pattern)
      const parent = element.parentElement;
      if (parent && parent.classList && parent.classList.contains('disabled')) return true;

      return false;
    } catch (error) {
      // If any error, assume not disabled (safer default)
      console.warn('[SelectorGenerator] Error checking disabled state:', error);
      return false;
    }
  }

  /**
   * Tier 1: Detect known carousel frameworks
   */
  private detectKnownFramework(element: Element): {
    detected: boolean;
    library?: string;
  } {
    const className = this.getElementClassName(element);

    // Swiper.js
    if (/swiper[-_]?button/i.test(className)) {
      return { detected: true, library: 'swiper' };
    }

    // Bootstrap Carousel
    if (/carousel[-_]?control/i.test(className)) {
      return { detected: true, library: 'bootstrap' };
    }

    // Slick Carousel
    if (/slick[-_]?(arrow|next|prev)/i.test(className)) {
      return { detected: true, library: 'slick' };
    }

    // Owl Carousel
    if (/owl[-_]?(next|prev|nav)/i.test(className)) {
      return { detected: true, library: 'owl' };
    }

    // Flickity
    if (/flickity[-_]?(button|prev|next)/i.test(className)) {
      return { detected: true, library: 'flickity' };
    }

    // Check parent containers for framework classes
    let parent = element.parentElement;
    let depth = 0;
    while (parent && depth < 3) {
      const parentClasses = this.getElementClassName(parent);
      if (/swiper[-_]?container/i.test(parentClasses)) {
        return { detected: true, library: 'swiper' };
      }
      if (
        /carousel/i.test(parentClasses) &&
        /bootstrap|bs-/.test(document.documentElement.className)
      ) {
        return { detected: true, library: 'bootstrap' };
      }
      if (/slick[-_]?(slider|list)/i.test(parentClasses)) {
        return { detected: true, library: 'slick' };
      }
      parent = parent.parentElement;
      depth++;
    }

    return { detected: false };
  }

  /**
   * Tier 2: Pattern-based detection for custom implementations
   */
  private detectCarouselPattern(element: Element): {
    detected: boolean;
    confidence: number;
  } {
    const className = this.getElementClassName(element);
    const ariaLabel = element.getAttribute('aria-label') || '';

    // Enhanced carousel class patterns (catches custom implementations)
    const carouselPatterns = [
      // Image/photo carousel patterns (custom implementations)
      /img[-_]arrow/i, // ✅ Matches content__body__item-img-arrow
      /image[-_]arrow/i,
      /photo[-_]arrow/i,
      /pic[-_]arrow/i,
      /picture[-_]arrow/i,

      // Gallery patterns
      /gallery[-_](arrow|nav|button|control)/i,
      /lightbox[-_](arrow|nav|button)/i,

      // Generic slider patterns
      /slider[-_](arrow|nav|button|control)/i,
      /slide[-_](arrow|nav|button|control)/i,

      // Direction + control patterns
      /(next|prev|previous)[-_]?(btn|button|arrow|icon|control)/i,
      /(arrow|icon|btn|button|control)[-_]?(next|prev|previous)/i,

      // Compound patterns (very specific)
      /carousel[-_]?(arrow|nav|button|control|next|prev|previous)/i, // Fixed: Added next/prev/previous
      /(arrow|nav|button)[-_]?carousel/i,
    ];

    // Check class names against patterns
    let matchedPattern = false;
    let confidence = 75; // Base confidence for pattern matching

    for (const pattern of carouselPatterns) {
      if (pattern.test(className)) {
        matchedPattern = true;

        // Higher confidence for more specific patterns
        if (/img[-_]arrow|image[-_]arrow|photo[-_]arrow/i.test(className)) {
          confidence = 90; // Very specific pattern
        } else if (/gallery|slider|carousel/i.test(className)) {
          confidence = 85; // Specific carousel terms
        }
        break;
      }
    }

    // 🆕 Check parent elements (for nested structures like <span><span><svg>)
    if (!matchedPattern) {
      let parent = element.parentElement;
      let depth = 0;
      while (parent && depth < 3) {
        const parentClassName = this.getElementClassName(parent);

        for (const pattern of carouselPatterns) {
          if (pattern.test(parentClassName)) {
            matchedPattern = true;

            // Adjust confidence based on depth (closer = higher confidence)
            if (depth === 0)
              confidence = 90; // Direct parent
            else if (depth === 1)
              confidence = 85; // Grandparent
            else confidence = 75; // Great-grandparent

            break;
          }
        }

        if (matchedPattern) break;
        parent = parent.parentElement;
        depth++;
      }
    }

    // Check ARIA labels for carousel indicators
    if (!matchedPattern && /next|prev|previous|slide|image|carousel|swipe/i.test(ariaLabel)) {
      matchedPattern = true;
      confidence = 80; // ARIA labels are reliable
    }

    // Check for SVG icons (common in custom implementations)
    if (matchedPattern) {
      const hasSvgIcon =
        element.querySelector('svg, use') !== null || element.tagName.toLowerCase() === 'svg';
      if (hasSvgIcon) {
        confidence += 5; // SVG icons increase confidence
      }
    }

    return { detected: matchedPattern, confidence };
  }

  /**
   * Tier 3: Heuristic structural analysis (fallback)
   */
  private detectCarouselByStructure(element: Element): {
    detected: boolean;
    confidence: number;
  } {
    const className = element.className || '';

    // Check for directional indicators
    const hasDirectionClass = /next|prev|previous|forward|backward|left|right/i.test(className);

    if (!hasDirectionClass) {
      return { detected: false, confidence: 0 };
    }

    let confidence = 50; // Base confidence for heuristic detection

    // Look for carousel/slider/gallery container in parents
    let parent = element.parentElement;
    let depth = 0;
    let foundCarouselContainer = false;

    while (parent && depth < 8) {
      const parentClasses = parent.className || '';

      // Check for carousel-related container classes
      if (/carousel|slider|gallery|swiper|slideshow|img|image|photo/i.test(parentClasses)) {
        foundCarouselContainer = true;
        confidence += 15;
        break;
      }

      parent = parent.parentElement;
      depth++;
    }

    if (!foundCarouselContainer) {
      return { detected: false, confidence: 0 };
    }

    // Check for multiple images or items (strong indicator of carousel)
    const nearestContainer = element.closest(
      '[class*="carousel"], [class*="slider"], [class*="gallery"], [class*="swiper"], [class*="img"], [class*="image"], [class*="photo"]'
    );

    if (nearestContainer) {
      const images = nearestContainer.querySelectorAll('img, [class*="slide"], [class*="item"]');
      if (images.length > 1) {
        confidence += 15; // Multiple items = definitely a carousel
      }

      // Check for navigation siblings (next/prev pair)
      const siblings = Array.from(element.parentElement?.children || []);
      const hasNavSiblings = siblings.some((sibling) => {
        if (sibling === element) return false;
        const siblingClass = sibling.className || '';
        return (
          /next|prev|previous|arrow/i.test(siblingClass) &&
          /next|prev|previous|arrow/i.test(className) &&
          siblingClass !== className
        );
      });

      if (hasNavSiblings) {
        confidence += 10; // Navigation pair increases confidence
      }
    }

    // Minimum confidence threshold for heuristic detection
    const detected = confidence >= 60;

    return { detected, confidence: detected ? confidence : 0 };
  }

  /**
   * Find unique parent container for carousel elements
   * Enhanced to handle both listing grids and detail pages
   */
  public findUniqueParentContainer(element: Element): {
    type: 'id' | 'data-attribute' | 'nth-child' | 'detail-page' | null;
    selector: string | null;
    element: Element | null;
    index?: number;
    pageType?: 'listing-grid' | 'detail-page' | 'hero-banner' | 'unknown';
  } {
    // 🆕 Detect page type first
    const pageType = this.detectPageType(element);

    let parent = element.parentElement;
    let depth = 0;

    // 🆕 PRIORITY: Look for <LI> element FIRST (for listing grids)
    while (parent && depth < 10) {
      if (parent.tagName === 'LI' && parent.parentElement) {
        const listParent = parent.parentElement;
        const siblings = Array.from(listParent.children);
        const index = siblings.indexOf(parent);

        // Build full selector including list parent (ul/ol)
        const listSelector = this.getElementSelectorPart(listParent); // "ul#listings_cn" or "ul.list-class"

        return {
          type: 'nth-child',
          selector: `${listSelector} > li:nth-child(${index + 1})`,
          element: parent,
          index: index,
          pageType,
        };
      }
      parent = parent.parentElement;
      depth++;
    }

    // Reset and continue with other container patterns
    parent = element.parentElement;
    depth = 0;

    while (parent && depth < 10) {
      // Check for ID
      if (parent.id && !this.isDynamicId(parent.id)) {
        return {
          type: 'id',
          selector: `#${cssEscape(parent.id)}`,
          element: parent,
          pageType,
        };
      }

      // Check for data attributes
      const dataId =
        parent.getAttribute('data-id') ||
        parent.getAttribute('data-item-id') ||
        parent.getAttribute('data-listing-id') ||
        parent.getAttribute('data-product-id');
      if (dataId) {
        const attrName = parent.hasAttribute('data-id')
          ? 'data-id'
          : parent.hasAttribute('data-item-id')
            ? 'data-item-id'
            : parent.hasAttribute('data-listing-id')
              ? 'data-listing-id'
              : 'data-product-id';
        return {
          type: 'data-attribute',
          selector: `[${attrName}="${dataId}"]`,
          element: parent,
          pageType,
        };
      }

      // 🆕 DETAIL PAGE HANDLING: If on detail page, stop at main content container
      if (pageType === 'detail-page') {
        // Look for main/article/section containers
        if (
          parent.tagName === 'MAIN' ||
          parent.tagName === 'ARTICLE' ||
          (parent.tagName === 'SECTION' && parent.classList.length > 0)
        ) {
          return {
            type: 'detail-page',
            selector: this.getElementSelectorPart(parent),
            element: parent,
            pageType,
          };
        }

        // Look for common detail page container classes
        if (
          parent.classList.length > 0 &&
          Array.from(parent.classList).some((cls) =>
            /detail|product[-_]?page|item[-_]?page|content[-_]?body|main[-_]?content/i.test(cls)
          )
        ) {
          return {
            type: 'detail-page',
            selector: this.getElementSelectorPart(parent),
            element: parent,
            pageType,
          };
        }
      }

      // Check for common container patterns (div.item, div.card, article, etc.)
      if (
        parent.classList.length > 0 &&
        Array.from(parent.classList).some((cls) => /item|card|listing|product|slide/i.test(cls))
      ) {
        const siblings = Array.from(parent.parentElement?.children || []).filter(
          (el) => el.className === parent?.className
        );
        const index = siblings.indexOf(parent);
        if (index !== -1 && parent.parentElement) {
          const parentSelector = this.getElementSelectorPart(parent.parentElement);
          const itemClass = Array.from(parent.classList).filter(
            (cls) => !this.isDynamicClass(cls)
          )[0];
          if (itemClass) {
            return {
              type: 'nth-child',
              selector: `${parentSelector} > .${cssEscape(itemClass)}:nth-child(${index + 1})`,
              element: parent,
              index: index,
              pageType,
            };
          }
        }
      }

      parent = parent.parentElement;
      depth++;
    }

    // 🆕 Fallback for detail pages - use body as container
    if (pageType === 'detail-page') {
      return {
        type: 'detail-page',
        selector: 'body',
        element: document.body,
        pageType,
      };
    }

    return { type: null, selector: null, element: null, pageType };
  }

  /**
   * 🆕 Detect page type (listing grid vs detail page)
   */
  private detectPageType(
    element: Element
  ): 'listing-grid' | 'detail-page' | 'hero-banner' | 'unknown' {
    // Check URL patterns first (most reliable)
    const url = window.location.pathname.toLowerCase();

    // Detail page patterns
    if (
      /\/(product|item|listing|detail|view)\/[^/]+/i.test(url) ||
      /\/p\/[^/]+/i.test(url) ||
      /\/id\/\d+/i.test(url)
    ) {
      return 'detail-page';
    }

    // Listing page patterns
    if (/\/(listings?|search|browse|gallery|catalog)/i.test(url)) {
      return 'listing-grid';
    }

    // Check DOM structure
    const carouselContainer = element.closest(
      '[class*="carousel"], [class*="slider"], [class*="gallery"], [class*="swiper"]'
    );

    if (!carouselContainer) {
      return 'unknown';
    }

    // Check if carousel is in hero banner (top of page)
    const rect = carouselContainer.getBoundingClientRect();
    const isAtTop = rect.top < window.innerHeight * 0.5; // Top half of viewport

    if (isAtTop) {
      // Count if there are multiple similar carousels on page (indicates listing grid)
      const allCarousels = document.querySelectorAll(
        '[class*="carousel"], [class*="slider"], [class*="gallery"], [class*="swiper"]'
      );

      if (allCarousels.length > 5) {
        return 'listing-grid'; // Multiple carousels = listing grid
      } else if (allCarousels.length === 1) {
        return 'hero-banner'; // Single carousel at top = hero banner
      }
    }

    // Check container structure
    const parentClasses = carouselContainer.className || '';

    // Listing grid indicators
    if (/item|card|listing|product/i.test(parentClasses)) {
      // Count similar siblings
      const siblings = Array.from(carouselContainer.parentElement?.children || []);
      const similarSiblings = siblings.filter(
        (el) => el !== carouselContainer && el.className === carouselContainer.className
      );

      if (similarSiblings.length > 2) {
        return 'listing-grid'; // Multiple similar items = grid
      }
    }

    // Detail page indicators
    if (/detail|product[-_]?page|main[-_]?content|content[-_]?body/i.test(parentClasses)) {
      return 'detail-page';
    }

    return 'unknown';
  }

  /**
   * Get relative selector from container to element
   */
  private getRelativeSelector(container: Element, element: Element): string {
    const parts: string[] = [];
    let current: Element | null = element;

    while (current && current !== container && current !== document.body) {
      const part = this.getElementSelectorPart(current);
      parts.unshift(part);
      current = current.parentElement;
    }

    return parts.join(' > ');
  }

  /**
   * Generate carousel-specific selectors with container scoping
   */
  public generateCarouselSelectors(element: Element): SelectorStrategy {
    const parentContainer = this.findUniqueParentContainer(element);

    if (!parentContainer.selector || !parentContainer.element) {
      // Fallback to regular selector
      return this.generateSelectors(element);
    }

    // Get relative selector from container to element
    const relativePath = this.getRelativeSelector(parentContainer.element, element);

    // Build container-scoped CSS selector with child combinator (>)
    const containerScopedCss = `${parentContainer.selector} > ${relativePath}`;

    // Generate other selectors normally
    const baseStrategy = this.generateAllSelectors(element);

    // 🆕 Build container-scoped XPath using direction-aware generation
    // This ensures next/prev buttons get unique XPath selectors
    let containerScopedXPath = baseStrategy.xpath;

    // Use the new contextual XPath generator for better direction specificity
    if (this.isCarouselControl(element)) {
      const contextualXPath = this.generateContextualXPath(element);

      // If we have a list item container, enhance XPath with container context
      if (parentContainer.type === 'nth-child' && parentContainer.index !== undefined) {
        const listMatch = parentContainer.selector.match(/(ul|ol)([#.][\w-]+)?/i);
        if (listMatch) {
          const listSelector = listMatch[0];
          const listIndex = parentContainer.index + 1; // XPath is 1-indexed

          // Extract direction and carousel classes from element AND parent (element may be child wrapper)
          // DOM structure: <span class="arrow next"><span (clicked)><svg/></span></span>
          //                      ↑ parent has classes    ↑ this element often has no classes
          const directionClasses = this.extractDirectionClasses(element);
          const carouselKeywords = ['arrow', 'control', 'button', 'slider', 'carousel', 'swiper'];

          // Check both element and parent for carousel classes
          const classList = Array.from(element.classList || []);
          const parentClassList = element.parentElement
            ? Array.from(element.parentElement.classList || [])
            : [];
          const combinedClassList = [...classList, ...parentClassList];

          const carouselClasses = combinedClassList.filter((cls) =>
            carouselKeywords.some((keyword) => cls.toLowerCase().includes(keyword))
          );

          // Build conditions array
          const conditions: string[] = [];
          directionClasses.forEach((cls) => conditions.push(`contains(@class, '${cls}')`));
          carouselClasses.forEach((cls) => {
            const condition = `contains(@class, '${cls}')`;
            if (!conditions.includes(condition)) {
              conditions.push(condition);
            }
          });

          if (conditions.length > 0) {
            // 🔧 FIX: Generate precise XPath that matches parent arrow span, then selects child
            // DOM structure: <span class="arrow next"><span (clicked)><svg/></span></span>
            // Old (BROKEN): //ul#listings_cn/li[4]/descendant::span[contains(@class, 'next')]
            //   → Matches ANY descendant span with 'next' (too broad, matches multiple carousels)
            // New (FIXED): //ul[@id='listings_cn']/li[4]//span[contains(@class, 'arrow') and contains(@class, 'next')]/span[1]
            //   → Matches parent span with BOTH arrow AND direction classes, then selects first child

            // Build @id attribute for stricter matching
            const listIdMatch = listSelector.match(/#([\w-]+)/);
            const listIdPart = listIdMatch ? `[@id='${listIdMatch[1]}']` : '';
            const listTag = listSelector.replace(/#[\w-]+/, '').replace(/^\./, '') || 'ul';

            // Build parent span conditions (must have BOTH arrow class AND direction class)
            const parentConditions = conditions.slice(); // Copy all conditions

            // Build XPath: match parent span with all conditions, then select child span[1]
            containerScopedXPath = `//${listTag}${listIdPart}/li[${listIndex}]//span[${parentConditions.join(' and ')}]/span[1]`;
          } else {
            // Fallback: Use contextual XPath with list container prefix
            containerScopedXPath = `//${listSelector}/li[${listIndex}]${contextualXPath.replace(/^\/\//, '//')}`;
          }
        } else {
          containerScopedXPath = contextualXPath;
        }
      } else {
        containerScopedXPath = contextualXPath;
      }

      // Validate the generated XPath
      if (!this.validateXPathUniqueness(containerScopedXPath, element)) {
        console.warn('[SelectorGenerator] ⚠️ Carousel XPath not unique:', {
          xpath: containerScopedXPath,
          element: element,
          classes: Array.from(element.classList),
        });
      } else {
        console.log('[SelectorGenerator] ✅ Carousel XPath validated as unique:', {
          xpath: containerScopedXPath,
          direction: this.extractDirectionClasses(element),
        });
      }
    }

    // Override CSS and XPath with container-scoped versions
    const carouselStrategy: SelectorStrategy = {
      ...baseStrategy,
      css: containerScopedCss,
      xpath: containerScopedXPath,
      // ✅ FIXED: Carousel-optimized priority - CSS first (includes .next/.prev), then precise XPath
      // This prevents cross-carousel interference by using most specific selectors first
      priority: [
        'css', // 1st - Best: includes direction classes (.next/.prev)
        'xpath', // 2nd - Precise: with direction + carousel index
        'xpathAbsolute', // 3rd - Fallback: structural
        'position', // 4th - Last resort: generic
        'id',
        'dataTestId',
        'ariaLabel',
        'name',
        'text',
        'textContains',
      ].filter(
        (type) => baseStrategy[type as keyof SelectorStrategy] !== undefined
      ) as SelectorType[],
    };

    console.log('[SelectorGenerator] Generated carousel selectors:', {
      containerType: parentContainer.type,
      containerSelector: parentContainer.selector,
      containerIndex: parentContainer.index,
      css: containerScopedCss,
      xpath: containerScopedXPath,
      priority: carouselStrategy.priority,
    });

    return carouselStrategy;
  }

  /**
   * 🆕 Safely get element className as string
   * Handles both HTMLElement.className (string) and SVGElement.className (SVGAnimatedString)
   */
  private getElementClassName(element: Element): string {
    if (!element.className) {
      return '';
    }

    // For SVG elements, className is an SVGAnimatedString object with baseVal property
    if (typeof element.className === 'object') {
      return String((element.className as any).baseVal || '');
    }

    // For HTML elements, className is a string
    return String(element.className || '');
  } /**
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

    // 🆕 CRITICAL FIX: Check if element is a carousel control
    // Use direction-aware XPath to ensure next/prev buttons have unique selectors
    if (this.isCarouselControl(element)) {
      const contextualXPath = this.generateContextualXPath(element);

      // Don't validate here - validation happens after container context is added
      // (multiple carousels may have same direction, but different list indices)
      console.log('[SelectorGenerator] ✅ Generated carousel XPath with direction:', {
        element: tagName,
        classes: Array.from(element.classList),
        xpath: contextualXPath,
      });
      return contextualXPath;
    }

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
    // BUT: Skip for carousel controls - we want class-based XPath for them
    if (text && text.length > 0 && text.length < 100 && !this.isCarouselControl(element)) {
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
   * Get a simple selector part for an element (public for carousel detection)
   */
  public getElementSelectorPart(element: Element): string {
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
   * Extract direction classes from element (next, prev, forward, back, etc.)
   * Critical for generating unique carousel selectors
   */
  private extractDirectionClasses(element: Element): string[] {
    const directionKeywords = ['next', 'prev', 'previous', 'forward', 'back', 'left', 'right'];

    // Check element's classes
    const classList = Array.from(element.classList || []);
    const directionClasses = classList.filter((cls) =>
      directionKeywords.some((dir) => cls.toLowerCase().includes(dir))
    );

    // If element has no direction classes, check parent (common for icon wrappers)
    if (directionClasses.length === 0 && element.parentElement) {
      const parentClassList = Array.from(element.parentElement.classList || []);
      return parentClassList.filter((cls) =>
        directionKeywords.some((dir) => cls.toLowerCase().includes(dir))
      );
    }

    return directionClasses;
  }

  /**
   * Generate contextual XPath with direction for carousel controls
   * This ensures next/prev buttons have unique XPath selectors
   */
  private generateContextualXPath(element: Element): string {
    const tagName = element.tagName.toLowerCase();
    const conditions: string[] = [];

    // Extract direction classes (critical for carousel uniqueness)
    const directionClasses = this.extractDirectionClasses(element);

    if (directionClasses.length > 0) {
      // Add each direction class as a condition
      directionClasses.forEach((dir) => {
        conditions.push(`contains(@class, '${dir}')`);
      });
    }

    // Add carousel-specific classes (arrow, control, button)
    const carouselKeywords = ['arrow', 'control', 'button', 'slider', 'carousel', 'swiper'];
    const classList = Array.from(element.classList || []);
    const carouselClasses = classList.filter((cls) =>
      carouselKeywords.some((keyword) => cls.toLowerCase().includes(keyword))
    );

    carouselClasses.forEach((cls) => {
      // Avoid duplicate conditions
      const condition = `contains(@class, '${cls}')`;
      if (!conditions.includes(condition)) {
        conditions.push(condition);
      }
    });

    // Build the XPath with parent context for better specificity
    let xpath = '';

    // Try to include parent container context
    let parent = element.parentElement;
    let maxDepth = 3;
    const parentParts: string[] = [];

    while (parent && maxDepth > 0) {
      const parentTag = parent.tagName.toLowerCase();

      // Stop at meaningful containers
      if (parent.id) {
        parentParts.unshift(`${parentTag}[@id='${parent.id}']`);
        break;
      }

      // Look for list items or carousel containers
      if (parentTag === 'ul' || parentTag === 'ol' || parentTag === 'li') {
        const parentClasses = Array.from(parent.classList || []).filter(
          (cls) => !this.isDynamicClass(cls)
        );
        if (parentClasses.length > 0) {
          parentParts.unshift(`${parentTag}[contains(@class, '${parentClasses[0]}')]`);
          break;
        }
        parentParts.unshift(parentTag);
      }

      parent = parent.parentElement;
      maxDepth--;
    }

    // Build final XPath
    if (conditions.length > 0) {
      xpath = `//${tagName}[${conditions.join(' and ')}]`;

      // If we have parent context, prepend it (fix triple slash bug)
      if (parentParts.length > 0) {
        xpath = `//${parentParts.join('//')}//${tagName}[${conditions.join(' and ')}]`;
      }
    } else {
      // Fallback to basic tag
      xpath = `//${tagName}`;
    }

    return xpath;
  }

  /**
   * Validate that an XPath selector is unique
   * Enhanced with detailed logging for debugging carousel cross-interference
   */
  private validateXPathUniqueness(xpath: string, element: Element): boolean {
    try {
      const result = document.evaluate(
        xpath,
        document,
        null,
        XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
        null
      );

      const matchCount = result.snapshotLength;

      if (matchCount === 0) {
        console.error('[SelectorGenerator] ❌ XPath matches 0 elements:', xpath);
        return false;
      }

      if (matchCount > 1) {
        console.error(
          `[SelectorGenerator] ❌ XPath matches ${matchCount} elements (expected 1):`,
          xpath
        );

        // Log all matched elements for debugging cross-carousel issues
        for (let i = 0; i < Math.min(matchCount, 5); i++) {
          const matchedEl = result.snapshotItem(i);
          const el = matchedEl as Element;
          console.warn(`  [${i}] Element:`, matchedEl, {
            tagName: el?.tagName,
            className: el?.className || '',
            parentCarousel: el?.closest('li') || null,
            isTarget: matchedEl === element,
          });
        }

        return false;
      }

      // Verify the matched element is the exact target element
      const matched = result.snapshotItem(0) === element;

      if (!matched) {
        console.error('[SelectorGenerator] ❌ XPath matched wrong element:', {
          xpath,
          expected: element,
          actual: result.snapshotItem(0),
        });
      }

      return matched;
    } catch (error) {
      console.warn('[SelectorGenerator] XPath validation error:', error);
      return false;
    }
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

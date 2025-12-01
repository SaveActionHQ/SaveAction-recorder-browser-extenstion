import type {
  ElementState,
  WaitConditions,
  ActionContext,
  AlternativeSelector,
  NavigationIntent,
  UrlChangeExpectation,
} from '../types/actions';

/**
 * Capture complete element state for smart waits
 */
export function captureElementState(element: Element): {
  elementState: ElementState;
  waitConditions: WaitConditions;
  context: ActionContext;
  alternativeSelectors: AlternativeSelector[];
} {
  const elementState = captureVisibilityState(element);
  const waitConditions: WaitConditions = {};
  const context: ActionContext = {};
  const alternativeSelectors: AlternativeSelector[] = [];

  // Image-specific state
  if (element instanceof HTMLImageElement) {
    const imageState = captureImageState(element);
    Object.assign(elementState, imageState);
    waitConditions.imageLoaded =
      imageState.imageComplete && (imageState.imageNaturalWidth ?? 0) > 0;
  }

  // Visibility conditions
  waitConditions.elementVisible = elementState.visible ?? false;
  waitConditions.parentVisible = isParentVisible(element);

  // Network state
  waitConditions.networkIdle = isNetworkIdle();

  // Element stability
  waitConditions.elementStable = true; // Will be checked asynchronously if needed

  // Modal context
  const modalContext = detectModalContext(element);
  Object.assign(context, modalContext);

  // Alternative selectors for listing items
  const alternatives = generateAlternativeSelectors(element);
  alternativeSelectors.push(...alternatives);

  // Lazy loading detection
  context.isLazyLoaded = isLazyLoadedElement(element);

  return {
    elementState,
    waitConditions,
    context,
    alternativeSelectors,
  };
}

/**
 * Capture image-specific state
 */
export function captureImageState(img: HTMLImageElement): Partial<ElementState> {
  return {
    imageComplete: img.complete,
    imageNaturalWidth: img.naturalWidth,
    imageNaturalHeight: img.naturalHeight,
  };
}

/**
 * Capture visibility state
 */
export function captureVisibilityState(element: Element): ElementState {
  const rect = element.getBoundingClientRect();
  const style = window.getComputedStyle(element);

  const isVisible =
    rect.width > 0 &&
    rect.height > 0 &&
    style.display !== 'none' &&
    style.visibility !== 'hidden' &&
    parseFloat(style.opacity) > 0;

  const inViewport =
    rect.top >= 0 &&
    rect.left >= 0 &&
    rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
    rect.right <= (window.innerWidth || document.documentElement.clientWidth);

  return {
    visible: isVisible,
    inViewport,
    opacity: style.opacity,
    display: style.display,
    zIndex: style.zIndex,
    enabled: !(element as HTMLInputElement | HTMLButtonElement).disabled,
  };
}

/**
 * Check if network is idle (no pending requests)
 */
export function isNetworkIdle(): boolean {
  try {
    const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
    const pendingRequests = resources.filter((r) => r.responseEnd === 0);
    return pendingRequests.length === 0;
  } catch (error) {
    // Performance API not available
    return true;
  }
}

/**
 * Check if parent containers are visible
 */
export function isParentVisible(element: Element): boolean {
  let parent = element.parentElement;
  let depth = 0;
  const maxDepth = 10;

  while (parent && depth < maxDepth) {
    const style = window.getComputedStyle(parent);

    if (
      style.display === 'none' ||
      style.visibility === 'hidden' ||
      parseFloat(style.opacity) === 0
    ) {
      return false;
    }

    parent = parent.parentElement;
    depth++;
  }

  return true;
}

/**
 * Check if element position is stable (not animating/moving)
 */
export async function isElementStable(element: Element, duration: number = 300): Promise<boolean> {
  const rect1 = element.getBoundingClientRect();

  await new Promise((resolve) => setTimeout(resolve, duration));

  const rect2 = element.getBoundingClientRect();

  return (
    rect1.top === rect2.top &&
    rect1.left === rect2.left &&
    rect1.width === rect2.width &&
    rect1.height === rect2.height
  );
}

/**
 * Calculate confidence score for modal detection
 */
function calculateModalScore(element: Element): number {
  let score = 0;
  const id = element.id || '';
  const idLower = id.toLowerCase();
  const classes = Array.from(element.classList).map((c) => c.toLowerCase());
  const role = element.getAttribute('role') || '';

  // Highest priority: Semantic HTML and ARIA
  if (role === 'dialog' || role === 'alertdialog') {
    score += 10;
  }

  // ID patterns (high confidence)
  if (/modal$/i.test(id)) {
    score += 10; // Ends with "Modal" (e.g., paymentModal, checkoutModal)
  } else if (/^modal-/.test(idLower)) {
    score += 9; // Starts with "modal-" (e.g., modal-container)
  } else if (idLower === 'modal') {
    score += 9; // Exact match "modal"
  } else if (idLower.includes('modal')) {
    score += 6; // Contains "modal" somewhere
  }

  if (idLower.includes('dialog')) {
    score += 7;
  } else if (idLower.includes('popup')) {
    score += 6;
  }

  // Class patterns (medium confidence)
  if (classes.includes('modal')) {
    score += 8; // Exact class "modal"
  } else if (classes.some((cls) => cls.includes('modal'))) {
    score += 5; // Contains "modal" in class
  }

  if (classes.some((cls) => cls.includes('dialog'))) {
    score += 6;
  } else if (classes.some((cls) => cls.includes('popup'))) {
    score += 5;
  }

  if (classes.some((cls) => cls.includes('overlay') || cls.includes('backdrop'))) {
    score += 4; // Modal overlays
  }

  if (classes.some((cls) => cls.includes('lightbox') || cls.includes('drawer'))) {
    score += 5;
  }

  // Lower priority: Generic e-commerce patterns
  if (idLower.includes('checkout') || idLower.includes('payment')) {
    score += 3; // Too generic, could be inner containers
  }
  if (classes.some((cls) => cls.includes('checkout') || cls.includes('payment'))) {
    score += 2;
  }

  // Position and z-index hints (weak signals)
  const style = window.getComputedStyle(element);
  if (style.position === 'fixed' || style.position === 'absolute') {
    const zIndex = parseInt(style.zIndex, 10);
    if (!isNaN(zIndex) && zIndex >= 100) {
      score += 2; // High z-index suggests modal
    }
  }

  return score;
}

/**
 * Detect modal/dialog context using confidence-based scoring
 */
export function detectModalContext(element: Element): Partial<ActionContext> {
  const context: Partial<ActionContext> = {};

  // Scan ALL parents and score each one
  let parent: Element | null = element.parentElement;
  let depth = 0;
  const maxDepth = 25; // Scan deeper to ensure we don't miss anything

  let bestModalCandidate: Element | null = null;
  let highestScore = 0;

  while (parent && depth < maxDepth) {
    const score = calculateModalScore(parent);

    if (score > 0) {
      // Found a modal candidate
      if (score > highestScore) {
        highestScore = score;
        bestModalCandidate = parent;
      }
    }

    parent = parent.parentElement;
    depth++;
  }

  // Use the highest-scoring modal candidate
  if (bestModalCandidate && highestScore >= 3) {
    // Minimum threshold to avoid false positives
    context.isInsideModal = true;
    context.modalId = bestModalCandidate.id || undefined;

    // Detect modal state by searching within the modal for state indicators
    const stateElements = bestModalCandidate.querySelectorAll(
      '[id*="status"], [id*="success"], [id*="error"], [id*="details"], [id*="state"], ' +
        '[class*="status"], [class*="success"], [class*="error"], [class*="details"], [class*="state"]'
    );

    if (stateElements.length > 0) {
      // Prioritize elements closer to the target element (more specific)
      let closestStateElement: Element | null = null;
      let closestDistance = Infinity;

      for (const stateEl of Array.from(stateElements)) {
        // Calculate "distance" (depth) from target element to state element
        let current: Element | null = element;
        let distance = 0;
        while (current && current !== stateEl && distance < 50) {
          current = current.parentElement;
          distance++;
        }
        if (current === stateEl && distance < closestDistance) {
          closestDistance = distance;
          closestStateElement = stateEl;
        }
      }

      // Extract state from closest state element
      if (closestStateElement) {
        if (closestStateElement.id) {
          context.modalState = closestStateElement.id;
        } else {
          const stateClasses = Array.from(closestStateElement.classList).filter(
            (cls) =>
              cls.toLowerCase().includes('status') ||
              cls.toLowerCase().includes('state') ||
              cls.toLowerCase().includes('success') ||
              cls.toLowerCase().includes('error') ||
              cls.toLowerCase().includes('details')
          );
          if (stateClasses.length > 0) {
            context.modalState = stateClasses[0];
          }
        }
      }
    }
  }

  // Fallback: If we detected a modal but no ID, use closest parent with ANY ID
  if (context.isInsideModal && !context.modalId && bestModalCandidate) {
    let current: Element | null = bestModalCandidate;
    let fallbackDepth = 0;

    while (current && fallbackDepth < 10) {
      if (current.id) {
        context.modalId = current.id;
        console.log('[Modal Detection] Using nearest ID as fallback:', current.id);
        break;
      }
      current = current.parentElement;
      fallbackDepth++;
    }
  }

  return context;
}

/**
 * Check if element uses lazy loading
 */
export function isLazyLoadedElement(element: Element): boolean {
  if (element instanceof HTMLImageElement) {
    return (
      element.loading === 'lazy' ||
      element.dataset.src !== undefined ||
      element.classList.contains('lazyload') ||
      element.classList.contains('lazy')
    );
  }

  return false;
}

/**
 * Generate alternative selectors for better targeting
 */
export function generateAlternativeSelectors(element: Element): AlternativeSelector[] {
  const alternatives: AlternativeSelector[] = [];
  let priority = 1;

  // For images in listing/product cards
  if (element instanceof HTMLImageElement) {
    // Try to get parent link
    const parentLink = element.closest('a');
    if (parentLink && parentLink.href) {
      const urlPart = parentLink.href.split('/').pop();
      if (urlPart) {
        alternatives.push({
          css: `a[href*="${urlPart}"] img`,
          priority: priority++,
        });
      }
    }

    // Alt text selector
    if (element.alt) {
      alternatives.push({
        xpath: `//img[@alt="${element.alt}"]`,
        priority: priority++,
      });
    }

    // Data attributes
    const dataAttrs = Array.from(element.attributes).filter((attr) =>
      attr.name.startsWith('data-')
    );
    if (dataAttrs.length > 0 && dataAttrs[0]) {
      const dataAttr = dataAttrs[0];
      alternatives.push({
        dataAttribute: `img[${dataAttr.name}="${dataAttr.value}"]`,
        priority: priority++,
      });
    }
  }

  // For links and buttons
  if (element instanceof HTMLAnchorElement || element instanceof HTMLButtonElement) {
    const textContent = element.textContent?.trim();
    if (textContent) {
      alternatives.push({
        text: textContent,
        xpath: `//${element.tagName.toLowerCase()}[text()="${textContent}"]`,
        priority: priority++,
      });
    }

    // Aria label
    const ariaLabel = element.getAttribute('aria-label');
    if (ariaLabel) {
      alternatives.push({
        ariaLabel,
        css: `${element.tagName.toLowerCase()}[aria-label="${ariaLabel}"]`,
        priority: priority++,
      });
    }
  }

  // For dropdown items (LI, OPTION)
  if (element.tagName === 'LI' || element.tagName === 'OPTION') {
    const textContent = element.textContent?.trim();
    if (textContent) {
      alternatives.push({
        text: textContent,
        xpath: `//${element.tagName.toLowerCase()}[text()="${textContent}"]`,
        priority: 1, // High priority for dropdown items
      });
    }
  }

  return alternatives;
}

/**
 * Detect navigation intent from button/link element
 */
export function detectNavigationIntent(element: Element): NavigationIntent {
  const text = element.textContent?.trim().toLowerCase() || '';
  const id = element.id?.toLowerCase() || '';
  const classes = Array.from(element.classList)
    .map((c) => c.toLowerCase())
    .join(' ');
  const type = (element as HTMLButtonElement).type?.toLowerCase() || '';
  const role = element.getAttribute('role')?.toLowerCase() || '';

  // Check for form submission
  if (type === 'submit' || (role === 'button' && element.closest('form'))) {
    // Detect checkout/payment completion
    if (
      text.includes('complete') ||
      text.includes('place order') ||
      text.includes('confirm') ||
      text.includes('pay now') ||
      text.includes('submit order') ||
      id.includes('complete') ||
      id.includes('submit') ||
      classes.includes('complete') ||
      classes.includes('submit')
    ) {
      return 'checkout-complete';
    }
    return 'submit-form';
  }

  // Check for checkout/payment completion (non-form buttons)
  if (
    text.includes('complete order') ||
    text.includes('place order') ||
    text.includes('confirm payment') ||
    text.includes('pay now') ||
    text.includes('checkout') ||
    text.includes('complete purchase') ||
    id.includes('checkout') ||
    id.includes('complete-order') ||
    id.includes('place-order')
  ) {
    return 'checkout-complete';
  }

  // Check for modal close with redirect
  const isInsideModal = !!element.closest('[role="dialog"], [id*="modal"], [class*="modal"]');
  if (isInsideModal) {
    if (
      text.includes('close') ||
      text.includes('ok') ||
      text.includes('done') ||
      text.includes('×') ||
      id.includes('close') ||
      classes.includes('close')
    ) {
      // Check if this is after a successful action (look for success indicators nearby)
      const modalRoot = element.closest('[role="dialog"], [id*="modal"], [class*="modal"]');
      if (modalRoot) {
        const successIndicators = modalRoot.querySelectorAll(
          '[class*="success"], [id*="success"], [class*="complete"], [id*="complete"]'
        );
        if (successIndicators.length > 0) {
          return 'close-modal-and-redirect';
        }
      }
    }
  }

  // Check for logout
  if (
    text.includes('log out') ||
    text.includes('logout') ||
    text.includes('sign out') ||
    id.includes('logout') ||
    classes.includes('logout')
  ) {
    return 'logout';
  }

  // Check for regular navigation (links, buttons with hrefs)
  if (element instanceof HTMLAnchorElement || element.hasAttribute('href')) {
    return 'navigate-to-page';
  }

  return 'none';
}

/**
 * Extract URL pattern from URL (for success flow detection)
 */
export function extractUrlPattern(url: string): string[] {
  const patterns: string[] = [];

  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;

    // Add full pathname
    patterns.push(pathname);

    // Extract path segments
    const segments = pathname.split('/').filter(Boolean);

    // Add key segments that indicate success pages
    if (segments.length > 0) {
      segments.forEach((_segment, index) => {
        // Add progressive patterns: /account/, /account/orders/, etc.
        const progressivePattern = '/' + segments.slice(0, index + 1).join('/') + '/';
        patterns.push(progressivePattern);
      });
    }

    // Add query parameters if any (for onboarded, success flags, etc.)
    if (urlObj.search) {
      patterns.push(pathname + urlObj.search);
    }
  } catch (error) {
    // Invalid URL, just use the string
    patterns.push(url);
  }

  return patterns;
}

/**
 * Check if URL indicates success flow
 */
export function isSuccessUrl(url: string): boolean {
  const lowerUrl = url.toLowerCase();

  // Common success page patterns
  const successPatterns = [
    '/account/',
    '/orders/',
    '/order/',
    '/thank-you',
    '/thankyou',
    '/success',
    '/confirmation',
    '/complete',
    '/receipt',
    '/dashboard',
    'success=true',
    'completed=true',
    'order_id=',
    'order-id=',
  ];

  return successPatterns.some((pattern) => lowerUrl.includes(pattern.toLowerCase()));
}

/**
 * Create expected URL change expectation
 */
export function createUrlChangeExpectation(
  beforeUrl: string,
  navigationIntent: NavigationIntent,
  afterUrl?: string
): UrlChangeExpectation | undefined {
  // Only create expectations for actions that typically cause navigation
  if (navigationIntent === 'none') {
    return undefined;
  }

  const expectation: UrlChangeExpectation = {
    type: 'same-page',
    patterns: [],
    isSuccessFlow: false,
    beforeUrl,
  };

  // If we have afterUrl (captured post-navigation), use it
  if (afterUrl) {
    expectation.afterUrl = afterUrl;
    expectation.patterns = extractUrlPattern(afterUrl);

    // Detect if this is a success flow
    if (
      navigationIntent === 'checkout-complete' ||
      navigationIntent === 'close-modal-and-redirect'
    ) {
      expectation.isSuccessFlow = isSuccessUrl(afterUrl);
      expectation.type = expectation.isSuccessFlow ? 'success' : 'redirect';
    } else {
      expectation.type = beforeUrl !== afterUrl ? 'redirect' : 'same-page';
    }
  } else {
    // Pre-predict based on intent
    if (navigationIntent === 'checkout-complete') {
      expectation.type = 'success';
      expectation.isSuccessFlow = true;
      // Add common success patterns
      expectation.patterns = [
        '/account/',
        '/orders/',
        '/order/',
        '/thank-you',
        '/confirmation',
        '/success',
      ];
    } else if (navigationIntent === 'logout') {
      expectation.type = 'redirect';
      expectation.patterns = ['/', '/login', '/signin'];
    } else if (navigationIntent === 'navigate-to-page') {
      expectation.type = 'redirect';
    }
  }

  return expectation;
}

/**
 * Log element state for debugging
 */
export function logElementState(
  element: Element,
  state: ElementState,
  conditions: WaitConditions
): void {
  const tagName = element.tagName.toLowerCase();
  const id = element.id ? `#${element.id}` : '';
  const classes = element.className ? `.${element.className.split(' ').join('.')}` : '';

  console.log(`[ElementState] ${tagName}${id}${classes}:`, {
    visible: state.visible,
    imageLoaded: element instanceof HTMLImageElement ? state.imageComplete : 'N/A',
    networkIdle: conditions.networkIdle,
    parentVisible: conditions.parentVisible,
  });

  if (!state.visible) {
    console.warn(`⚠️ Element not visible - display: ${state.display}, opacity: ${state.opacity}`);
  }

  if (element instanceof HTMLImageElement && !state.imageComplete) {
    console.warn(`⚠️ Image not loaded - naturalWidth: ${state.imageNaturalWidth}`);
  }

  if (!conditions.networkIdle) {
    console.warn(`⚠️ Network busy - pending requests detected`);
  }
}

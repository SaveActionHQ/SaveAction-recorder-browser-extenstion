import type { ContentSignature } from '@/types';

/**
 * Content signature utilities for intelligent element matching in dynamic lists
 */

/**
 * Detect if element is within a list/grid context
 */
export function detectElementContext(
  element: Element
): Pick<ContentSignature, 'elementType' | 'listContainer'> | null {
  // Check if element is inside a list/grid
  const listContainer = element.closest(
    'ul, ol, [class*="list"], [class*="grid"], [role="list"], table, [class*="container"]'
  );

  if (!listContainer) {
    return null; // Not a list item
  }

  const listItem = element.closest(
    'li, [class*="card"], [class*="item"], [role="listitem"], tr, [class*="row"]'
  );

  if (!listItem) {
    return null;
  }

  // Determine element type
  let elementType: ContentSignature['elementType'] = 'list-item';

  if (listItem.tagName === 'TR' || listContainer.tagName === 'TABLE') {
    elementType = 'table-row';
  } else if (listItem.className && /card/i.test(listItem.className)) {
    elementType = 'card';
  } else if (listContainer.className && /grid/i.test(listContainer.className)) {
    elementType = 'grid-item';
  }

  return {
    elementType,
    listContainer: {
      selector: generateSimpleSelector(listContainer),
      itemSelector: generateSimpleSelector(listItem).split(' ').slice(-1)[0] || 'li',
    },
  };
}

/**
 * Extract content fingerprint from a list item/card element
 */
export function extractContentFingerprint(
  element: Element
): ContentSignature['contentFingerprint'] | null {
  const listItem = element.closest(
    'li, [class*="card"], [class*="item"], [role="listitem"], tr, [class*="row"]'
  );

  if (!listItem) {
    return null;
  }

  const fingerprint: ContentSignature['contentFingerprint'] = {};

  // Extract heading (h1-h6, title, name classes)
  const heading = listItem.querySelector(
    'h1, h2, h3, h4, h5, h6, [class*="title"], [class*="name"], [class*="heading"]'
  );
  if (heading) {
    fingerprint.heading = heading.textContent?.trim();
  }

  // Extract subheading (subtitle, description, location)
  const subheading = listItem.querySelector(
    '[class*="subtitle"], [class*="description"], [class*="location"], [class*="address"], [class*="caption"]'
  );
  if (subheading) {
    fingerprint.subheading = subheading.textContent?.trim();
  }

  // Extract image info
  const image = listItem.querySelector('img');
  if (image) {
    fingerprint.imageAlt = image.alt || image.title || undefined;
    fingerprint.imageSrc = image.src || undefined;
  }

  // Extract link href
  const link = listItem.querySelector('a[href]');
  if (link) {
    const href = link.getAttribute('href');
    if (href && !href.startsWith('#')) {
      fingerprint.linkHref = href;
    }
  }

  // Extract price/cost
  const price = listItem.querySelector(
    '[class*="price"], [class*="cost"], [class*="amount"], [data-price]'
  );
  if (price) {
    fingerprint.price = price.textContent?.trim() || price.getAttribute('data-price') || undefined;
  }

  // Extract rating
  const rating = listItem.querySelector(
    '[class*="rating"], [class*="stars"], [class*="score"], [aria-label*="rating"]'
  );
  if (rating) {
    fingerprint.rating =
      rating.textContent?.trim() || rating.getAttribute('aria-label') || undefined;
  }

  // Extract button text
  const button = listItem.querySelector('button, [role="button"], a.button, a.btn');
  if (button) {
    fingerprint.buttonText = button.textContent?.trim();
  }

  // Extract data-id or similar unique identifiers
  const dataId =
    listItem.getAttribute('data-id') ||
    listItem.getAttribute('data-item-id') ||
    listItem.getAttribute('id');
  if (dataId) {
    fingerprint.dataId = dataId;
  }

  // Only return if we found meaningful content
  return Object.keys(fingerprint).length > 0 ? fingerprint : null;
}

/**
 * Extract visual hints from element
 */
export function extractVisualHints(element: Element): ContentSignature['visualHints'] {
  const listItem = element.closest(
    'li, [class*="card"], [class*="item"], [role="listitem"], tr, [class*="row"]'
  );

  if (!listItem) {
    return {};
  }

  return {
    hasImage: !!listItem.querySelector('img'),
    hasButton: !!listItem.querySelector('button, [role="button"]'),
    hasLink: !!listItem.querySelector('a[href]'),
    hasPrice: !!listItem.querySelector('[class*="price"], [class*="cost"]'),
    hasRating: !!listItem.querySelector('[class*="rating"], [class*="stars"]'),
  };
}

/**
 * Calculate fallback position of element in its list
 */
export function calculateFallbackPosition(element: Element): number {
  const listItem = element.closest(
    'li, [class*="card"], [class*="item"], [role="listitem"], tr, [class*="row"]'
  );

  const listContainer = listItem?.parentElement;

  if (!listContainer || !listItem) return 0;

  const items = Array.from(listContainer.children);
  return items.indexOf(listItem);
}

/**
 * Generate complete content signature for an element
 */
export function generateContentSignature(element: Element): ContentSignature | null {
  const context = detectElementContext(element);
  if (!context) {
    return null; // Not a list item
  }

  const fingerprint = extractContentFingerprint(element);
  if (!fingerprint) {
    return null; // No meaningful content found
  }

  return {
    ...context,
    contentFingerprint: fingerprint,
    visualHints: extractVisualHints(element),
    fallbackPosition: calculateFallbackPosition(element),
  };
}

/**
 * Generate a simple CSS selector for an element
 */
function generateSimpleSelector(element: Element): string {
  const tagName = element.tagName.toLowerCase();

  if (element.id && !/^\d|[^a-z0-9_-]/i.test(element.id)) {
    return `${tagName}#${element.id}`;
  }

  const classes = Array.from(element.classList)
    .filter((cls) => !/^(css-|jss-|_)/.test(cls)) // Filter out CSS-in-JS classes
    .slice(0, 2);

  if (classes.length > 0) {
    return `${tagName}.${classes.join('.')}`;
  }

  return tagName;
}

/**
 * Check if element is likely a carousel navigation element
 */
export function isCarouselElement(element: Element): boolean {
  const ariaLabel = element.getAttribute('aria-label')?.toLowerCase() || '';
  const className = element.className?.toString().toLowerCase() || '';
  const role = element.getAttribute('role')?.toLowerCase() || '';

  const carouselPatterns = [
    'swiper-button',
    'carousel-control',
    'slick-arrow',
    'slider-arrow',
    'next slide',
    'previous slide',
    'prev',
    'next',
    'arrow',
  ];

  return carouselPatterns.some(
    (pattern) =>
      ariaLabel.includes(pattern) || className.includes(pattern) || role.includes(pattern)
  );
}

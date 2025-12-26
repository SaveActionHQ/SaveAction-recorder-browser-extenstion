import type { ActionValidation, ClickIntent } from '@/types';

/**
 * Validation helpers for action confidence scoring and flagging
 * P1 Implementation - High Priority
 * 🆕 P0: Enhanced to detect SVG/decorative element redirection
 */

export interface ValidationContext {
  clickHistory: Array<{ element: Element; timestamp: number }>;
  recordingStartTime: number;
  clickedElement?: Element; // 🆕 Original clicked element (may be decorative)
  wasRedirected?: boolean; // 🆕 True if we redirected from child to parent
}

/**
 * Generate validation metadata (confidence scores, flags)
 * 🆕 P0: Enhanced to flag redirected clicks and warn about SVG recordings
 */
export function generateValidation(
  event: MouseEvent,
  element: Element,
  _clickIntent: ClickIntent,
  context: ValidationContext
): ActionValidation {
  const flags: string[] = [];
  let confidence = 100;

  // 🆕 P0: Flag if we redirected from decorative child to interactive parent
  if (context.wasRedirected && context.clickedElement) {
    flags.push('redirected-to-parent');
    const clickedTag = context.clickedElement.tagName.toLowerCase();

    // Log for debugging/validation
    console.log('[Validation] 🎯 Click redirected from decorative child:', {
      from: clickedTag,
      to: element.tagName.toLowerCase(),
      fromClasses: context.clickedElement.className,
      toClasses: element.className,
    });

    // SVG redirects are expected and good (don't reduce confidence)
    if (['svg', 'path', 'circle', 'rect', 'polygon', 'use', 'g'].includes(clickedTag)) {
      flags.push('svg-child-click');
      // Confidence stays at 100 - this is the correct behavior
    }
  }

  // 🆕 P0: CRITICAL WARNING - If element is still SVG/decorative, confidence = 0
  // This should NEVER happen with the new findInteractiveParent logic
  const decorativeTags = [
    'svg',
    'path',
    'circle',
    'rect',
    'polygon',
    'line',
    'polyline',
    'use',
    'g',
  ];
  if (decorativeTags.includes(element.tagName.toLowerCase())) {
    flags.push('ERROR-recorded-svg-element');
    confidence = 0;
    console.error('[Validation] 🚨 CRITICAL: Recorded click on SVG element!', {
      tag: element.tagName,
      classes: element.className,
    });
  }

  // Check for rapid-fire clicking pattern
  if (isRapidFirePattern(context.clickHistory)) {
    flags.push('rapid-fire');
    confidence -= 30;
  }

  // Check if element is moving (animation, scroll)
  if (isElementMoving(element)) {
    flags.push('moving-target');
    confidence -= 20;
  }

  // Check if too soon after page load
  if (isTooSoonAfterLoad(context.recordingStartTime)) {
    flags.push('too-soon-after-load');
    confidence -= 20;
  }

  // Check for OS event (double-click, triple-click)
  const isOsEvent = event.detail > 1;
  if (isOsEvent) {
    // OS events are reliable, don't reduce confidence
    flags.push(`os-event-detail-${event.detail}`);
  }

  return {
    isDuplicate: false,
    duplicateOf: null,
    isOsEvent,
    confidence: Math.max(0, Math.min(100, confidence)),
    flags,
  };
}

/**
 * Check if current click pattern indicates rapid-fire clicking
 */
function isRapidFirePattern(clickHistory: Array<{ element: Element; timestamp: number }>): boolean {
  if (clickHistory.length < 3) return false;

  const recentClicks = clickHistory.slice(-3);

  if (!recentClicks[0] || !recentClicks[2]) return false;

  const timeSpan = recentClicks[2].timestamp - recentClicks[0].timestamp;

  // 3 clicks within 500ms = rapid-fire
  return timeSpan < 500;
}

/**
 * Check if element is currently moving (has animation/transition)
 */
function isElementMoving(element: Element): boolean {
  try {
    const computed = window.getComputedStyle(element);
    return (
      computed.animation !== 'none' ||
      (computed.transition !== 'all 0s ease 0s' && computed.transition !== 'none')
    );
  } catch (error) {
    return false; // Default to not moving if error
  }
}

/**
 * Check if click happened too soon after recording started
 */
function isTooSoonAfterLoad(recordingStartTime: number): boolean {
  const timeSinceStart = Date.now() - recordingStartTime;
  return timeSinceStart < 500;
}

import type { ActionValidation, ClickIntent } from '@/types';

/**
 * Validation helpers for action confidence scoring and flagging
 * P1 Implementation - High Priority
 */

export interface ValidationContext {
  clickHistory: Array<{ element: Element; timestamp: number }>;
  recordingStartTime: number;
}

/**
 * Generate validation metadata (confidence scores, flags)
 */
export function generateValidation(
  event: MouseEvent,
  element: Element,
  _clickIntent: ClickIntent,
  context: ValidationContext
): ActionValidation {
  const flags: string[] = [];
  let confidence = 100;

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

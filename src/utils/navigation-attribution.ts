import type { Action } from '@/types';

export interface NavigationAttribution {
  navigationTrigger: 'back' | 'forward' | 'form-submit' | 'click' | 'redirect' | 'manual';
  relatedActionId?: string;
}

const FORM_SUBMIT_WINDOW_MS = 5000;
const CLICK_WINDOW_MS = 3000;

interface AttributionCandidate extends NavigationAttribution {
  timestamp: number;
  priority: number;
}

function isWithinWindow(
  currentRelativeTime: number,
  actionTimestamp: number,
  windowMs: number
): boolean {
  return currentRelativeTime - actionTimestamp < windowMs;
}

export function detectNavigationAttribution(
  recentActions: Action[],
  currentRelativeTime: number
): NavigationAttribution {
  const candidates: AttributionCandidate[] = [];

  for (const action of recentActions) {
    if (
      action.type === 'submit' &&
      isWithinWindow(currentRelativeTime, action.timestamp, FORM_SUBMIT_WINDOW_MS)
    ) {
      candidates.push({
        navigationTrigger: 'form-submit',
        relatedActionId: action.id,
        timestamp: action.timestamp,
        priority: 4,
      });
      continue;
    }

    if (action.type !== 'click') {
      continue;
    }

    if (
      action.context?.navigationIntent === 'submit-form' &&
      isWithinWindow(currentRelativeTime, action.timestamp, FORM_SUBMIT_WINDOW_MS)
    ) {
      candidates.push({
        navigationTrigger: 'form-submit',
        relatedActionId: action.id,
        timestamp: action.timestamp,
        priority: 3,
      });
      continue;
    }

    if (
      action.context?.navigationIntent !== undefined &&
      action.context.navigationIntent !== 'none' &&
      isWithinWindow(currentRelativeTime, action.timestamp, CLICK_WINDOW_MS)
    ) {
      const priority = action.context.isInsideModal ? 3 : 2;
      candidates.push({
        navigationTrigger: 'click',
        relatedActionId: action.id,
        timestamp: action.timestamp,
        priority,
      });
      continue;
    }

    if (
      (action.tagName === 'a' || action.tagName === 'img') &&
      isWithinWindow(currentRelativeTime, action.timestamp, CLICK_WINDOW_MS)
    ) {
      candidates.push({
        navigationTrigger: 'click',
        relatedActionId: action.id,
        timestamp: action.timestamp,
        priority: 1,
      });
    }
  }

  candidates.sort((left, right) => {
    if (right.timestamp !== left.timestamp) {
      return right.timestamp - left.timestamp;
    }

    return right.priority - left.priority;
  });

  const bestCandidate = candidates[0];
  if (bestCandidate) {
    return {
      navigationTrigger: bestCandidate.navigationTrigger,
      relatedActionId: bestCandidate.relatedActionId,
    };
  }

  return {
    navigationTrigger: 'redirect',
  };
}

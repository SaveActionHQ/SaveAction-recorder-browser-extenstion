import { describe, expect, it } from 'vitest';
import type { Action } from '@/types';
import { detectNavigationAttribution } from '@/utils/navigation-attribution';

function createClickAction(overrides: Partial<Action> = {}): Action {
  return {
    id: 'act_001',
    type: 'click',
    timestamp: 0,
    completedAt: 0,
    url: 'https://example.com',
    selector: { css: 'button', priority: ['css'] },
    tagName: 'button',
    coordinates: { x: 1, y: 1 },
    coordinatesRelativeTo: 'element',
    button: 'left',
    clickCount: 1,
    modifiers: [],
    ...overrides,
  } as Action;
}

function createSubmitAction(overrides: Partial<Action> = {}): Action {
  return {
    id: 'act_submit',
    type: 'submit',
    timestamp: 0,
    completedAt: 0,
    url: 'https://example.com',
    selector: { css: 'form', priority: ['css'] },
    tagName: 'form',
    ...overrides,
  } as Action;
}

describe('detectNavigationAttribution', () => {
  it('should prefer the most recent intent-bearing modal confirm click', () => {
    const attribution = detectNavigationAttribution(
      [
        createClickAction({
          id: 'act_020',
          timestamp: 26108,
          tagName: 'a',
          context: { navigationIntent: 'logout' },
        }),
        createClickAction({
          id: 'act_023',
          timestamp: 27607,
          context: {
            navigationIntent: 'logout',
            isInsideModal: true,
            modalId: 'modal-swal2-popup-swal2-modal',
          },
        }),
      ],
      28098
    );

    expect(attribution).toEqual({
      navigationTrigger: 'click',
      relatedActionId: 'act_023',
    });
  });

  it('should prefer submit clicks over generic navigation clicks', () => {
    const attribution = detectNavigationAttribution(
      [
        createClickAction({
          id: 'act_010',
          timestamp: 1200,
          tagName: 'a',
          context: { navigationIntent: 'navigate-to-page' },
        }),
        createClickAction({
          id: 'act_014',
          timestamp: 2200,
          context: { navigationIntent: 'submit-form' },
        }),
      ],
      2500
    );

    expect(attribution).toEqual({
      navigationTrigger: 'form-submit',
      relatedActionId: 'act_014',
    });
  });

  it('should not let an older submit steal navigation from a newer logout confirm click', () => {
    const attribution = detectNavigationAttribution(
      [
        createSubmitAction({
          id: 'act_011',
          timestamp: 15000,
        }),
        createClickAction({
          id: 'act_020',
          timestamp: 26000,
          tagName: 'a',
          context: { navigationIntent: 'logout' },
        }),
        createClickAction({
          id: 'act_023',
          timestamp: 27600,
          context: {
            navigationIntent: 'logout',
            isInsideModal: true,
            modalId: 'modal-session-6',
          },
        }),
      ],
      28100
    );

    expect(attribution).toEqual({
      navigationTrigger: 'click',
      relatedActionId: 'act_023',
    });
  });

  it('should fall back to redirect when no recent trigger exists', () => {
    expect(detectNavigationAttribution([], 5000)).toEqual({
      navigationTrigger: 'redirect',
    });
  });
});

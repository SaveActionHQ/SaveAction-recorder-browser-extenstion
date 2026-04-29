import { beforeEach, describe, expect, it } from 'vitest';
import {
  captureElementState,
  detectModalContext,
  detectNavigationIntent,
  generateAlternativeSelectors,
  isLikelyModalDismissControl,
} from '@/utils/element-state';

describe('element-state', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('should capture modal context when ids use baseVal-backed values', () => {
    const modal = document.createElement('div');
    modal.className = 'checkout modal';
    Object.defineProperty(modal, 'id', {
      configurable: true,
      value: { baseVal: 'checkoutModal' },
    });

    const button = document.createElement('button');
    button.textContent = 'Continue';
    modal.appendChild(button);
    document.body.appendChild(modal);

    expect(() => captureElementState(button)).not.toThrow();

    const context = detectModalContext(button);
    expect(context.isInsideModal).toBe(true);
    expect(context.modalId).toBe('checkoutModal');
  });

  it('should detect navigation intent when button metadata is object-like', () => {
    const button = document.createElement('button');
    button.textContent = 'Complete Order';
    Object.defineProperty(button, 'id', {
      configurable: true,
      value: { baseVal: 'complete-order' },
    });
    Object.defineProperty(button, 'type', {
      configurable: true,
      value: { baseVal: 'submit' },
    });

    expect(() => detectNavigationIntent(button)).not.toThrow();
    expect(detectNavigationIntent(button)).toBe('checkout-complete');
  });

  it('should not classify submit-looking buttons outside a form as submit-form', () => {
    const button = document.createElement('button');
    button.textContent = 'Accept';

    expect(detectNavigationIntent(button)).toBe('none');
  });

  it('should not classify modal trigger links as page navigation', () => {
    const modal = document.createElement('div');
    modal.id = 'contact-modal';
    modal.className = 'popup modal';
    document.body.appendChild(modal);

    const link = document.createElement('a');
    link.textContent = 'Contact';
    link.setAttribute('href', '#');
    link.setAttribute('data-bs-toggle', 'modal');
    link.setAttribute('data-bs-target', '#contact-modal');

    expect(detectNavigationIntent(link)).toBe('none');
  });

  it('should not classify modal dismiss links as page navigation', () => {
    const modal = document.createElement('div');
    modal.id = 'listing-alert-popup-body';
    modal.className = 'listing-alert-popup-body popup';
    document.body.appendChild(modal);

    const dismissLink = document.createElement('a');
    dismissLink.textContent = 'No thanks';
    dismissLink.className = 'btn-outline btn-inline';
    dismissLink.setAttribute('href', '/search/');
    modal.appendChild(dismissLink);

    expect(isLikelyModalDismissControl(dismissLink)).toBe(true);
    expect(detectNavigationIntent(dismissLink)).toBe('none');
  });

  it('should generate alternative selectors when tagName is object-like', () => {
    const button = document.createElement('button');
    button.textContent = 'Save';
    Object.defineProperty(button, 'tagName', {
      configurable: true,
      value: { baseVal: 'BUTTON' },
    });

    const alternatives = generateAlternativeSelectors(button);

    expect(alternatives).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          text: 'Save',
          xpath: '//button[text()="Save"]',
        }),
      ])
    );
  });
});

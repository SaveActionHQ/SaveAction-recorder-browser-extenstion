import { beforeEach, describe, expect, it } from 'vitest';
import { IntentClassifier } from '@/content/intent-classifier';

describe('IntentClassifier', () => {
  let classifier: IntentClassifier;

  beforeEach(() => {
    classifier = new IntentClassifier();
    document.body.innerHTML = '';
  });

  it('should classify modal trigger links as generic clicks', () => {
    const modal = document.createElement('div');
    modal.id = 'contact-modal';
    modal.className = 'popup__body';
    document.body.appendChild(modal);

    const link = document.createElement('a');
    link.textContent = 'Contact';
    link.setAttribute('href', '#');
    link.setAttribute('data-bs-toggle', 'modal');
    link.setAttribute('data-bs-target', '#contact-modal');

    const intent = classifier.classifyClick(link, {
      isCarousel: false,
      isFormSubmit: false,
      isPagination: false,
    });

    expect(intent.type).toBe('generic-click');
    expect(intent.requiresDelay).toBe(false);
  });

  it('should classify regular links as navigation', () => {
    const link = document.createElement('a');
    link.href = 'https://www.example.com/listings';
    link.textContent = 'View listing';

    const intent = classifier.classifyClick(link, {
      isCarousel: false,
      isFormSubmit: false,
      isPagination: false,
    });

    expect(intent.type).toBe('navigation');
    expect(intent.requiresDelay).toBe(true);
  });

  it('should classify modal dismiss links as generic clicks', () => {
    const modal = document.createElement('div');
    modal.id = 'listing-alert-popup-body';
    modal.className = 'listing-alert-popup-body popup';
    document.body.appendChild(modal);

    const link = document.createElement('a');
    link.textContent = 'No thanks';
    link.className = 'btn-outline btn-inline';
    link.href = 'https://www.example.com/search';
    modal.appendChild(link);

    const intent = classifier.classifyClick(link, {
      isCarousel: false,
      isFormSubmit: false,
      isPagination: false,
    });

    expect(intent.type).toBe('generic-click');
    expect(intent.requiresDelay).toBe(false);
  });

  it('should prioritize explicit form submit context over link heuristics', () => {
    const button = document.createElement('button');
    button.type = 'submit';
    button.textContent = 'Search';

    const intent = classifier.classifyClick(button, {
      isCarousel: false,
      isFormSubmit: true,
      isPagination: false,
    });

    expect(intent.type).toBe('form-submit');
    expect(intent.confidence).toBe(100);
  });
});

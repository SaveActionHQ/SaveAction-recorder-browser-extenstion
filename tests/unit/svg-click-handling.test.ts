/**
 * Tests for SVG click handling - P0 Critical Fix
 * Ensures SVG elements are never recorded as click targets
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EventListener } from '@/content/event-listener';
import type { Action } from '@/types';

describe('SVG Click Handling - P0 Fix', () => {
  let eventListener: EventListener;
  let capturedActions: Action[] = [];

  beforeEach(() => {
    capturedActions = [];
    eventListener = new EventListener((action) => {
      capturedActions.push(action);
    });
    document.body.innerHTML = '';
  });

  afterEach(() => {
    eventListener.destroy();
  });

  it('should record button click when clicking SVG child', () => {
    const button = document.createElement('button');
    button.id = 'svg-button';
    button.setAttribute('aria-label', 'Next');

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M10 5 L15 10 L10 15');

    svg.appendChild(path);
    button.appendChild(svg);
    document.body.appendChild(button);

    eventListener.start();
    eventListener.setRecordingStartTime(Date.now());

    // Click on the SVG path element
    const clickEvent = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
    });
    path.dispatchEvent(clickEvent);

    expect(capturedActions).toHaveLength(1);
    const action = capturedActions[0];

    // CRITICAL: Should record button, NOT svg or path
    expect(action?.type).toBe('click');
    if (action?.type === 'click') {
      expect(action.tagName).toBe('button');
      expect(action.tagName).not.toBe('svg');
      expect(action.tagName).not.toBe('path');

      // Should have redirected-to-parent flag
      expect(action.validation?.flags).toContain('redirected-to-parent');
      expect(action.validation?.flags).toContain('svg-child-click');

      // Confidence should be reasonable (may have penalties for test environment)
      expect(action.validation?.confidence).toBeGreaterThanOrEqual(50);
    }
  });

  it('should record span click when clicking SVG in carousel arrow', async () => {
    const span = document.createElement('span');
    span.className = 'carousel-arrow next';
    span.setAttribute('aria-label', 'Next image');

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'icon');

    span.appendChild(svg);
    document.body.appendChild(span);

    eventListener.start();
    eventListener.setRecordingStartTime(Date.now());

    svg.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    // Wait for async processing to complete (carousel clicks trigger async operations)
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(capturedActions).toHaveLength(1);
    const action = capturedActions[0];

    if (action?.type === 'click') {
      expect(action.tagName).toBe('span');
      expect(action.validation?.flags).toContain('redirected-to-parent');
    }
  });

  it('should NOT record click on standalone SVG without interactive parent', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'decorative-icon');
    document.body.appendChild(svg);

    eventListener.start();
    eventListener.setRecordingStartTime(Date.now());

    svg.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    // Should NOT record any action
    expect(capturedActions).toHaveLength(0);
  });

  it('should traverse multiple levels to find interactive parent', () => {
    const button = document.createElement('button');
    button.id = 'nested-button';

    const span1 = document.createElement('span');
    const span2 = document.createElement('span');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');

    button.appendChild(span1);
    span1.appendChild(span2);
    span2.appendChild(svg);
    svg.appendChild(path);
    document.body.appendChild(button);

    eventListener.start();
    eventListener.setRecordingStartTime(Date.now());

    // Click on deeply nested path
    path.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(capturedActions.length).toBeGreaterThanOrEqual(1);
    const action = capturedActions.find((a) => a.type === 'click');

    if (action?.type === 'click') {
      expect(action.tagName).toBe('button');
      expect(action.validation?.flags).toContain('redirected-to-parent');
      expect(action.validation?.flags).toContain('svg-child-click');
    }
  });

  it('should record link click when clicking icon child', () => {
    const link = document.createElement('a');
    link.href = '#';
    link.id = 'icon-link';

    const icon = document.createElement('i');
    icon.className = 'fa-icon fa-home';

    link.appendChild(icon);
    document.body.appendChild(link);

    eventListener.start();
    eventListener.setRecordingStartTime(Date.now());

    icon.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(capturedActions.length).toBeGreaterThanOrEqual(1);
    const action = capturedActions.find((a) => a.type === 'click');

    if (action?.type === 'click') {
      expect(action.tagName).toBe('a');
      // Icon elements don't have svg-child-click flag but do have redirected-to-parent
      expect(action.validation?.flags).toContain('redirected-to-parent');
    }
  });

  it('should record element with cursor:pointer when clicking child', () => {
    const div = document.createElement('div');
    div.style.cursor = 'pointer';
    div.id = 'clickable-div';

    const span = document.createElement('span');
    span.textContent = 'Click me';

    div.appendChild(span);
    document.body.appendChild(div);

    eventListener.start();
    eventListener.setRecordingStartTime(Date.now());

    span.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(capturedActions.length).toBeGreaterThanOrEqual(1);
    const action = capturedActions.find((a) => a.type === 'click');

    if (action?.type === 'click') {
      expect(action.tagName).toBe('div');
      expect(action.validation?.flags).toContain('redirected-to-parent');
    }
  });
});

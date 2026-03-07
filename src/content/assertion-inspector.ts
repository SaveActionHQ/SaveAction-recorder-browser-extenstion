/**
 * Assertion Inspector — Inspect mode for adding manual assertions during recording.
 *
 * UX Flow:
 * 1. User clicks "Add Assertion" → recording pauses, overlay appears.
 * 2. User hovers elements → highlighted with blue outline + tooltip.
 * 3. User clicks element → floating assertion panel appears.
 * 4. User picks assertion type, edits value, clicks "Add".
 * 5. CheckpointAction is emitted, overlay dismissed, recording resumes.
 */

import { SelectorGenerator } from './selector-generator';
import type { CheckpointAction } from '@/types/actions';
import type { SelectorStrategy } from '@/types/selectors';

/**
 * Callback invoked when user confirms an assertion.
 */
export type AssertionCallback = (action: CheckpointAction) => void;

/**
 * Available assertion type descriptor.
 */
interface AssertionOption {
  value: CheckpointAction['checkType'];
  label: string;
  defaultValue: string;
  editable: boolean;
}

// Prefix for all inspector DOM element IDs to avoid collisions.
const ID_PREFIX = 'saveaction-assertion';

/**
 * AssertionInspector manages the full inspect-mode lifecycle.
 */
export class AssertionInspector {
  private overlay: HTMLDivElement | null = null;
  private panel: HTMLDivElement | null = null;
  private tooltip: HTMLDivElement | null = null;
  private styleEl: HTMLStyleElement | null = null;

  private highlightedElement: HTMLElement | null = null;
  private selectorGenerator: SelectorGenerator;
  private callback: AssertionCallback | null = null;

  private active = false;
  private recordingStartTime = 0;

  // Bound handlers for proper cleanup
  private boundOnMouseMove: (e: MouseEvent) => void;
  private boundOnClick: (e: MouseEvent) => void;
  private boundOnKeyDown: (e: KeyboardEvent) => void;

  constructor() {
    this.selectorGenerator = new SelectorGenerator();
    this.boundOnMouseMove = this.onMouseMove.bind(this);
    this.boundOnClick = this.onClick.bind(this);
    this.boundOnKeyDown = this.onKeyDown.bind(this);
  }

  /**
   * Set the recording start time for relative timestamps
   */
  public setRecordingStartTime(startTime: number): void {
    this.recordingStartTime = startTime;
  }

  /**
   * Enter inspect mode. The callback receives the built CheckpointAction
   * when the user confirms an assertion.
   */
  public enter(callback: AssertionCallback): void {
    if (this.active) return;
    this.active = true;
    this.callback = callback;

    this.injectStyles();
    this.createOverlay();
    this.createTooltip();

    document.addEventListener('mousemove', this.boundOnMouseMove, true);
    document.addEventListener('click', this.boundOnClick, true);
    document.addEventListener('keydown', this.boundOnKeyDown, true);
  }

  /**
   * Exit inspect mode and clean up all DOM artefacts.
   */
  public exit(): void {
    if (!this.active) return;
    this.active = false;

    document.removeEventListener('mousemove', this.boundOnMouseMove, true);
    document.removeEventListener('click', this.boundOnClick, true);
    document.removeEventListener('keydown', this.boundOnKeyDown, true);

    this.clearHighlight();
    this.removePanel();
    this.removeOverlay();
    this.removeTooltip();
    this.removeStyles();

    this.highlightedElement = null;
    this.callback = null;
  }

  /**
   * Whether the inspector is currently active.
   */
  public isActive(): boolean {
    return this.active;
  }

  // ─── Event Handlers ──────────────────────────────────────────────

  private onMouseMove(e: MouseEvent): void {
    // Don't highlight while the assertion panel is visible
    if (this.panel) return;

    const target = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;

    if (!target || this.isInspectorElement(target)) {
      this.clearHighlight();
      this.hideTooltip();
      return;
    }

    if (target === this.highlightedElement) return;

    this.clearHighlight();
    this.highlightElement(target);
    this.showTooltip(target, e.clientX, e.clientY);
  }

  private onClick(e: MouseEvent): void {
    const target = e.target as HTMLElement;

    // Allow clicks inside the assertion panel
    if (this.panel && this.panel.contains(target)) return;

    // If clicking the overlay message, ignore
    if (this.isInspectorElement(target)) return;

    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    // If panel is already showing and user clicks elsewhere, close the panel
    if (this.panel) {
      this.removePanel();
      this.clearHighlight();
      return;
    }

    const element = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
    if (!element || this.isInspectorElement(element)) return;

    this.hideTooltip();
    this.showAssertionPanel(element);
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      this.exitAndResume();
    }
  }

  // ─── Highlight ────────────────────────────────────────────────────

  private highlightElement(el: HTMLElement): void {
    this.highlightedElement = el;
    el.setAttribute(`data-${ID_PREFIX}-highlight`, 'true');
  }

  private clearHighlight(): void {
    if (this.highlightedElement) {
      this.highlightedElement.removeAttribute(`data-${ID_PREFIX}-highlight`);
      this.highlightedElement = null;
    }
  }

  // ─── Tooltip ──────────────────────────────────────────────────────

  private createTooltip(): void {
    this.tooltip = document.createElement('div');
    this.tooltip.id = `${ID_PREFIX}-tooltip`;
    this.tooltip.style.display = 'none';
    document.body.appendChild(this.tooltip);
  }

  private showTooltip(el: HTMLElement, x: number, y: number): void {
    if (!this.tooltip) return;
    const tag = el.tagName.toLowerCase();
    const text = (el.textContent || '').trim().slice(0, 40);
    const id = el.id ? `#${el.id}` : '';
    this.tooltip.textContent = `<${tag}${id}>${text ? ` "${text}${(el.textContent || '').trim().length > 40 ? '…' : ''}"` : ''}`;
    this.tooltip.style.display = 'block';

    // Position below cursor, clamped to viewport
    const left = Math.min(x + 12, window.innerWidth - 260);
    const top = Math.min(y + 18, window.innerHeight - 34);
    this.tooltip.style.left = `${left}px`;
    this.tooltip.style.top = `${top}px`;
  }

  private hideTooltip(): void {
    if (this.tooltip) this.tooltip.style.display = 'none';
  }

  private removeTooltip(): void {
    this.tooltip?.remove();
    this.tooltip = null;
  }

  // ─── Overlay ──────────────────────────────────────────────────────

  private createOverlay(): void {
    this.overlay = document.createElement('div');
    this.overlay.id = `${ID_PREFIX}-overlay`;

    const msg = document.createElement('div');
    msg.id = `${ID_PREFIX}-overlay-msg`;
    msg.textContent = 'Click any element to add an assertion, or press Escape to cancel';
    this.overlay.appendChild(msg);

    document.body.appendChild(this.overlay);
  }

  private removeOverlay(): void {
    this.overlay?.remove();
    this.overlay = null;
  }

  // ─── Assertion Panel ─────────────────────────────────────────────

  private showAssertionPanel(element: HTMLElement): void {
    this.removePanel();

    const options = this.getAssertionOptions(element);
    const rect = element.getBoundingClientRect();

    this.panel = document.createElement('div');
    this.panel.id = `${ID_PREFIX}-panel`;

    // Position near element, clamped to viewport
    const panelWidth = 300;
    const panelHeight = 230;
    let left = rect.left + rect.width / 2 - panelWidth / 2;
    let top = rect.bottom + 8;

    if (top + panelHeight > window.innerHeight) {
      top = rect.top - panelHeight - 8;
    }
    if (top < 0) top = 8;
    left = Math.max(8, Math.min(left, window.innerWidth - panelWidth - 8));

    this.panel.style.left = `${left}px`;
    this.panel.style.top = `${top}px`;

    // Title
    const title = document.createElement('div');
    title.className = `${ID_PREFIX}-panel-title`;
    title.textContent = 'Add Assertion';
    this.panel.appendChild(title);

    // Assertion type dropdown
    const typeLabel = document.createElement('label');
    typeLabel.className = `${ID_PREFIX}-panel-label`;
    typeLabel.textContent = 'Assertion Type';
    this.panel.appendChild(typeLabel);

    const select = document.createElement('select');
    select.className = `${ID_PREFIX}-panel-select`;
    options.forEach((opt) => {
      const o = document.createElement('option');
      o.value = opt.value;
      o.textContent = opt.label;
      select.appendChild(o);
    });
    this.panel.appendChild(select);

    // Expected value input
    const valueLabel = document.createElement('label');
    valueLabel.className = `${ID_PREFIX}-panel-label`;
    valueLabel.textContent = 'Expected Value';
    this.panel.appendChild(valueLabel);

    const valueInput = document.createElement('input');
    valueInput.type = 'text';
    valueInput.className = `${ID_PREFIX}-panel-input`;
    valueInput.value = options[0]?.defaultValue ?? '';
    valueInput.readOnly = !options[0]?.editable;
    this.panel.appendChild(valueInput);

    // Update value when type changes
    select.addEventListener('change', () => {
      const opt = options.find((o) => o.value === select.value);
      if (opt) {
        valueInput.value = opt.defaultValue;
        valueInput.readOnly = !opt.editable;
      }
    });

    // Buttons row
    const buttons = document.createElement('div');
    buttons.className = `${ID_PREFIX}-panel-buttons`;

    const cancelBtn = document.createElement('button');
    cancelBtn.className = `${ID_PREFIX}-panel-btn ${ID_PREFIX}-panel-btn-cancel`;
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      this.removePanel();
      this.clearHighlight();
    });

    const addBtn = document.createElement('button');
    addBtn.className = `${ID_PREFIX}-panel-btn ${ID_PREFIX}-panel-btn-add`;
    addBtn.textContent = 'Add';
    addBtn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      this.confirmAssertion(
        element,
        select.value as CheckpointAction['checkType'],
        valueInput.value
      );
    });

    buttons.appendChild(cancelBtn);
    buttons.appendChild(addBtn);
    this.panel.appendChild(buttons);

    document.body.appendChild(this.panel);
  }

  private removePanel(): void {
    this.panel?.remove();
    this.panel = null;
  }

  // ─── Assertion Options ────────────────────────────────────────────

  private getAssertionOptions(element: HTMLElement): AssertionOption[] {
    const options: AssertionOption[] = [];
    const tag = element.tagName.toLowerCase();
    const text = (element.textContent || '').trim();

    // Always offer Is Visible
    options.push({
      value: 'elementVisible',
      label: 'Is Visible',
      defaultValue: 'true',
      editable: false,
    });

    // Text assertions if element has text content
    if (text) {
      options.unshift({
        value: 'elementText',
        label: 'Text Equals',
        defaultValue: text,
        editable: true,
      });
      options.splice(1, 0, {
        value: 'containsText',
        label: 'Text Contains',
        defaultValue: text,
        editable: true,
      });
    }

    // Value assertion for form elements
    if (tag === 'input' || tag === 'select' || tag === 'textarea') {
      const val = (element as HTMLInputElement).value || '';
      options.splice(text ? 2 : 0, 0, {
        value: 'elementHasValue',
        label: 'Has Value',
        defaultValue: val,
        editable: true,
      });
    }

    // Page-level assertions (always available)
    options.push({
      value: 'pageTitle',
      label: 'Page Title Equals',
      defaultValue: document.title,
      editable: true,
    });

    return options;
  }

  // ─── Confirm & Emit ───────────────────────────────────────────────

  private confirmAssertion(
    element: HTMLElement,
    checkType: CheckpointAction['checkType'],
    expectedValue: string
  ): void {
    const now = this.recordingStartTime > 0 ? Date.now() - this.recordingStartTime : Date.now();

    let selector: SelectorStrategy | undefined;
    let actualValue: string | undefined;

    if (checkType === 'pageTitle') {
      actualValue = document.title;
    } else {
      selector = this.selectorGenerator.generateSelectors(element);
      actualValue = this.getActualValue(element, checkType);
    }

    const checkpoint: CheckpointAction = {
      id: '', // Will be assigned by background via SYNC_ACTION
      type: 'checkpoint',
      timestamp: now,
      completedAt: now,
      url: window.location.href,
      checkType,
      selector,
      expectedValue,
      actualValue,
      passed: expectedValue === actualValue,
    };

    this.callback?.(checkpoint);
    this.exitAndResume();
  }

  private getActualValue(element: HTMLElement, checkType: CheckpointAction['checkType']): string {
    switch (checkType) {
      case 'elementText':
        return (element.textContent || '').trim();
      case 'containsText':
        return (element.textContent || '').trim();
      case 'elementHasValue':
        return (element as HTMLInputElement).value || '';
      case 'elementVisible':
        return String(this.isElementVisible(element));
      case 'pageTitle':
        return document.title;
      default:
        return '';
    }
  }

  private isElementVisible(el: HTMLElement): boolean {
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
      return false;
    }
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  // ─── Exit & Resume ────────────────────────────────────────────────

  private exitAndResume(): void {
    this.exit();
    // Tell background to resume recording
    try {
      chrome.runtime.sendMessage({ type: 'EXIT_ASSERTION_MODE' });
    } catch {
      // Extension context may be invalid; safe to ignore.
    }
  }

  // ─── Utility ──────────────────────────────────────────────────────

  private isInspectorElement(el: HTMLElement): boolean {
    return (
      !!el.closest(`#${ID_PREFIX}-overlay`) ||
      !!el.closest(`#${ID_PREFIX}-panel`) ||
      !!el.closest(`#${ID_PREFIX}-tooltip`) ||
      !!el.closest('#saveaction-recording-indicator')
    );
  }

  // ─── Styles ───────────────────────────────────────────────────────

  private injectStyles(): void {
    if (document.getElementById(`${ID_PREFIX}-styles`)) return;

    this.styleEl = document.createElement('style');
    this.styleEl.id = `${ID_PREFIX}-styles`;
    this.styleEl.textContent = `
      /* Overlay */
      #${ID_PREFIX}-overlay {
        position: fixed;
        inset: 0;
        background: rgba(59, 130, 246, 0.08);
        z-index: 2147483645;
        pointer-events: none;
      }
      #${ID_PREFIX}-overlay-msg {
        position: fixed;
        top: 60px;
        left: 50%;
        transform: translateX(-50%);
        background: #1e40af;
        color: #fff;
        padding: 10px 20px;
        border-radius: 8px;
        font: 13px/1.4 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        box-shadow: 0 4px 16px rgba(0,0,0,0.25);
        pointer-events: none;
        z-index: 2147483646;
        white-space: nowrap;
      }

      /* Element highlight */
      [data-${ID_PREFIX}-highlight] {
        outline: 2px solid #3b82f6 !important;
        outline-offset: 2px !important;
        cursor: crosshair !important;
      }

      /* Tooltip */
      #${ID_PREFIX}-tooltip {
        position: fixed;
        background: #1e293b;
        color: #e2e8f0;
        padding: 4px 10px;
        border-radius: 6px;
        font: 11px/1.4 monospace;
        z-index: 2147483647;
        pointer-events: none;
        max-width: 250px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
      }

      /* Assertion Panel */
      #${ID_PREFIX}-panel {
        position: fixed;
        width: 300px;
        background: #fff;
        border: 1px solid #e2e8f0;
        border-radius: 12px;
        box-shadow: 0 8px 30px rgba(0,0,0,0.18);
        padding: 16px;
        z-index: 2147483647;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        color: #1e293b;
      }
      .${ID_PREFIX}-panel-title {
        font-size: 14px;
        font-weight: 700;
        margin-bottom: 12px;
        color: #0f172a;
      }
      .${ID_PREFIX}-panel-label {
        display: block;
        font-size: 11px;
        font-weight: 600;
        color: #64748b;
        margin-bottom: 4px;
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }
      .${ID_PREFIX}-panel-select,
      .${ID_PREFIX}-panel-input {
        width: 100%;
        padding: 8px 10px;
        border: 1px solid #cbd5e1;
        border-radius: 6px;
        font-size: 13px;
        margin-bottom: 10px;
        background: #f8fafc;
        color: #1e293b;
        box-sizing: border-box;
      }
      .${ID_PREFIX}-panel-select:focus,
      .${ID_PREFIX}-panel-input:focus {
        outline: none;
        border-color: #3b82f6;
        box-shadow: 0 0 0 2px rgba(59,130,246,0.2);
      }
      .${ID_PREFIX}-panel-buttons {
        display: flex;
        gap: 8px;
        justify-content: flex-end;
        margin-top: 4px;
      }
      .${ID_PREFIX}-panel-btn {
        padding: 7px 16px;
        border-radius: 6px;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        border: none;
        transition: background 0.15s;
      }
      .${ID_PREFIX}-panel-btn-cancel {
        background: #f1f5f9;
        color: #475569;
      }
      .${ID_PREFIX}-panel-btn-cancel:hover {
        background: #e2e8f0;
      }
      .${ID_PREFIX}-panel-btn-add {
        background: #3b82f6;
        color: #fff;
      }
      .${ID_PREFIX}-panel-btn-add:hover {
        background: #2563eb;
      }
    `;
    document.head.appendChild(this.styleEl);
  }

  private removeStyles(): void {
    this.styleEl?.remove();
    this.styleEl = null;
  }
}

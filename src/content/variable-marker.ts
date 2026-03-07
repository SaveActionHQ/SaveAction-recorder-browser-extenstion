/**
 * Variable Marker — lets users mark any input field as a variable during recording.
 * Shows a small badge next to the focused input. On click, prompts for a variable name,
 * then stores the mapping so the EventListener can substitute ${VAR_NAME} for the value.
 */

const ICON_VAR = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>`;

export interface MarkedVariable {
  variableName: string;
  selector: string;
  fieldType: string;
  defaultValue: string;
}

export class VariableMarker {
  /** Map from element → variable name. Used by EventListener to substitute values. */
  private markedElements: Map<HTMLElement, string> = new Map();
  /** All variables marked during this recording session. */
  private variables: MarkedVariable[] = [];

  private badge: HTMLDivElement | null = null;
  private promptPopup: HTMLDivElement | null = null;
  private currentTarget: HTMLInputElement | HTMLTextAreaElement | null = null;
  private active = false;
  private focusOutTimer: ReturnType<typeof setTimeout> | null = null;

  // Event handler references for cleanup
  private boundOnFocusIn: (e: FocusEvent) => void;
  private boundOnFocusOut: (e: FocusEvent) => void;

  constructor() {
    this.boundOnFocusIn = (e) => this.onFocusIn(e);
    this.boundOnFocusOut = (e) => this.onFocusOut(e);
  }

  /** Start listening for input focus events. */
  public start(): void {
    if (this.active) return;
    this.active = true;
    document.addEventListener('focusin', this.boundOnFocusIn, true);
    document.addEventListener('focusout', this.boundOnFocusOut, true);
    console.log('[VariableMarker] Started');
  }

  /** Stop listening and remove badge. */
  public stop(): void {
    this.active = false;
    document.removeEventListener('focusin', this.boundOnFocusIn, true);
    document.removeEventListener('focusout', this.boundOnFocusOut, true);
    this.cancelFocusOutTimer();
    this.hidePromptPopup();
    this.hideBadge();
    console.log('[VariableMarker] Stopped');
  }

  /** Check whether an element is marked as a variable. */
  public getVariableName(element: HTMLElement): string | undefined {
    return this.markedElements.get(element);
  }

  /** Get all marked variables. */
  public getVariables(): MarkedVariable[] {
    return [...this.variables];
  }

  /** Check whether there are any marked variables. */
  public hasVariables(): boolean {
    return this.variables.length > 0;
  }

  /** Clear all marked variables (called when recording stops). */
  public clear(): void {
    this.markedElements.clear();
    this.variables = [];
  }

  // ─── Focus handlers ──────────────────────────────────────────

  private onFocusIn(e: FocusEvent): void {
    if (!this.active) return;
    const target = e.target as HTMLElement;
    if (!this.isInputLike(target)) return;
    // Cancel any pending hide from a previous field's focusout
    this.cancelFocusOutTimer();
    this.currentTarget = target as HTMLInputElement | HTMLTextAreaElement;
    this.showBadge(this.currentTarget);
  }

  private onFocusOut(_e: FocusEvent): void {
    // Delay so clicking the badge itself doesn't lose the target.
    // The timer is cancelled if a new focusin arrives first.
    this.cancelFocusOutTimer();
    this.focusOutTimer = setTimeout(() => {
      this.focusOutTimer = null;
      // Keep badge and target alive while prompt popup or badge is hovered
      if (this.promptPopup || this.badge?.matches(':hover')) {
        return;
      }
      this.hideBadge();
      this.currentTarget = null;
    }, 200);
  }

  private cancelFocusOutTimer(): void {
    if (this.focusOutTimer !== null) {
      clearTimeout(this.focusOutTimer);
      this.focusOutTimer = null;
    }
  }

  // ─── Badge UI ─────────────────────────────────────────────────

  private showBadge(target: HTMLInputElement | HTMLTextAreaElement): void {
    this.hideBadge();

    const isAlreadyMarked = this.markedElements.has(target);

    this.badge = document.createElement('div');
    this.badge.id = 'saveaction-var-badge';
    this.badge.title = isAlreadyMarked
      ? `Variable: \${${this.markedElements.get(target)}}`
      : 'Mark as variable';
    this.badge.style.cssText = `
      position: absolute;
      z-index: 2147483646;
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 3px 8px;
      border-radius: 6px;
      background: ${isAlreadyMarked ? '#059669' : '#2563eb'};
      color: #fff;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      box-shadow: 0 2px 8px rgba(0,0,0,0.25);
      user-select: none;
      white-space: nowrap;
      transition: background 0.15s;
      pointer-events: auto;
    `;

    const iconSpan = document.createElement('span');
    iconSpan.innerHTML = ICON_VAR;
    iconSpan.style.cssText = 'display:flex;align-items:center;';
    this.badge.appendChild(iconSpan);

    const label = document.createElement('span');
    label.textContent = isAlreadyMarked
      ? `\${${this.markedElements.get(target)}}`
      : 'Mark as Variable';
    this.badge.appendChild(label);

    // Position above right edge of target
    const rect = target.getBoundingClientRect();
    this.badge.style.top = `${window.scrollY + rect.top - 28}px`;
    this.badge.style.left = `${window.scrollX + rect.right - (this.badge.offsetWidth || 60)}px`;

    this.badge.addEventListener('mouseenter', () => {
      if (this.badge) this.badge.style.background = isAlreadyMarked ? '#047857' : '#1d4ed8';
    });
    this.badge.addEventListener('mouseleave', () => {
      if (this.badge) this.badge.style.background = isAlreadyMarked ? '#059669' : '#2563eb';
    });

    this.badge.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.promptVariableName(target);
    });

    document.body.appendChild(this.badge);

    // Re-position after paint (offsetWidth now available)
    requestAnimationFrame(() => {
      if (this.badge) {
        const bw = this.badge.offsetWidth;
        this.badge.style.left = `${window.scrollX + rect.right - bw}px`;
      }
    });
  }

  private hideBadge(): void {
    if (this.badge?.parentNode) {
      this.badge.parentNode.removeChild(this.badge);
    }
    this.badge = null;
  }

  // ─── Prompt popup ─────────────────────────────────────────────

  private promptVariableName(target: HTMLInputElement | HTMLTextAreaElement): void {
    // Toggle: if popup is already open, close it
    if (this.promptPopup) {
      this.hidePromptPopup();
      return;
    }

    const suggestedName = this.inferVariableName(target);
    const existingName = this.markedElements.get(target);

    this.promptPopup = document.createElement('div');
    this.promptPopup.id = 'saveaction-var-prompt';
    this.promptPopup.style.cssText = `
      position: absolute;
      z-index: 2147483647;
      background: #1e293b;
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 12px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.45);
      padding: 14px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      color: #e2e8f0;
      width: 260px;
    `;

    // Title
    const title = document.createElement('div');
    title.style.cssText =
      'font-weight:700;font-size:12px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:10px;';
    title.textContent = existingName ? 'Edit Variable' : 'Mark as Variable';
    this.promptPopup.appendChild(title);

    // Input
    const input = document.createElement('input');
    input.type = 'text';
    input.value = existingName || suggestedName;
    input.placeholder = 'e.g. EMAIL, USERNAME';
    input.style.cssText = `
      width: 100%;
      box-sizing: border-box;
      padding: 8px 10px;
      border-radius: 8px;
      border: 1px solid rgba(255,255,255,0.15);
      background: rgba(255,255,255,0.06);
      color: #f1f5f9;
      font-size: 13px;
      font-family: inherit;
      outline: none;
      margin-bottom: 10px;
    `;
    input.addEventListener('focus', () => {
      input.style.borderColor = '#2563eb';
    });
    input.addEventListener('blur', () => {
      input.style.borderColor = 'rgba(255,255,255,0.15)';
    });
    // Prevent these from being recorded
    input.addEventListener('input', (e) => e.stopPropagation(), true);
    input.addEventListener('keydown', (e) => e.stopPropagation(), true);
    input.addEventListener('keyup', (e) => e.stopPropagation(), true);
    this.promptPopup.appendChild(input);

    // Hint
    const hint = document.createElement('div');
    hint.style.cssText = 'font-size:11px;color:#64748b;margin-bottom:12px;line-height:1.4;';
    hint.textContent = 'Name will be uppercased. Use in tests as ${VAR_NAME}.';
    this.promptPopup.appendChild(hint);

    // Buttons row
    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;';

    // Remove button (only shown for existing variables)
    if (existingName) {
      const removeBtn = document.createElement('button');
      removeBtn.textContent = 'Remove';
      removeBtn.style.cssText = `
        padding: 6px 14px;
        border-radius: 8px;
        border: 1px solid rgba(239,68,68,0.3);
        background: transparent;
        color: #ef4444;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        font-family: inherit;
        margin-right: auto;
      `;
      removeBtn.addEventListener('mouseenter', () => {
        removeBtn.style.background = 'rgba(239,68,68,0.1)';
      });
      removeBtn.addEventListener('mouseleave', () => {
        removeBtn.style.background = 'transparent';
      });
      removeBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.removeVariable(target);
      });
      btnRow.appendChild(removeBtn);
    }

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.cssText = `
      padding: 6px 14px;
      border-radius: 8px;
      border: 1px solid rgba(255,255,255,0.12);
      background: transparent;
      color: #94a3b8;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      font-family: inherit;
    `;
    cancelBtn.addEventListener('mouseenter', () => {
      cancelBtn.style.background = 'rgba(255,255,255,0.06)';
    });
    cancelBtn.addEventListener('mouseleave', () => {
      cancelBtn.style.background = 'transparent';
    });
    cancelBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.hidePromptPopup();
    });

    const saveBtn = document.createElement('button');
    saveBtn.textContent = existingName ? 'Update' : 'Save';
    saveBtn.style.cssText = `
      padding: 6px 14px;
      border-radius: 8px;
      border: none;
      background: #2563eb;
      color: #fff;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      font-family: inherit;
    `;
    saveBtn.addEventListener('mouseenter', () => {
      saveBtn.style.background = '#1d4ed8';
    });
    saveBtn.addEventListener('mouseleave', () => {
      saveBtn.style.background = '#2563eb';
    });
    saveBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.applyVariableName(target, input.value);
    });

    btnRow.appendChild(cancelBtn);
    btnRow.appendChild(saveBtn);
    this.promptPopup.appendChild(btnRow);

    // Enter key submits
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.applyVariableName(target, input.value);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        this.hidePromptPopup();
      }
    });

    // Position below the badge
    const badgeRect = this.badge?.getBoundingClientRect();
    if (badgeRect) {
      this.promptPopup.style.top = `${window.scrollY + badgeRect.bottom + 6}px`;
      this.promptPopup.style.left = `${window.scrollX + badgeRect.right - 260}px`;
    }

    document.body.appendChild(this.promptPopup);

    // Focus input and select text
    requestAnimationFrame(() => {
      input.focus();
      input.select();
    });

    // Close on outside click (delayed to avoid immediate close)
    const closeOnOutside = (e: MouseEvent) => {
      if (
        this.promptPopup &&
        !this.promptPopup.contains(e.target as Node) &&
        !(this.badge && this.badge.contains(e.target as Node))
      ) {
        this.hidePromptPopup();
        document.removeEventListener('click', closeOnOutside, true);
      }
    };
    setTimeout(() => document.addEventListener('click', closeOnOutside, true), 0);
  }

  private applyVariableName(target: HTMLInputElement | HTMLTextAreaElement, rawName: string): void {
    if (!rawName || !rawName.trim()) {
      this.hidePromptPopup();
      return;
    }

    const cleaned = rawName
      .trim()
      .replace(/[^a-zA-Z0-9_]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
      .toUpperCase();

    if (!cleaned) {
      this.hidePromptPopup();
      return;
    }

    this.markedElements.set(target, cleaned);

    const variable: MarkedVariable = {
      variableName: cleaned,
      selector: this.buildSelector(target),
      fieldType: (target as HTMLInputElement).type || 'text',
      defaultValue: target.value,
    };

    // Replace existing entry for the same variable name or add new
    const existingIdx = this.variables.findIndex((v) => v.variableName === cleaned);
    if (existingIdx >= 0) {
      this.variables[existingIdx] = variable;
    } else {
      this.variables.push(variable);
    }

    // Notify background
    try {
      chrome.runtime.sendMessage({
        type: 'MARK_VARIABLE',
        payload: variable,
      });
    } catch (err) {
      console.error('[VariableMarker] Failed to sync variable:', err);
    }

    this.hidePromptPopup();
    // Refresh the badge to show the new name
    this.showBadge(target);
    console.log(`[VariableMarker] Marked field as \${${cleaned}}`);
  }

  private removeVariable(target: HTMLInputElement | HTMLTextAreaElement): void {
    const name = this.markedElements.get(target);
    if (name) {
      this.markedElements.delete(target);
      this.variables = this.variables.filter((v) => v.variableName !== name);

      // Notify background
      try {
        chrome.runtime.sendMessage({
          type: 'UNMARK_VARIABLE',
          payload: { variableName: name },
        });
      } catch (err) {
        console.error('[VariableMarker] Failed to sync variable removal:', err);
      }

      console.log(`[VariableMarker] Removed variable \${${name}}`);
    }

    this.hidePromptPopup();
    // Refresh badge to show "Mark as Variable" again
    this.showBadge(target);
  }

  private hidePromptPopup(): void {
    if (this.promptPopup?.parentNode) {
      this.promptPopup.parentNode.removeChild(this.promptPopup);
    }
    this.promptPopup = null;
  }

  // ─── Utilities ────────────────────────────────────────────────

  private isInputLike(el: HTMLElement): boolean {
    const tag = el.tagName;
    if (tag === 'TEXTAREA') return true;
    if (tag === 'INPUT') {
      const type = (el as HTMLInputElement).type;
      return ![
        'checkbox',
        'radio',
        'submit',
        'button',
        'reset',
        'file',
        'image',
        'hidden',
      ].includes(type);
    }
    return el.isContentEditable;
  }

  private inferVariableName(target: HTMLInputElement | HTMLTextAreaElement): string {
    const id = target.id?.toLowerCase() ?? '';
    const name = target.name?.toLowerCase() ?? '';
    const placeholder = target.placeholder?.toLowerCase() ?? '';
    const type = (target as HTMLInputElement).type ?? 'text';

    let base = id || name || placeholder || type;
    base = base
      .replace(/[^a-z0-9_]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
      .toUpperCase();

    return base || 'FIELD';
  }

  private buildSelector(target: HTMLElement): string {
    const escape = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape : (s: string) => s;
    if (target.id) return `#${escape(target.id)}`;
    if ((target as HTMLInputElement).name) {
      return `${target.tagName.toLowerCase()}[name="${escape((target as HTMLInputElement).name)}"]`;
    }
    return target.tagName.toLowerCase();
  }
}

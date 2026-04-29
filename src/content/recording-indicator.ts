/**
 * Recording Indicator - Modern panel overlay for recording controls
 * Draggable, with assert, pause, and finish buttons.
 */

// SVG icon constants (inline so no external deps)
const ICON_LOGO = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/><path d="M8 12l3 3 5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const ICON_ASSERT = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9 12l2 2 4-4"/></svg>`;

const ICON_PAUSE = `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>`;
const ICON_PLAY = `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="6,4 20,12 6,20"/></svg>`;
const ICON_FINISH = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
const ICON_VARIABLE = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>`;
const ICON_DRAG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" opacity="0.45"><circle cx="9" cy="5" r="1.5"/><circle cx="15" cy="5" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="19" r="1.5"/><circle cx="15" cy="19" r="1.5"/></svg>`;
const OVERLAY_DRAGGING_ATTR = 'data-saveaction-overlay-dragging';
const OVERLAY_SUPPRESS_UNTIL_ATTR = 'data-saveaction-overlay-suppress-until';
const OVERLAY_SUPPRESS_MS = 400;
const OVERLAY_RELEASE_SUPPRESS_MS = 150;

export class RecordingIndicator {
  private container: HTMLDivElement | null = null;
  private statusDot: HTMLDivElement | null = null;
  private timerText: HTMLSpanElement | null = null;
  private actionCountText: HTMLSpanElement | null = null;
  private startTime: number | null = null;
  private timerInterval: number | null = null;
  private pollingInterval: number | null = null;
  private pauseButton: HTMLButtonElement | null = null;
  private pauseLabel: HTMLSpanElement | null = null;
  private pauseIcon: HTMLSpanElement | null = null;
  private assertionButton: HTMLButtonElement | null = null;
  private variableButton: HTMLButtonElement | null = null;
  private variableCountBadge: HTMLSpanElement | null = null;
  private stopButton: HTMLButtonElement | null = null;
  private stopLabel: HTMLSpanElement | null = null;
  private isPaused = false;

  // Drag state
  private isDragging = false;
  private dragOffsetX = 0;
  private dragOffsetY = 0;
  private boundOnDragMove: ((e: MouseEvent) => void) | null = null;
  private boundOnDragEnd: (() => void) | null = null;

  public show(testName: string): void {
    if (this.container) return;
    this.createIndicator(testName);
    this.startPolling();
  }

  public hide(): void {
    this.stopTimer();
    this.stopPolling();
    this.cleanupDragListeners();
    this.hideVariablePopup();
    this.setOverlayDragging(false);
    this.clearOverlaySuppression();

    if (this.container?.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }

    this.container = null;
    this.statusDot = null;
    this.timerText = null;
    this.actionCountText = null;
    this.startTime = null;
    this.pauseButton = null;
    this.pauseLabel = null;
    this.pauseIcon = null;
    this.assertionButton = null;
    this.variableButton = null;
    this.variableCountBadge = null;
    this.stopButton = null;
    this.stopLabel = null;

    console.log('[RecordingIndicator] Indicator hidden and cleaned up');
  }

  public updateActionCount(count: number): void {
    if (this.actionCountText) {
      this.actionCountText.textContent = String(count);
    }
  }

  public setPaused(paused: boolean): void {
    if (!this.container || !this.statusDot) return;

    this.isPaused = paused;

    if (paused) {
      this.statusDot.style.backgroundColor = '#f59e0b';
      this.statusDot.style.animationPlayState = 'paused';
      this.stopTimer();
      if (this.pauseIcon) this.pauseIcon.innerHTML = ICON_PLAY;
      if (this.pauseLabel) this.pauseLabel.textContent = 'Resume recording';
    } else {
      this.statusDot.style.backgroundColor = '#ef4444';
      this.statusDot.style.animationPlayState = 'running';
      this.startTimer();
      if (this.pauseIcon) this.pauseIcon.innerHTML = ICON_PAUSE;
      if (this.pauseLabel) this.pauseLabel.textContent = 'Pause recording';
    }
  }

  // ─── Build UI ──────────────────────────────────────────────────

  private createIndicator(testName: string): void {
    this.injectStyles();

    // ── Outer container ──────────────────────────────────────────
    this.container = document.createElement('div');
    this.container.id = 'saveaction-recording-indicator';
    this.container.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      width: 260px;
      background: #1a1a2e;
      color: #e2e8f0;
      border-radius: 16px;
      box-shadow: 0 12px 40px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.08);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif;
      font-size: 13px;
      z-index: 2147483647;
      display: flex;
      flex-direction: column;
      user-select: none;
      animation: sa-fadeSlideIn 0.35s cubic-bezier(0.16, 1, 0.3, 1);
      touch-action: none;
      overflow: visible;
    `;

    // ── Header (draggable) ───────────────────────────────────────
    const header = document.createElement('div');
    header.style.cssText = `
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 14px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      cursor: grab;
    `;
    header.addEventListener('mousedown', (e) => this.onDragStart(e));

    // Drag grip
    const grip = document.createElement('span');
    grip.innerHTML = ICON_DRAG;
    grip.style.cssText = 'display:flex;align-items:center;flex-shrink:0;color:#fff;';
    header.appendChild(grip);

    // Logo + brand
    const brand = document.createElement('div');
    brand.style.cssText = 'display:flex;align-items:center;gap:6px;flex:1;min-width:0;';
    const logoEl = document.createElement('span');
    logoEl.innerHTML = ICON_LOGO;
    logoEl.style.cssText = 'display:flex;color:#fff;flex-shrink:0;';
    const brandName = document.createElement('span');
    brandName.style.cssText =
      'font-weight:700;font-size:13px;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
    brandName.textContent = 'SaveAction';
    brand.appendChild(logoEl);
    brand.appendChild(brandName);
    header.appendChild(brand);

    // REC badge
    const recBadge = document.createElement('div');
    recBadge.style.cssText = `
      display: flex;
      align-items: center;
      gap: 5px;
      background: rgba(0,0,0,0.25);
      padding: 3px 10px 3px 8px;
      border-radius: 20px;
      flex-shrink: 0;
    `;
    this.statusDot = document.createElement('div');
    this.statusDot.style.cssText = `
      width: 8px; height: 8px; border-radius: 50%;
      background-color: #ef4444;
      animation: sa-pulse 1.5s infinite;
    `;
    const recLabel = document.createElement('span');
    recLabel.style.cssText = 'font-size:10px;font-weight:700;letter-spacing:1px;color:#fff;';
    recLabel.textContent = 'REC';
    recBadge.appendChild(this.statusDot);
    recBadge.appendChild(recLabel);
    header.appendChild(recBadge);

    this.container.appendChild(header);

    // ── Info strip ───────────────────────────────────────────────
    const infoStrip = document.createElement('div');
    infoStrip.style.cssText = `
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 8px 14px;
      background: rgba(255,255,255,0.04);
      border-bottom: 1px solid rgba(255,255,255,0.06);
      font-size: 11px;
      color: #94a3b8;
    `;

    const nameChip = document.createElement('span');
    nameChip.style.cssText =
      'flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:500;color:#cbd5e1;';
    nameChip.textContent = testName;
    nameChip.title = testName;

    const timerChip = document.createElement('span');
    timerChip.style.cssText =
      'display:flex;align-items:center;gap:3px;flex-shrink:0;font-variant-numeric:tabular-nums;';
    timerChip.textContent = '⏱ ';
    this.timerText = document.createElement('span');
    this.timerText.textContent = '00:00';
    timerChip.appendChild(this.timerText);

    const actionsChip = document.createElement('span');
    actionsChip.style.cssText =
      'display:flex;align-items:center;gap:3px;flex-shrink:0;font-variant-numeric:tabular-nums;';
    actionsChip.textContent = '🎬 ';
    this.actionCountText = document.createElement('span');
    this.actionCountText.textContent = '0';
    actionsChip.appendChild(this.actionCountText);

    infoStrip.appendChild(nameChip);
    infoStrip.appendChild(timerChip);
    infoStrip.appendChild(actionsChip);
    this.container.appendChild(infoStrip);

    // ── Action buttons ───────────────────────────────────────────
    const body = document.createElement('div');
    body.style.cssText = 'display:flex;flex-direction:column;gap:4px;padding:10px 12px 14px;';

    this.assertionButton = this.createMenuButton(ICON_ASSERT, 'Add assertion', '#3b82f6', () =>
      this.handleAssertionClick()
    );

    // Variables button with count badge
    this.variableButton = this.createMenuButton(ICON_VARIABLE, 'Variables', '#06b6d4', () =>
      this.handleVariablesClick()
    );
    this.variableCountBadge = document.createElement('span');
    this.variableCountBadge.style.cssText = `
      margin-left: auto;
      background: rgba(6,182,212,0.2);
      color: #06b6d4;
      font-size: 10px;
      font-weight: 700;
      padding: 2px 7px;
      border-radius: 10px;
      display: none;
    `;
    this.variableCountBadge.textContent = '0';
    this.variableButton.appendChild(this.variableCountBadge);

    this.pauseIcon = document.createElement('span');
    this.pauseIcon.innerHTML = ICON_PAUSE;
    this.pauseIcon.style.cssText = 'display:flex;';
    this.pauseLabel = document.createElement('span');
    this.pauseLabel.textContent = 'Pause recording';
    this.pauseButton = this.createMenuButton('', 'Pause recording', '#64748b', () =>
      this.handlePauseClick()
    );
    // Replace inner HTML with our tracked elements
    this.pauseButton.innerHTML = '';
    const pauseIconWrap = document.createElement('span');
    pauseIconWrap.style.cssText =
      'display:flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:8px;background:rgba(100,116,139,0.15);flex-shrink:0;';
    pauseIconWrap.appendChild(this.pauseIcon);
    this.pauseButton.appendChild(pauseIconWrap);
    this.pauseButton.appendChild(this.pauseLabel);

    // Divider
    const divider = document.createElement('div');
    divider.style.cssText = 'height:1px;background:rgba(255,255,255,0.06);margin:4px 0;';

    // Finish button (primary CTA)
    this.stopLabel = document.createElement('span');
    this.stopLabel.textContent = 'Finish & save';
    this.stopButton = document.createElement('button');
    this.stopButton.style.cssText = `
      display: flex;
      align-items: center;
      gap: 10px;
      width: 100%;
      padding: 10px 12px;
      border: none;
      border-radius: 10px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: #fff;
      font-size: 13px;
      font-weight: 600;
      font-family: inherit;
      cursor: pointer;
      transition: opacity 0.15s, transform 0.1s;
      text-align: left;
    `;
    const finishIconWrap = document.createElement('span');
    finishIconWrap.style.cssText =
      'display:flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:8px;background:rgba(255,255,255,0.18);flex-shrink:0;';
    finishIconWrap.innerHTML = ICON_FINISH;
    this.stopButton.appendChild(finishIconWrap);
    this.stopButton.appendChild(this.stopLabel);
    this.stopButton.addEventListener('mouseenter', () => {
      if (this.stopButton) this.stopButton.style.opacity = '0.88';
    });
    this.stopButton.addEventListener('mouseleave', () => {
      if (this.stopButton) this.stopButton.style.opacity = '1';
    });
    this.stopButton.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      if (this.stopButton) this.stopButton.style.transform = 'scale(0.98)';
    });
    this.stopButton.addEventListener('mouseup', () => {
      if (this.stopButton) this.stopButton.style.transform = 'scale(1)';
    });
    this.stopButton.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.handleStopClick();
    });

    body.appendChild(this.assertionButton);
    body.appendChild(this.variableButton);
    body.appendChild(this.pauseButton);
    body.appendChild(divider);
    body.appendChild(this.stopButton);

    this.container.appendChild(body);
    document.body.appendChild(this.container);
  }

  // ─── Helpers ────────────────────────────────────────────────────

  private injectStyles(): void {
    if (document.getElementById('saveaction-indicator-styles')) return;
    const style = document.createElement('style');
    style.id = 'saveaction-indicator-styles';
    style.textContent = `
      @keyframes sa-fadeSlideIn {
        from { transform: translateY(-12px) scale(0.96); opacity: 0; }
        to   { transform: translateY(0) scale(1); opacity: 1; }
      }
      @keyframes sa-pulse {
        0%, 100% { opacity: 1; }
        50%      { opacity: 0.35; }
      }
      #saveaction-recording-indicator *,
      #saveaction-recording-indicator *::before,
      #saveaction-recording-indicator *::after {
        box-sizing: border-box;
      }
    `;
    document.head.appendChild(style);
  }

  private createMenuButton(
    iconSvg: string,
    label: string,
    accentColor: string,
    onClick: () => void
  ): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.style.cssText = `
      display: flex;
      align-items: center;
      gap: 10px;
      width: 100%;
      padding: 8px 10px;
      border: 1px solid rgba(255,255,255,0.06);
      border-radius: 10px;
      background: rgba(255,255,255,0.03);
      color: #e2e8f0;
      font-size: 13px;
      font-weight: 500;
      font-family: inherit;
      cursor: pointer;
      transition: background 0.15s, border-color 0.15s, transform 0.1s;
      text-align: left;
    `;

    const iconWrap = document.createElement('span');
    iconWrap.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      border-radius: 8px;
      background: ${accentColor}20;
      color: ${accentColor};
      flex-shrink: 0;
    `;
    iconWrap.innerHTML = iconSvg;

    const labelEl = document.createElement('span');
    labelEl.textContent = label;

    btn.appendChild(iconWrap);
    btn.appendChild(labelEl);

    btn.addEventListener('mouseenter', () => {
      btn.style.background = 'rgba(255,255,255,0.07)';
      btn.style.borderColor = 'rgba(255,255,255,0.12)';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.background = 'rgba(255,255,255,0.03)';
      btn.style.borderColor = 'rgba(255,255,255,0.06)';
    });
    btn.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      btn.style.transform = 'scale(0.98)';
    });
    btn.addEventListener('mouseup', () => {
      btn.style.transform = 'scale(1)';
    });
    btn.addEventListener('click', onClick);

    return btn;
  }

  // ─── Drag & Drop ───────────────────────────────────────────────

  private onDragStart(e: MouseEvent): void {
    if (e.button !== 0 || !this.container) return;

    this.isDragging = true;
    this.setOverlayDragging(true);
    this.suppressRecorderCapture(OVERLAY_SUPPRESS_MS);
    const rect = this.container.getBoundingClientRect();
    this.dragOffsetX = e.clientX - rect.left;
    this.dragOffsetY = e.clientY - rect.top;

    // Switch from right-anchored to left-anchored positioning
    this.container.style.right = 'auto';
    this.container.style.left = `${rect.left}px`;
    this.container.style.top = `${rect.top}px`;

    // Find the header and set grabbing cursor
    const header = this.container.firstElementChild as HTMLElement;
    if (header) header.style.cursor = 'grabbing';

    this.boundOnDragMove = (ev: MouseEvent) => this.onDragMove(ev);
    this.boundOnDragEnd = () => this.onDragEnd();
    document.addEventListener('mousemove', this.boundOnDragMove, true);
    document.addEventListener('mouseup', this.boundOnDragEnd, true);
    e.stopPropagation();
    e.preventDefault();
  }

  private onDragMove(e: MouseEvent): void {
    if (!this.isDragging || !this.container) return;
    this.suppressRecorderCapture(OVERLAY_SUPPRESS_MS);
    const rect = this.container.getBoundingClientRect();
    const newLeft = Math.max(
      0,
      Math.min(e.clientX - this.dragOffsetX, window.innerWidth - rect.width)
    );
    const newTop = Math.max(
      0,
      Math.min(e.clientY - this.dragOffsetY, window.innerHeight - rect.height)
    );
    this.container.style.left = `${newLeft}px`;
    this.container.style.top = `${newTop}px`;
  }

  private onDragEnd(): void {
    this.isDragging = false;
    this.setOverlayDragging(false);
    this.suppressRecorderCapture(OVERLAY_RELEASE_SUPPRESS_MS);
    if (this.container) {
      const header = this.container.firstElementChild as HTMLElement;
      if (header) header.style.cursor = 'grab';
    }
    this.cleanupDragListeners();
  }

  private setOverlayDragging(isDragging: boolean): void {
    const root = document.documentElement;

    if (isDragging) {
      root.setAttribute(OVERLAY_DRAGGING_ATTR, 'true');
      return;
    }

    root.removeAttribute(OVERLAY_DRAGGING_ATTR);
  }

  private suppressRecorderCapture(durationMs: number): void {
    document.documentElement.setAttribute(
      OVERLAY_SUPPRESS_UNTIL_ATTR,
      String(Date.now() + durationMs)
    );
  }

  private clearOverlaySuppression(): void {
    document.documentElement.removeAttribute(OVERLAY_SUPPRESS_UNTIL_ATTR);
  }

  private cleanupDragListeners(): void {
    if (this.boundOnDragMove) {
      document.removeEventListener('mousemove', this.boundOnDragMove, true);
      this.boundOnDragMove = null;
    }
    if (this.boundOnDragEnd) {
      document.removeEventListener('mouseup', this.boundOnDragEnd, true);
      this.boundOnDragEnd = null;
    }
  }

  // ─── Button Handlers ──────────────────────────────────────────

  private handlePauseClick(): void {
    console.log('[RecordingIndicator] Pause button clicked, isPaused:', this.isPaused);
    try {
      const type = this.isPaused ? 'RESUME_RECORDING' : 'PAUSE_RECORDING';
      chrome.runtime.sendMessage({ type }, (response) => {
        console.log(`[RecordingIndicator] ${type} response:`, response);
      });
    } catch (error) {
      console.error('[RecordingIndicator] Failed to toggle pause:', error);
    }
  }

  private handleAssertionClick(): void {
    console.log('[RecordingIndicator] Assertion button clicked');
    try {
      chrome.runtime.sendMessage({ type: 'ENTER_ASSERTION_MODE' }, (response) => {
        console.log('[RecordingIndicator] ENTER_ASSERTION_MODE response:', response);
      });
    } catch (error) {
      console.error('[RecordingIndicator] Failed to enter assertion mode:', error);
    }
  }

  private variablePopup: HTMLDivElement | null = null;

  private handleVariablesClick(): void {
    console.log('[RecordingIndicator] Variables button clicked');
    // Toggle popup
    if (this.variablePopup) {
      this.hideVariablePopup();
      return;
    }
    try {
      chrome.runtime.sendMessage({ type: 'GET_VARIABLES' }, (response) => {
        if (response?.success && response.data) {
          this.showVariablePopup(
            response.data as Array<{ variableName: string; selector: string; fieldType: string }>
          );
        } else {
          this.showVariablePopup([]);
        }
      });
    } catch (error) {
      console.error('[RecordingIndicator] Failed to get variables:', error);
    }
  }

  private showVariablePopup(
    vars: Array<{ variableName: string; selector: string; fieldType: string }>
  ): void {
    this.hideVariablePopup();
    if (!this.container) return;

    this.variablePopup = document.createElement('div');
    this.variablePopup.id = 'saveaction-variable-popup';
    this.variablePopup.style.cssText = `
      position: absolute;
      left: 0;
      right: 0;
      bottom: 100%;
      margin-bottom: 6px;
      background: #1e293b;
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 12px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.4);
      padding: 12px;
      font-family: inherit;
      font-size: 12px;
      color: #e2e8f0;
      max-height: 200px;
      overflow-y: auto;
      z-index: 2147483647;
    `;

    if (vars.length === 0) {
      const hint = document.createElement('div');
      hint.style.cssText = 'color:#94a3b8;text-align:center;padding:8px 0;line-height:1.5;';
      hint.innerHTML =
        'No variables yet.<br><span style="font-size:11px;color:#64748b;">Focus an input field and click the <strong style="color:#06b6d4;">{x}</strong> badge to mark it as a variable.</span>';
      this.variablePopup.appendChild(hint);
    } else {
      const title = document.createElement('div');
      title.style.cssText =
        'font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:#94a3b8;margin-bottom:8px;';
      title.textContent = `Variables (${vars.length})`;
      this.variablePopup.appendChild(title);

      vars.forEach((v) => {
        const row = document.createElement('div');
        row.style.cssText =
          'display:flex;align-items:center;gap:8px;padding:5px 6px;border-radius:6px;background:rgba(255,255,255,0.04);margin-bottom:4px;';
        const name = document.createElement('span');
        name.style.cssText = 'font-weight:600;color:#06b6d4;font-size:12px;';
        name.textContent = `\${${v.variableName}}`;
        const field = document.createElement('span');
        field.style.cssText =
          'color:#64748b;font-size:11px;margin-left:auto;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:120px;';
        field.textContent = v.selector;
        field.title = v.selector;
        row.appendChild(name);
        row.appendChild(field);
        this.variablePopup!.appendChild(row);
      });
    }

    // Close when clicking outside
    const closeOnOutsideClick = (e: MouseEvent) => {
      if (
        this.variablePopup &&
        !this.variablePopup.contains(e.target as Node) &&
        !(this.variableButton && this.variableButton.contains(e.target as Node))
      ) {
        this.hideVariablePopup();
        document.removeEventListener('click', closeOnOutsideClick, true);
      }
    };
    setTimeout(() => document.addEventListener('click', closeOnOutsideClick, true), 0);

    this.container.appendChild(this.variablePopup);
  }

  private hideVariablePopup(): void {
    if (this.variablePopup?.parentNode) {
      this.variablePopup.parentNode.removeChild(this.variablePopup);
    }
    this.variablePopup = null;
  }

  /** Update the variable count badge on the Variables button. */
  public updateVariableCount(count: number): void {
    if (!this.variableCountBadge) return;
    this.variableCountBadge.textContent = String(count);
    this.variableCountBadge.style.display = count > 0 ? 'inline' : 'none';
  }

  private handleStopClick(): void {
    console.log('[RecordingIndicator] Finish button clicked');
    if (this.stopButton && this.stopLabel) {
      this.stopLabel.textContent = 'Saving…';
      this.stopButton.style.pointerEvents = 'none';
      this.stopButton.style.opacity = '0.7';
    }
    try {
      chrome.runtime.sendMessage(
        { type: 'STOP_AND_UPLOAD', payload: { openPopup: true } },
        (response) => {
          console.log('[RecordingIndicator] STOP_AND_UPLOAD response:', response);
        }
      );
    } catch (error) {
      console.error('[RecordingIndicator] Failed to save recording:', error);
      if (this.stopButton && this.stopLabel) {
        this.stopLabel.textContent = 'Finish & save';
        this.stopButton.style.pointerEvents = 'auto';
        this.stopButton.style.opacity = '1';
      }
    }
  }

  // ─── Timer ────────────────────────────────────────────────────

  private startTimer(): void {
    this.stopTimer();
    const updateTimer = () => {
      if (!this.startTime || !this.timerText) return;
      const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
      const m = Math.floor(elapsed / 60);
      const s = elapsed % 60;
      this.timerText.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    };
    updateTimer();
    this.timerInterval = window.setInterval(updateTimer, 1000);
  }

  private stopTimer(): void {
    if (this.timerInterval !== null) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  // ─── Polling ──────────────────────────────────────────────────

  private startPolling(): void {
    this.stopPolling();
    const poll = async () => {
      try {
        if (!this.container) {
          this.stopPolling();
          return;
        }
        const response = await chrome.runtime.sendMessage({ type: 'GET_STATUS' });
        if (response?.success && response.data) {
          const { state, metadata } = response.data;
          if (state === 'idle') {
            this.stopPolling();
            return;
          }
          if (state === 'paused' && !this.isPaused) this.setPaused(true);
          else if (state === 'recording' && this.isPaused) this.setPaused(false);
          if (metadata) {
            const { startTime, actionCount } = metadata;
            if (startTime && !this.startTime) {
              this.startTime =
                typeof startTime === 'string' ? new Date(startTime).getTime() : startTime;
              this.startTimer();
            }
            if (typeof actionCount === 'number' && this.actionCountText) {
              this.actionCountText.textContent = String(actionCount);
            }
          }
        }
        // Update variable count badge
        try {
          const varResp = await chrome.runtime.sendMessage({ type: 'GET_VARIABLES' });
          if (varResp?.success && Array.isArray(varResp.data)) {
            this.updateVariableCount(varResp.data.length);
          }
        } catch {
          /* ignore */
        }
      } catch (error) {
        console.error('[RecordingIndicator] Polling error:', error);
      }
    };
    poll();
    this.pollingInterval = window.setInterval(poll, 1000);
  }

  private stopPolling(): void {
    if (this.pollingInterval !== null) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }
}

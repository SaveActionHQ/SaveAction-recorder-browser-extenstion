/**
 * Recording Indicator - Visual overlay to show recording status
 */

export class RecordingIndicator {
  private container: HTMLDivElement | null = null;
  private statusDot: HTMLDivElement | null = null;
  private timerText: HTMLSpanElement | null = null;
  private actionCountText: HTMLSpanElement | null = null;
  private startTime: number | null = null; // Store as timestamp, not ISO string
  private timerInterval: number | null = null;
  private pollingInterval: number | null = null;
  private pauseButton: HTMLButtonElement | null = null;
  private stopButton: HTMLButtonElement | null = null;
  private isPaused = false;

  /**
   * Show the recording indicator
   */
  public show(testName: string): void {
    if (this.container) {
      return; // Already showing
    }

    this.createIndicator(testName);
    this.startPolling();
  }

  /**
   * Hide the recording indicator
   */
  public hide(): void {
    this.stopTimer();
    this.stopPolling();

    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }

    this.container = null;
    this.statusDot = null;
    this.timerText = null;
    this.actionCountText = null;
    this.startTime = null;
    this.pauseButton = null;
    this.stopButton = null;

    console.log('[RecordingIndicator] Indicator hidden and cleaned up');
  }

  /**
   * Update action count
   */
  public updateActionCount(count: number): void {
    if (this.actionCountText) {
      this.actionCountText.textContent = String(count);
    }
  }

  /**
   * Set paused state
   */
  public setPaused(paused: boolean): void {
    if (!this.container || !this.statusDot) {
      return;
    }

    this.isPaused = paused;

    if (paused) {
      this.statusDot.style.backgroundColor = '#f59e0b';
      this.stopTimer();

      // Update pause button icon
      if (this.pauseButton) {
        this.pauseButton.innerHTML = '▶️';
        this.pauseButton.title = 'Resume Recording';
      }
    } else {
      this.statusDot.style.backgroundColor = '#ef4444';
      this.startTimer();

      // Update pause button icon
      if (this.pauseButton) {
        this.pauseButton.innerHTML = '⏸️';
        this.pauseButton.title = 'Pause Recording';
      }
    }
  }

  /**
   * Create the indicator element
   */
  private createIndicator(testName: string): void {
    // Container
    this.container = document.createElement('div');
    this.container.id = 'saveaction-recording-indicator';
    this.container.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 12px 16px;
      border-radius: 12px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2), 0 0 0 1px rgba(255, 255, 255, 0.1);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 13px;
      z-index: 2147483647;
      display: flex;
      align-items: center;
      gap: 12px;
      backdrop-filter: blur(10px);
      user-select: none;
      cursor: default;
      animation: slideIn 0.3s ease-out;
    `;

    // Add animation keyframes
    if (!document.getElementById('saveaction-indicator-styles')) {
      const style = document.createElement('style');
      style.id = 'saveaction-indicator-styles';
      style.textContent = `
        @keyframes slideIn {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
        @keyframes pulse {
          0%, 100% {
            opacity: 1;
            transform: scale(1);
          }
          50% {
            opacity: 0.8;
            transform: scale(1.1);
          }
        }
      `;
      document.head.appendChild(style);
    }

    // Status dot
    this.statusDot = document.createElement('div');
    this.statusDot.style.cssText = `
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background-color: #ef4444;
      animation: pulse 2s infinite;
      flex-shrink: 0;
    `;

    // Info container
    const infoContainer = document.createElement('div');
    infoContainer.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 4px;
    `;

    // Test name
    const testNameEl = document.createElement('div');
    testNameEl.style.cssText = `
      font-weight: 600;
      font-size: 12px;
      opacity: 0.9;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 200px;
    `;
    testNameEl.textContent = testName;

    // Stats row
    const statsRow = document.createElement('div');
    statsRow.style.cssText = `
      display: flex;
      gap: 12px;
      font-size: 11px;
      opacity: 0.85;
    `;

    // Timer
    const timerContainer = document.createElement('div');
    timerContainer.style.cssText = 'display: flex; align-items: center; gap: 4px;';
    const timerIcon = document.createElement('span');
    timerIcon.textContent = '⏱';
    this.timerText = document.createElement('span');
    this.timerText.textContent = '00:00';
    timerContainer.appendChild(timerIcon);
    timerContainer.appendChild(this.timerText);

    // Action count
    const actionContainer = document.createElement('div');
    actionContainer.style.cssText = 'display: flex; align-items: center; gap: 4px;';
    const actionIcon = document.createElement('span');
    actionIcon.textContent = '🎬';
    this.actionCountText = document.createElement('span');
    this.actionCountText.textContent = '0';
    actionContainer.appendChild(actionIcon);
    actionContainer.appendChild(this.actionCountText);

    // Assemble
    statsRow.appendChild(timerContainer);
    statsRow.appendChild(actionContainer);
    infoContainer.appendChild(testNameEl);
    infoContainer.appendChild(statsRow);
    this.container.appendChild(this.statusDot);
    this.container.appendChild(infoContainer);

    // Add control buttons
    const buttonContainer = document.createElement('div');
    buttonContainer.style.cssText = `
      display: flex;
      gap: 8px;
      margin-left: 8px;
    `;

    // Pause/Resume button
    this.pauseButton = document.createElement('button');
    this.pauseButton.innerHTML = '⏸️';
    this.pauseButton.title = 'Pause Recording';
    this.pauseButton.style.cssText = `
      background: rgba(255, 255, 255, 0.2);
      border: none;
      color: white;
      width: 32px;
      height: 32px;
      border-radius: 8px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      transition: all 0.2s;
      flex-shrink: 0;
    `;
    this.pauseButton.addEventListener('mouseenter', () => {
      if (this.pauseButton) {
        this.pauseButton.style.background = 'rgba(255, 255, 255, 0.3)';
      }
    });
    this.pauseButton.addEventListener('mouseleave', () => {
      if (this.pauseButton) {
        this.pauseButton.style.background = 'rgba(255, 255, 255, 0.2)';
      }
    });
    this.pauseButton.addEventListener('click', () => {
      this.handlePauseClick();
    });

    // Stop button
    this.stopButton = document.createElement('button');
    this.stopButton.innerHTML = '⬇️';
    this.stopButton.title = 'Stop & Download Recording';
    this.stopButton.style.cssText = `
      background: rgba(239, 68, 68, 0.9);
      border: none;
      color: white;
      width: 32px;
      height: 32px;
      border-radius: 8px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      transition: all 0.2s;
      flex-shrink: 0;
    `;
    this.stopButton.addEventListener('mouseenter', () => {
      if (this.stopButton) {
        this.stopButton.style.background = 'rgba(239, 68, 68, 1)';
      }
    });
    this.stopButton.addEventListener('mouseleave', () => {
      if (this.stopButton) {
        this.stopButton.style.background = 'rgba(239, 68, 68, 0.9)';
      }
    });
    this.stopButton.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.handleStopClick();
    });

    buttonContainer.appendChild(this.pauseButton);
    buttonContainer.appendChild(this.stopButton);
    this.container.appendChild(buttonContainer);

    // Add to page
    document.body.appendChild(this.container);
  }

  /**
   * Handle pause button click
   */
  private handlePauseClick(): void {
    console.log('[RecordingIndicator] Pause button clicked, isPaused:', this.isPaused);
    try {
      if (this.isPaused) {
        chrome.runtime.sendMessage({ type: 'RESUME_RECORDING' }, (response) => {
          console.log('[RecordingIndicator] RESUME_RECORDING response:', response);
        });
      } else {
        chrome.runtime.sendMessage({ type: 'PAUSE_RECORDING' }, (response) => {
          console.log('[RecordingIndicator] PAUSE_RECORDING response:', response);
        });
      }
    } catch (error) {
      console.error('[RecordingIndicator] Failed to toggle pause:', error);
    }
  }

  /**
   * Handle stop button click
   */
  private handleStopClick(): void {
    console.log('[RecordingIndicator] Stop button clicked');
    try {
      chrome.runtime.sendMessage({ type: 'STOP_RECORDING' }, (response) => {
        console.log('[RecordingIndicator] STOP_RECORDING response:', response);

        // Trigger download if we got recording data
        if (response?.success && response.data) {
          const recording = response.data;
          this.downloadRecording(recording);
        }
      });
    } catch (error) {
      console.error('[RecordingIndicator] Failed to stop recording:', error);
    }
  }

  /**
   * Download recording as JSON file
   */
  private downloadRecording(recording: any): void {
    try {
      const json = JSON.stringify(recording, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${recording.testName}_${recording.id.replace('rec_', '')}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      console.log('[RecordingIndicator] Recording downloaded:', a.download);
    } catch (error) {
      console.error('[RecordingIndicator] Failed to download recording:', error);
    }
  }

  /**
   * Start the timer
   */
  private startTimer(): void {
    this.stopTimer();

    const updateTimer = () => {
      if (!this.startTime || !this.timerText) {
        return;
      }

      const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
      const minutes = Math.floor(elapsed / 60);
      const seconds = elapsed % 60;
      this.timerText.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    };

    updateTimer();
    this.timerInterval = window.setInterval(updateTimer, 1000);
  }

  /**
   * Stop the timer
   */
  private stopTimer(): void {
    if (this.timerInterval !== null) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  /**
   * Start polling for recording status from background
   */
  private startPolling(): void {
    this.stopPolling();

    const poll = async () => {
      try {
        // Don't poll if indicator has been destroyed
        if (!this.container) {
          this.stopPolling();
          return;
        }

        const response = await chrome.runtime.sendMessage({ type: 'GET_STATUS' });

        if (response?.success && response.data) {
          const { state, metadata } = response.data;

          // Stop polling if recording is stopped
          if (state === 'idle') {
            this.stopPolling();
            return;
          }

          // Update pause state based on recording state
          if (state === 'paused' && !this.isPaused) {
            this.setPaused(true);
          } else if (state === 'recording' && this.isPaused) {
            this.setPaused(false);
          }

          if (metadata) {
            const { startTime, actionCount } = metadata;

            // Update start time if we don't have it yet
            if (startTime && !this.startTime) {
              // Convert ISO string to timestamp
              this.startTime =
                typeof startTime === 'string' ? new Date(startTime).getTime() : startTime;
              this.startTimer();
            }

            // Update action count
            if (typeof actionCount === 'number' && this.actionCountText) {
              this.actionCountText.textContent = String(actionCount);
            }
          }
        }
      } catch (error) {
        console.error('[RecordingIndicator] Polling error:', error);
      }
    };

    // Initial poll
    poll();

    // Poll every second
    this.pollingInterval = window.setInterval(poll, 1000);
  }

  /**
   * Stop polling
   */
  private stopPolling(): void {
    if (this.pollingInterval !== null) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }
}

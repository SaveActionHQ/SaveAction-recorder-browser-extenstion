import { EventListener } from './event-listener';
import type { Action, Recording } from '@/types';
import { generateRecordingId, SCHEMA_VERSION } from '@/types/recording';

/**
 * Recording state
 */
export type RecordingState = 'idle' | 'recording' | 'paused';

/**
 * Recording metadata (partial Recording without actions)
 */
export interface RecordingMetadata {
  id: string;
  testName: string;
  url: string;
  startTime: string;
  viewport: { width: number; height: number };
  userAgent: string;
}

/**
 * ActionRecorder manages the recording session lifecycle and action collection
 */
export class ActionRecorder {
  private state: RecordingState = 'idle';
  private eventListener: EventListener;
  private actions: Action[] = [];
  private metadata: RecordingMetadata | null = null;

  constructor() {
    // Initialize EventListener with action callback
    this.eventListener = new EventListener((action: Action) => {
      this.onActionCaptured(action);
    });
  }

  /**
   * Start recording with a test name
   */
  public startRecording(testName: string): void {
    const trimmedName = testName.trim();

    if (!trimmedName) {
      throw new Error('Test name is required to start recording');
    }

    // If already recording, throw error
    if (this.state === 'recording') {
      throw new Error('Recording is already in progress');
    }

    if (this.state === 'paused') {
      console.log('[ActionRecorder] Was paused, resuming');
      this.state = 'recording';
      this.eventListener.start();
      return;
    }

    // Start new recording (state is 'idle')
    // Initialize metadata
    this.metadata = {
      id: generateRecordingId(),
      testName: trimmedName,
      url: window.location.href,
      startTime: new Date().toISOString(),
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
      },
      userAgent: navigator.userAgent,
    };

    // Start fresh (actions will be restored from background if needed)
    this.actions = [];

    // Start capturing events
    this.state = 'recording';
    this.eventListener.start();
  }

  /**
   * Restore recording state after page navigation
   * This preserves the original metadata (including initial URL) from background
   */
  public restoreRecording(metadata: RecordingMetadata): void {
    if (this.state === 'recording') {
      console.log('[ActionRecorder] Already recording, skipping restoration');
      return;
    }

    // Restore metadata without modifying it (preserves initial URL)
    this.metadata = { ...metadata };

    // Start fresh actions (will be synced from background)
    this.actions = [];

    // Start capturing events
    this.state = 'recording';
    this.eventListener.start();

    // Sync action counter with background
    this.syncActionCounter();

    console.log('[ActionRecorder] Recording restored with original metadata:', this.metadata);
  }

  /**
   * Sync action counter with background to ensure sequential IDs
   */
  private async syncActionCounter(): Promise<void> {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_ACTION_COUNTER' });
      if (response?.success && typeof response.data?.counter === 'number') {
        this.eventListener.setActionSequence(response.data.counter);
        console.log(
          '[ActionRecorder] Synced action counter from background:',
          response.data.counter
        );
      }
    } catch (error) {
      console.error('[ActionRecorder] Failed to sync action counter:', error);
    }
  }

  /**
   * Pause recording (stop capturing but keep session)
   */
  public pauseRecording(): void {
    if (this.state !== 'recording') {
      throw new Error('Cannot pause: not currently recording');
    }

    this.state = 'paused';
    this.eventListener.stop();
  }

  /**
   * Resume recording from paused state
   */
  public resumeRecording(): void {
    if (this.state !== 'paused') {
      throw new Error('Cannot resume: recording is not paused');
    }

    this.state = 'recording';
    this.eventListener.start();
  }

  /**
   * Stop recording and return final Recording object
   */
  public stopRecording(): Recording {
    if (this.state === 'idle' || !this.metadata) {
      throw new Error('Cannot stop: no active recording');
    }

    // Stop event listener
    this.eventListener.stop();

    // Build final recording object
    const recording: Recording = {
      id: this.metadata.id,
      version: SCHEMA_VERSION,
      testName: this.metadata.testName,
      url: this.metadata.url,
      startTime: this.metadata.startTime,
      endTime: new Date().toISOString(),
      viewport: this.metadata.viewport,
      userAgent: this.metadata.userAgent,
      actions: [...this.actions],
    };

    // Reset state
    this.state = 'idle';
    this.metadata = null;
    this.actions = [];

    return recording;
  }

  /**
   * Get current recording state
   */
  public getState(): RecordingState {
    return this.state;
  }

  /**
   * Check if currently recording
   */
  public isRecording(): boolean {
    return this.state === 'recording';
  }

  /**
   * Get current recording metadata
   */
  public getMetadata(): RecordingMetadata | null {
    return this.metadata ? { ...this.metadata } : null;
  }

  /**
   * Get current action count
   */
  public getActionCount(): number {
    return this.actions.length;
  }

  /**
   * Get current actions
   */
  public getActions(): Action[] {
    return [...this.actions];
  }

  /**
   * Cleanup resources
   */
  public destroy(): void {
    this.eventListener.destroy();
    this.actions = [];
    this.metadata = null;
    this.state = 'idle';
  }

  /**
   * Handle action captured by EventListener
   */
  private onActionCaptured(action: Action): void {
    // Only collect actions when actively recording
    if (this.state === 'recording') {
      this.actions.push(action);
      // Send to background immediately for persistent storage
      this.syncActionToBackground(action);
    }
  }

  /**
   * Send action to background script for persistent storage
   */
  private syncActionToBackground(action: Action): void {
    try {
      chrome.runtime.sendMessage(
        {
          type: 'SYNC_ACTION',
          payload: { action },
        },
        () => {
          // Callback ensures message is sent before page might navigate
          if (chrome.runtime.lastError) {
            console.error('[ActionRecorder] Sync error:', chrome.runtime.lastError);
          }
        }
      );
    } catch (error) {
      console.error('[ActionRecorder] Failed to sync action to background:', error);
    }
  }
}

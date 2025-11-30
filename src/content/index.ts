/**
 * Content Script - Main Entry Point
 * Integrates ActionRecorder with background script communication
 */

import { ActionRecorder } from './action-recorder';
import { RecordingIndicator } from './recording-indicator';
import type { Message, MessageResponse } from '@/types/messages';
import type { Recording } from '@/types';

// Only run in the main frame, not iframes
if (window.self !== window.top) {
  console.log('[Content] Skipping iframe');
} else {
  let recorder: ActionRecorder | null = null;
  let indicator: RecordingIndicator | null = null;
  let restorationComplete = false;
  let restorationPromise: Promise<void> | null = null;

  /**
   * Initialize recorder and restore state if needed
   */
  async function ensureRecorderReady(): Promise<void> {
    // If already restored, return immediately
    if (restorationComplete) {
      return;
    }

    // If restoration is in progress, wait for it
    if (restorationPromise) {
      return restorationPromise;
    }

    // Start restoration
    restorationPromise = (async () => {
      // Initialize recorder and indicator
      if (!recorder) {
        recorder = new ActionRecorder();
        console.log('[Content] ActionRecorder initialized');
      }
      if (!indicator) {
        indicator = new RecordingIndicator();
        console.log('[Content] RecordingIndicator initialized');
      }

      // Check if there's an active recording in background
      try {
        const response = await new Promise<MessageResponse>((resolve) => {
          chrome.runtime.sendMessage({ type: 'GET_STATUS' }, resolve);
        });

        console.log('[Content] Status check response:', response);

        if (response?.success && response.data) {
          const responseData = response.data as any;
          const { state: recordingState, metadata } = responseData;

          if ((recordingState === 'recording' || recordingState === 'paused') && metadata) {
            console.log(
              '[Content] Restoring recording state:',
              recordingState,
              'metadata:',
              metadata
            );

            // Restore recording in the recorder
            if (recorder && metadata.testName) {
              try {
                console.log('[Content] Calling recorder.restoreRecording with metadata:', metadata);
                recorder.restoreRecording(metadata);
                console.log(
                  '[Content] recorder.restoreRecording completed, isRecording:',
                  recorder.isRecording()
                );

                // Show indicator
                if (indicator) {
                  console.log('[Content] Showing recording indicator');
                  indicator.show(metadata.testName);

                  if (recordingState === 'paused') {
                    console.log('[Content] Setting paused state');
                    indicator.setPaused(true);
                    recorder.pauseRecording();
                  }
                }

                console.log('[Content] Recording state restored successfully');
              } catch (error) {
                console.error('[Content] Failed to restore recording state:', error);
              }
            }
          } else {
            console.log('[Content] No active recording to restore, state:', recordingState);
          }
        }
      } catch (error) {
        console.error('[Content] Failed to check recording status:', error);
      }

      restorationComplete = true;
    })();

    return restorationPromise;
  }

  /**
   * Handle messages from background script
   */
  chrome.runtime.onMessage.addListener(
    (
      message: Message,
      _sender: chrome.runtime.MessageSender,
      sendResponse: (response: MessageResponse) => void
    ) => {
      console.log('[Content] Received message:', message.type);

      // Ensure recorder is ready and state is restored before handling messages
      ensureRecorderReady()
        .then(() => {
          try {
            switch (message.type) {
              case 'START_RECORDING':
                if (!recorder || !indicator) {
                  sendResponse({
                    success: false,
                    error: 'Recorder not initialized',
                  });
                  return false;
                }

                try {
                  console.log(
                    '[Content] Starting recording with testName:',
                    message.payload.testName
                  );
                  recorder.startRecording(message.payload.testName);
                  console.log('[Content] Recording started, isRecording:', recorder.isRecording());

                  indicator.show(message.payload.testName);
                  console.log('[Content] Indicator shown');

                  sendResponse({
                    success: true,
                    data: {
                      state: 'recording',
                      testName: message.payload.testName,
                    },
                  });
                } catch (error) {
                  console.error('[Content] Error starting recording:', error);
                  sendResponse({
                    success: false,
                    error: (error as Error).message,
                  });
                }
                return false;

              case 'STOP_RECORDING':
                if (!recorder || !indicator) {
                  sendResponse({
                    success: false,
                    error: 'Recorder not initialized',
                  });
                  return false;
                }

                try {
                  const recording: Recording = recorder.stopRecording();
                  indicator.hide();
                  console.log('[Content] Recording stopped, indicator hidden');
                  sendResponse({
                    success: true,
                    data: recording,
                  });
                } catch (error) {
                  console.error('[Content] Error stopping recording:', error);
                  // Hide indicator even on error
                  indicator.hide();
                  sendResponse({
                    success: false,
                    error: (error as Error).message,
                  });
                }
                return false;

              case 'PAUSE_RECORDING':
                if (!recorder || !indicator) {
                  sendResponse({
                    success: false,
                    error: 'Recorder not initialized',
                  });
                  return false;
                }

                try {
                  recorder.pauseRecording();
                  indicator.setPaused(true);
                  sendResponse({
                    success: true,
                    data: { state: 'paused' },
                  });
                } catch (error) {
                  sendResponse({
                    success: false,
                    error: (error as Error).message,
                  });
                }
                return false;

              case 'RESUME_RECORDING':
                if (!recorder || !indicator) {
                  sendResponse({
                    success: false,
                    error: 'Recorder not initialized',
                  });
                  return false;
                }

                try {
                  recorder.resumeRecording();
                  indicator.setPaused(false);
                  sendResponse({
                    success: true,
                    data: { state: 'recording' },
                  });
                } catch (error) {
                  sendResponse({
                    success: false,
                    error: (error as Error).message,
                  });
                }
                return false;

              case 'GET_STATUS':
                if (!recorder) {
                  sendResponse({
                    success: true,
                    data: {
                      state: 'idle',
                      metadata: null,
                    },
                  });
                  return false;
                }

                sendResponse({
                  success: true,
                  data: {
                    state: recorder.getState(),
                    metadata: recorder.getMetadata(),
                  },
                });
                return false;

              case 'GET_RECORDING':
                if (!recorder || !recorder.isRecording()) {
                  sendResponse({
                    success: false,
                    error: 'No active recording',
                  });
                  return false;
                }

                const actionCount = recorder.getActionCount();

                sendResponse({
                  success: true,
                  data: {
                    actionCount,
                    actions: recorder.getActions(),
                    metadata: recorder.getMetadata(),
                  },
                });
                return false;

              case 'SAVE_CURRENT_STATE':
                // Save current actions to background before page unloads
                console.log('[Content] SAVE_CURRENT_STATE received');
                if (!recorder || !recorder.isRecording()) {
                  console.log('[Content] No active recording, sending empty actions');
                  sendResponse({ success: true, data: { actions: [] } });
                  return false;
                }

                const actionsToSave = recorder.getActions();
                console.log('[Content] Saving', actionsToSave.length, 'actions to background');
                sendResponse({
                  success: true,
                  data: {
                    actions: actionsToSave,
                    metadata: recorder.getMetadata(),
                  },
                });
                return false;

              default:
                sendResponse({
                  success: false,
                  error: `Unknown message type: ${message.type}`,
                });
                return false;
            }
          } catch (error) {
            console.error('[Content] Error handling message:', error);
            sendResponse({
              success: false,
              error: (error as Error).message,
            });
            return false;
          }
        })
        .catch((error) => {
          console.error('[Content] Error ensuring recorder ready:', error);
          sendResponse({
            success: false,
            error: 'Failed to initialize recorder',
          });
        });

      // Return true to indicate we'll send response asynchronously
      return true;
    }
  );

  /**
   * Cleanup on page unload
   */
  window.addEventListener('beforeunload', () => {
    // Detect if this is back/forward navigation
    const isBackForward = performance.navigation && performance.navigation.type === 2;

    // Save current state to background before unloading
    if (recorder && recorder.isRecording()) {
      console.log('[Content] Page unloading - saving state, back/forward:', isBackForward);

      // Note: Navigation action will be captured by background's chrome.tabs.onUpdated
      // No need to create it here as it would be redundant

      try {
        chrome.runtime.sendMessage({
          type: 'SAVE_CURRENT_STATE',
        });
      } catch (error) {
        console.error('[Content] Failed to save state on unload:', error);
      }
    }

    // Cleanup
    if (recorder) {
      recorder.destroy();
      recorder = null;
    }
    if (indicator) {
      indicator.hide();
      indicator = null;
    }

    // Reset restoration flag for next page
    restorationComplete = false;
    restorationPromise = null;
  });

  // Initialize and restore state on load
  ensureRecorderReady().then(() => {
    console.log('[Content] Content script loaded and ready');
  });
} // End of main frame check

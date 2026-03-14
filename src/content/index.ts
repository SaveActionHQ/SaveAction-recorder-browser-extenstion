/**
 * Content Script - Main Entry Point
 * Integrates ActionRecorder with background script communication
 *
 * Runs in both main frame and iframes (all_frames: true in manifest).
 * In iframes: only ActionRecorder is active (no overlay UI).
 * Actions captured inside iframes include frameUrl, frameId, and
 * frameSelector so the runner can switch to the correct frame.
 */

import { ActionRecorder } from './action-recorder';
import { RecordingIndicator } from './recording-indicator';
import { AssertionInspector } from './assertion-inspector';
import { VariableMarker } from './variable-marker';
import type { Message, MessageResponse } from '@/types/messages';
import type { Recording } from '@/types';

const isIframe = window.self !== window.top;

{
  let recorder: ActionRecorder | null = null;
  let indicator: RecordingIndicator | null = null;
  let assertionInspector: AssertionInspector | null = null;
  let variableMarker: VariableMarker | null = null;
  let restorationComplete = false;
  let restorationPromise: Promise<void> | null = null;

  const logPrefix = isIframe ? '[Content/iframe]' : '[Content]';

  // CRITICAL FIX: Buffer early clicks during initialization to prevent data loss
  let earlyClicksBuffer: MouseEvent[] = [];
  let isInitializing = true;

  // Capture clicks immediately (even before recorder is ready)
  document.addEventListener(
    'click',
    (event: MouseEvent) => {
      if (isInitializing && !restorationComplete) {
        console.log('[Content] Buffering early click during initialization');
        earlyClicksBuffer.push(event);
      }
    },
    true
  );

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
      // Initialize recorder (always needed — captures actions)
      if (!recorder) {
        recorder = new ActionRecorder();
        console.log(logPrefix, 'ActionRecorder initialized');
      }
      // UI components are only used in the main frame (not inside iframes)
      if (!isIframe) {
        if (!indicator) {
          indicator = new RecordingIndicator();
          console.log(logPrefix, 'RecordingIndicator initialized');
        }
        if (!variableMarker) {
          variableMarker = new VariableMarker();
          console.log(logPrefix, 'VariableMarker initialized');
        }
      }

      // Check if there's an active recording in background
      try {
        const response = await new Promise<MessageResponse>((resolve) => {
          chrome.runtime.sendMessage({ type: 'GET_STATUS' }, resolve);
        });

        console.log(logPrefix, 'Status check response:', response);

        if (response?.success && response.data) {
          const responseData = response.data as any;
          const { state: recordingState, metadata } = responseData;

          if ((recordingState === 'recording' || recordingState === 'paused') && metadata) {
            console.log(
              logPrefix,
              'Restoring recording state:',
              recordingState,
              'metadata:',
              metadata
            );

            // Restore recording in the recorder
            if (recorder && metadata.testName) {
              try {
                console.log(
                  logPrefix,
                  'Calling recorder.restoreRecording with metadata:',
                  metadata
                );
                recorder.restoreRecording(metadata);
                console.log(
                  logPrefix,
                  'recorder.restoreRecording completed, isRecording:',
                  recorder.isRecording()
                );

                // Show indicator (main frame only)
                if (!isIframe && indicator) {
                  console.log(logPrefix, 'Showing recording indicator');
                  indicator.show(metadata.testName);

                  if (recordingState === 'paused') {
                    console.log(logPrefix, 'Setting paused state');
                    indicator.setPaused(true);
                    recorder.pauseRecording();
                  }
                } else if (isIframe && recordingState === 'paused') {
                  // Pause recorder in iframe too (no indicator to set)
                  recorder.pauseRecording();
                }

                // Start variable marker on restored recording (main frame only)
                if (!isIframe && variableMarker) {
                  variableMarker.start();
                  recorder.setVariableMarker(variableMarker);
                }

                console.log(logPrefix, 'Recording state restored successfully');
              } catch (error) {
                console.error(logPrefix, 'Failed to restore recording state:', error);
              }
            }
          } else {
            console.log(logPrefix, 'No active recording to restore, state:', recordingState);
          }
        }
      } catch (error) {
        console.error(logPrefix, 'Failed to check recording status:', error);
      }

      restorationComplete = true;
      isInitializing = false;

      // CRITICAL FIX: Process buffered early clicks after initialization
      if (earlyClicksBuffer.length > 0 && recorder && recorder.isRecording()) {
        console.log(
          `${logPrefix} Processing ${earlyClicksBuffer.length} buffered clicks from initialization`
        );
        // Give recorder a moment to fully initialize, then replay buffered clicks
        setTimeout(() => {
          earlyClicksBuffer.forEach((event) => {
            // Manually trigger the click handler
            const clickEvent = new MouseEvent('click', event);
            event.target?.dispatchEvent(clickEvent);
          });
          earlyClicksBuffer = []; // Clear buffer
          console.log(logPrefix, 'Buffered clicks processed');
        }, 100);
      }
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
      console.log(logPrefix, 'Received message:', message.type);

      // Ensure recorder is ready and state is restored before handling messages
      ensureRecorderReady()
        .then(() => {
          try {
            switch (message.type) {
              case 'START_RECORDING':
                if (!recorder) {
                  sendResponse({
                    success: false,
                    error: 'Recorder not initialized',
                  });
                  return false;
                }

                try {
                  // If ensureRecorderReady() already restored recording state,
                  // skip startRecording() to avoid "already in progress" error
                  if (recorder.isRecording()) {
                    console.log(
                      logPrefix,
                      'Recording already restored by ensureRecorderReady, skipping startRecording'
                    );
                    sendResponse({
                      success: true,
                      data: {
                        state: 'recording',
                        testName: message.payload.testName,
                      },
                    });
                    return false;
                  }

                  console.log(
                    logPrefix,
                    'Starting recording with testName:',
                    message.payload.testName
                  );
                  recorder.startRecording(message.payload.testName);
                  console.log(logPrefix, 'Recording started, isRecording:', recorder.isRecording());

                  // Start variable marker for this recording session (main frame only)
                  if (!isIframe && variableMarker) {
                    variableMarker.clear();
                    variableMarker.start();
                    recorder.setVariableMarker(variableMarker);
                  }

                  // Show indicator (main frame only)
                  if (!isIframe && indicator) {
                    indicator.show(message.payload.testName);
                    console.log(logPrefix, 'Indicator shown');
                  }

                  sendResponse({
                    success: true,
                    data: {
                      state: 'recording',
                      testName: message.payload.testName,
                    },
                  });
                } catch (error) {
                  console.error(logPrefix, 'Error starting recording:', error);
                  sendResponse({
                    success: false,
                    error: (error as Error).message,
                  });
                }
                return false;

              case 'STOP_RECORDING':
                if (!recorder) {
                  sendResponse({
                    success: false,
                    error: 'Recorder not initialized',
                  });
                  return false;
                }

                try {
                  // In iframes, just stop the recorder — main frame handles the recording data
                  if (isIframe) {
                    recorder.destroy();
                    recorder = new ActionRecorder();
                    sendResponse({ success: true });
                  } else {
                    const recording: Recording = recorder.stopRecording();
                    if (indicator) indicator.hide();
                    if (variableMarker) {
                      variableMarker.stop();
                      variableMarker.clear();
                    }
                    console.log(logPrefix, 'Recording stopped, indicator hidden');
                    sendResponse({
                      success: true,
                      data: recording,
                    });
                  }
                } catch (error) {
                  console.error(logPrefix, 'Error stopping recording:', error);
                  if (!isIframe && indicator) indicator.hide();
                  sendResponse({
                    success: false,
                    error: (error as Error).message,
                  });
                }
                return false;

              case 'PAUSE_RECORDING':
                if (!recorder) {
                  sendResponse({
                    success: false,
                    error: 'Recorder not initialized',
                  });
                  return false;
                }

                try {
                  recorder.pauseRecording();
                  if (!isIframe && indicator) indicator.setPaused(true);
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
                if (!recorder) {
                  sendResponse({
                    success: false,
                    error: 'Recorder not initialized',
                  });
                  return false;
                }

                try {
                  recorder.resumeRecording();
                  if (!isIframe && indicator) indicator.setPaused(false);
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
                console.log(logPrefix, 'SAVE_CURRENT_STATE received');
                if (!recorder || !recorder.isRecording()) {
                  console.log(logPrefix, 'No active recording, sending empty actions');
                  sendResponse({ success: true, data: { actions: [] } });
                  return false;
                }

                const actionsToSave = recorder.getActions();
                console.log(logPrefix, 'Saving', actionsToSave.length, 'actions to background');
                sendResponse({
                  success: true,
                  data: {
                    actions: actionsToSave,
                    metadata: recorder.getMetadata(),
                  },
                });
                return false;

              case 'ENTER_ASSERTION_MODE':
                if (!assertionInspector) {
                  assertionInspector = new AssertionInspector();
                }
                // Pass recording start time for relative timestamps
                if (recorder) {
                  assertionInspector.setRecordingStartTime(recorder.recordingStartTime);
                }
                assertionInspector.enter((checkpointAction) => {
                  // Populate frame context for iframe assertions
                  if (isIframe) {
                    checkpointAction.frameUrl = window.location.href;
                    const frameEl = window.frameElement;
                    if (frameEl) {
                      checkpointAction.frameId =
                        frameEl.getAttribute('id') || frameEl.getAttribute('name') || undefined;
                      const esc =
                        typeof CSS !== 'undefined' && CSS.escape ? CSS.escape : (s: string) => s;
                      const id = frameEl.getAttribute('id');
                      const name = frameEl.getAttribute('name');
                      const src = frameEl.getAttribute('src');
                      if (id) {
                        checkpointAction.frameSelector = `#${esc(id)}`;
                      } else if (name) {
                        checkpointAction.frameSelector = `iframe[name="${esc(name)}"]`;
                      } else if (src) {
                        checkpointAction.frameSelector = `iframe[src="${esc(src)}"]`;
                      }
                    }
                  }

                  // Emit the checkpoint action through the recorder
                  if (recorder) {
                    try {
                      chrome.runtime.sendMessage(
                        {
                          type: 'SYNC_ACTION',
                          payload: { action: checkpointAction },
                        },
                        (resp) => {
                          if (chrome.runtime.lastError) {
                            console.error(
                              logPrefix,
                              'Assertion sync error:',
                              chrome.runtime.lastError
                            );
                          } else {
                            console.log(logPrefix, 'Assertion synced:', resp);
                          }
                        }
                      );
                    } catch (error) {
                      console.error(logPrefix, 'Failed to sync assertion:', error);
                    }
                  }
                });
                sendResponse({ success: true });
                return false;

              case 'EXIT_ASSERTION_MODE':
                if (assertionInspector) {
                  assertionInspector.exit();
                }
                sendResponse({ success: true });
                return false;

              default:
                sendResponse({
                  success: false,
                  error: `Unknown message type: ${message.type}`,
                });
                return false;
            }
          } catch (error) {
            console.error(logPrefix, 'Error handling message:', error);
            sendResponse({
              success: false,
              error: (error as Error).message,
            });
            return false;
          }
        })
        .catch((error) => {
          console.error(logPrefix, 'Error ensuring recorder ready:', error);
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
      console.log(logPrefix, 'Page unloading - saving state, back/forward:', isBackForward);

      // Note: Navigation action will be captured by background's chrome.tabs.onUpdated
      // No need to create it here as it would be redundant

      try {
        chrome.runtime.sendMessage({
          type: 'SAVE_CURRENT_STATE',
        });
      } catch (error) {
        console.error(logPrefix, 'Failed to save state on unload:', error);
      }
    }

    // Cleanup
    if (assertionInspector) {
      assertionInspector.exit();
      assertionInspector = null;
    }
    if (!isIframe && variableMarker) {
      variableMarker.stop();
      variableMarker = null;
    }
    if (recorder) {
      recorder.destroy();
      recorder = null;
    }
    if (!isIframe && indicator) {
      indicator.hide();
      indicator = null;
    }

    // Reset restoration flag for next page
    restorationComplete = false;
    restorationPromise = null;
  });

  // CRITICAL FIX: Initialize and restore state IMMEDIATELY on load (synchronous initialization)
  // This ensures event listeners are attached BEFORE user can interact with the page
  // Previously, async initialization caused race condition where clicks were lost
  (async () => {
    await ensureRecorderReady();
    console.log(logPrefix, 'Content script loaded and ready - event listeners active');
  })();

  // BACKUP: Also ensure ready on DOMContentLoaded (if script loads late)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      ensureRecorderReady();
    });
  }
}

/**
 * Background Service Worker
 * Manages communication between popup and content scripts
 * Maintains global recording state across tabs
 */

import type { Message, MessageResponse, StatusResponse, RecordingResponse } from '@/types/messages';
import type { Recording, RecordingMetadata } from '@/types/recording';
import { saveRecording } from '@/utils/storage';

/**
 * Global recording state managed by background script
 */
interface BackgroundState {
  isRecording: boolean;
  isPaused: boolean;
  testName: string | null;
  currentTabId: number | null;
  startTime: number | null; // Changed to number (timestamp)
  initialUrl: string | null; // Store the starting URL where recording began
  metadata: RecordingMetadata | null;
  accumulatedActions: any[]; // Store actions across page navigations
  actionCache: any[]; // Cache of last known actions from content script
  pollingInterval: NodeJS.Timeout | null; // Timer for periodic action syncing
  actionCounter: number; // Global action counter across all pages
}

/**
 * Initialize background state
 */
let state: BackgroundState = {
  isRecording: false,
  isPaused: false,
  testName: null,
  currentTabId: null,
  startTime: null,
  initialUrl: null,
  metadata: null,
  accumulatedActions: [],
  actionCache: [],
  pollingInterval: null,
  actionCounter: 0,
};

/**
 * Start polling storage for actions every 2 seconds
 */
function startActionPolling() {
  // Clear any existing polling
  if (state.pollingInterval) {
    clearInterval(state.pollingInterval);
  }

  console.log('[Background] Starting action polling every 2 seconds');

  // Poll storage every 2 seconds to update cache
  state.pollingInterval = setInterval(async () => {
    if (!state.isRecording || !state.currentTabId) {
      return;
    }

    try {
      // Read actions directly from chrome.storage.session
      const result = await chrome.storage.session.get('saveaction_current_actions');
      if (
        result['saveaction_current_actions'] &&
        Array.isArray(result['saveaction_current_actions'])
      ) {
        state.actionCache = result['saveaction_current_actions'];
        console.log(
          '[Background] Action cache updated from storage:',
          state.actionCache.length,
          'actions'
        );
      }
    } catch (error) {
      console.error('[Background] Failed to read actions from storage:', error);
    }
  }, 2000);
}

/**
 * Stop polling content script
 */
function stopActionPolling() {
  if (state.pollingInterval) {
    console.log('[Background] Stopping action polling');
    clearInterval(state.pollingInterval);
    state.pollingInterval = null;
  }
}

/**
 * Handle messages from popup and content scripts
 */
chrome.runtime.onMessage.addListener(
  (
    message: Message,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: MessageResponse) => void
  ) => {
    console.log('[Background] Received message:', message.type, message);

    // Handle message based on type
    switch (message.type) {
      case 'START_RECORDING':
        handleStartRecording(message.payload.testName, sender)
          .then(sendResponse)
          .catch((error) =>
            sendResponse({
              success: false,
              error: error.message,
            })
          );
        return true; // Keep channel open for async response

      case 'STOP_RECORDING':
        handleStopRecording(sender)
          .then(sendResponse)
          .catch((error) =>
            sendResponse({
              success: false,
              error: error.message,
            })
          );
        return true;

      case 'PAUSE_RECORDING':
        handlePauseRecording(sender)
          .then(sendResponse)
          .catch((error) =>
            sendResponse({
              success: false,
              error: error.message,
            })
          );
        return true;

      case 'RESUME_RECORDING':
        handleResumeRecording(sender)
          .then(sendResponse)
          .catch((error) =>
            sendResponse({
              success: false,
              error: error.message,
            })
          );
        return true;

      case 'GET_STATUS':
        sendResponse(handleGetStatus());
        return false;

      case 'GET_RECORDING':
        handleGetRecording(sender)
          .then(sendResponse)
          .catch((error) =>
            sendResponse({
              success: false,
              error: error.message,
            })
          );
        return true;

      case 'SAVE_CURRENT_STATE':
        handleSaveCurrentState(sender)
          .then(sendResponse)
          .catch((error) =>
            sendResponse({
              success: false,
              error: error.message,
            })
          );
        return true;

      case 'SYNC_ACTION':
        handleSyncAction(message.payload)
          .then(sendResponse)
          .catch((error) =>
            sendResponse({
              success: false,
              error: error.message,
            })
          );
        return true;

      default:
        sendResponse({
          success: false,
          error: `Unknown message type: ${message.type}`,
        });
        return false;
    }
  }
);

/**
 * Start recording in the current tab
 */
async function handleStartRecording(
  testName: string,
  _sender: chrome.runtime.MessageSender
): Promise<MessageResponse> {
  if (state.isRecording) {
    return {
      success: false,
      error: 'Recording is already in progress',
    };
  }

  // Get current tab
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tabs.length === 0) {
    return {
      success: false,
      error: 'No active tab found',
    };
  }

  const tabId = tabs[0]?.id;
  if (!tabId) {
    return {
      success: false,
      error: 'Invalid tab ID',
    };
  }

  const startTime = Date.now();
  const initialUrl = tabs[0]?.url || ''; // Capture initial URL where recording starts

  // Update state
  state.isRecording = true;
  state.isPaused = false;
  state.testName = testName;
  state.currentTabId = tabId;
  state.startTime = startTime;
  state.initialUrl = initialUrl; // Store initial URL
  state.metadata = null; // Will be populated from content script

  // Send message to content script to start recording
  try {
    await chrome.tabs.sendMessage(tabId, {
      type: 'START_RECORDING',
      payload: { testName },
    });

    // Start polling for actions
    startActionPolling();

    // Broadcast status update to popup
    broadcastStatusUpdate();

    return {
      success: true,
      data: { state: 'recording', testName },
    };
  } catch (error) {
    // Reset state on error
    resetState();
    return {
      success: false,
      error: `Failed to start recording: ${(error as Error).message}`,
    };
  }
}

/**
 * Stop recording and get the final recording
 */
async function handleStopRecording(
  _sender: chrome.runtime.MessageSender
): Promise<RecordingResponse> {
  console.log('[Background] handleStopRecording called, isRecording:', state.isRecording);

  if (!state.isRecording) {
    return {
      success: false,
      error: 'No active recording',
    };
  }

  const tabId = state.currentTabId;
  if (!tabId) {
    resetState();
    return {
      success: false,
      error: 'No active tab for recording',
    };
  }

  try {
    // Stop polling
    stopActionPolling();

    // Get final actions from storage (has correct renumbered IDs)
    let currentPageActions: any[] = [];
    try {
      const result = await chrome.storage.session.get('saveaction_current_actions');
      if (
        result['saveaction_current_actions'] &&
        Array.isArray(result['saveaction_current_actions'])
      ) {
        currentPageActions = result['saveaction_current_actions'];
        console.log('[Background] Got', currentPageActions.length, 'actions from storage');
      }
    } catch (error) {
      console.error('[Background] Failed to read final actions from storage:', error);
    }

    // Try to get recording metadata from content script
    try {
      const response = await chrome.tabs.sendMessage(tabId, {
        type: 'STOP_RECORDING',
      });

      if (response?.success && response.data) {
        const recording = response.data as Recording;

        // Use actions from storage (with correct IDs), not from content script
        recording.actions = currentPageActions;

        // Use the recording if we got one with valid data
        if (recording.id && recording.testName && recording.startTime) {
          console.log('[Background] Got recording metadata from content script');

          // Merge accumulated actions from previous pages
          if (state.accumulatedActions.length > 0) {
            console.log(
              '[Background] Merging',
              state.accumulatedActions.length,
              'accumulated actions'
            );
            recording.actions = [...state.accumulatedActions, ...currentPageActions];

            // Re-sort by timestamp
            recording.actions.sort((a, b) => a.timestamp - b.timestamp);
          }

          // Save recording to storage
          try {
            await saveRecording(recording);
            console.log('[Background] Recording saved to storage:', recording.id);
          } catch (storageError) {
            console.error('[Background] Failed to save recording:', storageError);
          }

          // Reset state
          resetState();
          broadcastStatusUpdate();

          return {
            success: true,
            data: recording,
          };
        }
      }
    } catch (contentError) {
      console.log('[Background] Could not get recording from content script:', contentError);
      // Continue and build recording from background state
    }

    // Content script couldn't provide recording (likely on a different page)
    // Build recording from background state
    console.log('[Background] Building recording from background state');

    if (!state.testName || !state.startTime || !state.initialUrl) {
      throw new Error('Missing recording metadata');
    }

    // Use the initial URL where recording started, not the current page URL
    const recording: Recording = {
      id: `rec_${Date.now()}`,
      version: '1.0.0',
      testName: state.testName,
      url: state.initialUrl, // Use stored initial URL
      startTime: new Date(state.startTime).toISOString(),
      endTime: new Date().toISOString(),
      viewport: {
        width: 1920,
        height: 1080,
      },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      actions: [...state.accumulatedActions, ...currentPageActions],
    };

    // Sort by timestamp
    recording.actions.sort((a, b) => a.timestamp - b.timestamp);

    console.log('[Background] Recording built with', recording.actions.length, 'total actions');

    // Save recording to storage
    try {
      await saveRecording(recording);
      console.log('[Background] Recording saved to storage:', recording.id);
    } catch (storageError) {
      console.error('[Background] Failed to save recording:', storageError);
    }

    // Reset state
    resetState();
    broadcastStatusUpdate();

    return {
      success: true,
      data: recording,
    };
  } catch (error) {
    console.error('[Background] Error stopping recording:', error);
    resetState();
    return {
      success: false,
      error: `Failed to stop recording: ${(error as Error).message}`,
    };
  }
}

/**
 * Pause recording
 */
async function handlePauseRecording(
  _sender: chrome.runtime.MessageSender
): Promise<MessageResponse> {
  if (!state.isRecording) {
    return {
      success: false,
      error: 'No active recording to pause',
    };
  }

  if (state.isPaused) {
    return {
      success: false,
      error: 'Recording is already paused',
    };
  }

  const tabId = state.currentTabId;
  if (!tabId) {
    return {
      success: false,
      error: 'No active tab for recording',
    };
  }

  try {
    await chrome.tabs.sendMessage(tabId, {
      type: 'PAUSE_RECORDING',
    });

    state.isPaused = true;
    broadcastStatusUpdate();

    return {
      success: true,
      data: { state: 'paused' },
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to pause recording: ${(error as Error).message}`,
    };
  }
}

/**
 * Resume recording
 */
async function handleResumeRecording(
  _sender: chrome.runtime.MessageSender
): Promise<MessageResponse> {
  if (!state.isRecording) {
    return {
      success: false,
      error: 'No active recording to resume',
    };
  }

  if (!state.isPaused) {
    return {
      success: false,
      error: 'Recording is not paused',
    };
  }

  const tabId = state.currentTabId;
  if (!tabId) {
    return {
      success: false,
      error: 'No active tab for recording',
    };
  }

  try {
    await chrome.tabs.sendMessage(tabId, {
      type: 'RESUME_RECORDING',
    });

    state.isPaused = false;
    broadcastStatusUpdate();

    return {
      success: true,
      data: { state: 'recording' },
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to resume recording: ${(error as Error).message}`,
    };
  }
}

/**
 * Get current recording status
 */
function handleGetStatus(): StatusResponse {
  const recordingState = state.isRecording ? (state.isPaused ? 'paused' : 'recording') : 'idle';

  // Calculate total action count (accumulated + current page cache)
  const totalActions = state.accumulatedActions.length + state.actionCache.length;

  // Include complete metadata for restoration (preserves initial URL)
  const metadata =
    state.isRecording && state.testName && state.startTime && state.initialUrl
      ? {
          id: `rec_${state.startTime}`,
          testName: state.testName,
          url: state.initialUrl, // Use initial URL, not current page URL
          startTime: new Date(state.startTime).toISOString(),
          viewport: {
            width: 1920,
            height: 1080,
          },
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          actionCount: totalActions,
        }
      : undefined;

  return {
    success: true,
    data: {
      state: recordingState,
      metadata: metadata as any,
    },
  };
}

/**
 * Get current recording from content script
 */
async function handleGetRecording(
  _sender: chrome.runtime.MessageSender
): Promise<RecordingResponse> {
  if (!state.isRecording) {
    return {
      success: false,
      error: 'No active recording',
    };
  }

  const tabId = state.currentTabId;
  if (!tabId) {
    return {
      success: false,
      error: 'No active tab for recording',
    };
  }

  try {
    const response = await chrome.tabs.sendMessage(tabId, {
      type: 'GET_RECORDING',
    });

    // Return the response directly (it contains actionCount and metadata)
    return response;
  } catch (error) {
    return {
      success: false,
      error: `Failed to get recording: ${(error as Error).message}`,
    };
  }
}

/**
 * Sync action from content script to persistent storage
 */
async function handleSyncAction(payload: { action: any }): Promise<MessageResponse> {
  if (!state.isRecording || !payload.action) {
    return { success: true };
  }

  try {
    // Increment global counter
    state.actionCounter++;

    // Renumber action with global counter
    const action = {
      ...payload.action,
      id: `act_${String(state.actionCounter).padStart(3, '0')}`,
    };

    // Read current actions from storage
    const result = await chrome.storage.session.get('saveaction_current_actions');
    const actions = result['saveaction_current_actions'] || [];

    // Add new action with corrected ID
    actions.push(action);

    // Save back to storage
    await chrome.storage.session.set({
      saveaction_current_actions: actions,
    });

    console.log('[Background] Synced action', action.id, 'to storage. Total:', actions.length);

    return { success: true };
  } catch (error) {
    console.error('[Background] Failed to sync action:', error);
    return { success: false, error: (error as Error).message };
  }
}

/**
 * Save current state from content script (called before navigation)
 */
/**
 * Save current state from content script (called before navigation)
 */
async function handleSaveCurrentState(
  _sender: chrome.runtime.MessageSender
): Promise<MessageResponse> {
  console.log('[Background] handleSaveCurrentState called, isRecording:', state.isRecording);

  if (!state.isRecording) {
    console.log('[Background] No recording active, skipping save');
    return { success: true };
  }

  const tabId = state.currentTabId;
  if (!tabId) {
    console.log('[Background] No tab ID, skipping save');
    return { success: true };
  }

  try {
    console.log('[Background] Sending SAVE_CURRENT_STATE to tab', tabId);
    const response = await chrome.tabs.sendMessage(tabId, {
      type: 'SAVE_CURRENT_STATE',
    });

    console.log('[Background] SAVE_CURRENT_STATE response:', response);

    if (response?.success && response.data && response.data.actions) {
      const newActions = response.data.actions;
      console.log('[Background] Received', newActions.length, 'actions from content script');

      if (newActions.length > 0) {
        console.log('[Background] Saving', newActions.length, 'actions before navigation');
        state.accumulatedActions = [...state.accumulatedActions, ...newActions];
        console.log('[Background] Total accumulated actions:', state.accumulatedActions.length);
      }
    } else {
      console.log('[Background] Invalid response or no actions:', response);
    }

    return { success: true };
  } catch (error) {
    console.log('[Background] Could not save state (content script may be unloading):', error);
    return { success: true }; // Don't fail on this
  }
}

/**
 * Broadcast status update to all connected popups
 */
function broadcastStatusUpdate(): void {
  const recordingState = state.isRecording ? (state.isPaused ? 'paused' : 'recording') : 'idle';

  chrome.runtime
    .sendMessage({
      type: 'STATUS_UPDATE',
      payload: {
        state: recordingState,
        metadata: state.metadata || undefined,
      },
    })
    .catch(() => {
      // Ignore errors if popup is not open
    });
}

/**
 * Reset state to idle
 */
function resetState(): void {
  // Stop polling if active
  if (state.pollingInterval) {
    clearInterval(state.pollingInterval);
  }

  state = {
    isRecording: false,
    isPaused: false,
    testName: null,
    currentTabId: null,
    startTime: null,
    initialUrl: null,
    metadata: null,
    accumulatedActions: [],
    actionCache: [],
    pollingInterval: null,
    actionCounter: 0,
  };
}

/**
 * Handle tab close - stop recording if the recording tab is closed
 */
chrome.tabs.onRemoved.addListener((tabId: number) => {
  if (state.currentTabId === tabId && state.isRecording) {
    console.log('[Background] Recording tab closed, stopping recording');
    resetState();
    broadcastStatusUpdate();
  }
});

/**
 * Handle tab updates - detect navigation in recording tab
 */
chrome.tabs.onUpdated.addListener(async (tabId: number, changeInfo: chrome.tabs.TabChangeInfo) => {
  if (
    state.currentTabId === tabId &&
    state.isRecording &&
    changeInfo.status === 'loading' &&
    changeInfo.url
  ) {
    console.log('[Background] Recording tab navigating to:', changeInfo.url);
    console.log('[Background] Current accumulated actions:', state.accumulatedActions.length);

    // Read fresh actions directly from storage (not from cache which might be stale)
    let currentPageActions: any[] = [];
    try {
      const result = await chrome.storage.session.get('saveaction_current_actions');
      if (
        result['saveaction_current_actions'] &&
        Array.isArray(result['saveaction_current_actions'])
      ) {
        currentPageActions = result['saveaction_current_actions'];
        console.log(
          '[Background] Read',
          currentPageActions.length,
          'actions from storage before navigation'
        );
      }
    } catch (error) {
      console.error('[Background] Failed to read storage during navigation:', error);
    }

    // Merge current page actions into accumulated
    if (currentPageActions.length > 0) {
      console.log('[Background] Merging', currentPageActions.length, 'actions before navigation');

      // Only add actions we don't already have (deduplication by timestamp)
      const existingTimestamps = new Set(state.accumulatedActions.map((a: any) => a.timestamp));
      const newActions = currentPageActions.filter(
        (a: any) => !existingTimestamps.has(a.timestamp)
      );

      if (newActions.length > 0) {
        state.accumulatedActions = [...state.accumulatedActions, ...newActions];
        console.log(
          '[Background] Added',
          newActions.length,
          'new actions. Total:',
          state.accumulatedActions.length
        );
      }
    }

    // Clear cache and storage after merging
    state.actionCache = [];
    try {
      await chrome.storage.session.remove('saveaction_current_actions');
      console.log('[Background] Cleared storage for new page');
    } catch (error) {
      console.error('[Background] Failed to clear storage:', error);
    }
  }

  // When page finishes loading, the new content script will call GET_STATUS
  // and restore the recording state
  if (state.currentTabId === tabId && state.isRecording && changeInfo.status === 'complete') {
    console.log(
      '[Background] Page load complete - accumulated actions:',
      state.accumulatedActions.length
    );
  }
});

console.log('[Background] SaveAction Recorder initialized');

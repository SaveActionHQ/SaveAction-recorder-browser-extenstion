/**
 * Background Service Worker
 * Manages communication between popup and content scripts
 * Maintains global recording state across tabs
 */

import type { Message, MessageResponse, StatusResponse, RecordingResponse } from '@/types/messages';
import type { Recording, RecordingMetadata, Variable } from '@/types/recording';
import type { InputAction } from '@/types/actions';
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
  previousUrl: string | null; // Track previous URL for back/forward navigation detection
  // Dimension data from initial page
  viewport: { width: number; height: number } | null;
  windowSize: { width: number; height: number } | null;
  screenSize: { width: number; height: number } | null;
  devicePixelRatio: number | null;
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
  previousUrl: null,
  viewport: null,
  windowSize: null,
  screenSize: null,
  devicePixelRatio: null,
};

/**
 * Restore state from storage on service worker startup
 */
async function restoreStateFromStorage() {
  try {
    const result = await chrome.storage.session.get([
      'saveaction_action_counter',
      'saveaction_recording_state',
      'saveaction_current_actions',
    ]);

    // Restore action counter
    if (typeof result['saveaction_action_counter'] === 'number') {
      state.actionCounter = result['saveaction_action_counter'];
      console.log('[Background] Restored action counter:', state.actionCounter);
    }

    // Restore recording state if exists
    if (result['saveaction_recording_state']) {
      const recordingState = result['saveaction_recording_state'];
      state.isRecording = recordingState.isRecording || false;
      state.isPaused = recordingState.isPaused || false;
      state.testName = recordingState.testName || null;
      state.currentTabId = recordingState.currentTabId || null;
      state.startTime = recordingState.startTime || null;
      state.initialUrl = recordingState.initialUrl || null;
      console.log('[Background] Restored recording state:', {
        isRecording: state.isRecording,
        testName: state.testName,
        actionCounter: state.actionCounter,
      });
    }

    // Restore accumulated actions
    if (
      result['saveaction_current_actions'] &&
      Array.isArray(result['saveaction_current_actions'])
    ) {
      state.actionCache = result['saveaction_current_actions'];
      console.log('[Background] Restored', state.actionCache.length, 'actions from storage');
    }

    // Resume polling if recording was active
    if (state.isRecording) {
      startActionPolling();
    }
  } catch (error) {
    console.error('[Background] Failed to restore state:', error);
  }
}

/**
 * Persist action counter to storage
 */
async function persistActionCounter() {
  try {
    await chrome.storage.session.set({
      saveaction_action_counter: state.actionCounter,
    });
  } catch (error) {
    console.error('[Background] Failed to persist action counter:', error);
  }
}

/**
 * Get highest action ID from existing actions (hybrid validation)
 */
function getMaxActionId(actions: any[]): number {
  if (!actions || actions.length === 0) return 0;

  const ids = actions
    .map((action) => {
      if (action.id && typeof action.id === 'string') {
        const match = action.id.match(/act_(\d+)/);
        return match ? parseInt(match[1], 10) : 0;
      }
      return 0;
    })
    .filter((id) => !isNaN(id));

  return ids.length > 0 ? Math.max(...ids) : 0;
}

// Restore state on service worker startup
restoreStateFromStorage();

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

      case 'SYNC_METADATA':
        // Store dimension data from content script
        if (message.payload) {
          state.viewport = message.payload.viewport;
          state.windowSize = message.payload.windowSize;
          state.screenSize = message.payload.screenSize;
          state.devicePixelRatio = message.payload.devicePixelRatio;
          console.log('[Background] Synced metadata:', message.payload);
        }
        sendResponse({ success: true });
        return false;

      case 'GET_ACTION_COUNTER':
        sendResponse({
          success: true,
          data: { counter: state.actionCounter },
        });
        return false;

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
  state.previousUrl = initialUrl; // Initialize previousUrl for navigation detection
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

          // Use accumulated actions (which already include current page actions via SYNC_ACTION)
          if (state.accumulatedActions.length > 0) {
            console.log(
              '[Background] Using',
              state.accumulatedActions.length,
              'accumulated actions (includes current page)'
            );
            recording.actions = [...state.accumulatedActions];

            // Re-sort by timestamp
            recording.actions.sort((a, b) => a.timestamp - b.timestamp);

            // ✅ OPTION B: Renumber actions sequentially after sorting
            // Ensures IDs match chronological order in final JSON (clean for open source)
            recording.actions.forEach((action, index) => {
              action.id = `act_${String(index + 1).padStart(3, '0')}`;
            });
          }

          // Extract variables from sensitive input actions
          recording.variables = extractVariablesFromActions(recording.actions);

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

    // Use stored dimensions or fall back to reasonable defaults
    const viewport = state.viewport || { width: 1920, height: 1080 };
    const windowSize = state.windowSize || { width: 1920, height: 1179 }; // ~99px for browser chrome
    const screenSize = state.screenSize || { width: 1920, height: 1080 };
    const devicePixelRatio = state.devicePixelRatio || 1;

    // ✅ FIX: Use accumulatedActions which already contains all actions from SYNC_ACTION
    // currentPageActions is redundant and causes duplication since SYNC_ACTION already
    // adds every action to both session storage AND accumulatedActions
    // Using accumulatedActions ensures proper ordering and eliminates duplicates
    const recording: Recording = {
      id: `rec_${Date.now()}`,
      version: '1.0.0',
      testName: state.testName,
      url: state.initialUrl, // Use stored initial URL
      startTime: new Date(state.startTime).toISOString(),
      endTime: new Date().toISOString(),
      viewport,
      windowSize,
      screenSize,
      devicePixelRatio,
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      actions: [...state.accumulatedActions], // Use accumulated actions only (no duplication)
      variables: [], // Will be populated below
    };

    // Sort by timestamp
    recording.actions.sort((a, b) => a.timestamp - b.timestamp);

    // ✅ OPTION B: Renumber actions sequentially after sorting
    // Ensures IDs match chronological order in final JSON (clean for open source)
    recording.actions.forEach((action, index) => {
      action.id = `act_${String(index + 1).padStart(3, '0')}`;
    });

    // Extract variables from sensitive input actions
    recording.variables = extractVariablesFromActions(recording.actions);

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
          viewport: state.viewport || { width: 1920, height: 1080 },
          windowSize: state.windowSize || { width: 1920, height: 1179 },
          screenSize: state.screenSize || { width: 1920, height: 1080 },
          devicePixelRatio: state.devicePixelRatio || 1,
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
 * ✅ BUG FIX #4: ActionQueue to prevent race conditions
 * Sequential processing ensures no ID collisions from concurrent SYNC_ACTION messages
 */
class ActionQueue {
  private queue: Array<{
    action: any;
    resolve: (value: MessageResponse) => void;
    reject: (error: Error) => void;
  }> = [];
  private processing = false;

  async add(action: any): Promise<MessageResponse> {
    return new Promise((resolve, reject) => {
      this.queue.push({ action, resolve, reject });
      this.process();
    });
  }

  private async process(): Promise<void> {
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;

    while (this.queue.length > 0) {
      const item = this.queue.shift();
      if (!item) break;

      try {
        const result = await this.processAction(item.action);
        item.resolve(result);
      } catch (error) {
        item.reject(error as Error);
      }
    }

    this.processing = false;
  }

  private async processAction(action: any): Promise<MessageResponse> {
    if (!state.isRecording) {
      return { success: true };
    }

    try {
      // Read current actions from storage
      const result = await chrome.storage.session.get('saveaction_current_actions');
      const actions = result['saveaction_current_actions'] || [];

      // Hybrid validation: ensure counter is never less than max existing ID
      const maxExistingId = getMaxActionId(actions);
      if (state.actionCounter < maxExistingId) {
        console.log(
          '[Background] Counter drift detected. Adjusting from',
          state.actionCounter,
          'to',
          maxExistingId
        );
        state.actionCounter = maxExistingId;
      }

      // Increment global counter
      state.actionCounter++;

      // Renumber action with global counter
      const numberedAction = {
        ...action,
        id: `act_${String(state.actionCounter).padStart(3, '0')}`,
      };

      // Add new action with corrected ID
      actions.push(numberedAction);

      // ✅ BUG FIX #1: Removed duplicate push - accumulatedActions is already updated at line 512
      // state.accumulatedActions.push(action); // REMOVED to prevent duplication

      // Save actions and counter to storage
      await chrome.storage.session.set({
        saveaction_current_actions: actions,
        saveaction_action_counter: state.actionCounter,
      });

      console.log(
        '[Background] Synced action',
        numberedAction.id,
        'to storage. Total:',
        actions.length
      );

      return { success: true, data: { actionId: numberedAction.id, counter: state.actionCounter } };
    } catch (error) {
      console.error('[Background] Failed to sync action:', error);
      return { success: false, error: (error as Error).message };
    }
  }
}

// Initialize action queue
const actionQueue = new ActionQueue();

/**
 * Sync action from content script to persistent storage
 * ✅ BUG FIX #4: Uses ActionQueue for sequential processing
 */
async function handleSyncAction(payload: { action: any }): Promise<MessageResponse> {
  if (!state.isRecording || !payload.action) {
    return { success: true };
  }

  // Use queue to prevent race conditions
  return actionQueue.add(payload.action);
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
async function resetState(): Promise<void> {
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
    viewport: null,
    windowSize: null,
    screenSize: null,
    devicePixelRatio: null,
    accumulatedActions: [],
    actionCache: [],
    pollingInterval: null,
    actionCounter: 0,
    previousUrl: null,
  };

  // Clear storage
  try {
    await chrome.storage.session.remove([
      'saveaction_recording_state',
      'saveaction_current_actions',
      'saveaction_action_counter',
    ]);
    console.log('[Background] Storage cleared');
  } catch (error) {
    console.error('[Background] Failed to clear storage:', error);
  }
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
 * 🔧 OPTION C FIX: Detect at 'complete' and read from storage (not in-memory state)
 * This eliminates race conditions because:
 * 1. Page is fully loaded - all Chrome messages processed
 * 2. Storage is the single source of truth (not stale in-memory state)
 * 3. No timing dependencies - browser-native event guarantees order
 */
chrome.tabs.onUpdated.addListener(async (tabId: number, changeInfo: chrome.tabs.TabChangeInfo) => {
  // Log all tab updates for debugging
  if (state.currentTabId === tabId && state.isRecording) {
    console.log('[Background] Tab updated:', {
      status: changeInfo.status,
      url: changeInfo.url,
      hasUrl: !!changeInfo.url,
    });
  }

  if (state.currentTabId === tabId && state.isRecording && changeInfo.status === 'complete') {
    // Get the full tab object to access current URL (changeInfo.url is undefined at 'complete')
    const tab = await chrome.tabs.get(tabId);
    const currentUrl = tab.url;

    console.log('[Background] Page load complete:', currentUrl);

    // 🔧 STEP 1: First, read and merge actions from previous page BEFORE creating navigation action
    // This ensures we have all actions (including submit) before detecting navigation trigger
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
          'actions from storage at page complete'
        );

        // Merge into accumulatedActions immediately
        const existingIds = new Set(state.accumulatedActions.map((a: any) => a.id));
        const newActions = currentPageActions.filter((a: any) => !existingIds.has(a.id));

        if (newActions.length > 0) {
          state.accumulatedActions = [...state.accumulatedActions, ...newActions];
          console.log(
            '[Background] Merged',
            newActions.length,
            'actions. Total:',
            state.accumulatedActions.length
          );
        }
      }
    } catch (error) {
      console.error('[Background] Failed to read storage at page complete:', error);
    }

    // 🔧 STEP 2: Now detect navigation trigger using merged accumulatedActions
    // Detect back/forward navigation by URL change
    if (state.previousUrl && state.previousUrl !== currentUrl) {
      console.log('[Background] URL changed from', state.previousUrl, 'to', currentUrl);

      // Use accumulatedActions which now includes all actions from previous page
      const recentActions = state.accumulatedActions.slice(-10); // Last 10 actions for context

      console.log('[Background] Total accumulated actions:', state.accumulatedActions.length);
      console.log(
        '[Background] Last 5 actions:',
        recentActions
          .slice(-5)
          .map((a) => `${a.id}:${a.type}@${a.timestamp}`)
          .join(', ')
      );

      // 🔧 FIXED: Smart Navigation Trigger Detection
      // Correctly identifies form submissions, back/forward, and regular navigations
      const FORM_SUBMIT_WINDOW = 5000; // 5 seconds
      const LINK_CLICK_WINDOW = 3000; // 3 seconds

      let navigationTrigger: 'back' | 'forward' | 'form-submit' | 'click' | 'redirect' | 'manual' =
        'back';
      let relatedActionId: string | undefined;

      // Get recent actions from storage (reliable source, guaranteed complete at page load)

      // Calculate current relative timestamp
      const currentRelativeTime = state.startTime ? Date.now() - state.startTime : Date.now();

      // 1. CHECK: Was there a recent form submission? (HIGHEST PRIORITY)
      const recentSubmit = recentActions
        .slice()
        .reverse()
        .find((action) => {
          const timeDiff = currentRelativeTime - action.timestamp;
          return action.type === 'submit' && timeDiff < FORM_SUBMIT_WINDOW;
        });

      if (recentSubmit) {
        navigationTrigger = 'form-submit';
        relatedActionId = recentSubmit.id;
        console.log('[Background] ✓ Form submit detected, navigation triggered by form');
      }
      // 2. CHECK: Was there a recent submit button click?
      else {
        const recentSubmitClick = recentActions
          .slice()
          .reverse()
          .find((action) => {
            const timeDiff = currentRelativeTime - action.timestamp;
            return (
              action.type === 'click' &&
              'context' in action &&
              action.context?.navigationIntent === 'submit-form' &&
              timeDiff < FORM_SUBMIT_WINDOW
            );
          });

        if (recentSubmitClick) {
          navigationTrigger = 'form-submit';
          relatedActionId = recentSubmitClick.id;
          console.log('[Background] ✓ Submit button click detected, navigation triggered by form');
        }
        // 3. CHECK: Link click navigation
        else {
          const recentLinkClick = recentActions
            .slice()
            .reverse()
            .find((action) => {
              const timeDiff = currentRelativeTime - action.timestamp;
              return (
                action.type === 'click' &&
                'tagName' in action &&
                (action.tagName === 'a' || action.tagName === 'img') &&
                timeDiff < LINK_CLICK_WINDOW
              );
            });

          if (recentLinkClick) {
            navigationTrigger = 'click';
            relatedActionId = recentLinkClick.id;
            console.log('[Background] ✓ Link click navigation detected');
          }
          // 4. CHECK: URL direction to distinguish back from forward
          else {
            // Check if URL is going backward (previous URL seen before current URL)
            const isGoingBackward = state.previousUrl && currentUrl !== state.initialUrl;

            if (isGoingBackward) {
              navigationTrigger = 'back';
              console.log('[Background] ✓ Browser back navigation detected');
            } else {
              // Could be forward or first-time navigation
              navigationTrigger = 'manual';
              console.log('[Background] ⚠️ Manual/forward navigation (no trigger action found)');
            }
          }
        }
      }

      // Create navigation action with RELATIVE timestamp and proper metadata
      const relativeTimestamp = state.startTime ? Date.now() - state.startTime : Date.now();
      const navigationAction: any = {
        id: `act_${String(state.actionCounter + 1).padStart(3, '0')}`, // Will be renumbered
        type: 'navigation',
        timestamp: relativeTimestamp,
        completedAt: relativeTimestamp, // Will be updated when navigation completes
        url: currentUrl,
        from: state.previousUrl,
        to: currentUrl,
        navigationTrigger,
        waitUntil: 'load',
        duration: 0, // Will be calculated from actual page load
      };

      // Add relatedAction if we found one
      if (relatedActionId) {
        navigationAction.relatedAction = relatedActionId;
      }

      console.log(
        '[Background] Navigation action created:',
        '| Trigger:',
        navigationTrigger,
        '| From:',
        state.previousUrl,
        '| To:',
        currentUrl,
        '| Related:',
        relatedActionId || 'none'
      );

      // Add navigation action to accumulated actions
      // It will be included in the final export since export uses accumulatedActions
      state.accumulatedActions.push(navigationAction);
      state.actionCounter++;
      await persistActionCounter();

      console.log(
        '[Background] Created navigation action:',
        navigationAction.id,
        'trigger:',
        navigationTrigger,
        '| Total actions:',
        state.accumulatedActions.length
      );
    }

    // Update previous URL for next navigation
    state.previousUrl = currentUrl || null;

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

/**
 * Extract variable definitions from actions
 * Scans all InputAction items and collects unique variables
 */
function extractVariablesFromActions(actions: any[]): Variable[] {
  const variableMap = new Map<string, Variable>();

  for (const action of actions) {
    // Only process input actions with variables
    if (action.type === 'input' && action.variableName && action.isSensitive) {
      const inputAction = action as InputAction;
      const variableName = inputAction.variableName;

      // Type guard: variableName must be defined here
      if (!variableName) continue;

      // Skip if we already have this variable
      if (variableMap.has(variableName)) {
        continue;
      }

      // Get the primary selector (prefer id, dataTestId, or css)
      let selectorString = '';
      if (inputAction.selector) {
        if (inputAction.selector.id) {
          selectorString = `#${inputAction.selector.id}`;
        } else if (inputAction.selector.dataTestId) {
          selectorString = `[data-testid="${inputAction.selector.dataTestId}"]`;
        } else if (inputAction.selector.css) {
          selectorString = inputAction.selector.css;
        }
      }

      // Create variable definition
      const variable: Variable = {
        name: variableName,
        description: `${inputAction.inputType} field${selectorString ? ` (${selectorString})` : ''}`,
        fieldType: inputAction.inputType,
        selector: selectorString,
        placeholder: `\${${variableName}}`,
      };

      variableMap.set(variableName, variable);
    }
  }

  return Array.from(variableMap.values());
}

console.log('[Background] SaveAction Recorder initialized');

/**
 * Background Service Worker
 * Manages communication between popup and content scripts
 * Maintains global recording state across tabs
 */

import type { Message, MessageResponse, StatusResponse, RecordingResponse } from '@/types/messages';
import type { Recording, RecordingMetadata, Variable } from '@/types/recording';
import type { InputAction, TabAction } from '@/types/actions';
import { saveRecording } from '@/utils/storage';
import { downloadRecording } from '@/utils/exporter';
import { detectNavigationAttribution } from '@/utils/navigation-attribution';
import { loadSettings, uploadRecording as uploadToPlatform } from '@/platform/api';
import { hasActiveConnection, parseTags } from '@/types/settings';

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
  previousUrl: string | null; // Track previous URL for back/forward navigation detection (primary tab)
  tabPreviousUrls: Map<number, string>; // Per-tab URL tracking for multi-tab navigation detection
  // Dimension data from initial page
  viewport: { width: number; height: number } | null;
  windowSize: { width: number; height: number } | null;
  screenSize: { width: number; height: number } | null;
  devicePixelRatio: number | null;
  // Last upload result to show in popup
  lastUploadResult: {
    success: boolean;
    error?: string;
    recordingName?: string;
    timestamp: number;
  } | null;
  // User-marked variables from the variable marker
  markedVariables: Array<{
    variableName: string;
    selector: string;
    fieldType: string;
    defaultValue: string;
  }>;
  // Multi-tab tracking
  tabCounter: number; // Sequential tab index counter
  tabIndexMap: Map<number, number>; // chrome tab ID → sequential tabIndex
  activeTabId: number | null; // Currently focused tracked tab
  lastClosedTabIndex: number | null; // Index of the last closed tab (for switch-after-close)
  pendingWindowOpen: { url: string; timestamp: number } | null; // Pending window.open correlation
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
  tabPreviousUrls: new Map(),
  viewport: null,
  windowSize: null,
  screenSize: null,
  devicePixelRatio: null,
  lastUploadResult: null,
  markedVariables: [],
  tabCounter: 0,
  tabIndexMap: new Map(),
  activeTabId: null,
  lastClosedTabIndex: null as number | null,
  pendingWindowOpen: null,
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

      case 'STOP_AND_UPLOAD':
        handleStopAndUpload(sender, message.payload)
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

      case 'GET_LAST_UPLOAD_RESULT':
        sendResponse({
          success: true,
          data: state.lastUploadResult,
        });
        // Clear result after reading
        state.lastUploadResult = null;
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
        // Stamp tabIndex from sender's tab before queuing
        if (message.payload?.action && sender.tab?.id !== undefined) {
          const senderTabIndex = state.tabIndexMap.get(sender.tab.id);
          if (senderTabIndex !== undefined) {
            message.payload.action.tabIndex = senderTabIndex;
          }
        }
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

      case 'ENTER_ASSERTION_MODE':
        handleEnterAssertionMode(sender)
          .then(sendResponse)
          .catch((error) =>
            sendResponse({
              success: false,
              error: error.message,
            })
          );
        return true;

      case 'EXIT_ASSERTION_MODE':
        handleExitAssertionMode(sender)
          .then(sendResponse)
          .catch((error) =>
            sendResponse({
              success: false,
              error: error.message,
            })
          );
        return true;

      case 'MARK_VARIABLE':
        if (state.isRecording && message.payload) {
          const mv = message.payload;
          const idx = state.markedVariables.findIndex((v) => v.variableName === mv.variableName);
          if (idx >= 0) {
            state.markedVariables[idx] = mv;
          } else {
            state.markedVariables.push(mv);
          }
          console.log('[Background] Variable marked:', mv.variableName);
        }
        sendResponse({ success: true, data: state.markedVariables });
        return false;

      case 'UNMARK_VARIABLE':
        if (state.isRecording && message.payload) {
          const varName = message.payload.variableName;
          state.markedVariables = state.markedVariables.filter((v) => v.variableName !== varName);
          console.log('[Background] Variable removed:', varName);
        }
        sendResponse({ success: true, data: state.markedVariables });
        return false;

      case 'GET_VARIABLES':
        sendResponse({ success: true, data: state.markedVariables });
        return false;

      case 'GET_TAB_INDEX': {
        const senderTabId = sender.tab?.id;
        if (senderTabId && state.tabIndexMap.has(senderTabId)) {
          sendResponse({ success: true, data: { tabIndex: state.tabIndexMap.get(senderTabId) } });
        } else {
          sendResponse({ success: true, data: { tabIndex: 0 } });
        }
        return false;
      }

      case 'WINDOW_OPENED':
        if (state.isRecording && message.payload?.url) {
          state.pendingWindowOpen = {
            url: String(message.payload.url),
            timestamp: Date.now(),
          };
          console.log('[Background] window.open() detected, url:', message.payload.url);
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
  }
);

/**
 * Ensure the content script is injected on the given tab.
 * Tries a lightweight ping first; if no listener responds,
 * programmatically injects the content script bundle.
 */
async function ensureContentScriptInjected(tabId: number): Promise<void> {
  // The manifest already injects content/index.ts into all frames at document_end.
  // Only inject programmatically as a fallback for edge cases (e.g., chrome:// → http:// transition).
  // Send to the specific main frame (frameId: 0) to avoid ambiguity with iframe responses.
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'GET_STATUS' }, { frameId: 0 });
    // Content script already running in main frame
    return;
  } catch {
    console.log('[Background] Content script not found in main frame, injecting programmatically');
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: false },
      files: ['content/index.js'],
    });
    // Give the script a moment to initialise its listener
    await new Promise((resolve) => setTimeout(resolve, 150));
  } catch (error) {
    console.log('[Background] Programmatic injection failed (page may not support it):', error);
  }
}

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

  // Initialize multi-tab tracking
  state.tabCounter = 0;
  state.tabIndexMap = new Map();
  state.tabIndexMap.set(tabId, 0); // Recording tab = tab 0
  state.activeTabId = tabId;
  state.pendingWindowOpen = null;
  state.tabPreviousUrls = new Map();
  state.tabPreviousUrls.set(tabId, initialUrl);

  // Ensure content script is loaded, then start recording
  try {
    await ensureContentScriptInjected(tabId);

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
      // Send STOP_RECORDING to all tracked tabs
      const stopPromises: Promise<any>[] = [];
      for (const [trackedTabId] of state.tabIndexMap) {
        if (trackedTabId !== tabId) {
          stopPromises.push(
            chrome.tabs.sendMessage(trackedTabId, { type: 'STOP_RECORDING' }).catch(() => {})
          );
        }
      }
      // Wait for non-primary tabs to stop (best effort)
      await Promise.allSettled(stopPromises);

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

            // Deduplicate before sorting/renumbering
            recording.actions = deduplicateActions(recording.actions);

            // Re-sort by timestamp
            recording.actions.sort((a, b) => a.timestamp - b.timestamp);

            // Renumber actions sequentially after sorting
            recording.actions.forEach((action, index) => {
              action.id = `act_${String(index + 1).padStart(3, '0')}`;
            });
          }

          // Backfill variableName on input actions from user-marked variables
          backfillVariableNames(recording.actions);

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
      actions: [...state.accumulatedActions],
      variables: [], // Will be populated below
    };

    // Deduplicate before sorting/renumbering
    recording.actions = deduplicateActions(recording.actions);

    // Sort by timestamp
    recording.actions.sort((a, b) => a.timestamp - b.timestamp);

    // Renumber actions sequentially after sorting
    recording.actions.forEach((action, index) => {
      action.id = `act_${String(index + 1).padStart(3, '0')}`;
    });

    // Backfill variableName on input actions from user-marked variables
    backfillVariableNames(recording.actions);

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
 * Stop recording and upload to platform
 * Used by the overlay save button
 */
async function handleStopAndUpload(
  sender: chrome.runtime.MessageSender,
  payload?: { openPopup?: boolean }
): Promise<MessageResponse> {
  console.log('[Background] handleStopAndUpload called, payload:', payload);

  // First, stop the recording
  const stopResult = await handleStopRecording(sender);

  if (!stopResult.success || !stopResult.data) {
    // Show error notification
    chrome.notifications.create('save-error', {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icon-48.png'),
      title: 'SaveAction - Error',
      message: stopResult.error || 'Failed to stop recording',
    });
    return {
      success: false,
      error: stopResult.error || 'Failed to stop recording',
    };
  }

  const recording = stopResult.data;

  // Try to upload to platform
  try {
    const settings = await loadSettings();

    if (!settings.platformUrl || !hasActiveConnection(settings)) {
      console.log('[Background] Platform not configured, downloading locally');
      // Auto-download the recording
      await downloadRecording(recording);
      // Store result
      state.lastUploadResult = {
        success: false,
        error: 'Platform not configured. Recording downloaded locally.',
        recordingName: recording.testName,
        timestamp: Date.now(),
      };
      // Show notification
      chrome.notifications.create('upload-info', {
        type: 'basic',
        iconUrl: chrome.runtime.getURL('icon-48.png'),
        title: 'SaveAction',
        message: 'Recording downloaded. Configure platform settings for cloud upload.',
      });
      // Open popup if requested
      if (payload?.openPopup) {
        chrome.action.openPopup();
      }
      return {
        success: true,
        data: recording,
      };
    }

    // Check if project is selected (required for upload)
    if (!settings.selectedProjectId) {
      console.log('[Background] No project selected, downloading locally');
      // Auto-download the recording
      await downloadRecording(recording);
      state.lastUploadResult = {
        success: false,
        error: 'No project selected. Recording downloaded locally.',
        recordingName: recording.testName,
        timestamp: Date.now(),
      };
      chrome.notifications.create('upload-info', {
        type: 'basic',
        iconUrl: chrome.runtime.getURL('icon-48.png'),
        title: 'SaveAction',
        message: 'Recording downloaded. Select a project in settings for cloud upload.',
      });
      if (payload?.openPopup) {
        chrome.action.openPopup();
      }
      return {
        success: true,
        data: recording,
        error: 'No project selected',
      };
    }

    console.log('[Background] Uploading to platform...');
    const tags = parseTags(settings.defaultTags);

    const uploadResult = await uploadToPlatform(recording, tags, settings.selectedProjectId);

    if (uploadResult.success) {
      console.log('[Background] Upload successful:', uploadResult.recordingId);
      // Store result
      state.lastUploadResult = {
        success: true,
        recordingName: uploadResult.recordingName || recording.testName,
        timestamp: Date.now(),
      };
      // Show success notification
      chrome.notifications.create('upload-success', {
        type: 'basic',
        iconUrl: chrome.runtime.getURL('icon-48.png'),
        title: 'SaveAction',
        message: `Recording "${uploadResult.recordingName || recording.testName}" uploaded to platform`,
      });
      // Open popup if requested
      if (payload?.openPopup) {
        chrome.action.openPopup();
      }
      return {
        success: true,
        data: recording,
      };
    } else {
      console.error('[Background] Upload failed:', uploadResult.error);
      // Auto-download the recording as fallback
      await downloadRecording(recording);
      // Store result
      state.lastUploadResult = {
        success: false,
        error: `${uploadResult.error} Recording downloaded locally.`,
        recordingName: recording.testName,
        timestamp: Date.now(),
      };
      // Show error notification
      chrome.notifications.create('upload-error', {
        type: 'basic',
        iconUrl: chrome.runtime.getURL('icon-48.png'),
        title: 'SaveAction - Upload Failed',
        message: `${uploadResult.error || 'Unknown error'}. Recording downloaded.`,
      });
      // Open popup if requested
      if (payload?.openPopup) {
        chrome.action.openPopup();
      }
      return {
        success: true,
        data: recording,
        error: uploadResult.error,
      };
    }
  } catch (error) {
    console.error('[Background] Upload error:', error);
    // Auto-download the recording as fallback
    await downloadRecording(recording);
    // Store result
    state.lastUploadResult = {
      success: false,
      error: `${(error as Error).message} Recording downloaded locally.`,
      recordingName: recording.testName,
      timestamp: Date.now(),
    };
    // Show error notification
    chrome.notifications.create('upload-error', {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icon-48.png'),
      title: 'SaveAction - Upload Failed',
      message: `${(error as Error).message}. Recording downloaded.`,
    });
    // Open popup if requested
    if (payload?.openPopup) {
      chrome.action.openPopup();
    }
    return {
      success: true,
      data: recording,
      error: (error as Error).message,
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
 * Send a message to all frames (main + iframes) in a tab.
 * Uses chrome.webNavigation.getAllFrames to discover every frame,
 * then sends individually so each frame's listener fires reliably.
 */
async function sendMessageToAllFrames(
  tabId: number,
  message: Record<string, unknown>
): Promise<void> {
  const frames = await chrome.webNavigation.getAllFrames({ tabId });
  if (!frames || frames.length === 0) return;

  const results = await Promise.allSettled(
    frames.map((frame) => chrome.tabs.sendMessage(tabId, message, { frameId: frame.frameId }))
  );

  // Log any per-frame failures for debugging, but don't fail the whole operation
  for (const result of results) {
    if (result.status === 'rejected') {
      console.warn('[Background] Frame message failed:', result.reason);
    }
  }
}

/**
 * Enter assertion mode — auto-pauses recording and tells content script to activate inspector.
 */
async function handleEnterAssertionMode(
  _sender: chrome.runtime.MessageSender
): Promise<MessageResponse> {
  if (!state.isRecording) {
    return { success: false, error: 'No active recording' };
  }

  // Use the currently active tracked tab (not necessarily the original recording tab)
  const tabId = state.activeTabId || state.currentTabId;
  if (!tabId) {
    return { success: false, error: 'No active tab for recording' };
  }

  // Pause recording if not already paused (ALL tracked tabs, not just active)
  if (!state.isPaused) {
    try {
      const pausePromises: Promise<any>[] = [];
      for (const [trackedTabId] of state.tabIndexMap) {
        pausePromises.push(
          sendMessageToAllFrames(trackedTabId, { type: 'PAUSE_RECORDING' }).catch(() => {})
        );
      }
      await Promise.allSettled(pausePromises);
      state.isPaused = true;
      broadcastStatusUpdate();
    } catch (error) {
      return {
        success: false,
        error: `Failed to pause for assertion mode: ${(error as Error).message}`,
      };
    }
  }

  // Tell ALL frames of the ACTIVE tab to enter assertion inspector
  try {
    await sendMessageToAllFrames(tabId, { type: 'ENTER_ASSERTION_MODE' });
    return { success: true, data: { state: 'assertion-mode' } };
  } catch (error) {
    return {
      success: false,
      error: `Failed to enter assertion mode: ${(error as Error).message}`,
    };
  }
}

/**
 * Exit assertion mode — resume recording after assertion is added or cancelled.
 */
async function handleExitAssertionMode(
  _sender: chrome.runtime.MessageSender
): Promise<MessageResponse> {
  if (!state.isRecording) {
    return { success: false, error: 'No active recording' };
  }

  // Use the currently active tracked tab (matches enter assertion mode)
  const tabId = state.activeTabId || state.currentTabId;
  if (!tabId) {
    return { success: false, error: 'No active tab for recording' };
  }

  // Tell ALL frames to exit assertion inspector
  try {
    await sendMessageToAllFrames(tabId, { type: 'EXIT_ASSERTION_MODE' });
  } catch (error) {
    console.warn('[Background] Some frames failed to exit assertion mode:', error);
  }

  // Resume recording in ALL tracked tabs (not just active)
  if (state.isPaused) {
    try {
      const resumePromises: Promise<any>[] = [];
      for (const [trackedTabId] of state.tabIndexMap) {
        resumePromises.push(
          sendMessageToAllFrames(trackedTabId, { type: 'RESUME_RECORDING' }).catch(() => {})
        );
      }
      await Promise.allSettled(resumePromises);
      state.isPaused = false;
      broadcastStatusUpdate();
    } catch (error) {
      return {
        success: false,
        error: `Failed to resume after assertion mode: ${(error as Error).message}`,
      };
    }
  }

  return { success: true, data: { state: 'recording' } };
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
      // ✅ DEDUP FIX: Detect duplicate actions from multiple content script instances
      // (e.g., main frame + iframes all sending the same click event, or re-injected scripts).
      // Check if an identical action was recently added (same type + timestamp + selector text).
      const recentCount = Math.min(state.accumulatedActions.length, 10);
      for (
        let i = state.accumulatedActions.length - 1;
        i >= state.accumulatedActions.length - recentCount;
        i--
      ) {
        const existing = state.accumulatedActions[i];
        if (
          existing.type === action.type &&
          existing.timestamp === action.timestamp &&
          existing.type !== 'tab' && // Tab actions are background-generated, never duplicated
          existing.type !== 'navigation' // Navigation actions are background-generated
        ) {
          // Same type + timestamp — check selector match for clicks/inputs/checkpoints
          const existingSel = existing.selector?.css || existing.selector?.xpath || '';
          const actionSel = action.selector?.css || action.selector?.xpath || '';
          if (existingSel && actionSel && existingSel === actionSel) {
            console.log(
              '[Background] Skipping duplicate action:',
              action.type,
              'timestamp:',
              action.timestamp
            );
            return { success: true, data: { actionId: existing.id, counter: state.actionCounter } };
          }
          // For actions without selectors, match on text content
          if (!existingSel && !actionSel && existing.text === action.text) {
            console.log(
              '[Background] Skipping duplicate action (text match):',
              action.type,
              action.text
            );
            return { success: true, data: { actionId: existing.id, counter: state.actionCounter } };
          }
        }
      }

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

      // ✅ CRITICAL FIX: Add to accumulatedActions for cross-page persistence
      // This ensures actions are available when STOP_RECORDING is called
      state.accumulatedActions.push(numberedAction);

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
        // Dedup: only add actions not already in accumulatedActions
        // Content-script actions have empty IDs, so match by type + timestamp + selector
        let addedCount = 0;
        for (const action of newActions) {
          const actionSel = action.selector?.css || action.selector?.xpath || '';
          const isDuplicate = state.accumulatedActions.some((existing: any) => {
            if (existing.type !== action.type || existing.timestamp !== action.timestamp)
              return false;
            const existingSel = existing.selector?.css || existing.selector?.xpath || '';
            if (existingSel && actionSel) return existingSel === actionSel;
            if (!existingSel && !actionSel) return existing.text === action.text;
            return false;
          });
          if (!isDuplicate) {
            state.accumulatedActions.push(action);
            addedCount++;
          }
        }
        console.log(
          '[Background] Saved',
          addedCount,
          'new actions (deduped',
          newActions.length - addedCount,
          '). Total:',
          state.accumulatedActions.length
        );
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

  // Preserve lastUploadResult so popup can show it
  const preservedUploadResult = state.lastUploadResult;

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
    tabPreviousUrls: new Map(),
    lastUploadResult: preservedUploadResult,
    markedVariables: [],
    tabCounter: 0,
    tabIndexMap: new Map(),
    activeTabId: null,
    lastClosedTabIndex: null,
    pendingWindowOpen: null,
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
 * Handle tab close - stop recording if the PRIMARY recording tab is closed.
 * For other tracked tabs, emit TabAction(close) + TabAction(switch).
 */
chrome.tabs.onRemoved.addListener((tabId: number) => {
  if (!state.isRecording) return;

  const closedTabIndex = state.tabIndexMap.get(tabId);
  if (closedTabIndex === undefined) return; // Not a tracked tab

  // If the primary recording tab (index 0) is closed, stop recording
  if (closedTabIndex === 0) {
    console.log('[Background] Recording tab (tab 0) closed, stopping recording');
    resetState();
    broadcastStatusUpdate();
    return;
  }

  // Non-primary tracked tab closed — emit close action
  const relativeTimestamp = state.startTime ? Date.now() - state.startTime : Date.now();
  const closeAction: TabAction = {
    id: `act_${String(state.actionCounter + 1).padStart(3, '0')}`,
    type: 'tab',
    timestamp: relativeTimestamp,
    completedAt: relativeTimestamp,
    url: '',
    tabOperation: 'close',
    tabIndex: closedTabIndex,
  };

  state.actionCounter++;
  state.accumulatedActions.push(closeAction);
  persistActionCounter();
  console.log('[Background] Tab closed:', closedTabIndex, 'action:', closeAction.id);

  // Remove from tracking
  state.tabIndexMap.delete(tabId);

  // If the closed tab was the active one, clear activeTabId.
  // onActivated handles same-window tab closes (fires immediately).
  // For popup window closes, onActivated may NOT fire for the main window's tab,
  // so we use a deferred check to emit the switch if needed.
  if (state.activeTabId === tabId) {
    state.activeTabId = null;
    state.lastClosedTabIndex = closedTabIndex;

    // Deferred: if onActivated hasn't fired after 200ms, query the actual active tab
    // and emit a switch action ourselves. This handles popup/cross-window closes.
    setTimeout(async () => {
      if (state.activeTabId !== null || !state.isRecording) return; // onActivated already handled it

      try {
        const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        if (activeTab?.id && state.tabIndexMap.has(activeTab.id)) {
          const targetTabIndex = state.tabIndexMap.get(activeTab.id)!;
          state.activeTabId = activeTab.id;
          state.lastClosedTabIndex = null;
          const switchTimestamp = state.startTime ? Date.now() - state.startTime : Date.now();
          const switchAction: TabAction = {
            id: '',
            type: 'tab',
            timestamp: switchTimestamp,
            completedAt: switchTimestamp,
            url: '',
            tabOperation: 'switch',
            tabIndex: closedTabIndex,
            newTabIndex: targetTabIndex,
          };
          await emitTabAction(switchAction);
          console.log(
            '[Background] Deferred switch after popup close:',
            closedTabIndex,
            '→',
            targetTabIndex
          );
        }
      } catch (e) {
        console.error('[Background] Failed to detect active tab after close:', e);
      }
    }, 200);
  }
});

/**
 * Helper: Create and emit a TabAction via the accumulated actions pipeline
 */
async function emitTabAction(action: TabAction): Promise<void> {
  state.actionCounter++;
  action.id = `act_${String(state.actionCounter).padStart(3, '0')}`;
  state.accumulatedActions.push(action);
  await persistActionCounter();
}

/**
 * Handle new tab creation during recording.
 * Detects tabs opened by target="_blank" clicks or window.open() calls.
 */
chrome.tabs.onCreated.addListener(async (tab: chrome.tabs.Tab) => {
  if (!state.isRecording || state.isPaused) return;

  const newTabId = tab.id;
  if (!newTabId) return;

  // Skip chrome:// internal pages and explicit new-tab pages (user pressed Ctrl+T)
  // NOTE: Do NOT skip about:blank — popup windows (e.g., OAuth) often start there
  const tabUrl = tab.pendingUrl || tab.url || '';
  if (
    tabUrl === 'chrome://newtab/' ||
    tabUrl === 'about:newtab' ||
    tabUrl.startsWith('chrome://')
  ) {
    return;
  }

  // If this tab is already tracked, skip
  if (state.tabIndexMap.has(newTabId)) return;

  // Assign sequential index
  state.tabCounter++;
  const newTabIndex = state.tabCounter;
  state.tabIndexMap.set(newTabId, newTabIndex);

  // CRITICAL: Capture currentTabIndex and claim activeTabId IMMEDIATELY after adding
  // the tab to the map, BEFORE any awaits. This prevents onActivated from racing
  // (it checks tabIndexMap and activeTabId) and emitting a switch before we emit open.
  const currentTabIndex = state.activeTabId ? (state.tabIndexMap.get(state.activeTabId) ?? 0) : 0;
  const previousActiveTabId = state.activeTabId;
  state.activeTabId = newTabId; // Block onActivated from emitting a duplicate switch

  // Determine trigger type
  let triggerType: TabAction['triggerType'];
  let triggerUrl = tabUrl;
  const CORRELATION_WINDOW = 3000; // 3 seconds

  if (
    state.pendingWindowOpen &&
    Date.now() - state.pendingWindowOpen.timestamp < CORRELATION_WINDOW
  ) {
    triggerType = 'window_open';
    triggerUrl = state.pendingWindowOpen.url || tabUrl;
    state.pendingWindowOpen = null;
  } else if (tab.openerTabId !== undefined && state.tabIndexMap.has(tab.openerTabId)) {
    // Chrome sets openerTabId for target="_blank" link clicks
    triggerType = 'target_blank';
    // Use the opener tab's current URL as triggerUrl (new tab starts empty)
    try {
      const openerTab = await chrome.tabs.get(tab.openerTabId);
      triggerUrl = openerTab.url || tabUrl;
    } catch {
      // Opener tab may have closed; fall back to tabUrl
    }
  } else {
    triggerType = 'popup';
    // For popup triggers, try to get the previous active tab's URL
    if (previousActiveTabId) {
      try {
        const activeTab = await chrome.tabs.get(previousActiveTabId);
        triggerUrl = activeTab.url || tabUrl;
      } catch {
        // Active tab may have issues; fall back to tabUrl
      }
    }
  }

  // Emit TabAction: open
  const relativeTimestamp = state.startTime ? Date.now() - state.startTime : Date.now();
  const openAction: TabAction = {
    id: '', // Will be set by emitTabAction
    type: 'tab',
    timestamp: relativeTimestamp,
    completedAt: relativeTimestamp,
    url: '',
    tabOperation: 'open',
    tabIndex: currentTabIndex,
    newTabIndex,
    triggerUrl,
    triggerType,
  };
  await emitTabAction(openAction);

  // Also emit a switch action to this new tab (Chrome fires onActivated before onCreated,
  // so the switch in onActivated may have been skipped because the tab wasn't in tabIndexMap yet).
  // activeTabId is already set above to prevent onActivated from emitting a duplicate switch.
  if (previousActiveTabId !== null && previousActiveTabId !== newTabId) {
    const switchAction: TabAction = {
      id: '',
      type: 'tab',
      timestamp: relativeTimestamp,
      completedAt: relativeTimestamp,
      url: '',
      tabOperation: 'switch',
      tabIndex: currentTabIndex,
      newTabIndex,
    };
    await emitTabAction(switchAction);
  }

  console.log(
    '[Background] New tab detected:',
    newTabIndex,
    'trigger:',
    triggerType,
    'url:',
    triggerUrl
  );

  // NOTE: Do NOT inject content scripts here — the manifest already injects
  // content/index.ts at document_end for <all_urls>. Programmatic injection
  // would cause DUPLICATE content scripts → duplicate actions.
  // The manifest-injected script auto-restores via ensureRecorderReady() → GET_STATUS.
});

/**
 * Handle tab activation (user switches between tabs).
 * Only emits TabAction(switch) for tracked tabs.
 */
chrome.tabs.onActivated.addListener(async (activeInfo: chrome.tabs.TabActiveInfo) => {
  if (!state.isRecording) return;

  const activatedTabId = activeInfo.tabId;
  const activatedTabIndex = state.tabIndexMap.get(activatedTabId);

  // Only track switches involving our tracked tabs
  if (activatedTabIndex === undefined) return;

  // Don't emit switch if it's already the active tab
  if (state.activeTabId === activatedTabId) return;

  const previousTabId = state.activeTabId;
  state.activeTabId = activatedTabId;

  // Determine the "from" tab index for the switch action
  let previousTabIndex: number | null = null;
  if (previousTabId !== null && state.tabIndexMap.has(previousTabId)) {
    previousTabIndex = state.tabIndexMap.get(previousTabId) ?? 0;
  } else if (previousTabId === null && state.lastClosedTabIndex !== null) {
    // Tab was just closed — use the closed tab's index as the "from"
    previousTabIndex = state.lastClosedTabIndex;
    state.lastClosedTabIndex = null; // Consume it
  }

  if (previousTabIndex !== null) {
    const relativeTimestamp = state.startTime ? Date.now() - state.startTime : Date.now();
    const switchAction: TabAction = {
      id: '',
      type: 'tab',
      timestamp: relativeTimestamp,
      completedAt: relativeTimestamp,
      url: '',
      tabOperation: 'switch',
      tabIndex: previousTabIndex,
      newTabIndex: activatedTabIndex,
    };
    await emitTabAction(switchAction);
    console.log(
      '[Background] Tab switch from:',
      previousTabIndex,
      'to:',
      activatedTabIndex,
      'action:',
      switchAction.id
    );
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
  // Check if this tab is being tracked (multi-tab: any tab in tabIndexMap, or the primary tab)
  const isTrackedTab = state.tabIndexMap.has(tabId) || state.currentTabId === tabId;

  // Log all tab updates for debugging
  if (isTrackedTab && state.isRecording) {
    console.log('[Background] Tab updated:', {
      status: changeInfo.status,
      url: changeInfo.url,
      hasUrl: !!changeInfo.url,
      tabIndex: state.tabIndexMap.get(tabId),
    });
  }

  if (isTrackedTab && state.isRecording && changeInfo.status === 'complete') {
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
    // Detect back/forward navigation by URL change (use per-tab URL tracking for multi-tab)
    // For non-primary tabs, only use their own previous URL (not the global one)
    const isPrimaryTabUpdate = tabId === state.currentTabId;
    const previousUrlForTab =
      state.tabPreviousUrls.get(tabId) || (isPrimaryTabUpdate ? state.previousUrl : null);
    if (previousUrlForTab && previousUrlForTab !== currentUrl) {
      console.log('[Background] URL changed from', previousUrlForTab, 'to', currentUrl);

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

      // Calculate current relative timestamp
      const currentRelativeTime = state.startTime ? Date.now() - state.startTime : Date.now();
      const { navigationTrigger, relatedActionId } = detectNavigationAttribution(
        recentActions,
        currentRelativeTime
      );

      if (navigationTrigger === 'form-submit') {
        console.log('[Background] ✓ Form submit detected, navigation triggered by form');
      } else if (navigationTrigger === 'click') {
        console.log('[Background] ✓ Click-triggered navigation detected');
      } else {
        console.log(
          '[Background] ✓ Server redirect detected (no user action triggered this navigation)'
        );
      }

      // Create navigation action with RELATIVE timestamp and proper metadata
      const relativeTimestamp = state.startTime ? Date.now() - state.startTime : Date.now();
      const tabIndex = state.tabIndexMap.get(tabId) ?? 0;
      const navigationAction: any = {
        id: `act_${String(state.actionCounter + 1).padStart(3, '0')}`, // Will be renumbered
        type: 'navigation',
        timestamp: relativeTimestamp,
        completedAt: relativeTimestamp, // Will be updated when navigation completes
        url: currentUrl,
        from: previousUrlForTab,
        to: currentUrl,
        navigationTrigger,
        waitUntil: 'load',
        duration: 0, // Will be calculated from actual page load
        tabIndex,
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
        previousUrlForTab,
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

    // Update previous URL for next navigation (per-tab and global)
    state.previousUrl = currentUrl || null;
    if (currentUrl) {
      state.tabPreviousUrls.set(tabId, currentUrl);
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
  // and restore the recording state (works for all tracked tabs)
  if (isTrackedTab && state.isRecording && changeInfo.status === 'complete') {
    console.log(
      '[Background] Page load complete - accumulated actions:',
      state.accumulatedActions.length,
      'tabIndex:',
      state.tabIndexMap.get(tabId)
    );
  }
});

/**
 * Deduplicate actions by type + timestamp + selector.
 * Safety net: removes duplicates regardless of how they got into accumulatedActions.
 * Preserves the FIRST occurrence (which has tabIndex stamped from SYNC_ACTION handler).
 */
function deduplicateActions(actions: any[]): any[] {
  const seen = new Map<string, any>();
  const result: any[] = [];

  for (const action of actions) {
    // Tab and navigation actions are background-generated and unique by design
    if (action.type === 'tab' || action.type === 'navigation') {
      result.push(action);
      continue;
    }

    // Build a dedup key from type + timestamp + selector
    const sel = action.selector?.css || action.selector?.xpath || action.text || '';
    const key = `${action.type}:${action.timestamp}:${sel}`;

    if (!seen.has(key)) {
      seen.set(key, action);
      result.push(action);
    }
  }

  if (result.length < actions.length) {
    console.log(
      '[Background] Dedup removed',
      actions.length - result.length,
      'duplicate actions. Before:',
      actions.length,
      'After:',
      result.length
    );
  }

  return result;
}

/**
 * Backfill variableName onto input actions that match a user-marked variable.
 * When a user marks a field as a variable AFTER typing, the already-synced input
 * actions won't have variableName. This patches them at stop time.
 */
function backfillVariableNames(actions: any[]): void {
  if (state.markedVariables.length === 0) return;

  for (const action of actions) {
    if (action.type !== 'input' || action.variableName) continue;
    const sel = action.selector;
    if (!sel) continue;

    const selectorId = sel.id ? `#${sel.id}` : '';
    const selectorName = sel.name || '';

    for (const mv of state.markedVariables) {
      // Match by selector string (e.g. "#email") or field name
      if (
        (selectorId && mv.selector === selectorId) ||
        (selectorName && mv.selector === `[name="${selectorName}"]`) ||
        (sel.css && mv.selector === sel.css)
      ) {
        action.variableName = mv.variableName;
        break;
      }
    }
  }
}

/**
 * Extract variable definitions from actions
 * Scans all InputAction items and collects unique variables
 */
function extractVariablesFromActions(actions: any[]): Variable[] {
  const variableMap = new Map<string, Variable>();

  // 1. Collect variables from input actions (auto-detected sensitive + user-marked)
  for (const action of actions) {
    if (action.type === 'input' && action.variableName) {
      const inputAction = action as InputAction;
      const variableName = inputAction.variableName;

      if (!variableName || variableMap.has(variableName)) continue;

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

      variableMap.set(variableName, {
        name: variableName,
        description: `${inputAction.inputType} field${selectorString ? ` (${selectorString})` : ''}`,
        fieldType: inputAction.inputType,
        selector: selectorString,
        placeholder: `\${${variableName}}`,
      });
    }
  }

  // 2. Merge user-marked variables (from the VariableMarker in content script)
  for (const mv of state.markedVariables) {
    if (!variableMap.has(mv.variableName)) {
      variableMap.set(mv.variableName, {
        name: mv.variableName,
        description: `${mv.fieldType} field${mv.selector ? ` (${mv.selector})` : ''}`,
        fieldType: mv.fieldType,
        selector: mv.selector,
        placeholder: `\${${mv.variableName}}`,
      });
    }
  }

  return Array.from(variableMap.values());
}

console.log('[Background] SaveAction Recorder initialized');

/**
 * Popup Script
 * Manages the UI and communication with background script
 */

import type { Message, StatusResponse, RecordingResponse } from '@/types/messages';
import type { RecordingState } from '@/types/recording';
import { isValidUrl } from '@/types/settings';
import { downloadRecording } from '@/utils/exporter';
import {
  loadSettings,
  saveSettings,
  testConnection,
  uploadIfEnabled,
  getConnectionStatus,
  showUploadNotification,
  fetchProjects,
} from '@/platform/api';
import type { Project } from '@/types/settings';

// UI Elements
const testNameInput = document.getElementById('testNameInput') as HTMLInputElement;
const testNameSection = document.getElementById('testNameSection') as HTMLElement;
const recordingInfo = document.getElementById('recordingInfo') as HTMLElement;
const currentTestName = document.getElementById('currentTestName') as HTMLElement;
const actionCount = document.getElementById('actionCount') as HTMLElement;
const duration = document.getElementById('duration') as HTMLElement;
const statusBadge = document.getElementById('statusBadge') as HTMLElement;
const startBtn = document.getElementById('startBtn') as HTMLButtonElement;
const pauseBtn = document.getElementById('pauseBtn') as HTMLButtonElement;
const pauseBtnText = document.getElementById('pauseBtnText') as HTMLElement;
const stopButtons = document.getElementById('stopButtons') as HTMLElement;
const saveBtn = document.getElementById('saveBtn') as HTMLButtonElement;
const downloadBtn = document.getElementById('downloadBtn') as HTMLButtonElement;
const errorMessage = document.getElementById('errorMessage') as HTMLElement;
const errorText = document.getElementById('errorText') as HTMLElement;
const successMessage = document.getElementById('successMessage') as HTMLElement;
const successText = document.getElementById('successText') as HTMLElement;

// Upload Progress Elements
const uploadProgress = document.getElementById('uploadProgress') as HTMLElement;
const uploadProgressLabel = document.getElementById('uploadProgressLabel') as HTMLElement;
const uploadProgressPercent = document.getElementById('uploadProgressPercent') as HTMLElement;
const uploadProgressFill = document.getElementById('uploadProgressFill') as HTMLElement;

// Settings UI Elements
const mainView = document.getElementById('mainView') as HTMLElement;
const settingsView = document.getElementById('settingsView') as HTMLElement;
const settingsBtn = document.getElementById('settingsBtn') as HTMLButtonElement;
const backBtn = document.getElementById('backBtn') as HTMLButtonElement;
const platformUrlInput = document.getElementById('platformUrl') as HTMLInputElement;
const apiTokenInput = document.getElementById('apiToken') as HTMLInputElement;
const defaultTagsInput = document.getElementById('defaultTags') as HTMLInputElement;
const autoUploadToggle = document.getElementById('autoUpload') as HTMLInputElement;
const testConnectionBtn = document.getElementById('testConnectionBtn') as HTMLButtonElement;
const saveSettingsBtn = document.getElementById('saveSettingsBtn') as HTMLButtonElement;
const connectionResult = document.getElementById('connectionResult') as HTMLElement;
const connectionResultText = document.getElementById('connectionResultText') as HTMLElement;
const connectionStatus = document.getElementById('connectionStatus') as HTMLElement;
const setupBanner = document.getElementById('setupBanner') as HTMLElement;
const setupBannerBtn = document.getElementById('setupBannerBtn') as HTMLButtonElement;
const projectSection = document.getElementById('projectSection') as HTMLElement;
const projectSelect = document.getElementById('projectSelect') as HTMLSelectElement;
const refreshProjectsBtn = document.getElementById('refreshProjectsBtn') as HTMLButtonElement;

// State
let currentState: RecordingState = 'idle';
let startTime: number | null = null;
let durationInterval: number | null = null;
let pollInterval: number | null = null;
let lastRecording: any = null; // Store last recording for download

/**
 * Initialize popup
 */
async function init(): Promise<void> {
  console.log('[Popup] Initializing...');

  // Get current status from background
  await updateStatus();

  // Update connection status indicator
  await updateConnectionStatusIndicator();

  // Check for last upload result (shown when popup opens after save from overlay)
  await checkLastUploadResult();

  // Set up event listeners
  startBtn.addEventListener('click', handleStart);
  pauseBtn.addEventListener('click', handlePauseResume);
  saveBtn.addEventListener('click', handleSave);
  downloadBtn.addEventListener('click', handleDownload);

  // Settings event listeners
  settingsBtn.addEventListener('click', showSettingsView);
  backBtn.addEventListener('click', showMainView);
  testConnectionBtn.addEventListener('click', handleTestConnection);
  saveSettingsBtn.addEventListener('click', handleSaveSettings);
  setupBannerBtn.addEventListener('click', showSettingsView);
  refreshProjectsBtn.addEventListener('click', handleRefreshProjects);

  // Save project selection when changed
  projectSelect.addEventListener('change', handleProjectChange);

  // Listen for status updates from background
  chrome.runtime.onMessage.addListener((message: Message) => {
    if (message.type === 'STATUS_UPDATE') {
      currentState = message.payload.state;
      updateUI();
    }
  });

  console.log('[Popup] Initialized');
}

/**
 * Get current status from background script
 */
async function updateStatus(): Promise<void> {
  try {
    const response = await sendMessage<StatusResponse>({ type: 'GET_STATUS' });

    if (response.success && response.data) {
      currentState = response.data.state;

      if (response.data.metadata) {
        const metadata = response.data.metadata as any;

        if (metadata.testName) {
          currentTestName.textContent = metadata.testName;
          testNameInput.value = metadata.testName;
        }

        // Calculate duration from start time
        if (metadata.startTime) {
          startTime = new Date(metadata.startTime).getTime();
          if (currentState === 'recording') {
            startDurationTimer();
          }
        }
      }

      updateUI();
    }
  } catch (error) {
    console.error('[Popup] Failed to get status:', error);
  }
}

/**
 * Handle start recording
 */
async function handleStart(): Promise<void> {
  const testName = testNameInput.value.trim();

  if (!testName) {
    showError('Please enter a test name');
    testNameInput.focus();
    return;
  }

  hideMessages();
  setLoading(startBtn, true);

  try {
    console.log('[Popup] Sending START_RECORDING message');
    const response = await sendMessage({
      type: 'START_RECORDING',
      payload: { testName },
    });

    console.log('[Popup] START_RECORDING response:', response);

    if (response.success) {
      currentState = 'recording';
      startTime = Date.now();
      currentTestName.textContent = testName;
      startDurationTimer();
      updateUI();
      showSuccess('Recording started!');
    } else {
      showError(response.error || 'Failed to start recording');
    }
  } catch (error) {
    console.error('[Popup] Error starting recording:', error);
    showError((error as Error).message);
  } finally {
    setLoading(startBtn, false);
  }
}

/**
 * Handle pause/resume
 */
async function handlePauseResume(): Promise<void> {
  hideMessages();
  setLoading(pauseBtn, true);

  try {
    const messageType = currentState === 'recording' ? 'PAUSE_RECORDING' : 'RESUME_RECORDING';
    const response = await sendMessage({ type: messageType });

    if (response.success) {
      currentState = currentState === 'recording' ? 'paused' : 'recording';

      if (currentState === 'paused') {
        stopDurationTimer();
        showSuccess('Recording paused');
      } else {
        startDurationTimer();
        showSuccess('Recording resumed');
      }

      updateUI();
    } else {
      showError(response.error || `Failed to ${currentState === 'recording' ? 'pause' : 'resume'}`);
    }
  } catch (error) {
    showError((error as Error).message);
  } finally {
    setLoading(pauseBtn, false);
  }
}

/**
 * Handle save recording (stops recording and uploads to platform)
 */
async function handleSave(): Promise<void> {
  hideMessages();
  setLoading(saveBtn, true);

  try {
    console.log('[Popup] Sending STOP_RECORDING message');
    const response = await sendMessage<RecordingResponse>({ type: 'STOP_RECORDING' });

    console.log('[Popup] STOP_RECORDING response:', response);

    if (response.success && response.data) {
      stopDurationTimer();

      // Store the recording for optional download
      lastRecording = response.data;

      // Check if platform is configured
      const settings = await loadSettings();
      const isPlatformConfigured = settings.platformUrl && settings.apiToken;

      if (isPlatformConfigured) {
        // Upload to platform with progress
        await uploadWithProgress(response.data);
      } else {
        // No platform configured - just download
        await downloadRecording(response.data);
        showSuccess('Recording downloaded! Configure platform settings for cloud upload.');
      }

      currentState = 'idle';
      startTime = null;
      testNameInput.value = '';
      updateUI();
    } else if (response.success && !response.data) {
      console.warn('[Popup] Recording already stopped');
      stopDurationTimer();
      currentState = 'idle';
      startTime = null;
      testNameInput.value = '';
      updateUI();
      showError('Recording was already stopped');
    } else {
      showError(response.error || 'Failed to stop recording');
    }
  } catch (error) {
    console.error('[Popup] Error stopping recording:', error);
    showError((error as Error).message);
  } finally {
    setLoading(saveBtn, false);
  }
}

/**
 * Handle download button click (optional local download)
 */
async function handleDownload(): Promise<void> {
  hideMessages();

  // If we have a last recording, download it
  if (lastRecording) {
    await downloadRecording(lastRecording);
    showSuccess('Recording downloaded!');
    return;
  }

  // Otherwise, try to get the current recording
  try {
    setLoading(downloadBtn, true);
    const response = await sendMessage<RecordingResponse>({ type: 'STOP_RECORDING' });

    if (response.success && response.data) {
      stopDurationTimer();
      lastRecording = response.data;
      await downloadRecording(response.data);
      showSuccess('Recording downloaded!');

      currentState = 'idle';
      startTime = null;
      testNameInput.value = '';
      updateUI();
    } else {
      showError('No recording available to download');
    }
  } catch (error) {
    showError((error as Error).message);
  } finally {
    setLoading(downloadBtn, false);
  }
}

/**
 * Upload recording with progress indicator
 */
async function uploadWithProgress(recording: any): Promise<void> {
  const selectedProjectId = projectSelect.value || undefined;

  // Show progress bar
  uploadProgress.style.display = 'block';
  uploadProgress.className = 'upload-progress';
  uploadProgressLabel.textContent = 'Uploading to platform...';
  updateUploadProgress(10);

  try {
    // Simulate progress for UX (actual upload doesn't support progress events)
    updateUploadProgress(30);

    const result = await uploadIfEnabled(recording, selectedProjectId);

    if (result === null) {
      // Auto-upload disabled - hide progress and show info
      uploadProgress.style.display = 'none';
      showSuccess('Recording saved! Enable auto-upload in settings to sync to cloud.');
      return;
    }

    updateUploadProgress(90);

    if (result.success) {
      updateUploadProgress(100);
      uploadProgress.className = 'upload-progress success';
      uploadProgressLabel.textContent = 'Uploaded successfully!';

      // Show notification
      showUploadNotification(result);
      showSuccess(`Recording "${result.recordingName || recording.testName}" uploaded!`);

      // Hide progress after delay
      setTimeout(() => {
        uploadProgress.style.display = 'none';
      }, 2000);
    } else if (result.alreadyExists) {
      updateUploadProgress(100);
      uploadProgressLabel.textContent = 'Recording already exists on platform';
      setTimeout(() => {
        uploadProgress.style.display = 'none';
      }, 2000);
    } else {
      // Upload failed - auto-download as fallback
      await downloadRecording(recording);

      uploadProgress.className = 'upload-progress error';
      uploadProgressLabel.textContent = `Upload failed: ${result.error}`;
      showUploadNotification(result);
      showError(`${result.error} Recording downloaded locally.`);

      setTimeout(() => {
        uploadProgress.style.display = 'none';
      }, 4000);
    }
  } catch (error) {
    // Upload error - auto-download as fallback
    await downloadRecording(recording);

    uploadProgress.className = 'upload-progress error';
    uploadProgressLabel.textContent = `Upload error: ${(error as Error).message}`;
    updateUploadProgress(100);
    showError(`Upload failed: ${(error as Error).message}. Recording downloaded locally.`);

    setTimeout(() => {
      uploadProgress.style.display = 'none';
    }, 4000);
  }
}

/**
 * Update upload progress bar
 */
function updateUploadProgress(percent: number): void {
  uploadProgressPercent.textContent = `${percent}%`;
  uploadProgressFill.style.width = `${percent}%`;
}

/**
 * Update UI based on current state
 */
function updateUI(): void {
  // Update status badge
  statusBadge.className = `status-badge ${currentState}`;
  const statusText = statusBadge.querySelector('.status-text') as HTMLElement;
  statusText.textContent =
    currentState === 'idle' ? 'Idle' : currentState === 'recording' ? 'Recording' : 'Paused';

  // Update sections visibility
  if (currentState === 'idle') {
    testNameSection.style.display = 'block';
    recordingInfo.style.display = 'none';
    startBtn.style.display = 'flex';
    pauseBtn.style.display = 'none';
    stopButtons.style.display = 'none';
    uploadProgress.style.display = 'none';
    testNameInput.disabled = false;
    // Show setup banner / connection status when idle
    updateConnectionStatusIndicator();
  } else {
    testNameSection.style.display = 'none';
    recordingInfo.style.display = 'block';
    startBtn.style.display = 'none';
    pauseBtn.style.display = 'flex';
    stopButtons.style.display = 'flex';
    testNameInput.disabled = true;
    // Hide setup banner and connection status during recording
    setupBanner.style.display = 'none';
    connectionStatus.style.display = 'none';

    // Update pause/resume button
    const pauseIcon = pauseBtn.querySelector('.pause-icon') as HTMLElement;
    const resumeIcon = pauseBtn.querySelector('.resume-icon') as HTMLElement;

    if (currentState === 'recording') {
      pauseIcon.style.display = 'block';
      resumeIcon.style.display = 'none';
      pauseBtnText.textContent = 'Pause';
    } else {
      pauseIcon.style.display = 'none';
      resumeIcon.style.display = 'block';
      pauseBtnText.textContent = 'Resume';
    }
  }
}

/**
 * Start duration timer
 */
function startDurationTimer(): void {
  stopDurationTimer();

  const updateDuration = () => {
    if (startTime) {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      const minutes = Math.floor(elapsed / 60);
      const seconds = elapsed % 60;
      duration.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }
  };

  updateDuration();
  durationInterval = window.setInterval(updateDuration, 1000);

  // Also start polling for action count
  startActionCountPolling();
}

/**
 * Stop duration timer
 */
function stopDurationTimer(): void {
  if (durationInterval !== null) {
    clearInterval(durationInterval);
    durationInterval = null;
  }

  stopActionCountPolling();
}

/**
 * Start polling for action count
 */
function startActionCountPolling(): void {
  stopActionCountPolling();

  const updateActionCount = async () => {
    try {
      const response = await sendMessage({ type: 'GET_STATUS' });

      if (response.success && response.data) {
        // Stop polling if recording is idle
        if (response.data.state === 'idle') {
          stopActionCountPolling();
          return;
        }

        if (response.data.metadata) {
          const count = response.data.metadata.actionCount || 0;
          actionCount.textContent = String(count);
        }
      }
    } catch (error) {
      // Ignore errors during polling
      console.error('[Popup] Failed to get action count:', error);
    }
  };

  updateActionCount();
  pollInterval = window.setInterval(updateActionCount, 1000);
}

/**
 * Stop action count polling
 */
function stopActionCountPolling(): void {
  if (pollInterval !== null) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

/**
 * Send message to background script
 */
async function sendMessage<T = any>(message: Message): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(response);
      }
    });
  });
}

/**
 * Show error message
 */
function showError(message: string): void {
  errorText.textContent = message;
  errorMessage.style.display = 'flex';
  successMessage.style.display = 'none';

  setTimeout(() => {
    errorMessage.style.display = 'none';
  }, 5000);
}

/**
 * Show success message
 */
function showSuccess(message: string): void {
  successText.textContent = message;
  successMessage.style.display = 'flex';
  errorMessage.style.display = 'none';

  setTimeout(() => {
    successMessage.style.display = 'none';
  }, 3000);
}

/**
 * Hide all messages
 */
function hideMessages(): void {
  errorMessage.style.display = 'none';
  successMessage.style.display = 'none';
}

/**
 * Check for last upload result and display it
 */
async function checkLastUploadResult(): Promise<void> {
  try {
    const response = await new Promise<{
      success: boolean;
      data: {
        success: boolean;
        error?: string;
        recordingName?: string;
        timestamp: number;
      } | null;
    }>((resolve) => {
      chrome.runtime.sendMessage({ type: 'GET_LAST_UPLOAD_RESULT' }, resolve);
    });

    if (response.success && response.data) {
      const result = response.data;
      // Only show if result is recent (within last 30 seconds)
      if (Date.now() - result.timestamp < 30000) {
        if (result.success) {
          showSuccess(`Recording "${result.recordingName}" uploaded successfully!`);
        } else {
          showError(`Upload failed: ${result.error}`);
        }
      }
    }
  } catch (error) {
    console.log('[Popup] No upload result to show');
  }
}

/**
 * Set button loading state
 */
function setLoading(button: HTMLButtonElement, loading: boolean): void {
  if (loading) {
    button.classList.add('loading');
    button.disabled = true;
  } else {
    button.classList.remove('loading');
    button.disabled = false;
  }
}

// ============================================================================
// Settings View Functions
// ============================================================================

/**
 * Show settings view
 */
async function showSettingsView(): Promise<void> {
  mainView.style.display = 'none';
  settingsView.style.display = 'block';
  hideConnectionResult();

  // Load current settings
  const settings = await loadSettings();
  platformUrlInput.value = settings.platformUrl;
  apiTokenInput.value = settings.apiToken;
  defaultTagsInput.value = settings.defaultTags;
  autoUploadToggle.checked = settings.autoUpload;
}

/**
 * Show main view
 */
function showMainView(): void {
  settingsView.style.display = 'none';
  mainView.style.display = 'block';
  hideConnectionResult();

  // Update connection status indicator
  updateConnectionStatusIndicator();
}

/**
 * Handle test connection button click
 */
async function handleTestConnection(): Promise<void> {
  hideConnectionResult();
  setLoading(testConnectionBtn, true);

  const platformUrl = platformUrlInput.value.trim();
  const apiToken = apiTokenInput.value.trim();

  // Validate inputs
  if (!platformUrl) {
    showConnectionResult(false, 'Please enter a Platform URL');
    setLoading(testConnectionBtn, false);
    return;
  }

  if (!isValidUrl(platformUrl)) {
    showConnectionResult(false, 'Invalid URL format (must start with http:// or https://)');
    setLoading(testConnectionBtn, false);
    return;
  }

  if (!apiToken) {
    showConnectionResult(false, 'Please enter an API Token');
    setLoading(testConnectionBtn, false);
    return;
  }

  try {
    const result = await testConnection(platformUrl, apiToken);

    if (result.success) {
      showConnectionResult(true, 'Connection successful! Save settings to continue.');
    } else {
      showConnectionResult(false, result.error || 'Connection failed');
    }
  } catch (error) {
    showConnectionResult(false, `Connection error: ${(error as Error).message}`);
  } finally {
    setLoading(testConnectionBtn, false);
  }
}

/**
 * Handle save settings button click
 */
async function handleSaveSettings(): Promise<void> {
  setLoading(saveSettingsBtn, true);

  const platformUrl = platformUrlInput.value.trim();
  const apiToken = apiTokenInput.value.trim();
  const defaultTags = defaultTagsInput.value.trim();
  const autoUpload = autoUploadToggle.checked;

  // Validate URL format if provided
  if (platformUrl && !isValidUrl(platformUrl)) {
    showConnectionResult(false, 'Invalid URL format (must start with http:// or https://)');
    setLoading(saveSettingsBtn, false);
    return;
  }

  try {
    // Get selected project info
    const selectedProjectId = projectSelect.value || '';
    const selectedOption = projectSelect.options[projectSelect.selectedIndex];
    const selectedProjectName = selectedOption ? selectedOption.text : '';

    await saveSettings({
      platformUrl,
      apiToken,
      selectedProjectId,
      selectedProjectName,
      defaultTags,
      autoUpload,
    });

    showConnectionResult(true, 'Settings saved successfully!');

    // Auto-hide result after 2 seconds
    setTimeout(() => {
      hideConnectionResult();
    }, 2000);
  } catch (error) {
    showConnectionResult(false, `Failed to save settings: ${(error as Error).message}`);
  } finally {
    setLoading(saveSettingsBtn, false);
  }
}

/**
 * Load and show projects from platform
 */
async function loadAndShowProjects(
  platformUrl: string,
  apiToken: string,
  selectedProjectId?: string
): Promise<void> {
  try {
    const result = await fetchProjects(platformUrl, apiToken);

    if (result.success && result.projects) {
      populateProjectDropdown(result.projects, selectedProjectId);
      projectSection.style.display = 'block';
    } else {
      console.error('[Popup] Failed to load projects:', result.error);
      projectSection.style.display = 'none';
    }
  } catch (error) {
    console.error('[Popup] Error loading projects:', error);
    projectSection.style.display = 'none';
  }
}

/**
 * Populate the project dropdown with options
 */
function populateProjectDropdown(projects: Project[], selectedProjectId?: string): void {
  // Clear existing options except the first placeholder
  projectSelect.innerHTML = '<option value="">Select a project...</option>';

  // Sort projects: default first, then alphabetically
  const sortedProjects = [...projects].sort((a, b) => {
    if (a.isDefault && !b.isDefault) return -1;
    if (!a.isDefault && b.isDefault) return 1;
    return a.name.localeCompare(b.name);
  });

  for (const project of sortedProjects) {
    const option = document.createElement('option');
    option.value = project.id;
    option.textContent = project.isDefault ? `${project.name} (Default)` : project.name;

    if (project.id === selectedProjectId) {
      option.selected = true;
    }

    projectSelect.appendChild(option);
  }
}

/**
 * Handle refresh projects button click
 */
async function handleRefreshProjects(): Promise<void> {
  const platformUrl = platformUrlInput.value.trim();
  const apiToken = apiTokenInput.value.trim();

  if (!platformUrl || !apiToken) {
    showConnectionResult(false, 'Enter Platform URL and API Token first');
    return;
  }

  setLoading(refreshProjectsBtn, true);

  try {
    await loadAndShowProjects(platformUrl, apiToken, projectSelect.value);
    showConnectionResult(true, 'Projects refreshed!');
    setTimeout(() => hideConnectionResult(), 2000);
  } catch (error) {
    showConnectionResult(false, `Failed to refresh projects: ${(error as Error).message}`);
  } finally {
    setLoading(refreshProjectsBtn, false);
  }
}

/**
 * Handle project dropdown change - save to settings immediately
 */
async function handleProjectChange(): Promise<void> {
  const selectedProjectId = projectSelect.value || '';
  const selectedOption = projectSelect.options[projectSelect.selectedIndex];
  const selectedProjectName = selectedOption ? selectedOption.text : '';

  try {
    // Load current settings and update only project fields
    const currentSettings = await loadSettings();
    await saveSettings({
      ...currentSettings,
      selectedProjectId,
      selectedProjectName,
    });
    console.log('[Popup] Project selection saved:', selectedProjectName);
  } catch (error) {
    console.error('[Popup] Failed to save project selection:', error);
  }
}

/**
 * Show connection test result
 */
function showConnectionResult(success: boolean, message: string): void {
  connectionResult.style.display = 'flex';
  connectionResult.className = `connection-result ${success ? 'success' : 'error'}`;
  connectionResultText.textContent = message;
}

/**
 * Hide connection test result
 */
function hideConnectionResult(): void {
  connectionResult.style.display = 'none';
}

/**
 * Update connection status indicator and setup banner on main view
 */
async function updateConnectionStatusIndicator(): Promise<void> {
  try {
    const status = await getConnectionStatus();

    if (status.configured) {
      // Hide setup banner, show connection status
      setupBanner.style.display = 'none';
      connectionStatus.style.display = 'flex';
      const textEl = connectionStatus.querySelector('.connection-text') as HTMLElement;

      if (status.autoUpload) {
        connectionStatus.className = 'connection-status auto-upload';
        textEl.textContent = 'Auto-upload enabled';
      } else {
        connectionStatus.className = 'connection-status';
        textEl.textContent = 'Connected to platform';
      }

      // Load projects for main view dropdown
      const settings = await loadSettings();
      if (settings.platformUrl && settings.apiToken) {
        await loadAndShowProjects(
          settings.platformUrl,
          settings.apiToken,
          settings.selectedProjectId
        );
      }
    } else {
      // Show setup banner, hide connection status and project section
      setupBanner.style.display = 'flex';
      connectionStatus.style.display = 'none';
      projectSection.style.display = 'none';
    }
  } catch (error) {
    // Show setup banner on error (assume not configured)
    setupBanner.style.display = 'flex';
    connectionStatus.style.display = 'none';
    projectSection.style.display = 'none';
    console.error('[Popup] Failed to get connection status:', error);
  }
}

// Initialize on load
init();

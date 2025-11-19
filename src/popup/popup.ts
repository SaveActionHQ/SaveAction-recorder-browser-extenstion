/**
 * Popup Script
 * Manages the UI and communication with background script
 */

import type { Message, StatusResponse, RecordingResponse } from '@/types/messages';
import type { RecordingState } from '@/types/recording';
import { downloadRecording } from '@/utils/exporter';

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
const stopBtn = document.getElementById('stopBtn') as HTMLButtonElement;
const errorMessage = document.getElementById('errorMessage') as HTMLElement;
const errorText = document.getElementById('errorText') as HTMLElement;
const successMessage = document.getElementById('successMessage') as HTMLElement;
const successText = document.getElementById('successText') as HTMLElement;

// State
let currentState: RecordingState = 'idle';
let startTime: number | null = null;
let durationInterval: number | null = null;
let pollInterval: number | null = null;

/**
 * Initialize popup
 */
async function init(): Promise<void> {
  console.log('[Popup] Initializing...');
  
  // Get current status from background
  await updateStatus();
  
  // Set up event listeners
  startBtn.addEventListener('click', handleStart);
  pauseBtn.addEventListener('click', handlePauseResume);
  stopBtn.addEventListener('click', handleStop);
  
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
      payload: { testName }
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
 * Handle stop recording
 */
async function handleStop(): Promise<void> {
  hideMessages();
  setLoading(stopBtn, true);
  
  try {
    console.log('[Popup] Sending STOP_RECORDING message');
    const response = await sendMessage<RecordingResponse>({ type: 'STOP_RECORDING' });
    
    console.log('[Popup] STOP_RECORDING response:', response);
    
    if (response.success && response.data) {
      stopDurationTimer();
      
      // Download the recording
      await downloadRecording(response.data);
      
      currentState = 'idle';
      startTime = null;
      testNameInput.value = '';
      updateUI();
      showSuccess('Recording saved successfully!');
    } else if (response.success && !response.data) {
      // Response was successful but no data (recording already stopped)
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
    setLoading(stopBtn, false);
  }
}

/**
 * Update UI based on current state
 */
function updateUI(): void {
  // Update status badge
  statusBadge.className = `status-badge ${currentState}`;
  const statusText = statusBadge.querySelector('.status-text') as HTMLElement;
  statusText.textContent = currentState === 'idle' ? 'Idle' : 
                           currentState === 'recording' ? 'Recording' : 'Paused';
  
  // Update sections visibility
  if (currentState === 'idle') {
    testNameSection.style.display = 'block';
    recordingInfo.style.display = 'none';
    startBtn.style.display = 'flex';
    pauseBtn.style.display = 'none';
    stopBtn.style.display = 'none';
    testNameInput.disabled = false;
  } else {
    testNameSection.style.display = 'none';
    recordingInfo.style.display = 'block';
    startBtn.style.display = 'none';
    pauseBtn.style.display = 'flex';
    stopBtn.style.display = 'flex';
    testNameInput.disabled = true;
    
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

// Initialize on load
init();

/**
 * Popup controller.
 * Handles recorder controls, session-based workspace login, and project routing.
 */

import type { Message, MessageResponse, RecordingResponse, StatusResponse } from '@/types/messages';
import type { Recording, RecordingState } from '@/types/recording';
import type { ExtensionSettings, Project, Workspace } from '@/types/settings';
import { downloadRecording } from '@/utils/exporter';
import {
  beginAccountConnection,
  clearConnectionData,
  disconnectAccount,
  fetchProjects,
  fetchWorkspaces,
  loadSettings,
  pollAccountConnection,
  saveSettings,
  showUploadNotification,
  testConnection,
  uploadRecording as uploadRecordingToPlatform,
} from '@/platform/api';
import { hasActiveConnection, isValidUrl, normalizePlatformUrl, parseTags } from '@/types/settings';

const mainView = document.getElementById('mainView') as HTMLElement;
const settingsView = document.getElementById('settingsView') as HTMLElement;
const statusBadge = document.getElementById('statusBadge') as HTMLElement;
const recorderTabBtn = document.getElementById('recorderTabBtn') as HTMLButtonElement;
const workspaceTabBtn = document.getElementById('workspaceTabBtn') as HTMLButtonElement;
const recorderPanel = document.getElementById('recorderPanel') as HTMLElement;
const workspacePanel = document.getElementById('workspacePanel') as HTMLElement;

const settingsBtn = document.getElementById('settingsBtn') as HTMLButtonElement;
const backBtn = document.getElementById('backBtn') as HTMLButtonElement;

const workspaceStatePill = document.getElementById('workspaceStatePill') as HTMLElement;
const workspaceTitle = document.getElementById('workspaceTitle') as HTMLElement;
const workspaceDescription = document.getElementById('workspaceDescription') as HTMLElement;
const platformChip = document.getElementById('platformChip') as HTMLElement;
const destinationSummary = document.getElementById('destinationSummary') as HTMLElement;
const accountPanel = document.getElementById('accountPanel') as HTMLElement;
const accountAvatar = document.getElementById('accountAvatar') as HTMLElement;
const accountName = document.getElementById('accountName') as HTMLElement;
const accountEmail = document.getElementById('accountEmail') as HTMLElement;
const pendingConnectionPanel = document.getElementById('pendingConnectionPanel') as HTMLElement;
const pendingExpiresText = document.getElementById('pendingExpiresText') as HTMLElement;
const pendingCode = document.getElementById('pendingCode') as HTMLElement;

const connectAccountBtn = document.getElementById('connectAccountBtn') as HTMLButtonElement;
const openAuthTabBtn = document.getElementById('openAuthTabBtn') as HTMLButtonElement;
const refreshConnectionBtn = document.getElementById('refreshConnectionBtn') as HTMLButtonElement;
const disconnectBtn = document.getElementById('disconnectBtn') as HTMLButtonElement;
const openSettingsCtaBtn = document.getElementById('openSettingsCtaBtn') as HTMLButtonElement;
const copyPendingCodeBtn = document.getElementById('copyPendingCodeBtn') as HTMLButtonElement;

const destinationCard = document.getElementById('destinationCard') as HTMLElement;
const destinationHint = document.getElementById('destinationHint') as HTMLElement;
const organizationSelect = document.getElementById('organizationSelect') as HTMLSelectElement;
const projectSelect = document.getElementById('projectSelect') as HTMLSelectElement;
const refreshProjectsBtn = document.getElementById('refreshProjectsBtn') as HTMLButtonElement;

const testNameInput = document.getElementById('testNameInput') as HTMLInputElement;
const uploadTargetBadge = document.getElementById('uploadTargetBadge') as HTMLElement;
const credentialToggleSection = document.getElementById('credentialToggleSection') as HTMLElement;
const storeCredentialsToggle = document.getElementById('storeCredentials') as HTMLInputElement;

const recordingInfo = document.getElementById('recordingInfo') as HTMLElement;
const currentTestName = document.getElementById('currentTestName') as HTMLElement;
const actionCount = document.getElementById('actionCount') as HTMLElement;
const duration = document.getElementById('duration') as HTMLElement;
const assertionCount = document.getElementById('assertionCount') as HTMLElement;

const variablesSection = document.getElementById('variablesSection') as HTMLElement;
const variableCount = document.getElementById('variableCount') as HTMLElement;
const variablesList = document.getElementById('variablesList') as HTMLElement;

const startBtn = document.getElementById('startBtn') as HTMLButtonElement;
const pauseBtn = document.getElementById('pauseBtn') as HTMLButtonElement;
const pauseBtnText = document.getElementById('pauseBtnText') as HTMLElement;
const assertionBtn = document.getElementById('assertionBtn') as HTMLButtonElement;
const stopButtons = document.getElementById('stopButtons') as HTMLElement;
const saveBtn = document.getElementById('saveBtn') as HTMLButtonElement;
const saveBtnText = document.getElementById('saveBtnText') as HTMLElement;
const downloadBtn = document.getElementById('downloadBtn') as HTMLButtonElement;

const uploadProgress = document.getElementById('uploadProgress') as HTMLElement;
const uploadProgressLabel = document.getElementById('uploadProgressLabel') as HTMLElement;
const uploadProgressPercent = document.getElementById('uploadProgressPercent') as HTMLElement;
const uploadProgressFill = document.getElementById('uploadProgressFill') as HTMLElement;

const workspaceMessageSlot = document.getElementById('workspaceMessageSlot') as HTMLElement;
const destinationMessageSlot = document.getElementById('destinationMessageSlot') as HTMLElement;
const recorderMessageSlot = document.getElementById('recorderMessageSlot') as HTMLElement;
const settingsMessageSlot = document.getElementById('settingsMessageSlot') as HTMLElement;

const platformUrlInput = document.getElementById('platformUrl') as HTMLInputElement;
const defaultTagsInput = document.getElementById('defaultTags') as HTMLInputElement;
const autoUploadToggle = document.getElementById('autoUpload') as HTMLInputElement;
const testConnectionBtn = document.getElementById('testConnectionBtn') as HTMLButtonElement;
const saveSettingsBtn = document.getElementById('saveSettingsBtn') as HTMLButtonElement;
const settingsDisconnectBtn = document.getElementById('settingsDisconnectBtn') as HTMLButtonElement;
const settingsConnectionSummary = document.getElementById(
  'settingsConnectionSummary'
) as HTMLElement;

let currentState: RecordingState = 'idle';
let startTime: number | null = null;
let durationInterval: number | null = null;
let pollInterval: number | null = null;
let authPollInterval: number | null = null;
let lastRecording: Recording | null = null;
let workspacesCache: Workspace[] = [];
let projectsCache: Project[] = [];
let activeTab: PopupTab = 'recorder';

type MessageTarget = 'workspace' | 'destination' | 'recorder' | 'settings';
type MessageKind = 'success' | 'error';
type PopupTab = 'recorder' | 'workspace';

const messageSlots: Record<MessageTarget, HTMLElement> = {
  workspace: workspaceMessageSlot,
  destination: destinationMessageSlot,
  recorder: recorderMessageSlot,
  settings: settingsMessageSlot,
};

const messageTimers: Partial<Record<MessageTarget, number>> = {};

async function init(): Promise<void> {
  showMainTab('recorder');

  recorderTabBtn.addEventListener('click', () => showMainTab('recorder'));
  workspaceTabBtn.addEventListener('click', () => showMainTab('workspace'));

  startBtn.addEventListener('click', handleStart);
  pauseBtn.addEventListener('click', handlePauseResume);
  saveBtn.addEventListener('click', handleSave);
  downloadBtn.addEventListener('click', handleDownload);
  assertionBtn.addEventListener('click', handleAddAssertion);

  settingsBtn.addEventListener('click', showSettingsView);
  backBtn.addEventListener('click', showMainView);
  openSettingsCtaBtn.addEventListener('click', showSettingsView);

  connectAccountBtn.addEventListener('click', handleConnectAccount);
  openAuthTabBtn.addEventListener('click', handleOpenAuthTab);
  refreshConnectionBtn.addEventListener('click', () => checkPendingConnection(true));
  disconnectBtn.addEventListener('click', () => {
    void handleDisconnect('workspace');
  });
  settingsDisconnectBtn.addEventListener('click', () => {
    void handleDisconnect('settings');
  });
  copyPendingCodeBtn.addEventListener('click', handleCopyPendingCode);

  refreshProjectsBtn.addEventListener('click', handleRefreshDestination);
  organizationSelect.addEventListener('change', handleOrganizationChange);
  projectSelect.addEventListener('change', handleProjectChange);

  storeCredentialsToggle.addEventListener('change', handleStoreCredentialsChange);
  testConnectionBtn.addEventListener('click', handleTestConnection);
  saveSettingsBtn.addEventListener('click', handleSaveSettings);

  chrome.runtime.onMessage.addListener((message: Message) => {
    if (message.type === 'STATUS_UPDATE') {
      currentState = message.payload.state;
      updateUI();
    }
  });

  await updateStatus();

  try {
    await refreshWorkspaceContext();
  } catch (error) {
    console.error('[Popup] Failed to initialize workspace context:', error);
  }

  await checkLastUploadResult();
}

async function updateStatus(): Promise<void> {
  try {
    const response = await sendMessage<StatusResponse>({ type: 'GET_STATUS' });

    if (!response.success || !response.data) {
      return;
    }

    currentState = response.data.state;

    if (response.data.metadata?.testName) {
      currentTestName.textContent = response.data.metadata.testName;
      testNameInput.value = response.data.metadata.testName;
    }

    if (response.data.metadata?.startTime) {
      startTime = new Date(response.data.metadata.startTime).getTime();
      if (currentState === 'recording') {
        startDurationTimer();
      }
    }

    updateUI();
  } catch (error) {
    console.error('[Popup] Failed to get status:', error);
  }
}

function updateUI(): void {
  statusBadge.className = `status-badge ${currentState}`;
  const statusText = statusBadge.querySelector('.status-text') as HTMLElement;
  statusText.textContent =
    currentState === 'idle' ? 'Idle' : currentState === 'recording' ? 'Recording' : 'Paused';

  const isRecording = currentState !== 'idle';
  startBtn.style.display = isRecording ? 'none' : 'flex';
  pauseBtn.style.display = isRecording ? 'flex' : 'none';
  assertionBtn.style.display = isRecording ? 'flex' : 'none';
  stopButtons.style.display = isRecording ? 'flex' : 'none';
  recordingInfo.style.display = isRecording ? 'block' : 'none';
  testNameInput.disabled = isRecording;
  credentialToggleSection.style.display = isRecording ? 'none' : 'flex';

  const pauseIcon = pauseBtn.querySelector('.pause-icon') as HTMLElement;
  const resumeIcon = pauseBtn.querySelector('.resume-icon') as HTMLElement;

  if (currentState === 'recording') {
    pauseIcon.style.display = 'block';
    resumeIcon.style.display = 'none';
    pauseBtnText.textContent = 'Pause';
    assertionCount.textContent = 'Ready';
  } else {
    pauseIcon.style.display = 'none';
    resumeIcon.style.display = 'block';
    pauseBtnText.textContent = 'Resume';
    assertionCount.textContent = 'Paused';
  }

  if (!isRecording) {
    variablesSection.style.display = variablesList.childElementCount > 0 ? 'block' : 'none';
  }
}

function showMainTab(tab: PopupTab): void {
  activeTab = tab;

  const recorderActive = tab === 'recorder';
  recorderTabBtn.classList.toggle('active', recorderActive);
  recorderTabBtn.setAttribute('aria-selected', String(recorderActive));
  workspaceTabBtn.classList.toggle('active', !recorderActive);
  workspaceTabBtn.setAttribute('aria-selected', String(!recorderActive));

  recorderPanel.classList.toggle('active', recorderActive);
  recorderPanel.hidden = !recorderActive;
  workspacePanel.classList.toggle('active', !recorderActive);
  workspacePanel.hidden = recorderActive;
}

async function refreshWorkspaceContext(): Promise<void> {
  stopAuthPolling();

  let settings = await loadSettings();
  applySettingsInputs(settings);
  renderWorkspaceHero(settings);
  renderUploadTarget(settings);

  if (settings.pendingConnection && settings.connectionState === 'pending') {
    startAuthPolling(settings.pendingConnection.pollIntervalMs);
  }

  if (
    !settings.platformUrl ||
    settings.connectionState !== 'connected' ||
    !hasActiveConnection(settings)
  ) {
    workspacesCache = [];
    projectsCache = [];
    populateOrganizationDropdown([], settings.selectedOrganizationId);
    populateProjectDropdown([], settings.selectedProjectId);
    renderDestinationState(
      settings,
      'Connect your account to load the workspaces and projects you can upload to.'
    );
    updateUI();
    return;
  }

  const workspacesResult = await fetchWorkspaces(settings.platformUrl);
  if (!workspacesResult.success || !workspacesResult.workspaces) {
    if (workspacesResult.requiresReconnect) {
      settings = await loadSettings();
      renderWorkspaceHero(settings);
      renderUploadTarget(settings);
    }

    workspacesCache = [];
    projectsCache = [];
    populateOrganizationDropdown([], settings.selectedOrganizationId);
    populateProjectDropdown([], settings.selectedProjectId);
    renderDestinationState(
      settings,
      workspacesResult.error || 'Unable to load your workspaces right now.'
    );
    updateUI();
    return;
  }

  workspacesCache = workspacesResult.workspaces;

  const selectedWorkspace = resolveSelectedWorkspace(settings, workspacesCache);
  if (
    selectedWorkspace.id !== settings.selectedOrganizationId ||
    selectedWorkspace.name !== settings.selectedOrganizationName
  ) {
    await saveSettings({
      selectedOrganizationId: selectedWorkspace.id,
      selectedOrganizationName: selectedWorkspace.name,
      selectedProjectId:
        selectedWorkspace.id === settings.selectedOrganizationId ? settings.selectedProjectId : '',
      selectedProjectName:
        selectedWorkspace.id === settings.selectedOrganizationId
          ? settings.selectedProjectName
          : '',
    });
    settings = await loadSettings();
  }

  populateOrganizationDropdown(workspacesCache, settings.selectedOrganizationId);

  if (!settings.selectedOrganizationId) {
    projectsCache = [];
    populateProjectDropdown([], settings.selectedProjectId);
    renderDestinationState(settings, 'No workspaces are available for this account yet.');
    renderWorkspaceHero(settings);
    renderUploadTarget(settings);
    updateUI();
    return;
  }

  const activeWorkspace = workspacesCache.find(
    (workspace) => workspace.id === settings.selectedOrganizationId
  );
  if (!activeWorkspace) {
    projectsCache = [];
    populateProjectDropdown([], settings.selectedProjectId);
    renderDestinationState(settings, 'Choose a workspace to load its projects.');
    updateUI();
    return;
  }

  const projectsResult = await fetchProjects(settings.platformUrl, activeWorkspace);
  if (!projectsResult.success || !projectsResult.projects) {
    if (projectsResult.requiresReconnect) {
      settings = await loadSettings();
      renderWorkspaceHero(settings);
      renderUploadTarget(settings);
    }

    projectsCache = [];
    populateProjectDropdown([], settings.selectedProjectId);
    renderDestinationState(settings, projectsResult.error || 'Unable to load projects.');
    updateUI();
    return;
  }

  projectsCache = sortProjects(projectsResult.projects);

  const selectedProject = resolveSelectedProject(settings, projectsCache);
  if (
    selectedProject.id !== settings.selectedProjectId ||
    selectedProject.name !== settings.selectedProjectName
  ) {
    await saveSettings({
      selectedProjectId: selectedProject.id,
      selectedProjectName: selectedProject.name,
    });
    settings = await loadSettings();
  }

  populateProjectDropdown(projectsCache, settings.selectedProjectId);
  renderDestinationState(
    settings,
    projectsCache.length > 0
      ? 'Cloud uploads will route to the selected project.'
      : 'This workspace has no projects yet.'
  );
  renderWorkspaceHero(settings);
  renderUploadTarget(settings);
  updateUI();
}

function renderWorkspaceHero(settings: ExtensionSettings): void {
  const platformHost = getPlatformHost(settings.platformUrl);
  platformChip.textContent = platformHost || 'Not set';
  destinationSummary.textContent =
    settings.connectionState === 'connected' && settings.selectedProjectName
      ? settings.selectedOrganizationName
        ? `${settings.selectedOrganizationName} / ${settings.selectedProjectName}`
        : settings.selectedProjectName
      : settings.connectionState === 'connected'
        ? 'Choose a project'
        : 'Local only';

  setElementVisible(accountPanel, false, 'flex');
  setElementVisible(pendingConnectionPanel, false, 'flex');
  setElementVisible(connectAccountBtn, false, 'flex');
  setElementVisible(openAuthTabBtn, false, 'flex');
  setElementVisible(refreshConnectionBtn, false, 'flex');
  setElementVisible(disconnectBtn, false, 'flex');
  setElementVisible(openSettingsCtaBtn, false, 'flex');

  if (!settings.platformUrl) {
    workspaceStatePill.className = 'state-pill disconnected';
    workspaceStatePill.textContent = 'Disconnected';
    workspaceTitle.textContent = 'Add your platform URL';
    workspaceDescription.textContent =
      'You can still record locally. Add the platform URL when you want account login and cloud uploads.';
    setElementVisible(openSettingsCtaBtn, true, 'flex');
    return;
  }

  if (settings.connectionState === 'pending' && settings.pendingConnection) {
    workspaceStatePill.className = 'state-pill pending';
    workspaceStatePill.textContent = 'Pending';
    workspaceTitle.textContent = 'Finish sign-in';
    workspaceDescription.textContent =
      'Approve this extension in the browser tab you opened, then come back here.';
    pendingCode.textContent = settings.pendingConnection.verificationCode;
    pendingExpiresText.textContent = `Expires ${formatExpiry(settings.pendingConnection.expiresAt)}`;
    disconnectBtn.textContent = 'Cancel request';

    setElementVisible(pendingConnectionPanel, true, 'flex');
    setElementVisible(openAuthTabBtn, true, 'flex');
    setElementVisible(refreshConnectionBtn, true, 'flex');
    setElementVisible(disconnectBtn, true, 'flex');
    return;
  }

  if (settings.connectionState === 'connected' && settings.account) {
    workspaceStatePill.className = 'state-pill connected';
    workspaceStatePill.textContent = 'Connected';
    workspaceTitle.textContent = `Connected as ${settings.account.name}`;
    workspaceDescription.textContent = settings.selectedProjectName
      ? `Uploads will go to ${settings.selectedProjectName}.`
      : 'Choose a workspace and project to enable cloud upload.';

    accountAvatar.textContent = getAccountInitials(settings.account.name, settings.account.email);
    accountName.textContent = settings.account.name;
    accountEmail.textContent = settings.account.email;
    disconnectBtn.textContent = 'Disconnect';

    setElementVisible(accountPanel, true, 'flex');
    setElementVisible(disconnectBtn, true, 'flex');
    return;
  }

  workspaceStatePill.className =
    settings.connectionState === 'expired' ? 'state-pill expired' : 'state-pill disconnected';
  workspaceStatePill.textContent =
    settings.connectionState === 'expired' ? 'Expired' : 'Disconnected';
  workspaceTitle.textContent =
    settings.connectionState === 'expired' ? 'Reconnect your account' : 'Connect your account';
  workspaceDescription.textContent =
    settings.connectionState === 'expired'
      ? 'Your account session ended. Sign in again to restore cloud uploads.'
      : 'Keep using local save, or connect now to unlock organizations, projects, and cloud upload.';
  connectAccountBtn.textContent =
    settings.connectionState === 'expired' ? 'Reconnect Account' : 'Connect Account';
  setElementVisible(connectAccountBtn, true, 'flex');
}

function renderDestinationState(settings: ExtensionSettings, message: string): void {
  const connected = settings.connectionState === 'connected' && hasActiveConnection(settings);
  setElementVisible(destinationCard, connected);
  organizationSelect.disabled = workspacesCache.length === 0;
  projectSelect.disabled = projectsCache.length === 0;
  refreshProjectsBtn.disabled = !connected;
  destinationHint.textContent = message;
}

function renderUploadTarget(settings: ExtensionSettings): void {
  if (settings.connectionState === 'connected' && settings.selectedProjectName) {
    uploadTargetBadge.textContent = settings.autoUpload ? 'Auto upload' : 'Cloud upload';
    saveBtnText.textContent = 'Upload';
    return;
  }

  if (settings.connectionState === 'connected') {
    uploadTargetBadge.textContent = 'Pick project';
    saveBtnText.textContent = 'Save Local';
    return;
  }

  uploadTargetBadge.textContent = 'Local save';
  saveBtnText.textContent = 'Save Local';
}

function applySettingsInputs(settings: ExtensionSettings): void {
  platformUrlInput.value = settings.platformUrl;
  defaultTagsInput.value = settings.defaultTags;
  autoUploadToggle.checked = settings.autoUpload;
  storeCredentialsToggle.checked = settings.storeCredentials;
  settingsConnectionSummary.textContent =
    settings.connectionState === 'connected' && settings.account
      ? `${settings.account.name} connected to ${getPlatformHost(settings.platformUrl) || settings.platformUrl}`
      : settings.connectionState === 'pending'
        ? 'Connection request pending. Finish sign-in from the main screen.'
        : settings.connectionState === 'expired'
          ? 'Your session expired. Reconnect from the home screen.'
          : 'Not connected. Save a platform URL, then connect your account from the home screen.';
  setElementVisible(settingsDisconnectBtn, settings.connectionState === 'connected', 'flex');
}

async function handleConnectAccount(): Promise<void> {
  hideMessages();
  const settings = await loadSettings();

  if (!settings.platformUrl) {
    await showSettingsView();
    showError('Add your platform URL in settings first.', 'settings');
    return;
  }

  setLoading(connectAccountBtn, true);

  try {
    const result = await beginAccountConnection(settings.platformUrl);
    if (!result.success || !result.pendingConnection) {
      showError(result.error || 'Unable to start account connection.', 'workspace');
      return;
    }

    await chrome.tabs.create({ url: result.pendingConnection.authorizeUrl });
    await refreshWorkspaceContext();
    showSuccess('Login tab opened. Approve the extension there, then return here.', 'workspace');
  } catch (error) {
    showError((error as Error).message, 'workspace');
  } finally {
    setLoading(connectAccountBtn, false);
  }
}

async function handleOpenAuthTab(): Promise<void> {
  const settings = await loadSettings();
  if (!settings.pendingConnection?.authorizeUrl) {
    showError('No pending login request found. Start a new connection instead.', 'workspace');
    return;
  }

  await chrome.tabs.create({ url: settings.pendingConnection.authorizeUrl });
}

async function handleDisconnect(target: MessageTarget = 'workspace'): Promise<void> {
  hideMessages();
  try {
    await disconnectAccount();
    await refreshWorkspaceContext();
    showSuccess('Workspace disconnected. Recordings will stay local until you reconnect.', target);
  } catch (error) {
    showError(`Failed to disconnect: ${(error as Error).message}`, target);
  }
}

async function handleCopyPendingCode(): Promise<void> {
  const code = pendingCode.textContent.trim();
  if (!code || code === '-') {
    showError('No approval code available to copy.', 'workspace');
    return;
  }

  try {
    await navigator.clipboard.writeText(code);
    showSuccess('Approval code copied.', 'workspace');
  } catch {
    showError('Clipboard access was blocked. Copy the code manually instead.', 'workspace');
  }
}

function startAuthPolling(intervalMs: number): void {
  stopAuthPolling();
  authPollInterval = window.setInterval(
    () => {
      void checkPendingConnection(false);
    },
    Math.max(intervalMs, 1500)
  );
}

function stopAuthPolling(): void {
  if (authPollInterval !== null) {
    window.clearInterval(authPollInterval);
    authPollInterval = null;
  }
}

async function checkPendingConnection(showMessages: boolean): Promise<void> {
  const settings = await loadSettings();
  if (!settings.pendingConnection || settings.connectionState !== 'pending') {
    return;
  }

  const result = await pollAccountConnection(
    settings.platformUrl,
    settings.pendingConnection.sessionId
  );
  if (!result.success) {
    if (showMessages) {
      showError(result.error || 'Unable to check connection status.', 'workspace');
    }
    return;
  }

  if (result.status === 'pending') {
    if (showMessages) {
      showSuccess('Still waiting for approval. Finish sign-in in your browser tab.', 'workspace');
    }
    return;
  }

  stopAuthPolling();
  await refreshWorkspaceContext();

  if (result.status === 'approved') {
    showSuccess(
      result.account ? `Connected as ${result.account.name}.` : 'Workspace connected successfully.',
      'workspace'
    );
    return;
  }

  showError(result.error || 'Connection request expired. Start again to continue.', 'workspace');
}

async function handleTestConnection(): Promise<void> {
  clearSectionMessage('settings');
  const platformUrl = platformUrlInput.value.trim();

  if (!platformUrl) {
    showConnectionResult(false, 'Please enter a platform URL.');
    return;
  }

  if (!isValidUrl(platformUrl)) {
    showConnectionResult(false, 'Invalid URL format. Use http:// or https://.');
    return;
  }

  setLoading(testConnectionBtn, true);

  try {
    const result = await testConnection(platformUrl);
    showConnectionResult(
      result.success,
      result.success ? 'Platform is reachable.' : result.error || 'Platform check failed.'
    );
  } catch (error) {
    showConnectionResult(false, `Platform check failed: ${(error as Error).message}`);
  } finally {
    setLoading(testConnectionBtn, false);
  }
}

async function handleSaveSettings(): Promise<void> {
  clearSectionMessage('settings');
  const platformUrl = platformUrlInput.value.trim();
  const defaultTags = defaultTagsInput.value.trim();
  const autoUpload = autoUploadToggle.checked;

  if (platformUrl && !isValidUrl(platformUrl)) {
    showConnectionResult(false, 'Invalid URL format. Use http:// or https://.');
    return;
  }

  setLoading(saveSettingsBtn, true);

  try {
    const settings = await loadSettings();
    const normalizedUrl = platformUrl ? normalizePlatformUrl(platformUrl) : '';

    if (settings.platformUrl && settings.platformUrl !== normalizedUrl) {
      await clearConnectionData();
    }

    await saveSettings({
      platformUrl: normalizedUrl,
      defaultTags,
      autoUpload,
    });

    await refreshWorkspaceContext();
    showConnectionResult(
      true,
      settings.platformUrl && settings.platformUrl !== normalizedUrl
        ? 'Settings saved. Reconnect your account for the new platform URL.'
        : 'Settings saved successfully.'
    );
  } catch (error) {
    showConnectionResult(false, `Failed to save settings: ${(error as Error).message}`);
  } finally {
    setLoading(saveSettingsBtn, false);
  }
}

async function handleRefreshDestination(): Promise<void> {
  hideMessages();
  setLoading(refreshProjectsBtn, true);

  try {
    await refreshWorkspaceContext();
    showSuccess('Upload destinations refreshed.', 'destination');
  } catch (error) {
    showError(`Failed to refresh destinations: ${(error as Error).message}`, 'destination');
  } finally {
    setLoading(refreshProjectsBtn, false);
  }
}

async function handleOrganizationChange(): Promise<void> {
  const selectedOrganizationId = organizationSelect.value;
  const selectedWorkspace = workspacesCache.find(
    (workspace) => workspace.id === selectedOrganizationId
  );
  const selectedOrganizationName = selectedWorkspace?.name || '';

  try {
    await saveSettings({
      selectedOrganizationId,
      selectedOrganizationName,
      selectedProjectId: '',
      selectedProjectName: '',
    });
    await refreshWorkspaceContext();
  } catch (error) {
    showError(`Failed to save workspace: ${(error as Error).message}`, 'destination');
  }
}

async function handleProjectChange(): Promise<void> {
  const selectedProjectId = projectSelect.value;
  const selectedOption = projectSelect.options[projectSelect.selectedIndex];
  const selectedProjectName = selectedOption?.text || '';

  try {
    await saveSettings({
      selectedProjectId,
      selectedProjectName,
    });
    const settings = await loadSettings();
    renderWorkspaceHero(settings);
    renderUploadTarget(settings);
  } catch (error) {
    showError(`Failed to save project: ${(error as Error).message}`, 'destination');
  }
}

async function handleStoreCredentialsChange(): Promise<void> {
  try {
    await saveSettings({ storeCredentials: storeCredentialsToggle.checked });
  } catch (error) {
    showError(`Failed to update credential setting: ${(error as Error).message}`, 'recorder');
  }
}

async function handleStart(): Promise<void> {
  const testName = testNameInput.value.trim();

  if (!testName) {
    showError('Please enter a test name before recording.', 'recorder');
    testNameInput.focus();
    return;
  }

  hideMessages();
  setLoading(startBtn, true);

  try {
    const response = await sendMessage<MessageResponse>({
      type: 'START_RECORDING',
      payload: { testName },
    });

    if (response.success) {
      currentState = 'recording';
      startTime = Date.now();
      currentTestName.textContent = testName;
      startDurationTimer();
      updateUI();
      showSuccess('Recording started.', 'recorder');
      return;
    }

    showError(response.error || 'Failed to start recording.', 'recorder');
  } catch (error) {
    showError((error as Error).message, 'recorder');
  } finally {
    setLoading(startBtn, false);
  }
}

async function handlePauseResume(): Promise<void> {
  hideMessages();
  setLoading(pauseBtn, true);

  try {
    const messageType = currentState === 'recording' ? 'PAUSE_RECORDING' : 'RESUME_RECORDING';
    const response = await sendMessage<MessageResponse>({ type: messageType });

    if (!response.success) {
      showError(response.error || 'Unable to change recording state.', 'recorder');
      return;
    }

    currentState = currentState === 'recording' ? 'paused' : 'recording';

    if (currentState === 'paused') {
      stopDurationTimer();
      showSuccess('Recording paused.', 'recorder');
    } else {
      startDurationTimer();
      showSuccess('Recording resumed.', 'recorder');
    }

    updateUI();
  } catch (error) {
    showError((error as Error).message, 'recorder');
  } finally {
    setLoading(pauseBtn, false);
  }
}

async function handleSave(): Promise<void> {
  hideMessages();
  setLoading(saveBtn, true);

  try {
    const response = await sendMessage<RecordingResponse>({ type: 'STOP_RECORDING' });

    if (!response.success || !response.data) {
      showError(response.error || 'Failed to stop recording.', 'recorder');
      return;
    }

    stopDurationTimer();
    lastRecording = response.data;

    const settings = await loadSettings();
    const canUpload = settings.connectionState === 'connected' && !!settings.selectedProjectId;

    if (canUpload) {
      await uploadWithProgress(response.data, settings);
    } else {
      await downloadRecording(response.data);
      showSuccess(
        settings.platformUrl
          ? 'Recording downloaded locally. Choose a project to upload next time.'
          : 'Recording downloaded locally.',
        'recorder'
      );
    }

    currentState = 'idle';
    startTime = null;
    testNameInput.value = '';
    updateUI();
    await refreshWorkspaceContext();
  } catch (error) {
    showError((error as Error).message, 'recorder');
  } finally {
    setLoading(saveBtn, false);
  }
}

async function uploadWithProgress(
  recording: Recording,
  settings: ExtensionSettings
): Promise<void> {
  const selectedProjectId = projectSelect.value || settings.selectedProjectId;

  if (!selectedProjectId) {
    await downloadRecording(recording);
    showError('No project selected. Recording downloaded locally.', 'recorder');
    return;
  }

  uploadProgress.style.display = 'block';
  uploadProgress.className = 'upload-progress';
  uploadProgressLabel.textContent = 'Uploading to platform...';
  updateUploadProgress(12);

  try {
    updateUploadProgress(38);
    const result = await uploadRecordingToPlatform(
      recording,
      parseTags(settings.defaultTags),
      selectedProjectId
    );
    updateUploadProgress(92);

    if (result.success) {
      updateUploadProgress(100);
      uploadProgress.className = 'upload-progress success';
      uploadProgressLabel.textContent = 'Uploaded successfully';
      showUploadNotification(result);
      showSuccess(
        `Recording "${result.recordingName || recording.testName}" uploaded.`,
        'recorder'
      );

      window.setTimeout(() => {
        uploadProgress.style.display = 'none';
      }, 1800);
      return;
    }

    await downloadRecording(recording);
    uploadProgress.className = 'upload-progress error';
    uploadProgressLabel.textContent = result.requiresReconnect
      ? 'Session expired. Recording saved locally.'
      : `Upload failed: ${result.error}`;
    updateUploadProgress(100);
    showUploadNotification(result);
    showError(`${result.error || 'Upload failed.'} Recording downloaded locally.`, 'recorder');

    if (result.requiresReconnect) {
      await refreshWorkspaceContext();
    }

    window.setTimeout(() => {
      uploadProgress.style.display = 'none';
    }, 3200);
  } catch (error) {
    await downloadRecording(recording);
    uploadProgress.className = 'upload-progress error';
    uploadProgressLabel.textContent = `Upload error: ${(error as Error).message}`;
    updateUploadProgress(100);
    showError('Upload failed. Recording downloaded locally.', 'recorder');

    window.setTimeout(() => {
      uploadProgress.style.display = 'none';
    }, 3200);
  }
}

async function handleDownload(): Promise<void> {
  hideMessages();

  if (lastRecording) {
    await downloadRecording(lastRecording);
    showSuccess('Recording downloaded.', 'recorder');
    return;
  }

  setLoading(downloadBtn, true);

  try {
    const response = await sendMessage<RecordingResponse>({ type: 'STOP_RECORDING' });
    if (!response.success || !response.data) {
      showError('No recording available to download.', 'recorder');
      return;
    }

    stopDurationTimer();
    lastRecording = response.data;
    await downloadRecording(response.data);
    showSuccess('Recording downloaded.', 'recorder');

    currentState = 'idle';
    startTime = null;
    testNameInput.value = '';
    updateUI();
  } catch (error) {
    showError((error as Error).message, 'recorder');
  } finally {
    setLoading(downloadBtn, false);
  }
}

async function handleAddAssertion(): Promise<void> {
  hideMessages();
  setLoading(assertionBtn, true);

  try {
    const response = await sendMessage<MessageResponse>({ type: 'ENTER_ASSERTION_MODE' });
    if (response.success) {
      showSuccess('Assertion mode active. Click an element on the page.', 'recorder');
      return;
    }

    showError(response.error || 'Failed to enter assertion mode.', 'recorder');
  } catch (error) {
    showError((error as Error).message, 'recorder');
  } finally {
    setLoading(assertionBtn, false);
  }
}

function startDurationTimer(): void {
  stopDurationTimer();

  const updateDurationDisplay = (): void => {
    if (!startTime) {
      return;
    }

    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;
    duration.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  };

  updateDurationDisplay();
  durationInterval = window.setInterval(updateDurationDisplay, 1000);
  startActionCountPolling();
}

function stopDurationTimer(): void {
  if (durationInterval !== null) {
    window.clearInterval(durationInterval);
    durationInterval = null;
  }

  stopActionCountPolling();
}

function startActionCountPolling(): void {
  stopActionCountPolling();

  const updateActionData = async (): Promise<void> => {
    try {
      const response = await sendMessage<StatusResponse>({ type: 'GET_STATUS' });
      if (response.success && response.data) {
        if (response.data.state === 'idle') {
          stopActionCountPolling();
          return;
        }

        actionCount.textContent = String(response.data.metadata?.actionCount || 0);
      }

      const variableResponse = await sendMessage<
        MessageResponse<
          Array<{
            variableName: string;
            fieldType: string;
            defaultValue: string;
          }>
        >
      >({ type: 'GET_VARIABLES' });
      if (variableResponse.success && Array.isArray(variableResponse.data)) {
        updateVariablesUI(
          variableResponse.data as Array<{
            variableName: string;
            fieldType: string;
            defaultValue: string;
          }>
        );
      }
    } catch (error) {
      console.error('[Popup] Failed to update action data:', error);
    }
  };

  void updateActionData();
  pollInterval = window.setInterval(() => {
    void updateActionData();
  }, 1000);
}

function stopActionCountPolling(): void {
  if (pollInterval !== null) {
    window.clearInterval(pollInterval);
    pollInterval = null;
  }
}

function updateVariablesUI(
  variables: Array<{ variableName: string; fieldType: string; defaultValue: string }>
): void {
  variableCount.textContent = String(variables.length);
  variablesList.innerHTML = '';

  if (variables.length === 0) {
    variablesSection.style.display = 'none';
    return;
  }

  variablesSection.style.display = 'block';

  for (const variable of variables) {
    const item = document.createElement('div');
    item.className = 'variable-item';

    const name = document.createElement('span');
    name.className = 'variable-name';
    name.textContent = `\${${variable.variableName}}`;

    const defaultValue = document.createElement('span');
    defaultValue.className = 'variable-default';
    defaultValue.textContent = variable.defaultValue || `(${variable.fieldType})`;
    defaultValue.title = variable.defaultValue;

    item.appendChild(name);
    item.appendChild(defaultValue);
    variablesList.appendChild(item);
  }
}

async function showSettingsView(): Promise<void> {
  mainView.style.display = 'none';
  settingsView.style.display = 'flex';
  applySettingsInputs(await loadSettings());
}

function showMainView(): void {
  settingsView.style.display = 'none';
  mainView.style.display = 'flex';
  showMainTab(activeTab);
}

async function checkLastUploadResult(): Promise<void> {
  try {
    const response = await new Promise<{
      success: boolean;
      data: { success: boolean; error?: string; recordingName?: string; timestamp: number } | null;
    }>((resolve) => {
      chrome.runtime.sendMessage({ type: 'GET_LAST_UPLOAD_RESULT' }, resolve);
    });

    if (!response.success || !response.data || Date.now() - response.data.timestamp >= 30000) {
      return;
    }

    if (response.data.success) {
      showSuccess(`Recording "${response.data.recordingName}" uploaded successfully.`, 'recorder');
      return;
    }

    showError(`Upload failed: ${response.data.error}`, 'recorder');
  } catch {
    // Ignore missing upload result state.
  }
}

function populateOrganizationDropdown(
  workspaces: Workspace[],
  selectedOrganizationId: string
): void {
  organizationSelect.innerHTML = '<option value="">Select a workspace...</option>';

  for (const workspace of workspaces) {
    const option = document.createElement('option');
    option.value = workspace.id;
    option.textContent =
      workspace.type === 'organization' && workspace.role
        ? `${workspace.name} (${workspace.role})`
        : workspace.name;
    option.selected = workspace.id === selectedOrganizationId;
    organizationSelect.appendChild(option);
  }
}

function populateProjectDropdown(projects: Project[], selectedProjectId: string): void {
  projectSelect.innerHTML = '<option value="">Select a project...</option>';

  for (const project of projects) {
    const option = document.createElement('option');
    option.value = project.id;
    option.textContent = project.isDefault ? `${project.name} (Default)` : project.name;
    option.selected = project.id === selectedProjectId;
    projectSelect.appendChild(option);
  }
}

function resolveSelectedWorkspace(
  settings: ExtensionSettings,
  workspaces: Workspace[]
): { id: string; name: string } {
  if (workspaces.length === 0) {
    return { id: '', name: '' };
  }

  const existingSelection = workspaces.find(
    (workspace) => workspace.id === settings.selectedOrganizationId
  );
  const workspace = existingSelection || workspaces[0];
  if (!workspace) {
    return { id: '', name: '' };
  }

  return {
    id: workspace.id,
    name: workspace.name,
  };
}

function resolveSelectedProject(
  settings: ExtensionSettings,
  projects: Project[]
): { id: string; name: string } {
  if (projects.length === 0) {
    return { id: '', name: '' };
  }

  const existingSelection = projects.find((project) => project.id === settings.selectedProjectId);
  const fallbackSelection = projects.find((project) => project.isDefault) || projects[0];
  const project = existingSelection || fallbackSelection;
  if (!project) {
    return { id: '', name: '' };
  }

  return {
    id: project.id,
    name: project.name,
  };
}

function sortProjects(projects: Project[]): Project[] {
  return [...projects].sort((left, right) => {
    if (left.isDefault && !right.isDefault) {
      return -1;
    }

    if (!left.isDefault && right.isDefault) {
      return 1;
    }

    return left.name.localeCompare(right.name);
  });
}

function getPlatformHost(platformUrl: string): string {
  if (!platformUrl) {
    return '';
  }

  try {
    return new URL(platformUrl).host;
  } catch {
    return platformUrl;
  }
}

function getAccountInitials(name: string, email: string): string {
  const source = name || email;
  const parts = source.split(/\s+/).filter(Boolean).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() || '').join('') || 'SA';
}

function formatExpiry(expiresAt: string): string {
  const expiresAtMs = new Date(expiresAt).getTime();
  if (Number.isNaN(expiresAtMs)) {
    return 'soon';
  }

  const minutes = Math.max(0, Math.round((expiresAtMs - Date.now()) / 60000));
  return minutes <= 1 ? 'in under a minute' : `in ${minutes} min`;
}

function setElementVisible(element: HTMLElement, visible: boolean, display = 'block'): void {
  element.style.display = visible ? display : 'none';
}

function updateUploadProgress(percent: number): void {
  uploadProgressPercent.textContent = `${percent}%`;
  uploadProgressFill.style.width = `${percent}%`;
}

function setLoading(button: HTMLButtonElement, loading: boolean): void {
  if (loading) {
    button.classList.add('loading');
    button.disabled = true;
    return;
  }

  button.classList.remove('loading');
  button.disabled = false;
}

function showConnectionResult(success: boolean, message: string): void {
  showSectionMessage('settings', success ? 'success' : 'error', message, 5000);
}

function showError(message: string, target: MessageTarget = 'recorder'): void {
  showSectionMessage(target, 'error', message, 5000);
}

function showSuccess(message: string, target: MessageTarget = 'recorder'): void {
  showSectionMessage(target, 'success', message, 3200);
}

function hideMessages(): void {
  clearAllSectionMessages();
}

function showSectionMessage(
  target: MessageTarget,
  kind: MessageKind,
  message: string,
  timeoutMs: number
): void {
  const slot = messageSlots[target];
  const icon =
    kind === 'success'
      ? '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="7" stroke="currentColor" stroke-width="1.5" /><path d="M5 8L7 10L11 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" /></svg>'
      : '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="7" stroke="currentColor" stroke-width="1.5" /><path d="M8 4V9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" /><circle cx="8" cy="11.5" r="0.5" fill="currentColor" /></svg>';

  clearSectionMessage(target);
  slot.innerHTML = `<div class="inline-message inline-message-${kind}">${icon}<span>${escapeHtml(message)}</span></div>`;

  messageTimers[target] = window.setTimeout(() => {
    clearSectionMessage(target);
  }, timeoutMs);
}

function clearSectionMessage(target: MessageTarget): void {
  const slot = messageSlots[target];
  const activeTimer = messageTimers[target];
  if (activeTimer !== undefined) {
    window.clearTimeout(activeTimer);
    delete messageTimers[target];
  }

  slot.innerHTML = '';
}

function clearAllSectionMessages(): void {
  clearSectionMessage('workspace');
  clearSectionMessage('destination');
  clearSectionMessage('recorder');
  clearSectionMessage('settings');
}

function escapeHtml(value: string): string {
  const element = document.createElement('div');
  element.textContent = value;
  return element.innerHTML;
}

async function sendMessage<T = unknown>(message: Message): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response: T) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      resolve(response);
    });
  });
}

void init();

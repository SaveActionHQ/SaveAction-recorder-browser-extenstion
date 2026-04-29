/**
 * Platform API module.
 * Handles session-based login, workspace/project loading, and authenticated uploads.
 */

import type { Recording } from '@/types/recording';
import type {
  ApiErrorPayload,
  AuthTokens,
  BeginConnectionResult,
  ConnectedAccount,
  ConnectionTestResult,
  ExtensionAuthPollResponse,
  ExtensionAuthRefreshResponse,
  ExtensionAuthStartResponse,
  ExtensionSettings,
  HealthResponse,
  PendingConnection,
  PollConnectionResult,
  Project,
  ProjectsResponse,
  UploadResponse,
  UploadResult,
  Workspace,
  WorkspaceType,
  WorkspacesResponse,
} from '@/types/settings';
import {
  DEFAULT_SETTINGS,
  hasActiveConnection,
  isTokenExpired,
  normalizePlatformUrl,
  parseTags,
  SETTINGS_STORAGE_KEYS,
} from '@/types/settings';
import { normalizeRecording } from '@/utils/recording-normalizer';
import { validateRecording } from '@/utils/validator';

interface AuthFetchResult {
  success: boolean;
  response?: Response;
  error?: string;
  requiresReconnect?: boolean;
}

interface AccessTokenResult {
  success: boolean;
  accessToken?: string;
  error?: string;
  requiresReconnect?: boolean;
}

const STORAGE_KEYS = Object.values(SETTINGS_STORAGE_KEYS);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function parseAccount(value: unknown): ConnectedAccount | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = asString(value.id);
  const email = asString(value.email);
  if (!id || !email) {
    return null;
  }

  return {
    id,
    name: asString(value.name, email),
    email,
    avatarUrl: typeof value.avatarUrl === 'string' ? value.avatarUrl : null,
  };
}

function parsePendingConnection(value: unknown): PendingConnection | null {
  if (!isRecord(value)) {
    return null;
  }

  const sessionId = asString(value.sessionId);
  const authorizeUrl = asString(value.authorizeUrl);
  const verificationCode = asString(value.verificationCode);
  const expiresAt = asString(value.expiresAt);
  if (!sessionId || !authorizeUrl || !verificationCode || !expiresAt) {
    return null;
  }

  return {
    sessionId,
    authorizeUrl,
    verificationCode,
    expiresAt,
    pollIntervalMs:
      typeof value.pollIntervalMs === 'number' && value.pollIntervalMs > 0
        ? value.pollIntervalMs
        : 2000,
  };
}

function parseAuthTokens(value: unknown): AuthTokens | null {
  if (!isRecord(value)) {
    return null;
  }

  const accessToken = asString(value.accessToken);
  const refreshToken = asString(value.refreshToken);
  const accessTokenExpiresAt = asString(value.accessTokenExpiresAt);
  if (!accessToken || !refreshToken || !accessTokenExpiresAt) {
    return null;
  }

  return {
    accessToken,
    refreshToken,
    accessTokenExpiresAt,
  };
}

function parseWorkspaceType(value: unknown, fallback: WorkspaceType): WorkspaceType {
  return value === 'personal' || value === 'organization' ? value : fallback;
}

function parseWorkspace(value: unknown): Workspace | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = asString(value.id, asString(value.organizationId, asString(value.orgId)));
  const name = asString(value.name);
  if (!id || !name) {
    return null;
  }

  const slug = asString(value.slug, name.toLowerCase().replace(/\s+/g, '-'));
  const rawType = asString(value.type, asString(value.workspaceType));
  const role = asString(value.role);
  const organizationId = asString(value.organizationId, asString(value.orgId));
  const inferredType: WorkspaceType =
    rawType === 'personal' || rawType === 'organization'
      ? rawType
      : name.toLowerCase() === 'personal' || slug === 'personal'
        ? 'personal'
        : role || organizationId
          ? 'organization'
          : 'organization';

  return {
    id,
    name,
    slug,
    type: parseWorkspaceType(rawType, inferredType),
    role: role || null,
    organizationId: organizationId || null,
    projectCount:
      typeof value.projectCount === 'number' && value.projectCount >= 0
        ? value.projectCount
        : undefined,
    createdAt: asString(value.createdAt) || undefined,
    updatedAt: asString(value.updatedAt) || undefined,
  };
}

function parseWorkspaces(value: unknown): Workspace[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((workspace) => parseWorkspace(workspace))
    .filter((workspace): workspace is Workspace => workspace !== null);
}

function buildSettings(result: Record<string, unknown>): ExtensionSettings {
  const connectionState = asString(result.connectionState, DEFAULT_SETTINGS.connectionState);

  return {
    platformUrl: asString(result.platformUrl, DEFAULT_SETTINGS.platformUrl),
    connectionState:
      connectionState === 'pending' ||
      connectionState === 'connected' ||
      connectionState === 'expired'
        ? connectionState
        : DEFAULT_SETTINGS.connectionState,
    account: parseAccount(result.account),
    pendingConnection: parsePendingConnection(result.pendingConnection),
    authTokens: parseAuthTokens(result.authTokens),
    selectedOrganizationId: asString(
      result.selectedOrganizationId,
      DEFAULT_SETTINGS.selectedOrganizationId
    ),
    selectedOrganizationName: asString(
      result.selectedOrganizationName,
      DEFAULT_SETTINGS.selectedOrganizationName
    ),
    selectedProjectId: asString(result.selectedProjectId, DEFAULT_SETTINGS.selectedProjectId),
    selectedProjectName: asString(result.selectedProjectName, DEFAULT_SETTINGS.selectedProjectName),
    autoUpload: asBoolean(result.autoUpload, DEFAULT_SETTINGS.autoUpload),
    defaultTags: asString(result.defaultTags, DEFAULT_SETTINGS.defaultTags),
    storeCredentials: asBoolean(result.storeCredentials, DEFAULT_SETTINGS.storeCredentials),
  };
}

async function parseApiError(
  response: Response,
  fallbackMessage: string
): Promise<{ message: string; code: string }> {
  try {
    const payload = (await response.json()) as { error?: ApiErrorPayload };
    return {
      message: payload.error?.message || fallbackMessage,
      code: payload.error?.code || 'UNKNOWN',
    };
  } catch {
    return {
      message: fallbackMessage,
      code: 'UNKNOWN',
    };
  }
}

function createJsonHeaders(accessToken?: string, includeJsonContentType = false): HeadersInit {
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };

  if (includeJsonContentType) {
    headers['Content-Type'] = 'application/json';
  }

  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  return headers;
}

export async function loadSettings(): Promise<ExtensionSettings> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(STORAGE_KEYS, (result) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      resolve(buildSettings(result as Record<string, unknown>));
    });
  });
}

export async function saveSettings(settings: Partial<ExtensionSettings>): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set(settings, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      resolve();
    });
  });
}

export async function clearConnectionData(): Promise<void> {
  await saveSettings({
    connectionState: 'disconnected',
    account: null,
    pendingConnection: null,
    authTokens: null,
    selectedOrganizationId: '',
    selectedOrganizationName: '',
    selectedProjectId: '',
    selectedProjectName: '',
  });
}

async function markConnectionExpired(): Promise<void> {
  const settings = await loadSettings();
  await saveSettings({
    connectionState: 'expired',
    account: settings.account,
    pendingConnection: null,
    authTokens: null,
    selectedProjectId: '',
    selectedProjectName: '',
  });
}

export async function disconnectAccount(revokeRemote = true): Promise<void> {
  const settings = await loadSettings();

  if (
    revokeRemote &&
    settings.platformUrl &&
    settings.authTokens?.refreshToken &&
    settings.connectionState === 'connected'
  ) {
    try {
      await fetch(`${normalizePlatformUrl(settings.platformUrl)}/api/v1/extension-auth/logout`, {
        method: 'POST',
        headers: createJsonHeaders(settings.authTokens.accessToken, true),
        body: JSON.stringify({ refreshToken: settings.authTokens.refreshToken }),
      });
    } catch {
      // Best effort only.
    }
  }

  await clearConnectionData();
}

export async function testConnection(platformUrl: string): Promise<ConnectionTestResult> {
  const normalizedUrl = normalizePlatformUrl(platformUrl);

  try {
    const response = await fetch(`${normalizedUrl}/api/health`, {
      method: 'GET',
      headers: createJsonHeaders(),
    });

    if (!response.ok) {
      return {
        success: false,
        error: `Cannot reach platform at ${platformUrl}`,
        errorType: 'network',
      };
    }

    const payload = (await response.json()) as HealthResponse;
    if (payload.status !== 'ok') {
      return {
        success: false,
        error: 'Platform health check failed',
        errorType: 'server',
      };
    }

    return { success: true };
  } catch {
    return {
      success: false,
      error: `Cannot reach platform at ${platformUrl}`,
      errorType: 'network',
    };
  }
}

export async function beginAccountConnection(platformUrl: string): Promise<BeginConnectionResult> {
  const health = await testConnection(platformUrl);
  if (!health.success) {
    return health;
  }

  const normalizedUrl = normalizePlatformUrl(platformUrl);

  try {
    const response = await fetch(`${normalizedUrl}/api/v1/extension-auth/sessions`, {
      method: 'POST',
      headers: createJsonHeaders(undefined, true),
      body: JSON.stringify({ source: 'browser-extension' }),
    });

    if (!response.ok) {
      const apiError = await parseApiError(response, 'Failed to start account connection');
      return {
        success: false,
        error: apiError.message,
        errorType: 'server',
      };
    }

    const payload = (await response.json()) as ExtensionAuthStartResponse;
    const pendingConnection = parsePendingConnection(payload.data);

    if (!payload.success || !pendingConnection) {
      return {
        success: false,
        error: payload.error?.message || 'Platform returned an invalid login session',
        errorType: 'server',
      };
    }

    await saveSettings({
      platformUrl: normalizedUrl,
      connectionState: 'pending',
      pendingConnection,
      account: null,
      authTokens: null,
      selectedOrganizationId: '',
      selectedOrganizationName: '',
      selectedProjectId: '',
      selectedProjectName: '',
    });

    return {
      success: true,
      pendingConnection,
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to start account connection: ${(error as Error).message}`,
      errorType: 'network',
    };
  }
}

export async function pollAccountConnection(
  platformUrl?: string,
  sessionId?: string
): Promise<PollConnectionResult> {
  const settings = await loadSettings();
  const activePlatformUrl = normalizePlatformUrl(platformUrl || settings.platformUrl);
  const pendingConnection = settings.pendingConnection;
  const activeSessionId = sessionId || pendingConnection?.sessionId;

  if (!activePlatformUrl || !activeSessionId) {
    return {
      success: false,
      status: 'expired',
      error: 'No pending connection found',
      errorType: 'session',
    };
  }

  try {
    const response = await fetch(
      `${activePlatformUrl}/api/v1/extension-auth/sessions/${activeSessionId}`,
      {
        method: 'GET',
        headers: createJsonHeaders(),
      }
    );

    if (!response.ok) {
      const apiError = await parseApiError(response, 'Failed to check account connection status');

      if (response.status === 404 || response.status === 410) {
        await saveSettings({
          connectionState: 'expired',
          pendingConnection: null,
          authTokens: null,
        });
        return {
          success: true,
          status: 'expired',
          error: apiError.message,
          errorType: 'session',
        };
      }

      return {
        success: false,
        status: 'pending',
        error: apiError.message,
        errorType: 'server',
      };
    }

    const payload = (await response.json()) as ExtensionAuthPollResponse;
    const payloadData = payload.data;
    const status = payloadData?.status;

    if (!payload.success || !status || !payloadData) {
      return {
        success: false,
        status: 'pending',
        error: payload.error?.message || 'Platform returned an invalid login status',
        errorType: 'server',
      };
    }

    if (status === 'pending') {
      return {
        success: true,
        status,
      };
    }

    if (status === 'expired') {
      await saveSettings({ connectionState: 'expired', pendingConnection: null, authTokens: null });
      return {
        success: true,
        status,
        error: 'Connection request expired. Start again to continue.',
        errorType: 'session',
      };
    }

    const account = parseAccount(payloadData.account);
    const authTokens = parseAuthTokens({
      accessToken: payloadData.accessToken,
      refreshToken: payloadData.refreshToken,
      accessTokenExpiresAt: payloadData.accessTokenExpiresAt,
    });

    if (!account || !authTokens) {
      return {
        success: false,
        status: 'pending',
        error: 'Platform approved the session but returned incomplete account data',
        errorType: 'server',
      };
    }

    await saveSettings({
      platformUrl: activePlatformUrl,
      connectionState: 'connected',
      account,
      pendingConnection: null,
      authTokens,
    });

    return {
      success: true,
      status: 'approved',
      account,
    };
  } catch (error) {
    return {
      success: false,
      status: 'pending',
      error: `Failed to check account connection: ${(error as Error).message}`,
      errorType: 'network',
    };
  }
}

export async function refreshAccountSession(platformUrl?: string): Promise<AccessTokenResult> {
  const settings = await loadSettings();
  const normalizedUrl = normalizePlatformUrl(platformUrl || settings.platformUrl);
  const refreshToken = settings.authTokens?.refreshToken;

  if (!normalizedUrl || !refreshToken) {
    return {
      success: false,
      error: 'Account session is missing. Reconnect your workspace.',
      requiresReconnect: true,
    };
  }

  try {
    const response = await fetch(`${normalizedUrl}/api/v1/extension-auth/sessions/refresh`, {
      method: 'POST',
      headers: createJsonHeaders(undefined, true),
      body: JSON.stringify({ refreshToken }),
    });

    if (!response.ok) {
      const apiError = await parseApiError(response, 'Session refresh failed');
      await markConnectionExpired();
      return {
        success: false,
        error: apiError.message,
        requiresReconnect: true,
      };
    }

    const payload = (await response.json()) as ExtensionAuthRefreshResponse;
    const authTokens = parseAuthTokens(payload.data);
    if (!payload.success || !authTokens) {
      await markConnectionExpired();
      return {
        success: false,
        error: payload.error?.message || 'Session refresh returned invalid token data',
        requiresReconnect: true,
      };
    }

    await saveSettings({
      connectionState: 'connected',
      authTokens,
      pendingConnection: null,
    });

    return {
      success: true,
      accessToken: authTokens.accessToken,
    };
  } catch (error) {
    return {
      success: false,
      error: `Session refresh failed: ${(error as Error).message}`,
      requiresReconnect: true,
    };
  }
}

async function ensureValidAccessToken(platformUrl: string): Promise<AccessTokenResult> {
  const settings = await loadSettings();

  if (!hasActiveConnection(settings) || !settings.authTokens) {
    return {
      success: false,
      error: 'Connect your SaveAction account to continue.',
      requiresReconnect: true,
    };
  }

  if (!isTokenExpired(settings.authTokens.accessTokenExpiresAt)) {
    return {
      success: true,
      accessToken: settings.authTokens.accessToken,
    };
  }

  return refreshAccountSession(platformUrl);
}

async function authenticatedFetch(
  platformUrl: string,
  path: string,
  init: RequestInit = {}
): Promise<AuthFetchResult> {
  const normalizedUrl = normalizePlatformUrl(platformUrl);
  const tokenResult = await ensureValidAccessToken(normalizedUrl);
  if (!tokenResult.success || !tokenResult.accessToken) {
    return tokenResult;
  }

  const makeRequest = async (accessToken: string): Promise<Response> => {
    const mergedHeaders = {
      ...(init.headers || {}),
      ...createJsonHeaders(accessToken),
    };

    return fetch(`${normalizedUrl}${path}`, {
      ...init,
      headers: mergedHeaders,
    });
  };

  try {
    let response = await makeRequest(tokenResult.accessToken);

    if (response.status === 401) {
      const refreshed = await refreshAccountSession(normalizedUrl);
      if (!refreshed.success || !refreshed.accessToken) {
        return refreshed;
      }

      response = await makeRequest(refreshed.accessToken);
    }

    if (response.status === 401) {
      await markConnectionExpired();
      return {
        success: false,
        error: 'Your SaveAction session expired. Reconnect to continue.',
        requiresReconnect: true,
      };
    }

    return {
      success: true,
      response,
    };
  } catch (error) {
    return {
      success: false,
      error: (error as Error).message,
    };
  }
}

export async function fetchWorkspaces(platformUrl?: string): Promise<{
  success: boolean;
  workspaces?: Workspace[];
  error?: string;
  requiresReconnect?: boolean;
}> {
  const settings = await loadSettings();
  const activePlatformUrl = platformUrl || settings.platformUrl;

  if (!activePlatformUrl) {
    return {
      success: false,
      error: 'Platform URL is not configured',
    };
  }

  const request = await authenticatedFetch(activePlatformUrl, '/api/v1/workspaces?limit=100');
  if (!request.success || !request.response) {
    return {
      success: false,
      error: request.error || 'Failed to fetch workspaces',
      requiresReconnect: request.requiresReconnect,
    };
  }

  if (!request.response.ok) {
    const apiError = await parseApiError(request.response, 'Failed to fetch workspaces');
    return {
      success: false,
      error: apiError.message,
    };
  }

  const payload = (await request.response.json()) as WorkspacesResponse;
  return {
    success: true,
    workspaces: parseWorkspaces(payload.data),
  };
}

export async function fetchOrganizations(platformUrl?: string): Promise<{
  success: boolean;
  organizations?: Workspace[];
  error?: string;
  requiresReconnect?: boolean;
}> {
  const result = await fetchWorkspaces(platformUrl);
  return {
    success: result.success,
    organizations: result.workspaces,
    error: result.error,
    requiresReconnect: result.requiresReconnect,
  };
}

export async function fetchProjects(
  platformUrl: string,
  workspace: Pick<Workspace, 'id' | 'type' | 'organizationId'>
): Promise<{
  success: boolean;
  projects?: Project[];
  error?: string;
  requiresReconnect?: boolean;
}> {
  const query = new URLSearchParams({
    limit: '100',
    workspaceType: workspace.type,
  });

  if (workspace.type === 'organization') {
    query.set('orgId', workspace.organizationId || workspace.id);
  }

  const request = await authenticatedFetch(platformUrl, `/api/v1/projects?${query.toString()}`);

  if (!request.success || !request.response) {
    return {
      success: false,
      error: request.error || 'Failed to fetch projects',
      requiresReconnect: request.requiresReconnect,
    };
  }

  if (!request.response.ok) {
    const apiError = await parseApiError(request.response, 'Failed to fetch projects');
    return {
      success: false,
      error: apiError.message,
    };
  }

  const payload = (await request.response.json()) as ProjectsResponse;
  return {
    success: true,
    projects: payload.data || [],
  };
}

export async function uploadRecording(
  recording: Recording,
  tags: string[],
  projectId: string
): Promise<UploadResult> {
  const settings = await loadSettings();

  if (!settings.platformUrl) {
    return {
      success: false,
      error: 'Platform URL is not configured',
      errorCode: 'NO_PLATFORM',
    };
  }

  const normalizedRecording = normalizeRecording(recording);
  const validation = validateRecording(normalizedRecording);
  if (!validation.isValid) {
    return {
      success: false,
      error:
        validation.errors
          .slice(0, 5)
          .map(({ field, message }) => `${field}: ${message}`)
          .join('; ') || 'Invalid recording data',
      errorCode: 'VALIDATION_ERROR',
    };
  }

  const requestBody: Record<string, unknown> = {
    name: normalizedRecording.testName,
    tags,
    data: normalizedRecording,
    projectId,
  };

  const request = await authenticatedFetch(settings.platformUrl, '/api/v1/recordings', {
    method: 'POST',
    headers: createJsonHeaders(undefined, true),
    body: JSON.stringify(requestBody),
  });

  if (!request.success || !request.response) {
    return {
      success: false,
      error: request.error || 'Upload failed',
      errorCode: request.requiresReconnect ? 'SESSION_EXPIRED' : 'NETWORK_ERROR',
      requiresReconnect: request.requiresReconnect,
    };
  }

  const response = request.response;
  if (response.status === 201) {
    const payload = (await response.json()) as UploadResponse;
    return {
      success: true,
      recordingId: payload.data?.id,
      recordingName: payload.data?.name,
    };
  }

  if (response.status === 409) {
    return {
      success: false,
      alreadyExists: true,
      error: 'Recording already exists on platform',
      errorCode: 'DUPLICATE',
    };
  }

  const fallbackMessage = `Upload failed (${response.status})`;
  const apiError = await parseApiError(response, fallbackMessage);

  if (response.status === 413) {
    return {
      success: false,
      error: 'Recording too large (exceeds 10MB limit)',
      errorCode: 'TOO_LARGE',
    };
  }

  if (response.status === 400) {
    return {
      success: false,
      error: apiError.message,
      errorCode: 'VALIDATION_ERROR',
    };
  }

  if (response.status === 401) {
    await markConnectionExpired();
    return {
      success: false,
      error: 'Your SaveAction session expired. Reconnect to continue.',
      errorCode: 'SESSION_EXPIRED',
      requiresReconnect: true,
    };
  }

  return {
    success: false,
    error: apiError.message,
    errorCode: apiError.code || 'UPLOAD_FAILED',
  };
}

export async function isAutoUploadConfigured(): Promise<boolean> {
  const settings = await loadSettings();
  return settings.autoUpload && hasActiveConnection(settings) && !!settings.selectedProjectId;
}

export async function uploadIfEnabled(
  recording: Recording,
  projectId?: string
): Promise<UploadResult | null> {
  const settings = await loadSettings();

  if (!settings.autoUpload) {
    return null;
  }

  if (!settings.platformUrl || !hasActiveConnection(settings)) {
    return {
      success: false,
      error: 'Connect your SaveAction account to enable auto-upload.',
      errorCode: 'NO_CONNECTION',
      requiresReconnect: true,
    };
  }

  const validProjectId = projectId?.trim() || settings.selectedProjectId;
  if (!validProjectId) {
    return {
      success: false,
      error: 'No project selected. Please choose a destination project first.',
      errorCode: 'NO_PROJECT',
    };
  }

  return uploadRecording(recording, parseTags(settings.defaultTags), validProjectId);
}

export function showUploadNotification(result: UploadResult): void {
  const iconUrl = chrome.runtime.getURL('icon-48.png');

  if (result.success) {
    chrome.notifications.create('upload-success', {
      type: 'basic',
      iconUrl,
      title: 'SaveAction',
      message: `Recording "${result.recordingName || 'Untitled'}" uploaded to platform`,
    });
    return;
  }

  if (result.alreadyExists) {
    chrome.notifications.create('upload-duplicate', {
      type: 'basic',
      iconUrl,
      title: 'SaveAction',
      message: 'Recording already exists on platform',
    });
    return;
  }

  chrome.notifications.create('upload-error', {
    type: 'basic',
    iconUrl,
    title: 'SaveAction - Upload Failed',
    message: result.error || 'Unknown error occurred',
  });
}

export async function getConnectionStatus(): Promise<{
  configured: boolean;
  connected: boolean;
  pending: boolean;
  expired: boolean;
  autoUpload: boolean;
  platformUrl: string;
  accountName: string;
  organizationName: string;
  projectName: string;
}> {
  const settings = await loadSettings();

  return {
    configured: !!settings.platformUrl,
    connected: settings.connectionState === 'connected',
    pending: settings.connectionState === 'pending',
    expired: settings.connectionState === 'expired',
    autoUpload: settings.autoUpload,
    platformUrl: settings.platformUrl,
    accountName: settings.account?.name || '',
    organizationName: settings.selectedOrganizationName,
    projectName: settings.selectedProjectName,
  };
}

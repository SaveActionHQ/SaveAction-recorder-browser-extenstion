/**
 * Platform API Module
 * Handles communication with the SaveAction platform API
 */

import type { Recording } from '@/types/recording';
import type {
  ExtensionSettings,
  ConnectionTestResult,
  UploadResult,
  HealthResponse,
  UploadResponse,
  Project,
  ProjectsResponse,
} from '@/types/settings';
import { normalizePlatformUrl, parseTags, DEFAULT_SETTINGS } from '@/types/settings';

/**
 * Load settings from chrome.storage.sync
 */
export async function loadSettings(): Promise<ExtensionSettings> {
  return new Promise((resolve) => {
    chrome.storage.sync.get(
      [
        'platformUrl',
        'apiToken',
        'selectedProjectId',
        'selectedProjectName',
        'autoUpload',
        'defaultTags',
        'storeCredentials',
      ],
      (result) => {
        resolve({
          platformUrl: result.platformUrl || DEFAULT_SETTINGS.platformUrl,
          apiToken: result.apiToken || DEFAULT_SETTINGS.apiToken,
          selectedProjectId: result.selectedProjectId || DEFAULT_SETTINGS.selectedProjectId,
          selectedProjectName: result.selectedProjectName || DEFAULT_SETTINGS.selectedProjectName,
          autoUpload: result.autoUpload ?? DEFAULT_SETTINGS.autoUpload,
          defaultTags: result.defaultTags || DEFAULT_SETTINGS.defaultTags,
          storeCredentials: result.storeCredentials ?? DEFAULT_SETTINGS.storeCredentials,
        });
      }
    );
  });
}

/**
 * Save settings to chrome.storage.sync
 */
export async function saveSettings(settings: Partial<ExtensionSettings>): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.set(settings, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve();
      }
    });
  });
}

/**
 * Test connection to SaveAction platform
 * 1. Check health endpoint
 * 2. Verify API token with authenticated endpoint
 */
export async function testConnection(
  platformUrl: string,
  apiToken: string
): Promise<ConnectionTestResult> {
  const normalizedUrl = normalizePlatformUrl(platformUrl);

  // Step 1: Check health endpoint
  try {
    const healthResponse = await fetch(`${normalizedUrl}/api/health`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    });

    if (!healthResponse.ok) {
      return {
        success: false,
        error: `Cannot reach platform at ${platformUrl}`,
        errorType: 'network',
      };
    }

    const healthData: HealthResponse = await healthResponse.json();
    if (healthData.status !== 'ok') {
      return {
        success: false,
        error: `Platform health check failed`,
        errorType: 'server',
      };
    }
  } catch (error) {
    return {
      success: false,
      error: `Cannot reach platform at ${platformUrl}`,
      errorType: 'network',
    };
  }

  // Step 2: Verify API token by fetching projects list
  try {
    const authResponse = await fetch(`${normalizedUrl}/api/v1/projects?limit=1`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiToken}`,
        Accept: 'application/json',
      },
    });

    if (authResponse.status === 401) {
      return {
        success: false,
        error: 'Invalid API token',
        errorType: 'auth',
      };
    }

    if (authResponse.status === 403) {
      return {
        success: false,
        error: 'API token does not have required permissions',
        errorType: 'permission',
      };
    }

    if (!authResponse.ok) {
      return {
        success: false,
        error: `Connection error: ${authResponse.status}`,
        errorType: 'server',
      };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: `Connection error: ${(error as Error).message}`,
      errorType: 'network',
    };
  }
}

/**
 * Fetch projects from SaveAction platform
 */
export async function fetchProjects(
  platformUrl: string,
  apiToken: string
): Promise<{ success: boolean; projects?: Project[]; error?: string }> {
  const normalizedUrl = normalizePlatformUrl(platformUrl);

  try {
    const response = await fetch(`${normalizedUrl}/api/v1/projects?limit=100`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiToken}`,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      return {
        success: false,
        error: `Failed to fetch projects (${response.status})`,
      };
    }

    const result: ProjectsResponse = await response.json();
    return {
      success: true,
      projects: result.data,
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to fetch projects: ${(error as Error).message}`,
    };
  }
}

/**
 * Upload recording to SaveAction platform
 * Includes retry logic for network errors
 */
export async function uploadRecording(
  platformUrl: string,
  apiToken: string,
  recording: Recording,
  tags: string[],
  projectId?: string
): Promise<UploadResult> {
  const url = `${normalizePlatformUrl(platformUrl)}/api/v1/recordings`;
  const maxRetries = 2;
  let lastError: string | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Build request body with optional projectId
      const requestBody: Record<string, unknown> = {
        name: recording.testName,
        tags: tags,
        data: recording,
      };
      if (projectId) {
        requestBody.projectId = projectId;
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (response.status === 201) {
        const result: UploadResponse = await response.json();
        return {
          success: true,
          recordingId: result.data?.id,
          recordingName: result.data?.name,
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

      // Don't retry client errors (400, 401, 413)
      if (response.status >= 400 && response.status < 500) {
        const errorData: UploadResponse = await response.json().catch(() => ({
          success: false,
          error: { code: 'UNKNOWN', message: `Upload failed (${response.status})` },
        }));

        let errorMessage = errorData.error?.message || `Upload failed (${response.status})`;
        let errorCode = errorData.error?.code || 'UPLOAD_FAILED';

        if (response.status === 401) {
          errorMessage = 'Invalid API token';
          errorCode = 'UNAUTHORIZED';
        } else if (response.status === 413) {
          errorMessage = 'Recording too large (exceeds 10MB limit)';
          errorCode = 'TOO_LARGE';
        } else if (response.status === 400) {
          // Keep the actual error message from the API for validation errors
          errorMessage = errorData.error?.message || 'Invalid recording data';
          errorCode = 'VALIDATION_ERROR';
        }

        return {
          success: false,
          error: errorMessage,
          errorCode: errorCode,
        };
      }

      // Server errors (5xx) — retry
      lastError = `Server error (${response.status})`;
    } catch (err) {
      // Network errors — retry
      lastError = err instanceof Error ? err.message : 'Network error';
    }

    // Wait before retry (not on last attempt)
    if (attempt < maxRetries) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  return {
    success: false,
    error: lastError || 'Upload failed after retries',
    errorCode: 'NETWORK_ERROR',
  };
}

/**
 * Check if auto-upload is enabled and configured
 */
export async function isAutoUploadConfigured(): Promise<boolean> {
  const settings = await loadSettings();
  return settings.autoUpload && !!settings.platformUrl && !!settings.apiToken;
}

/**
 * Upload recording if auto-upload is enabled
 * Returns the upload result or null if auto-upload is disabled
 */
export async function uploadIfEnabled(
  recording: Recording,
  projectId?: string
): Promise<UploadResult | null> {
  const settings = await loadSettings();

  if (!settings.autoUpload || !settings.platformUrl || !settings.apiToken) {
    console.log('[Platform] Auto-upload disabled or not configured');
    return null;
  }

  // Ensure empty string is treated as undefined
  const validProjectId = projectId && projectId.trim() ? projectId.trim() : undefined;

  // projectId is REQUIRED according to platform API
  if (!validProjectId) {
    console.log('[Platform] No project selected, cannot upload');
    return {
      success: false,
      error: 'No project selected. Please select a project before uploading.',
      errorCode: 'NO_PROJECT',
    };
  }

  console.log('[Platform] Auto-upload enabled, uploading recording...');
  const tags = parseTags(settings.defaultTags);

  const result = await uploadRecording(
    settings.platformUrl,
    settings.apiToken,
    recording,
    tags,
    validProjectId
  );

  console.log('[Platform] Upload result:', result);
  return result;
}

/**
 * Show Chrome notification for upload result
 */
export function showUploadNotification(result: UploadResult): void {
  const iconUrl = chrome.runtime.getURL('icon-48.png');

  if (result.success) {
    chrome.notifications.create('upload-success', {
      type: 'basic',
      iconUrl,
      title: 'SaveAction',
      message: `Recording "${result.recordingName || 'Untitled'}" uploaded to platform`,
    });
  } else if (result.alreadyExists) {
    chrome.notifications.create('upload-duplicate', {
      type: 'basic',
      iconUrl,
      title: 'SaveAction',
      message: 'Recording already exists on platform',
    });
  } else {
    chrome.notifications.create('upload-error', {
      type: 'basic',
      iconUrl,
      title: 'SaveAction - Upload Failed',
      message: result.error || 'Unknown error occurred',
    });
  }
}

/**
 * Get connection status text for display
 */
export async function getConnectionStatus(): Promise<{
  configured: boolean;
  autoUpload: boolean;
  platformUrl: string;
}> {
  const settings = await loadSettings();
  return {
    configured: !!settings.platformUrl && !!settings.apiToken,
    autoUpload: settings.autoUpload,
    platformUrl: settings.platformUrl,
  };
}

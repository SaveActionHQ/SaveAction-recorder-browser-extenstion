/**
 * Extension Settings Types
 * Defines types for platform integration settings
 */

/**
 * Extension settings stored in chrome.storage.sync
 */
export interface ExtensionSettings {
  platformUrl: string; // e.g., "https://saveaction.example.com"
  apiToken: string; // e.g., "sa_live_abc123..."
  selectedProjectId: string; // UUID of selected project (required for upload)
  selectedProjectName: string; // For display purposes
  autoUpload: boolean; // default: false
  defaultTags: string; // comma-separated, e.g., "smoke,regression"
  storeCredentials: boolean; // default: false — store passwords as plaintext in recordings
}

/**
 * Default settings values
 */
export const DEFAULT_SETTINGS: ExtensionSettings = {
  platformUrl: '',
  apiToken: '',
  selectedProjectId: '',
  selectedProjectName: '',
  autoUpload: false,
  defaultTags: '',
  storeCredentials: false,
};

/**
 * Storage keys for settings
 */
export const SETTINGS_STORAGE_KEYS = {
  PLATFORM_URL: 'platformUrl',
  API_TOKEN: 'apiToken',
  SELECTED_PROJECT_ID: 'selectedProjectId',
  SELECTED_PROJECT_NAME: 'selectedProjectName',
  AUTO_UPLOAD: 'autoUpload',
  DEFAULT_TAGS: 'defaultTags',
  STORE_CREDENTIALS: 'storeCredentials',
} as const;

/**
 * Connection test result
 */
export interface ConnectionTestResult {
  success: boolean;
  error?: string;
  errorType?: 'network' | 'auth' | 'permission' | 'server';
}

/**
 * Upload result from platform API
 */
export interface UploadResult {
  success: boolean;
  recordingId?: string; // Platform's UUID for the recording
  recordingName?: string;
  error?: string;
  errorCode?: string; // API error code
  alreadyExists?: boolean; // true if 409 duplicate
}

/**
 * API health response
 */
export interface HealthResponse {
  status: 'ok' | 'error';
  version?: string;
}

/**
 * API upload response
 */
export interface UploadResponse {
  success: boolean;
  data?: {
    id: string;
    name: string;
    url: string;
    tags: string[];
    actionCount: number;
    createdAt: string;
  };
  error?: {
    code: string;
    message: string;
  };
}

/**
 * Project from SaveAction platform
 */
export interface Project {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  color: string | null;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Projects list response
 */
export interface ProjectsResponse {
  success: boolean;
  data: Project[];
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/**
 * Validate URL format
 */
export function isValidUrl(url: string): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Validate API token format
 * SaveAction API tokens look like: sa_live_<64 hex characters>
 */
export function isValidApiToken(token: string): boolean {
  if (!token) return false;
  return /^sa_live_[a-f0-9]{64}$/i.test(token);
}

/**
 * Parse tags from comma-separated string
 */
export function parseTags(tagString: string): string[] {
  if (!tagString) return [];
  return tagString
    .split(',')
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0 && tag.length <= 50)
    .slice(0, 20); // Max 20 tags
}

/**
 * Normalize platform URL (remove trailing slashes)
 */
export function normalizePlatformUrl(url: string): string {
  return url.replace(/\/+$/, '');
}

/**
 * Extension Settings Types
 * Defines types for platform connection and recorder preferences.
 */

export type ConnectionState = 'disconnected' | 'pending' | 'connected' | 'expired';

export interface ConnectedAccount {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
}

export interface PendingConnection {
  sessionId: string;
  authorizeUrl: string;
  verificationCode: string;
  expiresAt: string;
  pollIntervalMs: number;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: string;
}

/**
 * Extension settings stored in chrome.storage.local.
 * Local storage is used because this state contains active session material.
 */
export interface ExtensionSettings {
  platformUrl: string;
  connectionState: ConnectionState;
  account: ConnectedAccount | null;
  pendingConnection: PendingConnection | null;
  authTokens: AuthTokens | null;
  selectedOrganizationId: string;
  selectedOrganizationName: string;
  selectedProjectId: string;
  selectedProjectName: string;
  autoUpload: boolean;
  defaultTags: string;
  storeCredentials: boolean;
}

export const DEFAULT_SETTINGS: ExtensionSettings = {
  platformUrl: '',
  connectionState: 'disconnected',
  account: null,
  pendingConnection: null,
  authTokens: null,
  selectedOrganizationId: '',
  selectedOrganizationName: '',
  selectedProjectId: '',
  selectedProjectName: '',
  autoUpload: false,
  defaultTags: '',
  storeCredentials: false,
};

export const SETTINGS_STORAGE_KEYS = {
  PLATFORM_URL: 'platformUrl',
  CONNECTION_STATE: 'connectionState',
  ACCOUNT: 'account',
  PENDING_CONNECTION: 'pendingConnection',
  AUTH_TOKENS: 'authTokens',
  SELECTED_ORGANIZATION_ID: 'selectedOrganizationId',
  SELECTED_ORGANIZATION_NAME: 'selectedOrganizationName',
  SELECTED_PROJECT_ID: 'selectedProjectId',
  SELECTED_PROJECT_NAME: 'selectedProjectName',
  AUTO_UPLOAD: 'autoUpload',
  DEFAULT_TAGS: 'defaultTags',
  STORE_CREDENTIALS: 'storeCredentials',
} as const;

export interface ConnectionTestResult {
  success: boolean;
  error?: string;
  errorType?: 'network' | 'auth' | 'permission' | 'server' | 'session';
}

export interface BeginConnectionResult extends ConnectionTestResult {
  pendingConnection?: PendingConnection;
}

export interface PollConnectionResult extends ConnectionTestResult {
  status: 'pending' | 'approved' | 'expired';
  account?: ConnectedAccount;
}

export interface UploadResult {
  success: boolean;
  recordingId?: string;
  recordingName?: string;
  error?: string;
  errorCode?: string;
  alreadyExists?: boolean;
  requiresReconnect?: boolean;
}

export interface HealthResponse {
  status: 'ok' | 'error';
  version?: string;
}

export interface ApiErrorPayload {
  code: string;
  message: string;
}

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
  error?: ApiErrorPayload;
}

export type WorkspaceType = 'personal' | 'organization';

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  type: WorkspaceType;
  role: string | null;
  organizationId?: string | null;
  projectCount?: number;
  createdAt?: string;
  updatedAt?: string;
}

export type Organization = Workspace;

export interface Project {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  color: string | null;
  isDefault: boolean;
  organizationId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspacesResponse {
  success: boolean;
  data: Workspace[];
}

export type OrganizationsResponse = WorkspacesResponse;

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

export interface ExtensionAuthStartResponse {
  success: boolean;
  data?: PendingConnection;
  error?: ApiErrorPayload;
}

export interface ExtensionAuthPollResponse {
  success: boolean;
  data?: {
    status: 'pending' | 'approved' | 'expired';
    account?: ConnectedAccount;
    accessToken?: string;
    refreshToken?: string;
    accessTokenExpiresAt?: string;
  };
  error?: ApiErrorPayload;
}

export interface ExtensionAuthRefreshResponse {
  success: boolean;
  data?: AuthTokens;
  error?: ApiErrorPayload;
}

export function isValidUrl(url: string): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function parseTags(tagString: string): string[] {
  if (!tagString) return [];
  return tagString
    .split(',')
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0 && tag.length <= 50)
    .slice(0, 20);
}

export function normalizePlatformUrl(url: string): string {
  return url.replace(/\/+$/, '');
}

export function isTokenExpired(expiresAt: string, bufferMs = 30_000): boolean {
  if (!expiresAt) return true;
  const expiresAtMs = new Date(expiresAt).getTime();
  if (Number.isNaN(expiresAtMs)) return true;
  return Date.now() + bufferMs >= expiresAtMs;
}

export function hasActiveConnection(settings: ExtensionSettings): boolean {
  return settings.connectionState === 'connected' && !!settings.authTokens?.refreshToken;
}

export function hasPendingConnection(settings: ExtensionSettings): boolean {
  return settings.connectionState === 'pending' && !!settings.pendingConnection;
}

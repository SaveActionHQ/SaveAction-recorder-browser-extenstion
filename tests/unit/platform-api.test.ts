import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  beginAccountConnection,
  clearConnectionData,
  disconnectAccount,
  fetchProjects,
  fetchWorkspaces,
  getConnectionStatus,
  loadSettings,
  pollAccountConnection,
  refreshAccountSession,
  saveSettings,
  showUploadNotification,
  testConnection,
  uploadIfEnabled,
  uploadRecording,
} from '@/platform/api';
import { DEFAULT_SETTINGS } from '@/types/settings';
import type { Recording } from '@/types/recording';

const mockStorage: Record<string, unknown> = {};

const mockStorageLocal = {
  get: vi.fn((keys: string[], callback: (result: Record<string, unknown>) => void) => {
    const result: Record<string, unknown> = {};

    for (const key of keys) {
      if (mockStorage[key] !== undefined) {
        result[key] = mockStorage[key];
      }
    }

    callback(result);
  }),
  set: vi.fn((items: Record<string, unknown>, callback?: () => void) => {
    Object.assign(mockStorage, items);
    callback?.();
  }),
};

const mockNotifications = {
  create: vi.fn(),
};

const mockRuntime = {
  lastError: undefined as Error | undefined,
  getURL: vi.fn((path: string) => `chrome-extension://test/${path}`),
};

global.chrome = {
  storage: {
    local: mockStorageLocal,
  },
  notifications: mockNotifications,
  runtime: mockRuntime,
} as any;

global.fetch = vi.fn();

const mockRecording: Recording = {
  id: 'rec_123456789',
  testName: 'Checkout Flow',
  url: 'https://example.com',
  startTime: '2026-04-18T10:00:00.000Z',
  endTime: '2026-04-18T10:02:00.000Z',
  viewport: { width: 1440, height: 900 },
  windowSize: { width: 1440, height: 980 },
  screenSize: { width: 1440, height: 900 },
  devicePixelRatio: 1,
  userAgent: 'Mozilla/5.0',
  version: '1.0.0',
  variables: [],
  actions: [],
};

function futureIso(minutes = 30): string {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

function pastIso(minutes = 30): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

function seedConnectedSession(): void {
  mockStorage.platformUrl = 'https://saveaction.io';
  mockStorage.connectionState = 'connected';
  mockStorage.account = {
    id: 'user-1',
    name: 'QA Lead',
    email: 'qa@saveaction.io',
    avatarUrl: null,
  };
  mockStorage.authTokens = {
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
    accessTokenExpiresAt: futureIso(),
  };
  mockStorage.selectedOrganizationId = 'org-1';
  mockStorage.selectedOrganizationName = 'Platform Team';
  mockStorage.selectedProjectId = 'proj-1';
  mockStorage.selectedProjectName = 'Checkout';
}

describe('platform api', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.keys(mockStorage).forEach((key) => delete mockStorage[key]);
    mockRuntime.lastError = undefined;
  });

  describe('loadSettings', () => {
    it('returns defaults when storage is empty', async () => {
      const settings = await loadSettings();

      expect(settings).toEqual(DEFAULT_SETTINGS);
    });

    it('hydrates nested session state from storage', async () => {
      seedConnectedSession();
      mockStorage.autoUpload = true;
      mockStorage.defaultTags = 'smoke,checkout';

      const settings = await loadSettings();

      expect(settings.connectionState).toBe('connected');
      expect(settings.account?.email).toBe('qa@saveaction.io');
      expect(settings.authTokens?.refreshToken).toBe('refresh-token');
      expect(settings.autoUpload).toBe(true);
      expect(settings.defaultTags).toBe('smoke,checkout');
    });
  });

  describe('saveSettings', () => {
    it('persists partial settings into chrome.storage.local', async () => {
      await saveSettings({
        platformUrl: 'https://saveaction.dev',
        defaultTags: 'release-blocker',
      });

      expect(mockStorageLocal.set).toHaveBeenCalledWith(
        {
          platformUrl: 'https://saveaction.dev',
          defaultTags: 'release-blocker',
        },
        expect.any(Function)
      );
    });

    it('rejects when chrome.runtime.lastError is set', async () => {
      mockStorageLocal.set.mockImplementationOnce((_items, callback) => {
        mockRuntime.lastError = new Error('Storage is unavailable');
        callback?.();
        mockRuntime.lastError = undefined;
      });

      await expect(saveSettings({ platformUrl: 'https://saveaction.dev' })).rejects.toThrow(
        'Storage is unavailable'
      );
    });
  });

  describe('testConnection', () => {
    it('returns success when the health endpoint responds with ok', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'ok' }),
      });

      const result = await testConnection('https://saveaction.io');

      expect(result.success).toBe(true);
    });

    it('returns a network error when the platform is unreachable', async () => {
      (global.fetch as any).mockRejectedValueOnce(new Error('Connection refused'));

      const result = await testConnection('https://saveaction.io');

      expect(result.success).toBe(false);
      expect(result.errorType).toBe('network');
    });
  });

  describe('beginAccountConnection', () => {
    it('creates a pending session and stores it locally', async () => {
      (global.fetch as any)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'ok' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              success: true,
              data: {
                sessionId: 'sess-1',
                authorizeUrl: 'https://saveaction.io/connect/sess-1',
                verificationCode: 'JOIN-1234',
                expiresAt: futureIso(),
                pollIntervalMs: 2000,
              },
            }),
        });

      const result = await beginAccountConnection('https://saveaction.io');
      const settings = await loadSettings();

      expect(result.success).toBe(true);
      expect(result.pendingConnection?.sessionId).toBe('sess-1');
      expect(settings.connectionState).toBe('pending');
      expect(settings.pendingConnection?.verificationCode).toBe('JOIN-1234');
    });
  });

  describe('pollAccountConnection', () => {
    it('stores the approved account and tokens', async () => {
      mockStorage.platformUrl = 'https://saveaction.io';
      mockStorage.connectionState = 'pending';
      mockStorage.pendingConnection = {
        sessionId: 'sess-1',
        authorizeUrl: 'https://saveaction.io/connect/sess-1',
        verificationCode: 'JOIN-1234',
        expiresAt: futureIso(),
        pollIntervalMs: 2000,
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            data: {
              status: 'approved',
              account: {
                id: 'user-1',
                name: 'QA Lead',
                email: 'qa@saveaction.io',
                avatarUrl: null,
              },
              accessToken: 'new-access',
              refreshToken: 'new-refresh',
              accessTokenExpiresAt: futureIso(),
            },
          }),
      });

      const result = await pollAccountConnection();
      const settings = await loadSettings();

      expect(result.success).toBe(true);
      expect(result.status).toBe('approved');
      expect(settings.connectionState).toBe('connected');
      expect(settings.account?.email).toBe('qa@saveaction.io');
      expect(settings.authTokens?.accessToken).toBe('new-access');
    });

    it('marks the session as expired when the platform says it expired', async () => {
      mockStorage.platformUrl = 'https://saveaction.io';
      mockStorage.connectionState = 'pending';
      mockStorage.pendingConnection = {
        sessionId: 'sess-1',
        authorizeUrl: 'https://saveaction.io/connect/sess-1',
        verificationCode: 'JOIN-1234',
        expiresAt: futureIso(),
        pollIntervalMs: 2000,
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            data: {
              status: 'expired',
            },
          }),
      });

      const result = await pollAccountConnection();
      const settings = await loadSettings();

      expect(result.success).toBe(true);
      expect(result.status).toBe('expired');
      expect(settings.connectionState).toBe('expired');
      expect(settings.pendingConnection).toBeNull();
    });
  });

  describe('refreshAccountSession', () => {
    it('refreshes an expired access token and stores it', async () => {
      seedConnectedSession();
      mockStorage.authTokens = {
        accessToken: 'expired-access',
        refreshToken: 'refresh-token',
        accessTokenExpiresAt: pastIso(),
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            data: {
              accessToken: 'fresh-access',
              refreshToken: 'refresh-token',
              accessTokenExpiresAt: futureIso(),
            },
          }),
      });

      const result = await refreshAccountSession();
      const settings = await loadSettings();

      expect(result.success).toBe(true);
      expect(result.accessToken).toBe('fresh-access');
      expect(settings.authTokens?.accessToken).toBe('fresh-access');
    });
  });

  describe('fetchWorkspaces', () => {
    it('refreshes first when the access token is expired', async () => {
      seedConnectedSession();
      mockStorage.authTokens = {
        accessToken: 'expired-access',
        refreshToken: 'refresh-token',
        accessTokenExpiresAt: pastIso(),
      };

      (global.fetch as any)
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              success: true,
              data: {
                accessToken: 'fresh-access',
                refreshToken: 'refresh-token',
                accessTokenExpiresAt: futureIso(),
              },
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              success: true,
              data: [
                {
                  id: 'org-1',
                  name: 'Platform Team',
                  slug: 'platform-team',
                  type: 'organization',
                  role: 'owner',
                },
                {
                  id: 'personal',
                  name: 'Personal',
                  slug: 'personal',
                  type: 'personal',
                },
              ],
            }),
        });

      const result = await fetchWorkspaces();

      expect(result.success).toBe(true);
      expect(result.workspaces?.[0]?.name).toBe('Platform Team');
      expect(result.workspaces?.[1]?.type).toBe('personal');
      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect((global.fetch as any).mock.calls[1][0]).toBe(
        'https://saveaction.io/api/v1/workspaces?limit=100'
      );
    });
  });

  describe('fetchProjects', () => {
    it('loads organization-scoped projects for the selected workspace', async () => {
      seedConnectedSession();

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            data: [
              {
                id: 'proj-1',
                name: 'Checkout',
                slug: 'checkout',
                description: null,
                color: '#00bcd4',
                isDefault: true,
                createdAt: futureIso(),
                updatedAt: futureIso(),
              },
            ],
          }),
      });

      const result = await fetchProjects('https://saveaction.io', {
        id: 'org-1',
        type: 'organization',
        organizationId: 'org-1',
      });

      expect(result.success).toBe(true);
      expect(result.projects?.[0]?.name).toBe('Checkout');
      expect((global.fetch as any).mock.calls[0][0]).toBe(
        'https://saveaction.io/api/v1/projects?limit=100&workspaceType=organization&orgId=org-1'
      );
    });

    it('loads personal projects for the personal workspace', async () => {
      seedConnectedSession();

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            data: [
              {
                id: 'proj-personal-1',
                name: 'Personal web',
                slug: 'personal-web',
                description: null,
                color: '#6366f1',
                isDefault: true,
                createdAt: futureIso(),
                updatedAt: futureIso(),
              },
            ],
          }),
      });

      const result = await fetchProjects('https://saveaction.io', {
        id: 'personal',
        type: 'personal',
        organizationId: null,
      });

      expect(result.success).toBe(true);
      expect(result.projects?.[0]?.name).toBe('Personal web');
      expect((global.fetch as any).mock.calls[0][0]).toBe(
        'https://saveaction.io/api/v1/projects?limit=100&workspaceType=personal'
      );
    });
  });

  describe('uploadRecording', () => {
    it('uploads a recording through the active session', async () => {
      seedConnectedSession();

      (global.fetch as any).mockResolvedValueOnce({
        status: 201,
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            data: {
              id: 'rec-uploaded-1',
              name: 'Checkout Flow',
            },
          }),
      });

      const result = await uploadRecording(mockRecording, ['smoke', 'checkout'], 'proj-1');

      expect(result.success).toBe(true);
      expect(result.recordingId).toBe('rec-uploaded-1');

      const fetchCall = (global.fetch as any).mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);
      expect(body.projectId).toBe('proj-1');
      expect(body.tags).toEqual(['smoke', 'checkout']);
    });

    it('requires reconnect when refresh fails before upload', async () => {
      seedConnectedSession();
      mockStorage.authTokens = {
        accessToken: 'expired-access',
        refreshToken: 'refresh-token',
        accessTokenExpiresAt: pastIso(),
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ error: { code: 'SESSION_EXPIRED', message: 'Expired' } }),
      });

      const result = await uploadRecording(mockRecording, [], 'proj-1');
      const settings = await loadSettings();

      expect(result.success).toBe(false);
      expect(result.requiresReconnect).toBe(true);
      expect(settings.connectionState).toBe('expired');
    });
  });

  describe('uploadIfEnabled', () => {
    it('returns null when auto-upload is disabled', async () => {
      seedConnectedSession();
      mockStorage.autoUpload = false;

      const result = await uploadIfEnabled(mockRecording, 'proj-1');

      expect(result).toBeNull();
    });

    it('returns an error when no project is selected', async () => {
      seedConnectedSession();
      mockStorage.autoUpload = true;
      mockStorage.selectedProjectId = '';
      mockStorage.selectedProjectName = '';

      const result = await uploadIfEnabled(mockRecording);

      expect(result?.success).toBe(false);
      expect(result?.errorCode).toBe('NO_PROJECT');
    });
  });

  describe('clearConnectionData and disconnectAccount', () => {
    it('clears local session state while preserving the platform URL', async () => {
      seedConnectedSession();

      await clearConnectionData();
      const settings = await loadSettings();

      expect(settings.platformUrl).toBe('https://saveaction.io');
      expect(settings.connectionState).toBe('disconnected');
      expect(settings.account).toBeNull();
      expect(settings.selectedProjectId).toBe('');
    });

    it('revokes the remote session and clears storage on disconnect', async () => {
      seedConnectedSession();
      (global.fetch as any).mockResolvedValueOnce({ ok: true });

      await disconnectAccount();
      const settings = await loadSettings();

      expect(settings.connectionState).toBe('disconnected');
      expect(settings.account).toBeNull();
      expect(global.fetch).toHaveBeenCalledWith(
        'https://saveaction.io/api/v1/extension-auth/logout',
        expect.objectContaining({ method: 'POST' })
      );
    });
  });

  describe('showUploadNotification', () => {
    it('shows the success toast for uploaded recordings', () => {
      showUploadNotification({
        success: true,
        recordingId: 'rec-1',
        recordingName: 'Checkout Flow',
      });

      expect(mockNotifications.create).toHaveBeenCalledWith(
        'upload-success',
        expect.objectContaining({
          title: 'SaveAction',
          message: expect.stringContaining('Checkout Flow'),
        })
      );
    });
  });

  describe('getConnectionStatus', () => {
    it('summarizes the connected workspace state', async () => {
      seedConnectedSession();
      mockStorage.autoUpload = true;

      const status = await getConnectionStatus();

      expect(status.configured).toBe(true);
      expect(status.connected).toBe(true);
      expect(status.autoUpload).toBe(true);
      expect(status.accountName).toBe('QA Lead');
      expect(status.projectName).toBe('Checkout');
    });
  });
});

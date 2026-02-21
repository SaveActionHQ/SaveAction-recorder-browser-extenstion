import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  loadSettings,
  saveSettings,
  testConnection,
  fetchProjects,
  uploadRecording,
  uploadIfEnabled,
  showUploadNotification,
  getConnectionStatus,
} from '@/platform/api';
import { DEFAULT_SETTINGS } from '@/types/settings';
import type { Recording } from '@/types/recording';

// Mock chrome.storage.sync API
const mockStorage: Record<string, any> = {};
const mockStorageSync = {
  get: vi.fn((keys, callback) => {
    const result: Record<string, any> = {};
    if (Array.isArray(keys)) {
      keys.forEach((key) => {
        if (mockStorage[key] !== undefined) {
          result[key] = mockStorage[key];
        }
      });
    }
    callback(result);
  }),
  set: vi.fn((items, callback) => {
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
    sync: mockStorageSync,
  },
  notifications: mockNotifications,
  runtime: mockRuntime,
} as any;

// Mock fetch
global.fetch = vi.fn();

// Mock recording
const mockRecording: Recording = {
  id: 'rec_123456789',
  testName: 'Test Recording',
  url: 'https://example.com',
  startTime: '2026-02-21T10:00:00.000Z',
  endTime: '2026-02-21T10:05:00.000Z',
  viewport: { width: 1920, height: 1080 },
  windowSize: { width: 1920, height: 1179 },
  screenSize: { width: 1920, height: 1080 },
  devicePixelRatio: 1,
  userAgent: 'Mozilla/5.0',
  version: '1.0.0',
  variables: [],
  actions: [],
};

describe('Platform API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.keys(mockStorage).forEach((key) => delete mockStorage[key]);
    mockRuntime.lastError = undefined;
  });

  describe('loadSettings', () => {
    it('should load settings from chrome.storage.sync', async () => {
      mockStorage.platformUrl = 'https://saveaction.io';
      mockStorage.apiToken = 'sa_live_test123';
      mockStorage.autoUpload = true;
      mockStorage.defaultTags = 'smoke,login';
      mockStorage.selectedProjectId = 'proj-123';
      mockStorage.selectedProjectName = 'My Project';

      const settings = await loadSettings();

      expect(settings.platformUrl).toBe('https://saveaction.io');
      expect(settings.apiToken).toBe('sa_live_test123');
      expect(settings.autoUpload).toBe(true);
      expect(settings.defaultTags).toBe('smoke,login');
      expect(settings.selectedProjectId).toBe('proj-123');
      expect(settings.selectedProjectName).toBe('My Project');
    });

    it('should return default settings when storage is empty', async () => {
      const settings = await loadSettings();

      expect(settings.platformUrl).toBe(DEFAULT_SETTINGS.platformUrl);
      expect(settings.apiToken).toBe(DEFAULT_SETTINGS.apiToken);
      expect(settings.autoUpload).toBe(DEFAULT_SETTINGS.autoUpload);
      expect(settings.defaultTags).toBe(DEFAULT_SETTINGS.defaultTags);
    });

    it('should handle autoUpload being explicitly false', async () => {
      mockStorage.autoUpload = false;

      const settings = await loadSettings();

      expect(settings.autoUpload).toBe(false);
    });
  });

  describe('saveSettings', () => {
    it('should save settings to chrome.storage.sync', async () => {
      await saveSettings({
        platformUrl: 'https://test.saveaction.io',
        apiToken: 'sa_live_abc',
      });

      expect(mockStorageSync.set).toHaveBeenCalledWith(
        {
          platformUrl: 'https://test.saveaction.io',
          apiToken: 'sa_live_abc',
        },
        expect.any(Function)
      );
    });

    it('should reject on chrome runtime error', async () => {
      mockStorageSync.set.mockImplementationOnce((_items, callback) => {
        mockRuntime.lastError = new Error('Storage quota exceeded');
        callback?.();
        mockRuntime.lastError = undefined;
      });

      await expect(saveSettings({ platformUrl: 'https://test.saveaction.io' })).rejects.toThrow(
        'Storage quota exceeded'
      );
    });
  });

  describe('testConnection', () => {
    it('should return success when health and auth succeed', async () => {
      (global.fetch as any)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'ok' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ success: true, data: [] }),
        });

      const result = await testConnection('https://saveaction.io', 'sa_live_token');

      expect(result.success).toBe(true);
    });

    it('should return error when health check fails', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      const result = await testConnection('https://saveaction.io', 'sa_live_token');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Cannot reach platform');
      expect(result.errorType).toBe('network');
    });

    it('should return error when health status is not ok', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'degraded' }),
      });

      const result = await testConnection('https://saveaction.io', 'sa_live_token');

      expect(result.success).toBe(false);
      expect(result.error).toContain('health check failed');
      expect(result.errorType).toBe('server');
    });

    it('should return auth error when token is invalid', async () => {
      (global.fetch as any)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'ok' }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
        });

      const result = await testConnection('https://saveaction.io', 'invalid_token');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid API token');
      expect(result.errorType).toBe('auth');
    });

    it('should return permission error on 403', async () => {
      (global.fetch as any)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'ok' }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 403,
        });

      const result = await testConnection('https://saveaction.io', 'limited_token');

      expect(result.success).toBe(false);
      expect(result.error).toContain('permissions');
      expect(result.errorType).toBe('permission');
    });

    it('should return server error on other failures', async () => {
      (global.fetch as any)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'ok' }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
        });

      const result = await testConnection('https://saveaction.io', 'sa_live_token');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Connection error: 500');
      expect(result.errorType).toBe('server');
    });

    it('should handle network errors during health check', async () => {
      (global.fetch as any).mockRejectedValueOnce(new Error('Network failure'));

      const result = await testConnection('https://saveaction.io', 'sa_live_token');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Cannot reach platform');
      expect(result.errorType).toBe('network');
    });

    it('should handle network errors during auth check', async () => {
      (global.fetch as any)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'ok' }),
        })
        .mockRejectedValueOnce(new Error('Connection reset'));

      const result = await testConnection('https://saveaction.io', 'sa_live_token');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Connection error');
      expect(result.errorType).toBe('network');
    });
  });

  describe('fetchProjects', () => {
    it('should fetch and return projects', async () => {
      const mockProjects = [
        { id: 'proj-1', name: 'Project 1', isDefault: true },
        { id: 'proj-2', name: 'Project 2', isDefault: false },
      ];

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, data: mockProjects }),
      });

      const result = await fetchProjects('https://saveaction.io', 'sa_live_token');

      expect(result.success).toBe(true);
      expect(result.projects).toEqual(mockProjects);
    });

    it('should return error on fetch failure', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      const result = await fetchProjects('https://saveaction.io', 'sa_live_token');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to fetch projects');
    });

    it('should handle network errors', async () => {
      (global.fetch as any).mockRejectedValueOnce(new Error('Network error'));

      const result = await fetchProjects('https://saveaction.io', 'sa_live_token');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Network error');
    });
  });

  describe('uploadRecording', () => {
    it('should upload recording successfully', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        status: 201,
        json: () =>
          Promise.resolve({
            success: true,
            data: { id: 'rec-uploaded-123', name: 'Test Recording' },
          }),
      });

      const result = await uploadRecording(
        'https://saveaction.io',
        'sa_live_token',
        mockRecording,
        ['smoke', 'login'],
        'proj-123'
      );

      expect(result.success).toBe(true);
      expect(result.recordingId).toBe('rec-uploaded-123');
      expect(result.recordingName).toBe('Test Recording');
    });

    it('should handle duplicate recording (409)', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        status: 409,
      });

      const result = await uploadRecording(
        'https://saveaction.io',
        'sa_live_token',
        mockRecording,
        [],
        'proj-123'
      );

      expect(result.success).toBe(false);
      expect(result.alreadyExists).toBe(true);
      expect(result.errorCode).toBe('DUPLICATE');
    });

    it('should handle unauthorized error (401)', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        status: 401,
        json: () => Promise.resolve({ error: { code: 'UNAUTHORIZED', message: 'Invalid token' } }),
      });

      const result = await uploadRecording(
        'https://saveaction.io',
        'invalid_token',
        mockRecording,
        [],
        'proj-123'
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid API token');
      expect(result.errorCode).toBe('UNAUTHORIZED');
    });

    it('should handle too large error (413)', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        status: 413,
        json: () => Promise.resolve({ error: { code: 'TOO_LARGE', message: 'Too large' } }),
      });

      const result = await uploadRecording(
        'https://saveaction.io',
        'sa_live_token',
        mockRecording,
        [],
        'proj-123'
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('too large');
      expect(result.errorCode).toBe('TOO_LARGE');
    });

    it('should handle validation error (400)', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        status: 400,
        json: () =>
          Promise.resolve({ error: { code: 'VALIDATION_ERROR', message: 'Invalid data' } }),
      });

      const result = await uploadRecording(
        'https://saveaction.io',
        'sa_live_token',
        mockRecording,
        [],
        'proj-123'
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid data');
      expect(result.errorCode).toBe('VALIDATION_ERROR');
    });

    it('should retry on server errors and eventually fail', async () => {
      // Mock 3 failures (initial + 2 retries)
      (global.fetch as any)
        .mockResolvedValueOnce({ status: 500 })
        .mockResolvedValueOnce({ status: 500 })
        .mockResolvedValueOnce({ status: 500 });

      const result = await uploadRecording(
        'https://saveaction.io',
        'sa_live_token',
        mockRecording,
        [],
        'proj-123'
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Server error');
      expect(global.fetch).toHaveBeenCalledTimes(3);
    });

    it('should retry on network errors', async () => {
      (global.fetch as any)
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          status: 201,
          json: () => Promise.resolve({ success: true, data: { id: 'rec-123', name: 'Test' } }),
        });

      const result = await uploadRecording(
        'https://saveaction.io',
        'sa_live_token',
        mockRecording,
        [],
        'proj-123'
      );

      expect(result.success).toBe(true);
      expect(global.fetch).toHaveBeenCalledTimes(3);
    });

    it('should not retry on client errors (4xx)', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        status: 400,
        json: () =>
          Promise.resolve({ error: { code: 'VALIDATION_ERROR', message: 'Invalid data' } }),
      });

      const result = await uploadRecording(
        'https://saveaction.io',
        'sa_live_token',
        mockRecording,
        [],
        'proj-123'
      );

      expect(result.success).toBe(false);
      expect(global.fetch).toHaveBeenCalledTimes(1); // No retries
    });

    it('should include projectId in request when provided', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        status: 201,
        json: () => Promise.resolve({ success: true, data: { id: 'rec-123', name: 'Test' } }),
      });

      await uploadRecording(
        'https://saveaction.io',
        'sa_live_token',
        mockRecording,
        ['tag1'],
        'proj-456'
      );

      const fetchCall = (global.fetch as any).mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);
      expect(body.projectId).toBe('proj-456');
      expect(body.tags).toEqual(['tag1']);
    });

    it('should not include projectId when not provided', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        status: 201,
        json: () => Promise.resolve({ success: true, data: { id: 'rec-123', name: 'Test' } }),
      });

      await uploadRecording('https://saveaction.io', 'sa_live_token', mockRecording, [], undefined);

      const fetchCall = (global.fetch as any).mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);
      expect(body.projectId).toBeUndefined();
    });
  });

  describe('uploadIfEnabled', () => {
    it('should return null when auto-upload is disabled', async () => {
      mockStorage.autoUpload = false;
      mockStorage.platformUrl = 'https://saveaction.io';
      mockStorage.apiToken = 'sa_live_token';

      const result = await uploadIfEnabled(mockRecording, 'proj-123');

      expect(result).toBeNull();
    });

    it('should return null when platform URL is not configured', async () => {
      mockStorage.autoUpload = true;
      mockStorage.platformUrl = '';
      mockStorage.apiToken = 'sa_live_token';

      const result = await uploadIfEnabled(mockRecording, 'proj-123');

      expect(result).toBeNull();
    });

    it('should return null when API token is not configured', async () => {
      mockStorage.autoUpload = true;
      mockStorage.platformUrl = 'https://saveaction.io';
      mockStorage.apiToken = '';

      const result = await uploadIfEnabled(mockRecording, 'proj-123');

      expect(result).toBeNull();
    });

    it('should return error when no project is selected', async () => {
      mockStorage.autoUpload = true;
      mockStorage.platformUrl = 'https://saveaction.io';
      mockStorage.apiToken = 'sa_live_token';

      const result = await uploadIfEnabled(mockRecording, '');

      expect(result).not.toBeNull();
      expect(result?.success).toBe(false);
      expect(result?.error).toContain('No project selected');
      expect(result?.errorCode).toBe('NO_PROJECT');
    });

    it('should upload when all settings are configured', async () => {
      mockStorage.autoUpload = true;
      mockStorage.platformUrl = 'https://saveaction.io';
      mockStorage.apiToken = 'sa_live_token';
      mockStorage.defaultTags = 'tag1, tag2';

      (global.fetch as any).mockResolvedValueOnce({
        status: 201,
        json: () => Promise.resolve({ success: true, data: { id: 'rec-123', name: 'Test' } }),
      });

      const result = await uploadIfEnabled(mockRecording, 'proj-123');

      expect(result).not.toBeNull();
      expect(result?.success).toBe(true);
    });
  });

  describe('showUploadNotification', () => {
    it('should show success notification', () => {
      showUploadNotification({
        success: true,
        recordingId: 'rec-123',
        recordingName: 'My Test',
      });

      expect(mockNotifications.create).toHaveBeenCalledWith(
        'upload-success',
        expect.objectContaining({
          type: 'basic',
          title: 'SaveAction',
          message: expect.stringContaining('My Test'),
        })
      );
    });

    it('should show duplicate notification', () => {
      showUploadNotification({
        success: false,
        alreadyExists: true,
        error: 'Recording already exists',
      });

      expect(mockNotifications.create).toHaveBeenCalledWith(
        'upload-duplicate',
        expect.objectContaining({
          message: 'Recording already exists on platform',
        })
      );
    });

    it('should show error notification', () => {
      showUploadNotification({
        success: false,
        error: 'Upload failed',
      });

      expect(mockNotifications.create).toHaveBeenCalledWith(
        'upload-error',
        expect.objectContaining({
          title: 'SaveAction - Upload Failed',
          message: 'Upload failed',
        })
      );
    });
  });

  describe('getConnectionStatus', () => {
    it('should return configured status when settings are complete', async () => {
      mockStorage.platformUrl = 'https://saveaction.io';
      mockStorage.apiToken = 'sa_live_token';
      mockStorage.autoUpload = true;

      const status = await getConnectionStatus();

      expect(status.configured).toBe(true);
      expect(status.autoUpload).toBe(true);
      expect(status.platformUrl).toBe('https://saveaction.io');
    });

    it('should return not configured when settings are missing', async () => {
      mockStorage.platformUrl = '';
      mockStorage.apiToken = '';

      const status = await getConnectionStatus();

      expect(status.configured).toBe(false);
    });
  });
});

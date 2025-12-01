import { describe, it, expect, beforeEach, vi } from 'vitest';
import { saveRecording, loadRecording, deleteRecording, listRecordings } from '@/utils/storage';
import type { Recording } from '@/types/recording';

// Mock chrome.storage API
const mockStorage = {
  local: {
    get: vi.fn(),
    set: vi.fn(),
    remove: vi.fn(),
    clear: vi.fn(),
  },
};

global.chrome = {
  storage: mockStorage,
  runtime: {
    lastError: undefined,
  },
} as any;

// Helper for dimension data
const mockDimensions = {
  viewport: { width: 1920, height: 1080 },
  windowSize: { width: 1920, height: 1179 },
  screenSize: { width: 1920, height: 1080 },
  devicePixelRatio: 1,
};

describe('Storage Utils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('saveRecording', () => {
    it('should save a recording to chrome.storage', async () => {
      const recording: Recording = {
        id: 'rec_123',
        testName: 'Login Test',
        url: 'https://example.com',
        startTime: '2025-11-18T10:00:00.000Z',
        endTime: '2025-11-18T10:01:00.000Z',
        variables: [],
        actions: [],
        ...mockDimensions,
        userAgent: 'Mozilla/5.0',
        version: '1.0.0',
      };

      mockStorage.local.get.mockImplementation((_keys, callback) => {
        callback?.({});
        return Promise.resolve({});
      });

      mockStorage.local.set.mockImplementation((_data, callback) => {
        callback?.();
        return Promise.resolve();
      });

      await saveRecording(recording);

      expect(mockStorage.local.set).toHaveBeenCalledWith(
        {
          [`recording_${recording.id}`]: recording,
          recording_ids: expect.arrayContaining([recording.id]),
        },
        expect.any(Function)
      );
    });

    it('should update existing recording if id already exists', async () => {
      const recording: Recording = {
        id: 'rec_123',
        testName: 'Updated Test',
        url: 'https://example.com',
        startTime: '2025-11-18T10:00:00.000Z',
        endTime: '2025-11-18T10:02:00.000Z',
        variables: [],
        actions: [],
        ...mockDimensions,
        userAgent: 'Mozilla/5.0',
        version: '1.0.0',
      };

      mockStorage.local.get.mockImplementation((_keys, callback) => {
        callback?.({ recording_ids: ['rec_123', 'rec_456'] });
        return Promise.resolve({ recording_ids: ['rec_123', 'rec_456'] });
      });

      mockStorage.local.set.mockImplementation((_data, callback) => {
        callback?.();
        return Promise.resolve();
      });

      await saveRecording(recording);

      expect(mockStorage.local.set).toHaveBeenCalledWith(
        {
          [`recording_${recording.id}`]: recording,
          recording_ids: ['rec_123', 'rec_456'],
        },
        expect.any(Function)
      );
    });

    it('should handle chrome.storage errors', async () => {
      const recording: Recording = {
        id: 'rec_123',
        testName: 'Test',
        url: 'https://example.com',
        startTime: '2025-11-18T10:00:00.000Z',
        endTime: '2025-11-18T10:01:00.000Z',
        variables: [],
        actions: [],
        ...mockDimensions,
        userAgent: 'Mozilla/5.0',
        version: '1.0.0',
      };

      mockStorage.local.set.mockImplementation(() => {
        throw new Error('Storage error');
      });

      await expect(saveRecording(recording)).rejects.toThrow('Storage error');
    });
  });

  describe('loadRecording', () => {
    it('should load a recording by id', async () => {
      const recording: Recording = {
        id: 'rec_123',
        testName: 'Test',
        url: 'https://example.com',
        startTime: '2025-11-18T10:00:00.000Z',
        endTime: '2025-11-18T10:01:00.000Z',
        variables: [],
        actions: [],
        ...mockDimensions,
        userAgent: 'Mozilla/5.0',
        version: '1.0.0',
      };

      mockStorage.local.get.mockImplementation((_keys, callback) => {
        callback?.({ [`recording_${recording.id}`]: recording });
        return Promise.resolve({ [`recording_${recording.id}`]: recording });
      });

      const result = await loadRecording('rec_123');

      expect(result).toEqual(recording);
      expect(mockStorage.local.get).toHaveBeenCalledWith(
        ['recording_rec_123'],
        expect.any(Function)
      );
    });

    it('should return null if recording not found', async () => {
      mockStorage.local.get.mockImplementation((_keys, callback) => {
        callback?.({});
        return Promise.resolve({});
      });

      const result = await loadRecording('non_existent');

      expect(result).toBeNull();
    });

    it('should handle chrome.storage errors', async () => {
      mockStorage.local.get.mockImplementation(() => {
        throw new Error('Storage error');
      });

      await expect(loadRecording('rec_123')).rejects.toThrow('Storage error');
    });
  });

  describe('deleteRecording', () => {
    it('should delete a recording by id', async () => {
      mockStorage.local.get.mockImplementation((_keys, callback) => {
        callback?.({ recording_ids: ['rec_123', 'rec_456'] });
        return Promise.resolve({ recording_ids: ['rec_123', 'rec_456'] });
      });

      mockStorage.local.remove.mockImplementation((_keys, callback) => {
        callback?.();
        return Promise.resolve();
      });

      mockStorage.local.set.mockImplementation((_data, callback) => {
        callback?.();
        return Promise.resolve();
      });

      await deleteRecording('rec_123');

      expect(mockStorage.local.remove).toHaveBeenCalledWith(
        ['recording_rec_123'],
        expect.any(Function)
      );
      expect(mockStorage.local.set).toHaveBeenCalledWith(
        { recording_ids: ['rec_456'] },
        expect.any(Function)
      );
    });

    it('should handle non-existent recording gracefully', async () => {
      mockStorage.local.get.mockImplementation((_keys, callback) => {
        callback?.({ recording_ids: ['rec_456'] });
        return Promise.resolve({ recording_ids: ['rec_456'] });
      });

      mockStorage.local.remove.mockImplementation((_keys, callback) => {
        callback?.();
        return Promise.resolve();
      });

      await deleteRecording('rec_123');

      expect(mockStorage.local.remove).toHaveBeenCalled();
    });

    it('should handle chrome.storage errors', async () => {
      mockStorage.local.get.mockImplementation(() => {
        throw new Error('Storage error');
      });

      await expect(deleteRecording('rec_123')).rejects.toThrow('Storage error');
    });
  });

  describe('listRecordings', () => {
    it('should return all recording metadata', async () => {
      const recording1: Recording = {
        id: 'rec_123',
        testName: 'Test 1',
        url: 'https://example.com',
        startTime: '2025-11-18T10:00:00.000Z',
        endTime: '2025-11-18T10:01:00.000Z',
        variables: [],
        actions: [],
        ...mockDimensions,
        userAgent: 'Mozilla/5.0',
        version: '1.0.0',
      };

      const recording2: Recording = {
        id: 'rec_456',
        testName: 'Test 2',
        url: 'https://example.com',
        startTime: '2025-11-18T11:00:00.000Z',
        endTime: '2025-11-18T11:01:00.000Z',
        variables: [],
        actions: [],
        ...mockDimensions,
        userAgent: 'Mozilla/5.0',
        version: '1.0.0',
      };

      mockStorage.local.get.mockImplementation((keys, callback) => {
        if (Array.isArray(keys) && keys[0] === 'recording_ids') {
          callback?.({ recording_ids: ['rec_123', 'rec_456'] });
          return Promise.resolve({ recording_ids: ['rec_123', 'rec_456'] });
        } else {
          callback?.({
            recording_rec_123: recording1,
            recording_rec_456: recording2,
          });
          return Promise.resolve({
            recording_rec_123: recording1,
            recording_rec_456: recording2,
          });
        }
      });

      const result = await listRecordings();

      expect(result).toEqual([
        {
          id: 'rec_123',
          testName: 'Test 1',
          url: 'https://example.com',
          startTime: '2025-11-18T10:00:00.000Z',
          endTime: '2025-11-18T10:01:00.000Z',
          actionCount: 0,
        },
        {
          id: 'rec_456',
          testName: 'Test 2',
          url: 'https://example.com',
          startTime: '2025-11-18T11:00:00.000Z',
          endTime: '2025-11-18T11:01:00.000Z',
          actionCount: 0,
        },
      ]);
    });

    it('should return empty array if no recordings exist', async () => {
      mockStorage.local.get.mockImplementation((_keys, callback) => {
        callback?.({});
        return Promise.resolve({});
      });

      const result = await listRecordings();

      expect(result).toEqual([]);
    });

    it('should handle chrome.storage errors', async () => {
      mockStorage.local.get.mockImplementation(() => {
        throw new Error('Storage error');
      });

      await expect(listRecordings()).rejects.toThrow('Storage error');
    });
  });
});

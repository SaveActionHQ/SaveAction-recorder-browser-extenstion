import { describe, it, expect, beforeEach, vi } from 'vitest';
import { exportAsJSON, downloadRecording, validateExportData } from '@/utils/exporter';
import type { Recording } from '@/types/recording';

// Mock chrome.downloads API
const mockDownloads = {
  download: vi.fn(),
};

global.chrome = {
  downloads: mockDownloads,
  runtime: {
    lastError: undefined,
  },
} as any;

// Mock URL.createObjectURL and URL.revokeObjectURL
global.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
global.URL.revokeObjectURL = vi.fn();

// Helper for dimension data
const mockDimensions = {
  viewport: { width: 1920, height: 1080 },
  windowSize: { width: 1920, height: 1179 },
  screenSize: { width: 1920, height: 1080 },
  devicePixelRatio: 1,
};

describe('Exporter Utils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('exportAsJSON', () => {
    it('should convert recording to JSON string', () => {
      const recording: Recording = {
        id: 'rec_123',
        testName: 'Login Test',
        url: 'https://example.com',
        startTime: '2025-11-18T10:00:00.000Z',
        endTime: '2025-11-18T10:01:00.000Z',
        actions: [],
        ...mockDimensions,
        userAgent: 'Mozilla/5.0',
        version: '1.0.0',
      };

      const json = exportAsJSON(recording);
      const parsed = JSON.parse(json);

      expect(parsed).toEqual(recording);
      expect(json).toContain('"testName": "Login Test"');
    });

    it('should format JSON with 2-space indentation', () => {
      const recording: Recording = {
        id: 'rec_123',
        testName: 'Test',
        url: 'https://example.com',
        startTime: '2025-11-18T10:00:00.000Z',
        endTime: '2025-11-18T10:01:00.000Z',
        actions: [],
        ...mockDimensions,
        userAgent: 'Mozilla/5.0',
        version: '1.0.0',
      };

      const json = exportAsJSON(recording);

      expect(json).toContain('  "id"');
      expect(json).toContain('  "testName"');
    });

    it('should handle recordings with actions', () => {
      const recording: Recording = {
        id: 'rec_123',
        testName: 'Test',
        url: 'https://example.com',
        startTime: '2025-11-18T10:00:00.000Z',
        endTime: '2025-11-18T10:01:00.000Z',
        actions: [
          {
            id: 'act_001',
            type: 'click',
            timestamp: Date.now(),
            completedAt: Date.now() + 50,
            url: 'https://example.com',
            selector: {
              id: 'button',
              css: '#button',
              priority: ['id', 'css'],
            },
            tagName: 'button',
            text: 'Submit',
            coordinates: { x: 10, y: 20 },
            coordinatesRelativeTo: 'element',
            button: 'left',
            clickCount: 1,
            modifiers: [],
          },
        ],
        ...mockDimensions,
        userAgent: 'Mozilla/5.0',
        version: '1.0.0',
      };

      const json = exportAsJSON(recording);
      const parsed = JSON.parse(json);

      expect(parsed.actions).toHaveLength(1);
      expect(parsed.actions[0].type).toBe('click');
    });
  });

  describe('downloadRecording', () => {
    it('should download recording as JSON file', async () => {
      const recording: Recording = {
        id: 'rec_123',
        testName: 'Login Test',
        url: 'https://example.com',
        startTime: '2025-11-18T10:00:00.000Z',
        endTime: '2025-11-18T10:01:00.000Z',
        actions: [],
        ...mockDimensions,
        userAgent: 'Mozilla/5.0',
        version: '1.0.0',
      };

      mockDownloads.download.mockImplementation((_options, callback) => {
        callback?.(1);
        return Promise.resolve(1);
      });

      await downloadRecording(recording);

      expect(mockDownloads.download).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'blob:mock-url',
          filename: expect.stringContaining('Login_Test'),
          saveAs: true,
        }),
        expect.any(Function)
      );
    });

    it('should generate filename from test name', async () => {
      const recording: Recording = {
        id: 'rec_123',
        testName: 'User Login Flow Test',
        url: 'https://example.com',
        startTime: '2025-11-18T10:00:00.000Z',
        endTime: '2025-11-18T10:01:00.000Z',
        actions: [],
        ...mockDimensions,
        userAgent: 'Mozilla/5.0',
        version: '1.0.0',
      };

      mockDownloads.download.mockImplementation((_options, callback) => {
        callback?.(1);
        return Promise.resolve(1);
      });

      await downloadRecording(recording);

      const call = mockDownloads.download.mock.calls[0][0];
      expect(call.filename).toMatch(/User_Login_Flow_Test_\d+\.json/);
    });

    it('should sanitize filename', async () => {
      const recording: Recording = {
        id: 'rec_123',
        testName: 'Test: With/Special\\Characters*',
        url: 'https://example.com',
        startTime: '2025-11-18T10:00:00.000Z',
        endTime: '2025-11-18T10:01:00.000Z',
        actions: [],
        ...mockDimensions,
        userAgent: 'Mozilla/5.0',
        version: '1.0.0',
      };

      mockDownloads.download.mockImplementation((_options, callback) => {
        callback?.(1);
        return Promise.resolve(1);
      });

      await downloadRecording(recording);

      const call = mockDownloads.download.mock.calls[0][0];
      expect(call.filename).not.toContain(':');
      expect(call.filename).not.toContain('/');
      expect(call.filename).not.toContain('\\');
      expect(call.filename).not.toContain('*');
    });

    it('should handle download errors', async () => {
      const recording: Recording = {
        id: 'rec_123',
        testName: 'Test',
        url: 'https://example.com',
        startTime: '2025-11-18T10:00:00.000Z',
        endTime: '2025-11-18T10:01:00.000Z',
        actions: [],
        ...mockDimensions,
        userAgent: 'Mozilla/5.0',
        version: '1.0.0',
      };

      mockDownloads.download.mockImplementation(() => {
        throw new Error('Download failed');
      });

      await expect(downloadRecording(recording)).rejects.toThrow('Download failed');
    });

    it('should revoke blob URL after download', async () => {
      const recording: Recording = {
        id: 'rec_123',
        testName: 'Test',
        url: 'https://example.com',
        startTime: '2025-11-18T10:00:00.000Z',
        endTime: '2025-11-18T10:01:00.000Z',
        actions: [],
        ...mockDimensions,
        userAgent: 'Mozilla/5.0',
        version: '1.0.0',
      };

      mockDownloads.download.mockImplementation((_options, callback) => {
        callback?.(1);
        return Promise.resolve(1);
      });

      await downloadRecording(recording);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
    });
  });

  describe('validateExportData', () => {
    it('should validate correct recording data', () => {
      const recording: Recording = {
        id: 'rec_123',
        testName: 'Test',
        url: 'https://example.com',
        startTime: '2025-11-18T10:00:00.000Z',
        endTime: '2025-11-18T10:01:00.000Z',
        actions: [],
        ...mockDimensions,
        userAgent: 'Mozilla/5.0',
        version: '1.0.0',
      };

      const result = validateExportData(recording);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect missing required fields', () => {
      const invalidRecording = {
        id: 'rec_123',
        testName: 'Test',
        // missing url, startTime, etc.
      } as any;

      const result = validateExportData(invalidRecording);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should detect invalid timestamp format', () => {
      const recording: Recording = {
        id: 'rec_123',
        testName: 'Test',
        url: 'https://example.com',
        startTime: 'invalid-date',
        endTime: '2025-11-18T10:01:00.000Z',
        actions: [],
        ...mockDimensions,
        userAgent: 'Mozilla/5.0',
        version: '1.0.0',
      };

      const result = validateExportData(recording);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid startTime format');
    });

    it('should detect invalid viewport dimensions', () => {
      const recording: Recording = {
        id: 'rec_123',
        testName: 'Test',
        url: 'https://example.com',
        startTime: '2025-11-18T10:00:00.000Z',
        endTime: '2025-11-18T10:01:00.000Z',
        actions: [],
        viewport: { width: -100, height: 0 },
        windowSize: { width: 1920, height: 1179 },
        screenSize: { width: 1920, height: 1080 },
        devicePixelRatio: 1,
        userAgent: 'Mozilla/5.0',
        version: '1.0.0',
      };

      const result = validateExportData(recording);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should detect invalid endTime format', () => {
      const recording: Recording = {
        id: 'rec_123',
        testName: 'Test',
        url: 'https://example.com',
        startTime: '2025-11-18T10:00:00.000Z',
        endTime: 'not-a-date',
        actions: [],
        ...mockDimensions,
        userAgent: 'Mozilla/5.0',
        version: '1.0.0',
      };

      const result = validateExportData(recording);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid endTime format');
    });

    it('should validate recording with no endTime', () => {
      const recording: Recording = {
        id: 'rec_123',
        testName: 'Test',
        url: 'https://example.com',
        startTime: '2025-11-18T10:00:00.000Z',
        actions: [],
        ...mockDimensions,
        userAgent: 'Mozilla/5.0',
        version: '1.0.0',
      };

      const result = validateExportData(recording);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect missing viewport width', () => {
      const recording: Recording = {
        id: 'rec_123',
        testName: 'Test',
        url: 'https://example.com',
        startTime: '2025-11-18T10:00:00.000Z',
        actions: [],
        viewport: { width: 0, height: 1080 },
        windowSize: { width: 1920, height: 1179 },
        screenSize: { width: 1920, height: 1080 },
        devicePixelRatio: 1,
        userAgent: 'Mozilla/5.0',
        version: '1.0.0',
      };

      const result = validateExportData(recording);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid viewport width');
    });

    it('should detect missing viewport height', () => {
      const recording: Recording = {
        id: 'rec_123',
        testName: 'Test',
        url: 'https://example.com',
        startTime: '2025-11-18T10:00:00.000Z',
        actions: [],
        viewport: { width: 1920, height: 0 },
        windowSize: { width: 1920, height: 1179 },
        screenSize: { width: 1920, height: 1080 },
        devicePixelRatio: 1,
        userAgent: 'Mozilla/5.0',
        version: '1.0.0',
      };

      const result = validateExportData(recording);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid viewport height');
    });

    it('should detect non-array actions', () => {
      const recording = {
        id: 'rec_123',
        testName: 'Test',
        url: 'https://example.com',
        startTime: '2025-11-18T10:00:00.000Z',
        actions: 'not-an-array',
        ...mockDimensions,
        userAgent: 'Mozilla/5.0',
        version: '1.0.0',
      } as unknown as Recording;

      const result = validateExportData(recording);

      expect(result.valid).toBe(false);
      const hasError = result.errors.includes('Actions must be an array');
      expect(hasError).toBe(true);
    });
  });
});

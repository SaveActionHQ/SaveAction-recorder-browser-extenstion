import { describe, it, expect } from 'vitest';
import {
  isValidUrl,
  isValidApiToken,
  parseTags,
  normalizePlatformUrl,
  DEFAULT_SETTINGS,
  SETTINGS_STORAGE_KEYS,
} from '@/types/settings';

describe('isValidUrl', () => {
  it('should accept valid https URL', () => {
    expect(isValidUrl('https://saveaction.example.com')).toBe(true);
  });

  it('should accept valid http URL', () => {
    expect(isValidUrl('http://localhost:3000')).toBe(true);
  });

  it('should reject empty string', () => {
    expect(isValidUrl('')).toBe(false);
  });

  it('should reject invalid URL', () => {
    expect(isValidUrl('not-a-url')).toBe(false);
  });

  it('should reject ftp protocol', () => {
    expect(isValidUrl('ftp://example.com')).toBe(false);
  });

  it('should reject javascript protocol', () => {
    expect(isValidUrl('javascript:alert(1)')).toBe(false);
  });
});

describe('isValidApiToken', () => {
  it('should accept valid token format', () => {
    const validToken = 'sa_live_' + 'a'.repeat(64);
    expect(isValidApiToken(validToken)).toBe(true);
  });

  it('should accept uppercase hex characters', () => {
    const validToken = 'sa_live_' + 'A1B2C3D4'.repeat(8);
    expect(isValidApiToken(validToken)).toBe(true);
  });

  it('should reject empty string', () => {
    expect(isValidApiToken('')).toBe(false);
  });

  it('should reject token with wrong prefix', () => {
    expect(isValidApiToken('sa_test_' + 'a'.repeat(64))).toBe(false);
  });

  it('should reject token with wrong length', () => {
    expect(isValidApiToken('sa_live_' + 'a'.repeat(32))).toBe(false);
  });

  it('should reject token with invalid characters', () => {
    expect(isValidApiToken('sa_live_' + 'g'.repeat(64))).toBe(false);
  });
});

describe('parseTags', () => {
  it('should parse comma-separated tags', () => {
    expect(parseTags('smoke,regression,critical')).toEqual([
      'smoke',
      'regression',
      'critical',
    ]);
  });

  it('should trim whitespace from tags', () => {
    expect(parseTags(' smoke , regression ')).toEqual(['smoke', 'regression']);
  });

  it('should return empty array for empty string', () => {
    expect(parseTags('')).toEqual([]);
  });

  it('should filter out empty tags', () => {
    expect(parseTags('smoke,,regression,,')).toEqual(['smoke', 'regression']);
  });

  it('should limit to 20 tags', () => {
    const manyTags = Array.from({ length: 25 }, (_, i) => `tag${i}`).join(',');
    expect(parseTags(manyTags)).toHaveLength(20);
  });

  it('should filter out tags longer than 50 characters', () => {
    const longTag = 'a'.repeat(51);
    expect(parseTags(`short,${longTag},valid`)).toEqual(['short', 'valid']);
  });
});

describe('normalizePlatformUrl', () => {
  it('should remove trailing slash', () => {
    expect(normalizePlatformUrl('https://example.com/')).toBe('https://example.com');
  });

  it('should remove multiple trailing slashes', () => {
    expect(normalizePlatformUrl('https://example.com///')).toBe('https://example.com');
  });

  it('should not modify URL without trailing slash', () => {
    expect(normalizePlatformUrl('https://example.com')).toBe('https://example.com');
  });

  it('should handle URL with path', () => {
    expect(normalizePlatformUrl('https://example.com/api/')).toBe(
      'https://example.com/api'
    );
  });
});

describe('DEFAULT_SETTINGS', () => {
  it('should have correct default values', () => {
    expect(DEFAULT_SETTINGS.platformUrl).toBe('');
    expect(DEFAULT_SETTINGS.apiToken).toBe('');
    expect(DEFAULT_SETTINGS.selectedProjectId).toBe('');
    expect(DEFAULT_SETTINGS.autoUpload).toBe(false);
    expect(DEFAULT_SETTINGS.storeCredentials).toBe(false);
  });
});

describe('SETTINGS_STORAGE_KEYS', () => {
  it('should have all required keys', () => {
    expect(SETTINGS_STORAGE_KEYS.PLATFORM_URL).toBe('platformUrl');
    expect(SETTINGS_STORAGE_KEYS.API_TOKEN).toBe('apiToken');
    expect(SETTINGS_STORAGE_KEYS.AUTO_UPLOAD).toBe('autoUpload');
    expect(SETTINGS_STORAGE_KEYS.STORE_CREDENTIALS).toBe('storeCredentials');
  });
});

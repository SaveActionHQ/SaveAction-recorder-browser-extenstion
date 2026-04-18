import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  hasActiveConnection,
  hasPendingConnection,
  isTokenExpired,
  isValidUrl,
  normalizePlatformUrl,
  parseTags,
  SETTINGS_STORAGE_KEYS,
} from '@/types/settings';

describe('isValidUrl', () => {
  it('accepts valid https URLs', () => {
    expect(isValidUrl('https://saveaction.example.com')).toBe(true);
  });

  it('accepts valid http URLs', () => {
    expect(isValidUrl('http://localhost:3000')).toBe(true);
  });

  it('rejects invalid or unsupported URLs', () => {
    expect(isValidUrl('')).toBe(false);
    expect(isValidUrl('not-a-url')).toBe(false);
    expect(isValidUrl('ftp://example.com')).toBe(false);
    expect(isValidUrl('javascript:alert(1)')).toBe(false);
  });
});

describe('parseTags', () => {
  it('splits and trims comma-separated tags', () => {
    expect(parseTags(' smoke , regression , critical ')).toEqual([
      'smoke',
      'regression',
      'critical',
    ]);
  });

  it('filters invalid tags and limits to 20 entries', () => {
    const tooManyTags = Array.from({ length: 25 }, (_, index) => `tag${index}`).join(',');
    const longTag = 'a'.repeat(51);

    expect(parseTags(`ok,${longTag},${tooManyTags}`)).toHaveLength(20);
  });
});

describe('normalizePlatformUrl', () => {
  it('removes trailing slashes', () => {
    expect(normalizePlatformUrl('https://example.com/')).toBe('https://example.com');
    expect(normalizePlatformUrl('https://example.com///')).toBe('https://example.com');
  });

  it('preserves URLs without trailing slashes', () => {
    expect(normalizePlatformUrl('https://example.com/api')).toBe('https://example.com/api');
  });
});

describe('isTokenExpired', () => {
  it('returns true for missing or past expirations', () => {
    expect(isTokenExpired('')).toBe(true);
    expect(isTokenExpired(new Date(Date.now() - 60_000).toISOString())).toBe(true);
  });

  it('returns false for future expirations outside the safety buffer', () => {
    expect(isTokenExpired(new Date(Date.now() + 5 * 60_000).toISOString())).toBe(false);
  });
});

describe('connection helpers', () => {
  it('recognizes active account sessions', () => {
    expect(
      hasActiveConnection({
        ...DEFAULT_SETTINGS,
        connectionState: 'connected',
        authTokens: {
          accessToken: 'access-token',
          refreshToken: 'refresh-token',
          accessTokenExpiresAt: new Date(Date.now() + 60_000).toISOString(),
        },
      })
    ).toBe(true);
  });

  it('recognizes pending connection requests', () => {
    expect(
      hasPendingConnection({
        ...DEFAULT_SETTINGS,
        connectionState: 'pending',
        pendingConnection: {
          sessionId: 'sess-1',
          authorizeUrl: 'https://saveaction.io/connect/sess-1',
          verificationCode: 'JOIN-1234',
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
          pollIntervalMs: 2000,
        },
      })
    ).toBe(true);
  });
});

describe('DEFAULT_SETTINGS', () => {
  it('defaults to a disconnected local-only state', () => {
    expect(DEFAULT_SETTINGS.platformUrl).toBe('');
    expect(DEFAULT_SETTINGS.connectionState).toBe('disconnected');
    expect(DEFAULT_SETTINGS.account).toBeNull();
    expect(DEFAULT_SETTINGS.pendingConnection).toBeNull();
    expect(DEFAULT_SETTINGS.authTokens).toBeNull();
    expect(DEFAULT_SETTINGS.selectedOrganizationId).toBe('');
    expect(DEFAULT_SETTINGS.selectedProjectId).toBe('');
    expect(DEFAULT_SETTINGS.autoUpload).toBe(false);
    expect(DEFAULT_SETTINGS.storeCredentials).toBe(false);
  });
});

describe('SETTINGS_STORAGE_KEYS', () => {
  it('exposes the expected storage keys for connection and routing state', () => {
    expect(SETTINGS_STORAGE_KEYS.PLATFORM_URL).toBe('platformUrl');
    expect(SETTINGS_STORAGE_KEYS.CONNECTION_STATE).toBe('connectionState');
    expect(SETTINGS_STORAGE_KEYS.PENDING_CONNECTION).toBe('pendingConnection');
    expect(SETTINGS_STORAGE_KEYS.AUTH_TOKENS).toBe('authTokens');
    expect(SETTINGS_STORAGE_KEYS.SELECTED_ORGANIZATION_ID).toBe('selectedOrganizationId');
    expect(SETTINGS_STORAGE_KEYS.SELECTED_PROJECT_ID).toBe('selectedProjectId');
    expect(SETTINGS_STORAGE_KEYS.AUTO_UPLOAD).toBe('autoUpload');
    expect(SETTINGS_STORAGE_KEYS.STORE_CREDENTIALS).toBe('storeCredentials');
  });
});

import { describe, it, expect } from 'vitest';
import {
  sanitizeValue,
  isSensitiveField,
  maskCreditCard,
  maskEmail,
  maskPassword,
  sanitizeAction,
  sanitizeRecording,
} from '@/utils/sanitizer';
import type { Action, InputAction, Recording } from '@/types';

// Helper for dimension data
const mockDimensions = {
  viewport: { width: 1920, height: 1080 },
  windowSize: { width: 1920, height: 1179 },
  screenSize: { width: 1920, height: 1080 },
  devicePixelRatio: 1,
};

describe('Sanitizer', () => {
  describe('Password Masking', () => {
    it('should fully mask password values', () => {
      const result = maskPassword('MySecretPassword123!');
      expect(result).toBe('••••••••••••••••••••');
    });

    it('should handle empty passwords', () => {
      const result = maskPassword('');
      expect(result).toBe('');
    });

    it('should mask passwords of different lengths', () => {
      expect(maskPassword('abc')).toBe('•••');
      expect(maskPassword('12345678')).toBe('••••••••');
      expect(maskPassword('a')).toBe('•');
    });
  });

  describe('Credit Card Masking', () => {
    it('should mask credit card with last 4 digits visible', () => {
      const result = maskCreditCard('4532015112830366');
      expect(result).toBe('************0366');
    });

    it('should handle credit cards with spaces', () => {
      const result = maskCreditCard('4532 0151 1283 0366');
      expect(result).toBe('**** **** **** 0366');
    });

    it('should handle credit cards with dashes', () => {
      const result = maskCreditCard('4532-0151-1283-0366');
      expect(result).toBe('****-****-****-0366');
    });

    it('should handle short numbers', () => {
      const result = maskCreditCard('1234');
      expect(result).toBe('1234');
    });

    it('should preserve format', () => {
      const result = maskCreditCard('4532  0151  1283  0366');
      expect(result).toBe('****  ****  ****  0366');
    });
  });

  describe('Email Masking', () => {
    it('should partially mask email addresses', () => {
      const result = maskEmail('john.doe@example.com');
      expect(result).toBe('jo••••••@example.com');
    });

    it('should show first 2 chars of username', () => {
      const result = maskEmail('user@domain.com');
      expect(result).toBe('us••@domain.com');
    });

    it('should handle short usernames', () => {
      const result = maskEmail('a@example.com');
      expect(result).toBe('a@example.com');
    });

    it('should handle single char username', () => {
      const result = maskEmail('ab@example.com');
      expect(result).toBe('ab@example.com');
    });

    it('should preserve domain', () => {
      const result = maskEmail('verylongemail@subdomain.example.co.uk');
      expect(result).toBe('ve•••••••••••@subdomain.example.co.uk');
    });
  });

  describe('Sensitive Field Detection', () => {
    it('should detect password fields by type', () => {
      expect(isSensitiveField('password', 'text', 'username')).toBe(true);
    });

    it('should detect password fields by name', () => {
      expect(isSensitiveField('text', 'text', 'password')).toBe(true);
      expect(isSensitiveField('text', 'text', 'user_password')).toBe(true);
      expect(isSensitiveField('text', 'text', 'passwordConfirm')).toBe(true);
    });

    it('should detect password fields by id', () => {
      expect(isSensitiveField('text', 'text', '', 'password')).toBe(true);
      expect(isSensitiveField('text', 'text', '', 'login-password')).toBe(true);
    });

    it('should detect credit card fields', () => {
      expect(isSensitiveField('text', 'text', 'cc-number')).toBe(true);
      expect(isSensitiveField('text', 'text', 'card_number')).toBe(true);
      expect(isSensitiveField('text', 'text', 'cardnumber')).toBe(true);
      expect(isSensitiveField('text', 'text', '', 'creditCard')).toBe(true);
    });

    it('should detect CVV fields', () => {
      expect(isSensitiveField('text', 'text', 'cvv')).toBe(true);
      expect(isSensitiveField('text', 'text', 'cvc')).toBe(true);
      expect(isSensitiveField('text', 'text', 'card-code')).toBe(true);
      expect(isSensitiveField('text', 'text', 'security_code')).toBe(true);
    });

    it('should detect SSN fields', () => {
      expect(isSensitiveField('text', 'text', 'ssn')).toBe(true);
      expect(isSensitiveField('text', 'text', 'social-security')).toBe(true);
      expect(isSensitiveField('text', 'text', '', 'social_security_number')).toBe(true);
    });

    it('should detect PIN fields', () => {
      expect(isSensitiveField('text', 'text', 'pin')).toBe(true);
      expect(isSensitiveField('text', 'text', 'pin-code')).toBe(true);
    });

    it('should not flag non-sensitive fields', () => {
      expect(isSensitiveField('text', 'text', 'username')).toBe(false);
      expect(isSensitiveField('text', 'text', 'email')).toBe(false);
      expect(isSensitiveField('text', 'text', 'first-name')).toBe(false);
    });
  });

  describe('Value Sanitization', () => {
    it('should sanitize password type inputs', () => {
      const result = sanitizeValue('MyPassword123', 'password', '', '');
      expect(result).toBe('•••••••••••••');
    });

    it('should sanitize credit card numbers', () => {
      const result = sanitizeValue('4532015112830366', 'text', 'card-number', '');
      expect(result).toBe('************0366');
    });

    it('should sanitize CVV', () => {
      const result = sanitizeValue('123', 'text', 'cvv', '');
      expect(result).toBe('•••');
    });

    it('should sanitize SSN', () => {
      const result = sanitizeValue('123-45-6789', 'text', 'ssn', '');
      expect(result).toBe('•••••••••••');
    });

    it('should not sanitize non-sensitive fields', () => {
      const result = sanitizeValue('John Doe', 'text', 'name', '');
      expect(result).toBe('John Doe');
    });

    it('should partially mask emails', () => {
      const result = sanitizeValue('user@example.com', 'email', 'email', '');
      expect(result).toBe('us••@example.com');
    });
  });

  describe('Action Sanitization', () => {
    it('should sanitize input actions with sensitive data', () => {
      const action: InputAction = {
        id: 'act_001',
        type: 'input',
        timestamp: Date.now(),
        completedAt: Date.now() + 1600,
        url: 'http://example.com',
        selector: { priority: ['id'], id: 'password' },
        tagName: 'input',
        value: 'MySecretPassword',
        inputType: 'password',
        isSensitive: true,
        simulationType: 'type',
      };

      const sanitized = sanitizeAction(action) as InputAction;
      expect(sanitized.value).toBe('••••••••••••••••');
      expect(sanitized.isSensitive).toBe(true);
    });

    it('should not modify non-input actions', () => {
      const action: Action = {
        id: 'act_001',
        type: 'click',
        timestamp: Date.now(),
        completedAt: Date.now() + 50,
        url: 'http://example.com',
        selector: { priority: ['id'], id: 'btn' },
        tagName: 'button',
        coordinates: { x: 100, y: 50 },
        coordinatesRelativeTo: 'element',
        button: 'left',
        clickCount: 1,
        modifiers: [],
      };

      const sanitized = sanitizeAction(action);
      expect(sanitized).toEqual(action);
    });

    it('should not modify non-sensitive input actions', () => {
      const action: InputAction = {
        id: 'act_001',
        type: 'input',
        timestamp: Date.now(),
        completedAt: Date.now() + 800,
        url: 'http://example.com',
        selector: { priority: ['id'], id: 'username' },
        tagName: 'input',
        value: 'john_doe',
        inputType: 'text',
        isSensitive: false,
        simulationType: 'type',
      };

      const sanitized = sanitizeAction(action) as InputAction;
      expect(sanitized.value).toBe('john_doe');
    });

    it('should sanitize credit card in input actions', () => {
      const action: InputAction = {
        id: 'act_001',
        type: 'input',
        timestamp: Date.now(),
        completedAt: Date.now() + 1600,
        url: 'http://example.com',
        selector: { priority: ['name'], name: 'card-number' },
        tagName: 'input',
        value: '4532015112830366',
        inputType: 'text',
        isSensitive: true,
        simulationType: 'type',
      };

      const sanitized = sanitizeAction(action) as InputAction;
      expect(sanitized.value).toBe('************0366');
    });
  });

  describe('Recording Sanitization', () => {
    it('should sanitize all actions in a recording', () => {
      const recording: Recording = {
        id: 'rec_123',
        version: '1.0.0',
        testName: 'Login Test',
        url: 'http://example.com',
        startTime: '2024-01-01T00:00:00.000Z',
        endTime: '2024-01-01T00:01:00.000Z',
        ...mockDimensions,
        userAgent: 'Test Agent',
        actions: [
          {
            id: 'act_001',
            type: 'input',
            timestamp: 1000,
            completedAt: 0,
            url: 'http://example.com',
            selector: { priority: ['id'], id: 'username' },
            tagName: 'input',
            value: 'john_doe',
            inputType: 'text',
            isSensitive: false,
            simulationType: 'type',
          },
          {
            id: 'act_002',
            type: 'input',
            timestamp: 2000,
            completedAt: 0,
            url: 'http://example.com',
            selector: { priority: ['id'], id: 'password' },
            tagName: 'input',
            value: 'SecretPassword123',
            inputType: 'password',
            isSensitive: true,
            simulationType: 'type',
          },
          {
            id: 'act_003',
            type: 'click',
            timestamp: 3000,
            completedAt: 0,
            url: 'http://example.com',
            selector: { priority: ['id'], id: 'login-btn' },
            tagName: 'button',
            coordinates: { x: 100, y: 50 },
            coordinatesRelativeTo: 'element',
            button: 'left',
            clickCount: 1,
            modifiers: [],
          },
        ],
      };

      const sanitized = sanitizeRecording(recording);

      expect((sanitized.actions[0] as InputAction).value).toBe('john_doe'); // Not sensitive
      expect((sanitized.actions[1] as InputAction).value).toBe('•••••••••••••••••'); // Password masked
      expect(sanitized.actions[2]).toEqual(recording.actions[2]); // Click unchanged
    });

    it('should not mutate original recording', () => {
      const recording: Recording = {
        id: 'rec_123',
        version: '1.0.0',
        testName: 'Test',
        url: 'http://example.com',
        startTime: '2024-01-01T00:00:00.000Z',
        ...mockDimensions,
        userAgent: 'Test Agent',
        actions: [
          {
            id: 'act_001',
            type: 'input',
            timestamp: 1000,
            completedAt: 0,
            url: 'http://example.com',
            selector: { priority: ['id'], id: 'password' },
            tagName: 'input',
            value: 'SecretPassword',
            inputType: 'password',
            isSensitive: true,
            simulationType: 'type',
          },
        ],
      };

      const originalValue = (recording.actions[0] as InputAction).value;
      sanitizeRecording(recording);

      expect((recording.actions[0] as InputAction).value).toBe(originalValue);
    });

    it('should preserve all recording metadata', () => {
      const recording: Recording = {
        id: 'rec_456',
        version: '1.0.0',
        testName: 'Payment Test',
        url: 'http://example.com/checkout',
        startTime: '2024-01-01T00:00:00.000Z',
        endTime: '2024-01-01T00:02:00.000Z',
        viewport: { width: 1366, height: 768 },
        windowSize: { width: 1366, height: 847 },
        screenSize: { width: 1366, height: 768 },
        devicePixelRatio: 1,
        userAgent: 'Mozilla/5.0',
        actions: [],
      };

      const sanitized = sanitizeRecording(recording);

      expect(sanitized.id).toBe(recording.id);
      expect(sanitized.version).toBe(recording.version);
      expect(sanitized.testName).toBe(recording.testName);
      expect(sanitized.url).toBe(recording.url);
      expect(sanitized.startTime).toBe(recording.startTime);
      expect(sanitized.endTime).toBe(recording.endTime);
      expect(sanitized.viewport).toEqual(recording.viewport);
      expect(sanitized.userAgent).toBe(recording.userAgent);
    });
  });
});

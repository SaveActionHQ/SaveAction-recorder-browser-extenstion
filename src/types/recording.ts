import type { Action } from './actions';

/**
 * Variable definition for sensitive data (passwords, API keys, etc.)
 */
export interface Variable {
  name: string; // Variable name (e.g., 'LOGIN_PASSWORD')
  description: string; // Human-readable description
  fieldType: string; // Input type (password, text, email, etc.)
  selector: string; // CSS selector where this variable is used
  placeholder: string; // Placeholder format (e.g., '${LOGIN_PASSWORD}')
}

/**
 * Recording session containing all captured actions
 */
export interface Recording {
  id: string; // Unique recording ID (rec_<timestamp>)
  testName: string; // User-provided test name
  url: string; // Starting URL
  startTime: string; // ISO 8601 format
  endTime?: string; // ISO 8601 format
  viewport: {
    width: number; // window.innerWidth - visible page area
    height: number; // window.innerHeight - visible page area
  };
  windowSize: {
    width: number; // window.outerWidth - includes browser chrome (tabs, address bar)
    height: number; // window.outerHeight - includes browser chrome
  };
  screenSize: {
    width: number; // screen.width - monitor resolution
    height: number; // screen.height - monitor resolution
  };
  devicePixelRatio: number; // window.devicePixelRatio - for retina/high-DPI displays
  userAgent: string;
  actions: Action[];
  variables: Variable[]; // Environment variables for sensitive data
  version: string; // Schema version (semantic versioning)
}

/**
 * Recording state (internal use)
 */
export type RecordingState = 'idle' | 'recording' | 'paused' | 'stopped';

/**
 * Recording session metadata
 */
export interface RecordingMetadata {
  id: string;
  testName: string;
  url: string;
  startTime: string;
  actionCount: number;
  state: RecordingState;
}

/**
 * Recording options
 */
export interface RecordingOptions {
  testName: string;
  maskSensitiveData?: boolean; // Default: true
  captureTypingDelay?: boolean; // Default: true
  captureCoordinates?: boolean; // Default: true
  autoGenerateCheckpoints?: boolean; // Default: true
}

/**
 * Current schema version
 */
export const SCHEMA_VERSION = '1.0.0';

/**
 * Generate unique recording ID
 */
export function generateRecordingId(): string {
  return `rec_${Date.now()}`;
}

/**
 * Generate unique action ID
 */
export function generateActionId(sequence: number): string {
  return `act_${String(sequence).padStart(3, '0')}`;
}

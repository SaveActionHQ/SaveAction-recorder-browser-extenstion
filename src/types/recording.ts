import type { Action } from './actions';

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

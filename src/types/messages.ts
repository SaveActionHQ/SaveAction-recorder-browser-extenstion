import type { Action } from './actions';
import type { Recording, RecordingMetadata, RecordingState } from './recording';

/**
 * Message types for communication between extension components
 */
export type MessageType =
  | 'START_RECORDING'
  | 'STOP_RECORDING'
  | 'PAUSE_RECORDING'
  | 'RESUME_RECORDING'
  | 'ADD_ACTION'
  | 'GET_STATUS'
  | 'GET_RECORDING'
  | 'SAVE_CURRENT_STATE'
  | 'SYNC_ACTION'
  | 'CLEAR_RECORDING'
  | 'DOWNLOAD_RECORDING'
  | 'STATUS_UPDATE';

/**
 * Base message interface
 */
export interface BaseMessage {
  type: MessageType;
}

/**
 * Start recording message
 */
export interface StartRecordingMessage extends BaseMessage {
  type: 'START_RECORDING';
  payload: {
    testName: string;
  };
}

/**
 * Stop recording message
 */
export interface StopRecordingMessage extends BaseMessage {
  type: 'STOP_RECORDING';
}

/**
 * Pause recording message
 */
export interface PauseRecordingMessage extends BaseMessage {
  type: 'PAUSE_RECORDING';
}

/**
 * Resume recording message
 */
export interface ResumeRecordingMessage extends BaseMessage {
  type: 'RESUME_RECORDING';
}

/**
 * Add action message (from content script to background)
 */
export interface AddActionMessage extends BaseMessage {
  type: 'ADD_ACTION';
  payload: {
    action: Action;
  };
}

/**
 * Get status message
 */
export interface GetStatusMessage extends BaseMessage {
  type: 'GET_STATUS';
}

/**
 * Get recording message
 */
export interface GetRecordingMessage extends BaseMessage {
  type: 'GET_RECORDING';
}

/**
 * Save current state message (before navigation)
 */
export interface SaveCurrentStateMessage extends BaseMessage {
  type: 'SAVE_CURRENT_STATE';
}

/**
 * Sync action to background for persistent storage
 */
export interface SyncActionMessage extends BaseMessage {
  type: 'SYNC_ACTION';
  payload: {
    action: Action;
  };
}

/**
 * Clear recording message
 */
export interface ClearRecordingMessage extends BaseMessage {
  type: 'CLEAR_RECORDING';
}

/**
 * Download recording message
 */
export interface DownloadRecordingMessage extends BaseMessage {
  type: 'DOWNLOAD_RECORDING';
}

/**
 * Status update message (from background to popup)
 */
export interface StatusUpdateMessage extends BaseMessage {
  type: 'STATUS_UPDATE';
  payload: {
    state: RecordingState;
    metadata?: RecordingMetadata;
  };
}

/**
 * Union type of all messages
 */
export type Message =
  | StartRecordingMessage
  | StopRecordingMessage
  | PauseRecordingMessage
  | ResumeRecordingMessage
  | AddActionMessage
  | GetStatusMessage
  | GetRecordingMessage
  | SaveCurrentStateMessage
  | SyncActionMessage
  | ClearRecordingMessage
  | DownloadRecordingMessage
  | StatusUpdateMessage;

/**
 * Message response types
 */
export interface MessageResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Status response
 */
export type StatusResponse = MessageResponse<{
  state: RecordingState;
  metadata?: RecordingMetadata;
}>;

/**
 * Recording response
 */
export type RecordingResponse = MessageResponse<Recording>;

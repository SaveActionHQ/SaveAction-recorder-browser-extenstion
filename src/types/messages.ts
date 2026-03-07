import type { Action } from './actions';
import type { Recording, RecordingMetadata, RecordingState } from './recording';

/**
 * Message types for communication between extension components
 */
export type MessageType =
  | 'START_RECORDING'
  | 'STOP_RECORDING'
  | 'STOP_AND_UPLOAD'
  | 'PAUSE_RECORDING'
  | 'RESUME_RECORDING'
  | 'ADD_ACTION'
  | 'GET_STATUS'
  | 'GET_LAST_UPLOAD_RESULT'
  | 'GET_RECORDING'
  | 'SAVE_CURRENT_STATE'
  | 'SYNC_ACTION'
  | 'SYNC_METADATA'
  | 'GET_ACTION_COUNTER'
  | 'CLEAR_RECORDING'
  | 'DOWNLOAD_RECORDING'
  | 'STATUS_UPDATE'
  | 'ENTER_ASSERTION_MODE'
  | 'EXIT_ASSERTION_MODE'
  | 'MARK_VARIABLE'
  | 'UNMARK_VARIABLE'
  | 'GET_VARIABLES';

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
 * Stop and upload recording message (from overlay)
 */
export interface StopAndUploadMessage extends BaseMessage {
  type: 'STOP_AND_UPLOAD';
  payload?: {
    openPopup?: boolean;
  };
}

/**
 * Get last upload result message
 */
export interface GetLastUploadResultMessage extends BaseMessage {
  type: 'GET_LAST_UPLOAD_RESULT';
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
 * Sync action message
 */
export interface SyncActionMessage extends BaseMessage {
  type: 'SYNC_ACTION';
  payload: {
    action: Action;
  };
}

/**
 * Sync metadata message (send dimensions to background)
 */
export interface SyncMetadataMessage extends BaseMessage {
  type: 'SYNC_METADATA';
  payload: {
    viewport: { width: number; height: number };
    windowSize: { width: number; height: number };
    screenSize: { width: number; height: number };
    devicePixelRatio: number;
  };
}

/**
 * Get action counter message
 */
export interface GetActionCounterMessage extends BaseMessage {
  type: 'GET_ACTION_COUNTER';
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
 * Enter assertion mode message (from popup to content)
 */
export interface EnterAssertionModeMessage extends BaseMessage {
  type: 'ENTER_ASSERTION_MODE';
}

/**
 * Exit assertion mode message (from popup/content to background)
 */
export interface ExitAssertionModeMessage extends BaseMessage {
  type: 'EXIT_ASSERTION_MODE';
}

/**
 * Mark a field as a variable (from content to background)
 */
export interface MarkVariableMessage extends BaseMessage {
  type: 'MARK_VARIABLE';
  payload: {
    variableName: string;
    selector: string;
    fieldType: string;
    defaultValue: string;
  };
}

/**
 * Unmark a variable (from content to background)
 */
export interface UnmarkVariableMessage extends BaseMessage {
  type: 'UNMARK_VARIABLE';
  payload: {
    variableName: string;
  };
}

/**
 * Get the list of marked variables for the current recording
 */
export interface GetVariablesMessage extends BaseMessage {
  type: 'GET_VARIABLES';
}

/**
 * Union type of all messages
 */
export type Message =
  | StartRecordingMessage
  | StopRecordingMessage
  | StopAndUploadMessage
  | GetLastUploadResultMessage
  | PauseRecordingMessage
  | ResumeRecordingMessage
  | AddActionMessage
  | GetStatusMessage
  | GetRecordingMessage
  | SaveCurrentStateMessage
  | SyncActionMessage
  | SyncMetadataMessage
  | GetActionCounterMessage
  | ClearRecordingMessage
  | DownloadRecordingMessage
  | StatusUpdateMessage
  | EnterAssertionModeMessage
  | ExitAssertionModeMessage
  | MarkVariableMessage
  | UnmarkVariableMessage
  | GetVariablesMessage;

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

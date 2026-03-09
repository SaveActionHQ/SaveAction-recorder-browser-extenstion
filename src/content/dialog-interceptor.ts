/**
 * Dialog Interceptor - Shared constants
 *
 * The actual dialog monkey-patching now lives in dialog-early-inject.ts
 * which runs in the MAIN world (declared in manifest.json with "world": "MAIN").
 * This avoids CSP violations from inline <script> injection.
 *
 * This module exports the shared message type constant so that
 * event-listener.ts (ISOLATED world) can filter incoming postMessage events.
 */

export const DIALOG_MESSAGE_TYPE = 'saveaction-dialog-event';

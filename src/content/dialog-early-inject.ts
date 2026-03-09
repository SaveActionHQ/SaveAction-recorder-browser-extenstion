/**
 * Content Script - Dialog Early Injection (MAIN world)
 *
 * This script runs in the MAIN world at document_start, meaning it shares
 * the page's JavaScript execution environment. It monkey-patches
 * window.alert, window.confirm, and window.prompt to capture dialog
 * interactions and post them back via window.postMessage.
 *
 * The content script (event-listener.ts, running in ISOLATED world)
 * listens for these messages and records them as DialogAction events.
 *
 * Because this runs directly in the MAIN world (declared in manifest.json),
 * there is NO inline <script> injection — avoiding CSP violations entirely.
 *
 * beforeunload dialogs cannot be monkey-patched (browser-level) and
 * are intentionally skipped — the runner handles them via Playwright's
 * page.on('dialog') event.
 */

(() => {
  // Guard against double-patching (e.g. multiple frames or re-injection)
  if ((window as any).__saveaction_dialog_patched) return;
  (window as any).__saveaction_dialog_patched = true;

  const MESSAGE_TYPE = 'saveaction-dialog-event';

  const origAlert = window.alert.bind(window);
  const origConfirm = window.confirm.bind(window);
  const origPrompt = window.prompt.bind(window);

  window.alert = function (message?: any): void {
    const msg = message === undefined || message === null ? '' : String(message);
    origAlert(msg);
    window.postMessage(
      {
        type: MESSAGE_TYPE,
        dialogType: 'alert',
        message: msg,
        response: 'accept',
      },
      '*'
    );
  };

  window.confirm = function (message?: string): boolean {
    const msg = message === undefined || message === null ? '' : String(message);
    const result = origConfirm(msg);
    window.postMessage(
      {
        type: MESSAGE_TYPE,
        dialogType: 'confirm',
        message: msg,
        response: result ? 'accept' : 'dismiss',
      },
      '*'
    );
    return result;
  };

  window.prompt = function (message?: string, defaultValue?: string): string | null {
    const msg = message === undefined || message === null ? '' : String(message);
    const result = origPrompt(msg, defaultValue);
    window.postMessage(
      {
        type: MESSAGE_TYPE,
        dialogType: 'prompt',
        message: msg,
        response: result !== null ? 'accept' : 'dismiss',
        promptValue: result !== null ? result : undefined,
      },
      '*'
    );
    return result;
  };
})();

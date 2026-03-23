/**
 * Content Script - window.open Early Injection (MAIN world)
 *
 * This script runs in the MAIN world at document_start, meaning it shares
 * the page's JavaScript execution environment. It monkey-patches
 * window.open to capture programmatic new-tab/popup creation and post
 * them back via window.postMessage.
 *
 * The content script (event-listener.ts, running in ISOLATED world)
 * listens for these messages and relays them to the background script
 * so tab open actions can be correlated with chrome.tabs.onCreated events.
 *
 * Follows the exact same pattern as dialog-early-inject.ts.
 */

(() => {
  // Guard against double-patching (e.g. multiple frames or re-injection)
  if ((window as any).__saveaction_windowopen_patched) return;
  (window as any).__saveaction_windowopen_patched = true;

  const MESSAGE_TYPE = 'saveaction-window-open';

  const origOpen = window.open.bind(window);

  window.open = function (
    url?: string | URL,
    target?: string,
    features?: string
  ): WindowProxy | null {
    const result = origOpen(url, target, features);

    const resolvedUrl = url ? String(url) : '';

    window.postMessage(
      {
        type: MESSAGE_TYPE,
        url: resolvedUrl,
        target: target || '',
        features: features || '',
      },
      '*'
    );

    return result;
  };
})();

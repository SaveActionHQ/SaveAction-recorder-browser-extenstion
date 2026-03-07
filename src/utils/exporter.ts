import type { Recording } from '@/types/recording';
import type { Action } from '@/types/actions';
import { sanitizeRecording } from '@/utils/sanitizer';
import { DEFAULT_SETTINGS } from '@/types/settings';

/**
 * Check if an action is related to the extension's own UI
 * @param action - The action to check
 * @returns true if the action should be filtered out (it's an extension UI action)
 */
function isExtensionUIAction(action: Action): boolean {
  // Check if action has a selector property (click, input, select, etc.)
  if ('selector' in action && action.selector) {
    const selector = action.selector;

    // Check all selector strategies for extension UI reference
    if (typeof selector === 'object') {
      // Check CSS selector
      if (selector.css && selector.css.includes('saveaction-')) {
        return true;
      }
      // Check XPath selector
      if (selector.xpath && selector.xpath.includes('saveaction-')) {
        return true;
      }
      // Check ID selector
      if (selector.id && selector.id.includes('saveaction-')) {
        return true;
      }
      // Check data-testid selector
      if (selector.dataTestId && selector.dataTestId.includes('saveaction-')) {
        return true;
      }
      // Check fallback parent references
      if (selector.fallback) {
        const fb = selector.fallback as Record<string, unknown>;
        if (typeof fb.parentId === 'string' && fb.parentId.includes('saveaction-')) {
          return true;
        }
        if (typeof fb.uniqueParent === 'string' && fb.uniqueParent.includes('saveaction-')) {
          return true;
        }
      }
    }
  }

  // Check alternative selectors
  if ('alternativeSelectors' in action && action.alternativeSelectors) {
    for (const altSelector of action.alternativeSelectors) {
      if (altSelector.css?.includes('saveaction-')) {
        return true;
      }
      if (altSelector.xpath?.includes('saveaction-')) {
        return true;
      }
    }
  }

  // Check selectors array (multi-strategy selectors)
  if ('selectors' in action && action.selectors) {
    for (const selectorWithConfidence of action.selectors) {
      if (selectorWithConfidence.value?.includes('saveaction-')) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Filter out extension UI actions from recording
 * @param recording - The recording to filter
 * @returns A new recording with extension UI actions removed
 */
export function filterExtensionUIActions(recording: Recording): Recording {
  const filteredActions = recording.actions.filter((action) => !isExtensionUIAction(action));

  // Log if any actions were filtered
  const removedCount = recording.actions.length - filteredActions.length;
  if (removedCount > 0) {
    console.log(`[Exporter] 🛡️ Filtered ${removedCount} extension UI action(s) from recording`);
  }

  return {
    ...recording,
    actions: filteredActions,
  };
}

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Export recording as formatted JSON string
 * Automatically filters out any extension UI actions
 */
export function exportAsJSON(recording: Recording, storeCredentials = false): string {
  // Filter out extension UI actions before export
  const filteredRecording = filterExtensionUIActions(recording);
  // Sanitize sensitive values unless storeCredentials is enabled
  const output = storeCredentials ? filteredRecording : sanitizeRecording(filteredRecording);
  return JSON.stringify(output, null, 2);
}

/**
 * Download recording as JSON file using chrome.downloads API
 * Automatically filters out any extension UI actions
 * Uses data URL for service worker compatibility (no DOM APIs)
 */
export async function downloadRecording(recording: Recording): Promise<void> {
  // Load storeCredentials setting
  let storeCredentials = DEFAULT_SETTINGS.storeCredentials;
  try {
    const result = await new Promise<Record<string, any>>((resolve) => {
      chrome.storage.sync.get(['storeCredentials'], resolve);
    });
    storeCredentials = result.storeCredentials ?? false;
  } catch {
    // Fall back to default (masked)
  }

  return new Promise((resolve, reject) => {
    try {
      // Filter out extension UI actions before export
      const filteredRecording = filterExtensionUIActions(recording);
      // Sanitize sensitive values unless storeCredentials is enabled
      const outputRecording = storeCredentials
        ? filteredRecording
        : sanitizeRecording(filteredRecording);

      // Generate filename from test name
      const sanitizedName = outputRecording.testName
        .replace(/[^a-zA-Z0-9\s-_]/g, '')
        .replace(/\s+/g, '_');
      const timestamp = Date.now();
      const filename = `${sanitizedName}_${timestamp}.json`;

      // Create JSON and convert to data URL (works in service workers)
      const json = JSON.stringify(outputRecording, null, 2);
      const base64 = btoa(unescape(encodeURIComponent(json)));
      const dataUrl = `data:application/json;base64,${base64}`;

      // Download using chrome.downloads API
      chrome.downloads.download(
        {
          url: dataUrl,
          filename,
          saveAs: true,
        },
        (_downloadId) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve();
          }
        }
      );
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Validate recording data before export
 */
export function validateExportData(recording: Recording): ValidationResult {
  const errors: string[] = [];

  // Required fields
  if (!recording.id) {
    errors.push('Missing id');
  }
  if (!recording.testName) {
    errors.push('Missing testName');
  }
  if (!recording.url) {
    errors.push('Missing url');
  }
  if (!recording.startTime) {
    errors.push('Missing startTime');
  }
  if (!recording.userAgent) {
    errors.push('Missing userAgent');
  }
  if (!recording.version) {
    errors.push('Missing version');
  }

  // Validate timestamp format (ISO 8601)
  if (recording.startTime) {
    const startDate = new Date(recording.startTime);
    if (isNaN(startDate.getTime())) {
      errors.push('Invalid startTime format');
    }
  }

  if (recording.endTime) {
    const endDate = new Date(recording.endTime);
    if (isNaN(endDate.getTime())) {
      errors.push('Invalid endTime format');
    }
  }

  // Validate viewport
  if (!recording.viewport) {
    errors.push('Missing viewport');
  } else {
    if (!recording.viewport.width || recording.viewport.width <= 0) {
      errors.push('Invalid viewport width');
    }
    if (!recording.viewport.height || recording.viewport.height <= 0) {
      errors.push('Invalid viewport height');
    }
  }

  // Validate actions array
  if (!Array.isArray(recording.actions)) {
    errors.push('Actions must be an array');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

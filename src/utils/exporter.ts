import type { Recording } from '@/types/recording';

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Export recording as formatted JSON string
 */
export function exportAsJSON(recording: Recording): string {
  return JSON.stringify(recording, null, 2);
}

/**
 * Download recording as JSON file using chrome.downloads API
 */
export async function downloadRecording(recording: Recording): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      // Generate filename from test name
      const sanitizedName = recording.testName
        .replace(/[^a-zA-Z0-9\s-_]/g, '')
        .replace(/\s+/g, '_');
      const timestamp = Date.now();
      const filename = `${sanitizedName}_${timestamp}.json`;

      // Create JSON blob
      const json = exportAsJSON(recording);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      // Download using chrome.downloads API
      chrome.downloads.download(
        {
          url,
          filename,
          saveAs: true,
        },
        (_downloadId) => {
          // Revoke blob URL after download starts
          URL.revokeObjectURL(url);

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

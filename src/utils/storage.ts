import type { Recording } from '@/types/recording';

/**
 * Recording metadata for listing
 */
export interface RecordingMetadata {
  id: string;
  testName: string;
  url: string;
  startTime: string;
  endTime: string | null;
  actionCount: number;
}

/**
 * Save a recording to chrome.storage.local
 */
export async function saveRecording(recording: Recording): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      // Get existing recording IDs
      chrome.storage.local.get(['recording_ids'], (result) => {
        const recordingIds: string[] = result.recording_ids || [];
        
        // Add new ID if not already present
        if (!recordingIds.includes(recording.id)) {
          recordingIds.push(recording.id);
        }

        // Save both the recording and updated ID list
        chrome.storage.local.set(
          {
            [`recording_${recording.id}`]: recording,
            'recording_ids': recordingIds,
          },
          () => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else {
              resolve();
            }
          }
        );
      });
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Load a recording from chrome.storage.local
 */
export async function loadRecording(id: string): Promise<Recording | null> {
  return new Promise((resolve, reject) => {
    try {
      chrome.storage.local.get([`recording_${id}`], (result) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          const recording = result[`recording_${id}`] || null;
          resolve(recording);
        }
      });
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Delete a recording from chrome.storage.local
 */
export async function deleteRecording(id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      // Get existing recording IDs
      chrome.storage.local.get(['recording_ids'], (result) => {
        const recordingIds: string[] = result.recording_ids || [];
        
        // Remove the ID from the list
        const updatedIds = recordingIds.filter((recordingId) => recordingId !== id);

        // Remove the recording and update ID list
        chrome.storage.local.remove([`recording_${id}`], () => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }

          chrome.storage.local.set({ 'recording_ids': updatedIds }, () => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else {
              resolve();
            }
          });
        });
      });
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * List all recording metadata
 */
export async function listRecordings(): Promise<RecordingMetadata[]> {
  return new Promise((resolve, reject) => {
    try {
      // Get all recording IDs
      chrome.storage.local.get(['recording_ids'], (result) => {
        const recordingIds: string[] = result.recording_ids || [];

        if (recordingIds.length === 0) {
          resolve([]);
          return;
        }

        // Get all recordings
        const keys = recordingIds.map((id) => `recording_${id}`);
        chrome.storage.local.get(keys, (recordings) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }

          const metadata = recordingIds
            .map((id) => {
              const recording: Recording | undefined = recordings[`recording_${id}`];
              if (!recording) return null;

              return {
                id: recording.id,
                testName: recording.testName,
                url: recording.url,
                startTime: recording.startTime,
                endTime: recording.endTime,
                actionCount: recording.actions.length,
              } as RecordingMetadata;
            })
            .filter((item): item is RecordingMetadata => item !== null);

          resolve(metadata);
        });
      });
    } catch (error) {
      reject(error);
    }
  });
}

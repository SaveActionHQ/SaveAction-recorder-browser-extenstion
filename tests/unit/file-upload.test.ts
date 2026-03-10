/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { EventListener } from '@/content/event-listener';
import { validateAction } from '@/utils/validator';
import {
  isFileUploadAction,
  type FileUploadAction,
  type Action,
  type ClickAction,
} from '@/types/actions';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a mock FileList with the given file metadata.
 * JSDOM does not support DataTransfer, so we build a FileList-like object manually.
 */
function createMockFileList(
  files: Array<{ name: string; size: number; type: string; lastModified: number }>
): FileList {
  const fileObjects = files.map(
    (f) =>
      new File(['x'.repeat(Math.min(f.size, 1))], f.name, {
        type: f.type,
        lastModified: f.lastModified,
      })
  );

  // Override the size to match the requested value (File constructor uses content length)
  fileObjects.forEach((fileObj, i) => {
    Object.defineProperty(fileObj, 'size', {
      value: files[i]!.size,
      writable: false,
      configurable: true,
    });
  });

  // Build a FileList-like object
  const fileList: any = {
    length: fileObjects.length,
    item: (index: number) => fileObjects[index] ?? null,
    [Symbol.iterator]: function* () {
      for (const f of fileObjects) yield f;
    },
  };
  // Index access (fileList[0], fileList[1], etc.)
  fileObjects.forEach((f, i) => {
    fileList[i] = f;
  });

  return fileList as FileList;
}

/**
 * Attach a mock FileList to an input element's `files` property.
 */
function setInputFiles(
  input: HTMLInputElement,
  files: Array<{ name: string; size: number; type: string; lastModified: number }>
): void {
  const fileList = createMockFileList(files);
  Object.defineProperty(input, 'files', {
    value: fileList,
    writable: false,
    configurable: true,
  });
}

/**
 * Build a minimal valid FileUploadAction for use in validator / type guard tests.
 */
function buildValidFileUploadAction(
  overrides: Partial<FileUploadAction> = {}
): FileUploadAction {
  return {
    id: 'act_001',
    type: 'file-upload',
    timestamp: Date.now(),
    completedAt: Date.now() + 50,
    url: 'http://example.com',
    selector: { priority: ['id'], id: 'file-input' },
    tagName: 'input',
    inputName: 'avatar',
    inputId: 'file-input',
    acceptAttribute: 'image/*',
    multiple: false,
    files: [
      {
        name: 'photo.jpg',
        size: 1024,
        type: 'image/jpeg',
        lastModified: 1700000000000,
      },
    ],
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Type Guard Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('isFileUploadAction', () => {
  it('should return true for file-upload actions', () => {
    const action = buildValidFileUploadAction();
    expect(isFileUploadAction(action)).toBe(true);
  });

  it('should return false for click actions', () => {
    const action: ClickAction = {
      id: 'act_001',
      type: 'click',
      timestamp: 1000,
      completedAt: 0,
      url: 'http://example.com',
      selector: { priority: ['id'], id: 'btn' },
      tagName: 'button',
      coordinates: { x: 100, y: 50 },
      coordinatesRelativeTo: 'element',
      button: 'left',
      clickCount: 1,
      modifiers: [],
    };
    expect(isFileUploadAction(action as Action)).toBe(false);
  });

  it('should return false for input actions', () => {
    const action: Action = {
      id: 'act_002',
      type: 'input',
      timestamp: 2000,
      completedAt: 0,
      url: 'http://example.com',
      selector: { priority: ['id'], id: 'input' },
      tagName: 'input',
      value: 'test',
      inputType: 'text',
      isSensitive: false,
      simulationType: 'type',
    };
    expect(isFileUploadAction(action)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Validator Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('Validator – file-upload action', () => {
  it('should validate a valid file-upload action', () => {
    const action = buildValidFileUploadAction();
    const result = validateAction(action);
    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should validate a multi-file upload action', () => {
    const action = buildValidFileUploadAction({
      multiple: true,
      files: [
        { name: 'doc.pdf', size: 2048, type: 'application/pdf', lastModified: 1700000000000 },
        { name: 'img.png', size: 4096, type: 'image/png', lastModified: 1700000001000 },
      ],
    });
    const result = validateAction(action);
    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should fail if selector is missing', () => {
    const action = buildValidFileUploadAction();
    (action as any).selector = undefined;
    const result = validateAction(action);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        field: 'action.selector',
        message: 'File upload action must have a selector',
      })
    );
  });

  it('should fail if files array is missing', () => {
    const action = buildValidFileUploadAction();
    (action as any).files = undefined;
    const result = validateAction(action);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        field: 'action.files',
        message: 'File upload action must have at least one file',
      })
    );
  });

  it('should fail if files array is empty', () => {
    const action = buildValidFileUploadAction({ files: [] });
    const result = validateAction(action as any);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        field: 'action.files',
        message: 'File upload action must have at least one file',
      })
    );
  });

  it('should fail if a file name is missing', () => {
    const action = buildValidFileUploadAction({
      files: [{ name: '', size: 100, type: 'text/plain', lastModified: 1700000000000 }],
    });
    const result = validateAction(action);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        field: 'action.files[0].name',
        message: 'File at index 0 must have a name',
      })
    );
  });

  it('should fail if a file size is negative', () => {
    const action = buildValidFileUploadAction({
      files: [{ name: 'bad.txt', size: -1, type: 'text/plain', lastModified: 1700000000000 }],
    });
    const result = validateAction(action);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        field: 'action.files[0].size',
        message: 'File at index 0 must have a valid size',
      })
    );
  });

  it('should fail if a file size is not a number', () => {
    const action = buildValidFileUploadAction();
    (action.files[0] as any).size = 'big';
    const result = validateAction(action);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        field: 'action.files[0].size',
        message: 'File at index 0 must have a valid size',
      })
    );
  });

  it('should fail if a file type is missing', () => {
    const action = buildValidFileUploadAction({
      files: [{ name: 'file.bin', size: 512, type: '', lastModified: 1700000000000 }],
    });
    const result = validateAction(action);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        field: 'action.files[0].type',
        message: 'File at index 0 must have a MIME type',
      })
    );
  });

  it('should fail if multiple flag is not a boolean', () => {
    const action = buildValidFileUploadAction();
    (action as any).multiple = 'yes';
    const result = validateAction(action);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        field: 'action.multiple',
        message: 'File upload action must specify whether input accepts multiple files',
      })
    );
  });

  it('should report errors for multiple invalid files in one action', () => {
    const action = buildValidFileUploadAction({
      files: [
        { name: '', size: -1, type: '', lastModified: 1700000000000 },
        { name: '', size: -2, type: '', lastModified: 1700000000000 },
      ],
    });
    const result = validateAction(action);
    expect(result.isValid).toBe(false);
    // 3 errors per file (name, size, type) × 2 files = 6 errors + base fields OK
    const fileErrors = result.errors.filter((e) => e.field.startsWith('action.files'));
    expect(fileErrors).toHaveLength(6);
  });

  it('should accept zero-byte files', () => {
    const action = buildValidFileUploadAction({
      files: [{ name: 'empty.txt', size: 0, type: 'text/plain', lastModified: 1700000000000 }],
    });
    const result = validateAction(action);
    expect(result.isValid).toBe(true);
  });

  it('should validate selector errors in file-upload action', () => {
    const action = buildValidFileUploadAction({
      selector: { priority: ['id', 'css'], id: 'file-input' },
      // css referenced in priority but not defined → selector validation should fail
    });
    const result = validateAction(action);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        field: 'selector.css',
      })
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// EventListener Integration Tests — File Upload Recording
// ─────────────────────────────────────────────────────────────────────────────

describe('EventListener – File Upload Recording', () => {
  let eventListener: EventListener;
  let capturedActions: Action[];
  let mockCallback: (action: Action) => void;

  beforeEach(() => {
    window.scrollTo = vi.fn() as any;
    capturedActions = [];
    mockCallback = vi.fn((action: Action) => {
      capturedActions.push(action);
    });
    eventListener = new EventListener(mockCallback);
  });

  afterEach(() => {
    eventListener.destroy();
    capturedActions = [];
  });

  // ── Single File Upload ──────────────────────────────────────────────────

  it('should capture single file upload with metadata', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.id = 'avatar-upload';
    input.name = 'avatar';
    input.accept = 'image/*';
    document.body.appendChild(input);

    setInputFiles(input, [
      { name: 'portrait.jpg', size: 5120, type: 'image/jpeg', lastModified: 1700000000000 },
    ]);

    eventListener.start();
    input.dispatchEvent(new Event('change', { bubbles: true }));

    expect(capturedActions).toHaveLength(1);
    const action = capturedActions[0]!;
    expect(action.type).toBe('file-upload');

    if (isFileUploadAction(action)) {
      expect(action.tagName).toBe('input');
      expect(action.inputName).toBe('avatar');
      expect(action.inputId).toBe('avatar-upload');
      expect(action.acceptAttribute).toBe('image/*');
      expect(action.multiple).toBe(false);
      expect(action.files).toHaveLength(1);
      expect(action.files[0]!.name).toBe('portrait.jpg');
      expect(action.files[0]!.size).toBe(5120);
      expect(action.files[0]!.type).toBe('image/jpeg');
      expect(action.files[0]!.lastModified).toBe(1700000000000);
      expect(action.selector).toBeDefined();
      expect(action.url).toBe(window.location.href);
    }

    document.body.removeChild(input);
  });

  // ── Multiple File Upload ────────────────────────────────────────────────

  it('should capture multiple file upload with all file metadata', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.id = 'documents';
    input.name = 'docs';
    input.multiple = true;
    input.accept = '.pdf,.doc,.docx';
    document.body.appendChild(input);

    setInputFiles(input, [
      { name: 'report.pdf', size: 102400, type: 'application/pdf', lastModified: 1700000001000 },
      { name: 'notes.docx', size: 20480, type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', lastModified: 1700000002000 },
      { name: 'summary.doc', size: 15360, type: 'application/msword', lastModified: 1700000003000 },
    ]);

    eventListener.start();
    input.dispatchEvent(new Event('change', { bubbles: true }));

    expect(capturedActions).toHaveLength(1);
    const action = capturedActions[0]!;

    if (isFileUploadAction(action)) {
      expect(action.multiple).toBe(true);
      expect(action.acceptAttribute).toBe('.pdf,.doc,.docx');
      expect(action.files).toHaveLength(3);
      expect(action.files[0]!.name).toBe('report.pdf');
      expect(action.files[1]!.name).toBe('notes.docx');
      expect(action.files[2]!.name).toBe('summary.doc');
    }

    document.body.removeChild(input);
  });

  // ── Edge Cases ──────────────────────────────────────────────────────────

  it('should not record when file picker is cancelled (empty file list)', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.id = 'upload';
    document.body.appendChild(input);

    // Simulate cancelled picker — files is an empty FileList
    setInputFiles(input, []);

    eventListener.start();
    input.dispatchEvent(new Event('change', { bubbles: true }));

    expect(capturedActions).toHaveLength(0);

    document.body.removeChild(input);
  });

  it('should not record file upload for disabled input', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.id = 'disabled-upload';
    input.disabled = true;
    document.body.appendChild(input);

    setInputFiles(input, [
      { name: 'file.txt', size: 100, type: 'text/plain', lastModified: 1700000000000 },
    ]);

    eventListener.start();
    input.dispatchEvent(new Event('change', { bubbles: true }));

    expect(capturedActions).toHaveLength(0);

    document.body.removeChild(input);
  });

  it('should not record file upload for hidden input (display:none)', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.id = 'hidden-upload';
    input.style.display = 'none';
    document.body.appendChild(input);

    setInputFiles(input, [
      { name: 'hidden.txt', size: 50, type: 'text/plain', lastModified: 1700000000000 },
    ]);

    eventListener.start();
    input.dispatchEvent(new Event('change', { bubbles: true }));

    expect(capturedActions).toHaveLength(0);

    document.body.removeChild(input);
  });

  it('should not record file upload for invisible input (visibility:hidden)', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.id = 'invisible-upload';
    input.style.visibility = 'hidden';
    document.body.appendChild(input);

    setInputFiles(input, [
      { name: 'invisible.txt', size: 50, type: 'text/plain', lastModified: 1700000000000 },
    ]);

    eventListener.start();
    input.dispatchEvent(new Event('change', { bubbles: true }));

    expect(capturedActions).toHaveLength(0);

    document.body.removeChild(input);
  });

  // ── Input Without Optional Attributes ───────────────────────────────────

  it('should handle file input without name, id, or accept', () => {
    const input = document.createElement('input');
    input.type = 'file';
    // No id, name, or accept attribute
    document.body.appendChild(input);

    setInputFiles(input, [
      { name: 'generic.bin', size: 256, type: 'application/octet-stream', lastModified: 1700000000000 },
    ]);

    eventListener.start();
    input.dispatchEvent(new Event('change', { bubbles: true }));

    expect(capturedActions).toHaveLength(1);
    const action = capturedActions[0]!;

    if (isFileUploadAction(action)) {
      expect(action.inputName).toBeUndefined();
      expect(action.inputId).toBeUndefined();
      expect(action.acceptAttribute).toBeUndefined();
      expect(action.multiple).toBe(false);
      expect(action.files).toHaveLength(1);
      expect(action.files[0]!.name).toBe('generic.bin');
    }

    document.body.removeChild(input);
  });

  // ── Does Not Interfere With Other Input Events ──────────────────────────

  it('should not capture file input through onInput handler (no fake path)', async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.id = 'file-via-input';
    document.body.appendChild(input);

    setInputFiles(input, [
      { name: 'test.pdf', size: 1000, type: 'application/pdf', lastModified: 1700000000000 },
    ]);

    eventListener.start();

    // Dispatch input event (browsers fire this for file inputs with "C:\fakepath\...")
    input.dispatchEvent(new Event('input', { bubbles: true }));

    // Wait for debounce
    await new Promise((resolve) => setTimeout(resolve, 600));
    eventListener.stop();

    // The onInput handler should skip type="file" — no fake-path action recorded
    // Only change event should trigger file-upload action
    const inputActions = capturedActions.filter((a) => a.type === 'input');
    expect(inputActions).toHaveLength(0);

    document.body.removeChild(input);
  });

  it('should only record file-upload type (not input type) on change event', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.id = 'file-change';
    document.body.appendChild(input);

    setInputFiles(input, [
      { name: 'test.txt', size: 100, type: 'text/plain', lastModified: 1700000000000 },
    ]);

    eventListener.start();
    input.dispatchEvent(new Event('change', { bubbles: true }));

    expect(capturedActions).toHaveLength(1);
    expect(capturedActions[0]!.type).toBe('file-upload');
    // Not 'input' or 'select' type
    expect(capturedActions[0]!.type).not.toBe('input');
    expect(capturedActions[0]!.type).not.toBe('select');

    document.body.removeChild(input);
  });

  // ── Large File Metadata ─────────────────────────────────────────────────

  it('should record metadata for large files without storing content', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.id = 'large-file';
    document.body.appendChild(input);

    setInputFiles(input, [
      {
        name: 'video.mp4',
        size: 1073741824, // 1 GB
        type: 'video/mp4',
        lastModified: 1700000000000,
      },
    ]);

    eventListener.start();
    input.dispatchEvent(new Event('change', { bubbles: true }));

    expect(capturedActions).toHaveLength(1);

    if (isFileUploadAction(capturedActions[0]!)) {
      const action = capturedActions[0]!;
      expect(action.files[0]!.size).toBe(1073741824);
      expect(action.files[0]!.name).toBe('video.mp4');
      // No `content` or `data` property should exist
      expect((action.files[0] as any).content).toBeUndefined();
      expect((action.files[0] as any).data).toBeUndefined();
      expect((action.files[0] as any).buffer).toBeUndefined();
    }

    document.body.removeChild(input);
  });

  // ── Action Structure Completeness ───────────────────────────────────────

  it('should emit action with correct base fields', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.id = 'base-fields-test';
    document.body.appendChild(input);

    setInputFiles(input, [
      { name: 'doc.pdf', size: 500, type: 'application/pdf', lastModified: 1700000000000 },
    ]);

    eventListener.start();
    input.dispatchEvent(new Event('change', { bubbles: true }));

    expect(capturedActions).toHaveLength(1);
    const action = capturedActions[0]!;

    // Base action fields
    expect(action.id).toBeDefined();
    expect(action.id).toMatch(/^act_\d{3,}$/);
    expect(action.type).toBe('file-upload');
    expect(typeof action.timestamp).toBe('number');
    expect(action.timestamp).toBeGreaterThanOrEqual(0);
    expect(action.url).toBe(window.location.href);

    document.body.removeChild(input);
  });

  // ── Different MIME Types ────────────────────────────────────────────────

  it('should correctly record various MIME types', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.id = 'mime-test';
    input.multiple = true;
    document.body.appendChild(input);

    setInputFiles(input, [
      { name: 'image.png', size: 1024, type: 'image/png', lastModified: 1700000000000 },
      { name: 'styles.css', size: 256, type: 'text/css', lastModified: 1700000000000 },
      { name: 'data.json', size: 512, type: 'application/json', lastModified: 1700000000000 },
      { name: 'archive.zip', size: 8192, type: 'application/zip', lastModified: 1700000000000 },
    ]);

    eventListener.start();
    input.dispatchEvent(new Event('change', { bubbles: true }));

    expect(capturedActions).toHaveLength(1);

    if (isFileUploadAction(capturedActions[0]!)) {
      const files = capturedActions[0]!.files;
      expect(files).toHaveLength(4);
      expect(files[0]!.type).toBe('image/png');
      expect(files[1]!.type).toBe('text/css');
      expect(files[2]!.type).toBe('application/json');
      expect(files[3]!.type).toBe('application/zip');
    }

    document.body.removeChild(input);
  });

  // ── Select Events Still Work ────────────────────────────────────────────

  it('should still correctly record select dropdown changes (no regression)', () => {
    const select = document.createElement('select');
    select.id = 'country';
    select.name = 'country';

    const option1 = document.createElement('option');
    option1.value = '';
    option1.textContent = 'Choose...';

    const option2 = document.createElement('option');
    option2.value = 'us';
    option2.textContent = 'United States';

    select.appendChild(option1);
    select.appendChild(option2);
    document.body.appendChild(select);

    eventListener.start();

    select.value = 'us';
    select.dispatchEvent(new Event('change', { bubbles: true }));

    expect(capturedActions).toHaveLength(1);
    expect(capturedActions[0]!.type).toBe('select');

    document.body.removeChild(select);
  });
});

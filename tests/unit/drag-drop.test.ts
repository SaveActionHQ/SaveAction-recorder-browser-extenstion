/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  isDragDropAction,
  type DragDropAction,
  type Action,
  type ClickAction,
} from '@/types/actions';
import { validateAction } from '@/utils/validator';
import { EventListener } from '@/content/event-listener';

// ─────────────────────────────────────────────────────────────────────────────
// JSDOM Compatibility Setup
// ─────────────────────────────────────────────────────────────────────────────

// JSDOM does not implement DragEvent — polyfill it using MouseEvent as base.
// The EventListener handlers only access MouseEvent properties (target, clientX/Y),
// so this polyfill is sufficient for unit testing.
if (!global.DragEvent) {
  global.DragEvent = class DragEvent extends MouseEvent {
    readonly dataTransfer: DataTransfer | null = null;
    constructor(type: string, options?: DragEventInit & MouseEventInit) {
      super(type, options);
    }
  };
}

// JSDOM does not implement PointerEvent — polyfill it using MouseEvent as base.
// The EventListener handlers only access MouseEvent properties (target, clientX/Y, button),
// so this polyfill is sufficient for unit testing.
if (!global.PointerEvent) {
  // @ts-expect-error – Intentional polyfill; we only implement properties needed for testing
  global.PointerEvent = class PointerEvent extends MouseEvent {
    readonly pointerId: number;
    readonly pointerType: string;
    constructor(type: string, options?: PointerEventInit & MouseEventInit) {
      super(type, options);
      this.pointerId = (options as any)?.pointerId ?? 1;
      this.pointerType = (options as any)?.pointerType ?? 'mouse';
    }
  };
}

// JSDOM does not implement layout, so document.elementFromPoint returns null.
// We install a mock in beforeEach so it can be configured per-test.
function mockElementFromPoint(returnValue: Element | null = null): ReturnType<typeof vi.fn> {
  const mock = vi.fn().mockReturnValue(returnValue);
  Object.defineProperty(document, 'elementFromPoint', {
    value: mock,
    writable: true,
    configurable: true,
  });
  return mock;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function buildValidDragDropAction(overrides: Partial<DragDropAction> = {}): DragDropAction {
  return {
    id: 'act_001',
    type: 'drag-drop',
    timestamp: 1000,
    completedAt: 1000,
    url: 'http://example.com',
    sourceSelector: { priority: ['id'], id: 'drag-source' },
    targetSelector: { priority: ['id'], id: 'drop-target' },
    sourceCoordinates: { x: 100, y: 200 },
    targetCoordinates: { x: 500, y: 300 },
    dragType: 'native',
    sourceTagName: 'DIV',
    targetTagName: 'DIV',
    ...overrides,
  };
}

/**
 * Fire a drag event on an element with coordinates.
 * Uses DragEvent (polyfilled via MouseEvent in JSDOM) since EventListener listens for drag* events.
 */
function fireDragEvent(
  element: Element,
  type: 'dragstart' | 'dragend' | 'drop',
  coords = { x: 100, y: 50 }
): void {
  const event = new DragEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: coords.x,
    clientY: coords.y,
  });
  element.dispatchEvent(event);
}

/**
 * Fire a pointer event on an element with coordinates
 */
function firePointerEvent(
  element: Element,
  type: 'pointerdown' | 'pointermove' | 'pointerup',
  coords = { x: 100, y: 50 },
  options: Partial<PointerEventInit> = {}
): void {
  const event = new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: coords.x,
    clientY: coords.y,
    button: 0,
    buttons: type === 'pointerup' ? 0 : 1,
    ...options,
  });
  element.dispatchEvent(event);
}

// ─────────────────────────────────────────────────────────────────────────────
// Type Guard Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('isDragDropAction type guard', () => {
  it('should return true for drag-drop actions', () => {
    const action = buildValidDragDropAction();
    expect(isDragDropAction(action)).toBe(true);
  });

  it('should return false for click actions', () => {
    const action: ClickAction = {
      id: 'act_002',
      type: 'click',
      timestamp: 1000,
      completedAt: 1000,
      url: 'http://example.com',
      selector: { priority: ['id'], id: 'btn' },
      tagName: 'button',
      coordinates: { x: 100, y: 50 },
      coordinatesRelativeTo: 'element',
      button: 'left',
      clickCount: 1,
      modifiers: [],
    };
    expect(isDragDropAction(action as Action)).toBe(false);
  });

  it('should return false for other action types', () => {
    const types = ['click', 'input', 'navigation', 'scroll', 'tab', 'dialog', 'file-upload'];
    for (const type of types) {
      const fake = { ...buildValidDragDropAction(), type } as unknown as Action;
      expect(isDragDropAction(fake)).toBe(false);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// DragDropAction Type Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('DragDropAction type', () => {
  it('should support native drag type', () => {
    const action = buildValidDragDropAction({ dragType: 'native' });
    expect(action.type).toBe('drag-drop');
    expect(action.dragType).toBe('native');
  });

  it('should support pointer drag type', () => {
    const action = buildValidDragDropAction({ dragType: 'pointer' });
    expect(action.dragType).toBe('pointer');
  });

  it('should store source and target selectors', () => {
    const action = buildValidDragDropAction({
      sourceSelector: { priority: ['css'], css: '.card-item' },
      targetSelector: { priority: ['css'], css: '.drop-zone' },
    });
    expect(action.sourceSelector).toEqual({ priority: ['css'], css: '.card-item' });
    expect(action.targetSelector).toEqual({ priority: ['css'], css: '.drop-zone' });
  });

  it('should store source and target coordinates', () => {
    const action = buildValidDragDropAction({
      sourceCoordinates: { x: 50, y: 80 },
      targetCoordinates: { x: 600, y: 200 },
    });
    expect(action.sourceCoordinates).toEqual({ x: 50, y: 80 });
    expect(action.targetCoordinates).toEqual({ x: 600, y: 200 });
  });

  it('should store source and target tag names', () => {
    const action = buildValidDragDropAction({
      sourceTagName: 'LI',
      targetTagName: 'UL',
    });
    expect(action.sourceTagName).toBe('LI');
    expect(action.targetTagName).toBe('UL');
  });

  it('should include optional base action fields', () => {
    const action = buildValidDragDropAction({
      tabIndex: 0,
      frameUrl: 'https://example.com/frame',
    });
    expect(action.tabIndex).toBe(0);
    expect(action.frameUrl).toBe('https://example.com/frame');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Validator Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('Validator – drag-drop action', () => {
  it('should validate a valid native drag-drop action', () => {
    const action = buildValidDragDropAction({ dragType: 'native' });
    const result = validateAction(action);
    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should validate a valid pointer drag-drop action', () => {
    const action = buildValidDragDropAction({ dragType: 'pointer' });
    const result = validateAction(action);
    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should fail when sourceSelector is missing', () => {
    const action = buildValidDragDropAction();
    (action as any).sourceSelector = undefined;
    const result = validateAction(action);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        field: 'action.sourceSelector',
        message: 'Drag-drop action must have a sourceSelector',
      })
    );
  });

  it('should fail when targetSelector is missing', () => {
    const action = buildValidDragDropAction();
    (action as any).targetSelector = undefined;
    const result = validateAction(action);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        field: 'action.targetSelector',
        message: 'Drag-drop action must have a targetSelector',
      })
    );
  });

  it('should fail when dragType is invalid', () => {
    const action = buildValidDragDropAction();
    (action as any).dragType = 'mouse';
    const result = validateAction(action);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        field: 'action.dragType',
        message: 'Drag-drop action must have dragType of "native" or "pointer"',
      })
    );
  });

  it('should fail when dragType is missing', () => {
    const action = buildValidDragDropAction();
    (action as any).dragType = undefined;
    const result = validateAction(action);
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.field === 'action.dragType')).toBe(true);
  });

  it('should report errors for invalid sourceSelector', () => {
    const action = buildValidDragDropAction({
      // priority references 'id' but id is not defined
      sourceSelector: { priority: ['id'] } as any,
    });
    const result = validateAction(action);
    expect(result.isValid).toBe(false);
    // error field will be prefixed with 'action.source.'
    expect(result.errors.some((e) => e.field.startsWith('action.source.'))).toBe(true);
  });

  it('should report errors for invalid targetSelector', () => {
    const action = buildValidDragDropAction({
      // priority references 'css' but css is not defined
      targetSelector: { priority: ['css'] } as any,
    });
    const result = validateAction(action);
    expect(result.isValid).toBe(false);
    // error field will be prefixed with 'action.target.'
    expect(result.errors.some((e) => e.field.startsWith('action.target.'))).toBe(true);
  });

  it('should fail if action id is missing', () => {
    const action = buildValidDragDropAction();
    (action as any).id = '';
    const result = validateAction(action);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContainEqual(expect.objectContaining({ field: 'action.id' }));
  });

  it('should fail if url is missing', () => {
    const action = buildValidDragDropAction();
    (action as any).url = '';
    const result = validateAction(action);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContainEqual(expect.objectContaining({ field: 'action.url' }));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// EventListener Integration Tests — Native Drag Recording
// ─────────────────────────────────────────────────────────────────────────────

describe('EventListener – Native Drag Recording', () => {
  let eventListener: EventListener;
  let capturedActions: Action[];

  beforeEach(() => {
    window.scrollTo = vi.fn() as any;
    capturedActions = [];
    eventListener = new EventListener((action: Action) => {
      capturedActions.push(action);
    });
    eventListener.setRecordingStartTime(Date.now() - 5000);
  });

  afterEach(() => {
    eventListener.destroy();
    capturedActions = [];
    vi.restoreAllMocks();
  });

  it('should record a native drag-drop action on dragstart + drop', () => {
    const source = document.createElement('div');
    source.id = 'drag-card';
    const target = document.createElement('div');
    target.id = 'drop-zone';
    document.body.appendChild(source);
    document.body.appendChild(target);

    eventListener.start();

    fireDragEvent(source, 'dragstart', { x: 100, y: 80 });
    fireDragEvent(target, 'drop', { x: 400, y: 200 });

    expect(capturedActions.some((a) => a.type === 'drag-drop')).toBe(true);
    const action = capturedActions.find((a) => a.type === 'drag-drop') as DragDropAction;
    expect(action.dragType).toBe('native');
    expect(action.sourceCoordinates).toEqual({ x: 100, y: 80 });
    expect(action.targetCoordinates).toEqual({ x: 400, y: 200 });
    expect(action.sourceTagName).toBe('DIV');
    expect(action.targetTagName).toBe('DIV');
    expect(action.url).toBe(window.location.href);
    expect(action.id).toMatch(/^act_/);

    document.body.removeChild(source);
    document.body.removeChild(target);
  });

  it('should not emit an action on dragend alone (no drop)', () => {
    const source = document.createElement('div');
    source.id = 'drag-source-no-drop';
    document.body.appendChild(source);

    eventListener.start();

    fireDragEvent(source, 'dragstart', { x: 50, y: 50 });
    fireDragEvent(source, 'dragend', { x: 300, y: 300 });

    const dragActions = capturedActions.filter((a) => a.type === 'drag-drop');
    expect(dragActions).toHaveLength(0);

    document.body.removeChild(source);
  });

  it('should not record when listener is not started', () => {
    const source = document.createElement('div');
    source.id = 'inactive-source';
    const target = document.createElement('div');
    target.id = 'inactive-target';
    document.body.appendChild(source);
    document.body.appendChild(target);

    // Do NOT call start()
    fireDragEvent(source, 'dragstart', { x: 50, y: 50 });
    fireDragEvent(target, 'drop', { x: 200, y: 100 });

    expect(capturedActions.filter((a) => a.type === 'drag-drop')).toHaveLength(0);

    document.body.removeChild(source);
    document.body.removeChild(target);
  });

  it('should skip native drag from extension UI source element', () => {
    const source = document.createElement('div');
    source.id = 'saveaction-overlay';
    const target = document.createElement('div');
    target.id = 'page-target';
    document.body.appendChild(source);
    document.body.appendChild(target);

    eventListener.start();

    fireDragEvent(source, 'dragstart', { x: 10, y: 10 });
    fireDragEvent(target, 'drop', { x: 200, y: 200 });

    expect(capturedActions.filter((a) => a.type === 'drag-drop')).toHaveLength(0);

    document.body.removeChild(source);
    document.body.removeChild(target);
  });

  it('should skip native drop on extension UI target element', () => {
    const source = document.createElement('div');
    source.id = 'page-source';
    const target = document.createElement('div');
    target.id = 'saveaction-indicator';
    document.body.appendChild(source);
    document.body.appendChild(target);

    eventListener.start();

    fireDragEvent(source, 'dragstart', { x: 50, y: 50 });
    fireDragEvent(target, 'drop', { x: 300, y: 300 });

    expect(capturedActions.filter((a) => a.type === 'drag-drop')).toHaveLength(0);

    document.body.removeChild(source);
    document.body.removeChild(target);
  });

  it('should not emit a second drag-drop action after dragend clears state', () => {
    const source = document.createElement('div');
    source.id = 'card-src';
    const target = document.createElement('div');
    target.id = 'card-tgt';
    document.body.appendChild(source);
    document.body.appendChild(target);

    eventListener.start();

    // First drag: completes via drop
    fireDragEvent(source, 'dragstart', { x: 10, y: 10 });
    fireDragEvent(target, 'drop', { x: 200, y: 200 });

    const countAfterFirst = capturedActions.filter((a) => a.type === 'drag-drop').length;

    // dragend fires after drop — should NOT produce a second action
    fireDragEvent(source, 'dragend', { x: 200, y: 200 });

    expect(capturedActions.filter((a) => a.type === 'drag-drop')).toHaveLength(countAfterFirst);

    document.body.removeChild(source);
    document.body.removeChild(target);
  });

  it('should assign sequential action IDs across drag actions', () => {
    const source = document.createElement('div');
    source.setAttribute('data-testid', 'src-1');
    const target1 = document.createElement('div');
    target1.setAttribute('data-testid', 'tgt-1');
    const source2 = document.createElement('div');
    source2.setAttribute('data-testid', 'src-2');
    const target2 = document.createElement('div');
    target2.setAttribute('data-testid', 'tgt-2');
    document.body.appendChild(source);
    document.body.appendChild(target1);
    document.body.appendChild(source2);
    document.body.appendChild(target2);

    eventListener.start();

    fireDragEvent(source, 'dragstart', { x: 10, y: 10 });
    fireDragEvent(target1, 'drop', { x: 100, y: 100 });
    fireDragEvent(source2, 'dragstart', { x: 200, y: 200 });
    fireDragEvent(target2, 'drop', { x: 300, y: 300 });

    const dragActions = capturedActions.filter((a) => a.type === 'drag-drop') as DragDropAction[];
    expect(dragActions).toHaveLength(2);
    // Both should have sequential IDs
    expect(dragActions[0]!.id).not.toBe(dragActions[1]!.id);

    [source, target1, source2, target2].forEach((el) => document.body.removeChild(el));
  });

  it('should stop recording native drag after stop() is called', () => {
    const source = document.createElement('div');
    source.id = 'stop-src';
    const target = document.createElement('div');
    target.id = 'stop-tgt';
    document.body.appendChild(source);
    document.body.appendChild(target);

    eventListener.start();
    eventListener.stop();

    fireDragEvent(source, 'dragstart', { x: 10, y: 10 });
    fireDragEvent(target, 'drop', { x: 200, y: 100 });

    expect(capturedActions.filter((a) => a.type === 'drag-drop')).toHaveLength(0);

    document.body.removeChild(source);
    document.body.removeChild(target);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// EventListener Integration Tests — Pointer-Based Drag Recording
// ─────────────────────────────────────────────────────────────────────────────

describe('EventListener – Pointer Drag Recording', () => {
  let eventListener: EventListener;
  let capturedActions: Action[];

  beforeEach(() => {
    window.scrollTo = vi.fn() as any;
    capturedActions = [];
    eventListener = new EventListener((action: Action) => {
      capturedActions.push(action);
    });
    eventListener.setRecordingStartTime(Date.now() - 5000);
  });

  afterEach(() => {
    eventListener.destroy();
    capturedActions = [];
    vi.restoreAllMocks();
  });

  it('should record pointer drag that exceeds movement threshold', () => {
    const source = document.createElement('div');
    source.id = 'pointer-src';
    const target = document.createElement('div');
    target.id = 'pointer-tgt';
    document.body.appendChild(source);
    document.body.appendChild(target);

    // Mock elementFromPoint to return our target element
    mockElementFromPoint(target);

    eventListener.start();

    // pointerdown at (100, 50)
    firePointerEvent(source, 'pointerdown', { x: 100, y: 50 });
    // pointermove with 20px horizontal movement (exceeds 10px threshold)
    firePointerEvent(source, 'pointermove', { x: 120, y: 50 });
    // pointerup at new position
    firePointerEvent(source, 'pointerup', { x: 120, y: 50 });

    const dragActions = capturedActions.filter((a) => a.type === 'drag-drop') as DragDropAction[];
    expect(dragActions).toHaveLength(1);

    const action = dragActions[0]!;
    expect(action.dragType).toBe('pointer');
    expect(action.sourceCoordinates).toEqual({ x: 100, y: 50 });
    expect(action.targetCoordinates).toEqual({ x: 120, y: 50 });
    expect(action.sourceTagName).toBe('DIV');
    expect(action.targetTagName).toBe('DIV');
    expect(action.url).toBe(window.location.href);

    document.body.removeChild(source);
    document.body.removeChild(target);
  });

  it('should not record pointer drag below movement threshold (a click)', () => {
    const source = document.createElement('div');
    source.id = 'click-not-drag';
    document.body.appendChild(source);

    eventListener.start();

    // pointerdown at (100, 50)
    firePointerEvent(source, 'pointerdown', { x: 100, y: 50 });
    // Small movement — 5px, below the 10px threshold
    firePointerEvent(source, 'pointermove', { x: 105, y: 50 });
    // pointerup
    firePointerEvent(source, 'pointerup', { x: 105, y: 50 });

    expect(capturedActions.filter((a) => a.type === 'drag-drop')).toHaveLength(0);

    document.body.removeChild(source);
  });

  it('should not record when no pointermove before pointerup', () => {
    const source = document.createElement('div');
    source.id = 'no-move-src';
    document.body.appendChild(source);

    eventListener.start();

    firePointerEvent(source, 'pointerdown', { x: 100, y: 50 });
    // No pointermove
    firePointerEvent(source, 'pointerup', { x: 100, y: 50 });

    expect(capturedActions.filter((a) => a.type === 'drag-drop')).toHaveLength(0);

    document.body.removeChild(source);
  });

  it('should not record when pointerup target is the source element itself', () => {
    const source = document.createElement('div');
    source.id = 'same-src-tgt';
    document.body.appendChild(source);

    // elementFromPoint returns the same source element (drop on self)
    mockElementFromPoint(source);

    eventListener.start();

    firePointerEvent(source, 'pointerdown', { x: 100, y: 50 });
    firePointerEvent(source, 'pointermove', { x: 120, y: 50 });
    firePointerEvent(source, 'pointerup', { x: 120, y: 50 });

    expect(capturedActions.filter((a) => a.type === 'drag-drop')).toHaveLength(0);

    document.body.removeChild(source);
  });

  it('should not record when no element found at drop point', () => {
    const source = document.createElement('div');
    source.id = 'null-tgt';
    document.body.appendChild(source);

    // elementFromPoint returns null (no element at position)
    mockElementFromPoint(null);

    eventListener.start();

    firePointerEvent(source, 'pointerdown', { x: 100, y: 50 });
    firePointerEvent(source, 'pointermove', { x: 200, y: 50 });
    firePointerEvent(source, 'pointerup', { x: 200, y: 50 });

    expect(capturedActions.filter((a) => a.type === 'drag-drop')).toHaveLength(0);

    document.body.removeChild(source);
  });

  it('should not record when extension UI source element is dragged', () => {
    const source = document.createElement('div');
    source.id = 'saveaction-btn';
    const target = document.createElement('div');
    target.id = 'real-target';
    document.body.appendChild(source);
    document.body.appendChild(target);

    mockElementFromPoint(target);

    eventListener.start();

    firePointerEvent(source, 'pointerdown', { x: 10, y: 10 });
    firePointerEvent(source, 'pointermove', { x: 50, y: 50 });
    firePointerEvent(source, 'pointerup', { x: 50, y: 50 });

    expect(capturedActions.filter((a) => a.type === 'drag-drop')).toHaveLength(0);

    document.body.removeChild(source);
    document.body.removeChild(target);
  });

  it('should not record when extension UI element is the drop target', () => {
    const source = document.createElement('div');
    source.id = 'real-source';
    const target = document.createElement('div');
    target.id = 'saveaction-indicator';
    document.body.appendChild(source);
    document.body.appendChild(target);

    mockElementFromPoint(target);

    eventListener.start();

    firePointerEvent(source, 'pointerdown', { x: 100, y: 100 });
    firePointerEvent(source, 'pointermove', { x: 200, y: 100 });
    firePointerEvent(source, 'pointerup', { x: 200, y: 100 });

    expect(capturedActions.filter((a) => a.type === 'drag-drop')).toHaveLength(0);

    document.body.removeChild(source);
    document.body.removeChild(target);
  });

  it('should skip pointer handling when native drag is in progress', () => {
    const source = document.createElement('div');
    source.id = 'native-active-src';
    const target = document.createElement('div');
    target.id = 'native-active-tgt';
    document.body.appendChild(source);
    document.body.appendChild(target);

    mockElementFromPoint(target);

    eventListener.start();

    // Start a native drag
    fireDragEvent(source, 'dragstart', { x: 10, y: 10 });

    // While native drag is active, pointer events should be ignored
    firePointerEvent(source, 'pointerdown', { x: 10, y: 10 });
    firePointerEvent(source, 'pointermove', { x: 100, y: 100 });
    firePointerEvent(source, 'pointerup', { x: 100, y: 100 });

    // The native drag should complete via drop
    fireDragEvent(target, 'drop', { x: 300, y: 100 });

    const dragActions = capturedActions.filter((a) => a.type === 'drag-drop') as DragDropAction[];
    // Only one action — from the native drag, not the pointer events
    expect(dragActions).toHaveLength(1);
    expect(dragActions[0]!.dragType).toBe('native');

    document.body.removeChild(source);
    document.body.removeChild(target);
  });

  it('should not record when listener is not started', () => {
    const source = document.createElement('div');
    source.id = 'inactive-ptr-src';
    const target = document.createElement('div');
    target.id = 'inactive-ptr-tgt';
    document.body.appendChild(source);
    document.body.appendChild(target);

    mockElementFromPoint(target);

    // Do NOT call start()
    firePointerEvent(source, 'pointerdown', { x: 50, y: 50 });
    firePointerEvent(source, 'pointermove', { x: 150, y: 50 });
    firePointerEvent(source, 'pointerup', { x: 150, y: 50 });

    expect(capturedActions.filter((a) => a.type === 'drag-drop')).toHaveLength(0);

    document.body.removeChild(source);
    document.body.removeChild(target);
  });

  it('should not record pointer drag from non-primary button', () => {
    const source = document.createElement('div');
    source.id = 'right-btn-drag';
    const target = document.createElement('div');
    target.id = 'right-btn-tgt';
    document.body.appendChild(source);
    document.body.appendChild(target);

    mockElementFromPoint(target);

    eventListener.start();

    // Right mouse button (button=2)
    firePointerEvent(source, 'pointerdown', { x: 100, y: 50 }, { button: 2 });
    firePointerEvent(source, 'pointermove', { x: 200, y: 50 });
    firePointerEvent(source, 'pointerup', { x: 200, y: 50 });

    expect(capturedActions.filter((a) => a.type === 'drag-drop')).toHaveLength(0);

    document.body.removeChild(source);
    document.body.removeChild(target);
  });

  it('should stop recording pointer drag after stop() is called', () => {
    const source = document.createElement('div');
    source.id = 'stop-ptr-src';
    const target = document.createElement('div');
    target.id = 'stop-ptr-tgt';
    document.body.appendChild(source);
    document.body.appendChild(target);

    mockElementFromPoint(target);

    eventListener.start();
    eventListener.stop();

    firePointerEvent(source, 'pointerdown', { x: 50, y: 50 });
    firePointerEvent(source, 'pointermove', { x: 200, y: 50 });
    firePointerEvent(source, 'pointerup', { x: 200, y: 50 });

    expect(capturedActions.filter((a) => a.type === 'drag-drop')).toHaveLength(0);

    document.body.removeChild(source);
    document.body.removeChild(target);
  });

  it('should use diagonal movement to calculate threshold distance', () => {
    const source = document.createElement('div');
    source.id = 'diagonal-drag';
    const target = document.createElement('div');
    target.id = 'diagonal-target';
    document.body.appendChild(source);
    document.body.appendChild(target);

    mockElementFromPoint(target);

    eventListener.start();

    // Diagonal movement: dx=7, dy=7 → distance = √(49+49) ≈ 9.9px < 10px threshold
    firePointerEvent(source, 'pointerdown', { x: 100, y: 100 });
    firePointerEvent(source, 'pointermove', { x: 107, y: 107 });
    firePointerEvent(source, 'pointerup', { x: 107, y: 107 });

    // Just below threshold — should not record
    expect(capturedActions.filter((a) => a.type === 'drag-drop')).toHaveLength(0);

    document.body.removeChild(source);
    document.body.removeChild(target);
  });

  it('should use diagonal movement that exceeds threshold', () => {
    const source = document.createElement('div');
    source.id = 'diagonal-drag-2';
    const target = document.createElement('div');
    target.id = 'diagonal-target-2';
    document.body.appendChild(source);
    document.body.appendChild(target);

    mockElementFromPoint(target);

    eventListener.start();

    // Diagonal movement: dx=8, dy=8 → distance = √(64+64) ≈ 11.3px > 10px threshold
    firePointerEvent(source, 'pointerdown', { x: 100, y: 100 });
    firePointerEvent(source, 'pointermove', { x: 108, y: 108 });
    firePointerEvent(source, 'pointerup', { x: 108, y: 108 });

    const dragActions = capturedActions.filter((a) => a.type === 'drag-drop');
    expect(dragActions).toHaveLength(1);

    document.body.removeChild(source);
    document.body.removeChild(target);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// EventListener – calculateCompletedAt for drag-drop
// ─────────────────────────────────────────────────────────────────────────────

describe('EventListener – completedAt for drag-drop action', () => {
  it('should set completedAt equal to timestamp for drag-drop', () => {
    const source = document.createElement('div');
    source.id = 'completed-at-src';
    const target = document.createElement('div');
    target.id = 'completed-at-tgt';
    document.body.appendChild(source);
    document.body.appendChild(target);

    let capturedAction: Action | null = null;
    const listener = new EventListener((action: Action) => {
      if (action.type === 'drag-drop') capturedAction = action;
    });
    listener.setRecordingStartTime(Date.now() - 5000);
    listener.start();

    fireDragEvent(source, 'dragstart', { x: 50, y: 50 });
    fireDragEvent(target, 'drop', { x: 200, y: 200 });

    listener.destroy();

    expect(capturedAction).not.toBeNull();
    const action = capturedAction as unknown as DragDropAction;
    // completedAt should be >= timestamp (never negative)
    expect(action.completedAt).toBeGreaterThanOrEqual(action.timestamp);

    document.body.removeChild(source);
    document.body.removeChild(target);
  });
});

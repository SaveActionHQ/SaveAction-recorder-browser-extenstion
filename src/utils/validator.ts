import type {
  Recording,
  Action,
  SelectorStrategy,
  ClickAction,
  InputAction,
  NavigationAction,
  DialogAction,
  DragDropAction,
  FileUploadAction,
  TabAction,
} from '@/types';

/**
 * Validation error
 */
export interface ValidationError {
  field: string;
  message: string;
}

/**
 * Validation result
 */
export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
}

const SELECTOR_STRING_FIELDS = [
  'id',
  'dataTestId',
  'ariaLabel',
  'name',
  'css',
  'xpath',
  'xpathAbsolute',
  'text',
  'textContains',
] as const;

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function hasSelectorValue(selector: SelectorStrategy, key: keyof SelectorStrategy): boolean {
  if (key === 'position') {
    return !!selector.position;
  }

  const selectorValue = selector[key];
  return Boolean(selectorValue);
}

/**
 * Validate a selector strategy
 */
export function validateSelector(selector: SelectorStrategy): ValidationResult {
  const errors: ValidationError[] = [];

  for (const key of SELECTOR_STRING_FIELDS) {
    const selectorValue = selector[key];
    if (selectorValue !== undefined && !isString(selectorValue)) {
      errors.push({
        field: `selector.${key}`,
        message: `${key} must be a string`,
      });
    }
  }

  if (selector.position) {
    if (!isString(selector.position.parent)) {
      errors.push({
        field: 'selector.position.parent',
        message: 'Position parent must be a string',
      });
    }

    if (typeof selector.position.index !== 'number' || selector.position.index < 0) {
      errors.push({
        field: 'selector.position.index',
        message: 'Position index must be a non-negative number',
      });
    }
  }

  if (selector.fallback) {
    if (selector.fallback.parentId !== undefined && !isString(selector.fallback.parentId)) {
      errors.push({
        field: 'selector.fallback.parentId',
        message: 'Fallback parentId must be a string',
      });
    }

    if (selector.fallback.uniqueParent !== undefined && !isString(selector.fallback.uniqueParent)) {
      errors.push({
        field: 'selector.fallback.uniqueParent',
        message: 'Fallback uniqueParent must be a string',
      });
    }

    if (selector.fallback.textContent !== undefined && !isString(selector.fallback.textContent)) {
      errors.push({
        field: 'selector.fallback.textContent',
        message: 'Fallback textContent must be a string',
      });
    }
  }

  // Check priority array
  if (!Array.isArray(selector.priority) || selector.priority.length === 0) {
    errors.push({
      field: 'selector.priority',
      message: 'Priority array cannot be empty',
    });
  }

  // Check that priority references actual selectors
  if (Array.isArray(selector.priority)) {
    for (const key of selector.priority) {
      if (!hasSelectorValue(selector, key as keyof SelectorStrategy)) {
        errors.push({
          field: `selector.${key}`,
          message: `Priority references "${key}" but selector is not defined`,
        });
      }
    }
  }

  // Check that at least one selector is provided
  const hasAnySelector =
    SELECTOR_STRING_FIELDS.some((key) => isNonEmptyString(selector[key])) || !!selector.position;

  if (!hasAnySelector) {
    errors.push({
      field: 'selector',
      message: 'At least one selector must be provided',
    });
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Validate an action
 */
export function validateAction(action: Action): ValidationResult {
  const errors: ValidationError[] = [];

  // Base action validation
  if (!isNonEmptyString(action.id)) {
    errors.push({
      field: 'action.id',
      message: 'Action ID is required',
    });
  }

  if (!isNonEmptyString(action.type)) {
    errors.push({
      field: 'action.type',
      message: 'Action type is required',
    });
  }

  if (typeof action.timestamp !== 'number' || action.timestamp < 0) {
    errors.push({
      field: 'action.timestamp',
      message: 'Timestamp must be a positive number',
    });
  }

  if (action.type !== 'tab' && !isNonEmptyString(action.url)) {
    errors.push({
      field: 'action.url',
      message: 'Action URL is required',
    });
  }

  // Type-specific validation
  switch (action.type) {
    case 'click': {
      const clickAction = action as ClickAction;
      if (!clickAction.selector) {
        errors.push({
          field: 'action.selector',
          message: 'Click action must have a selector',
        });
      } else {
        const selectorResult = validateSelector(clickAction.selector);
        errors.push(...selectorResult.errors);
      }

      if (!isNonEmptyString(clickAction.tagName)) {
        errors.push({
          field: 'action.tagName',
          message: 'Click action must have a tagName',
        });
      }

      if (!clickAction.coordinates) {
        errors.push({
          field: 'action.coordinates',
          message: 'Click action must have coordinates',
        });
      }
      break;
    }

    case 'input': {
      const inputAction = action as InputAction;
      if (!inputAction.selector) {
        errors.push({
          field: 'action.selector',
          message: 'Input action must have a selector',
        });
      } else {
        const selectorResult = validateSelector(inputAction.selector);
        errors.push(...selectorResult.errors);
      }

      if (!isString(inputAction.value)) {
        errors.push({
          field: 'action.value',
          message: 'Input action must have a value',
        });
      }

      if (!isNonEmptyString(inputAction.inputType)) {
        errors.push({
          field: 'action.inputType',
          message: 'Input action must have an inputType',
        });
      }
      break;
    }

    case 'navigation': {
      const navAction = action as NavigationAction;
      if (!isNonEmptyString(navAction.from)) {
        errors.push({
          field: 'action.from',
          message: 'Navigation action must have a "from" URL',
        });
      }

      if (!isNonEmptyString(navAction.to)) {
        errors.push({
          field: 'action.to',
          message: 'Navigation action must have a "to" URL',
        });
      }
      break;
    }

    case 'drag-drop': {
      const dragDropAction = action as DragDropAction;
      if (!dragDropAction.sourceSelector) {
        errors.push({
          field: 'action.sourceSelector',
          message: 'Drag-drop action must have a sourceSelector',
        });
      } else {
        const selectorResult = validateSelector(dragDropAction.sourceSelector);
        errors.push(
          ...selectorResult.errors.map((e) => ({ ...e, field: `action.source.${e.field}` }))
        );
      }
      if (!dragDropAction.targetSelector) {
        errors.push({
          field: 'action.targetSelector',
          message: 'Drag-drop action must have a targetSelector',
        });
      } else {
        const selectorResult = validateSelector(dragDropAction.targetSelector);
        errors.push(
          ...selectorResult.errors.map((e) => ({ ...e, field: `action.target.${e.field}` }))
        );
      }
      if (dragDropAction.dragType !== 'native' && dragDropAction.dragType !== 'pointer') {
        errors.push({
          field: 'action.dragType',
          message: 'Drag-drop action must have dragType of "native" or "pointer"',
        });
      }
      break;
    }

    case 'dialog': {
      const dialogAction = action as DialogAction;
      if (!isNonEmptyString(dialogAction.dialogType)) {
        errors.push({
          field: 'action.dialogType',
          message: 'Dialog action must have a dialogType',
        });
      }
      if (dialogAction.response !== 'accept' && dialogAction.response !== 'dismiss') {
        errors.push({
          field: 'action.response',
          message: 'Dialog action response must be "accept" or "dismiss"',
        });
      }
      break;
    }

    case 'file-upload': {
      const fileUploadAction = action as FileUploadAction;
      if (!fileUploadAction.selector) {
        errors.push({
          field: 'action.selector',
          message: 'File upload action must have a selector',
        });
      } else {
        const selectorResult = validateSelector(fileUploadAction.selector);
        errors.push(...selectorResult.errors);
      }

      if (
        !fileUploadAction.files ||
        !Array.isArray(fileUploadAction.files) ||
        fileUploadAction.files.length === 0
      ) {
        errors.push({
          field: 'action.files',
          message: 'File upload action must have at least one file',
        });
      } else {
        for (let i = 0; i < fileUploadAction.files.length; i++) {
          const file = fileUploadAction.files[i];
          if (!file) continue;
          if (!file.name || typeof file.name !== 'string') {
            errors.push({
              field: `action.files[${i}].name`,
              message: `File at index ${i} must have a name`,
            });
          }
          if (typeof file.size !== 'number' || file.size < 0) {
            errors.push({
              field: `action.files[${i}].size`,
              message: `File at index ${i} must have a valid size`,
            });
          }
          if (!file.type || typeof file.type !== 'string') {
            errors.push({
              field: `action.files[${i}].type`,
              message: `File at index ${i} must have a MIME type`,
            });
          }
        }
      }

      if (typeof fileUploadAction.multiple !== 'boolean') {
        errors.push({
          field: 'action.multiple',
          message: 'File upload action must specify whether input accepts multiple files',
        });
      }
      break;
    }

    case 'tab': {
      const tabAction = action as TabAction;
      const validOperations = ['open', 'switch', 'close'];
      if (
        !isNonEmptyString(tabAction.tabOperation) ||
        !validOperations.includes(tabAction.tabOperation)
      ) {
        errors.push({
          field: 'action.tabOperation',
          message: 'Tab action must have a valid tabOperation (open, switch, close)',
        });
      }
      if (typeof tabAction.tabIndex !== 'number' || tabAction.tabIndex < 0) {
        errors.push({
          field: 'action.tabIndex',
          message: 'Tab action must have a non-negative tabIndex',
        });
      }
      if (tabAction.tabOperation === 'open') {
        if (typeof tabAction.newTabIndex !== 'number' || tabAction.newTabIndex < 1) {
          errors.push({
            field: 'action.newTabIndex',
            message: 'Tab open action must have a newTabIndex >= 1',
          });
        }
      }
      if (tabAction.tabOperation === 'switch') {
        if (typeof tabAction.newTabIndex !== 'number' || tabAction.newTabIndex < 0) {
          errors.push({
            field: 'action.newTabIndex',
            message: 'Tab switch action must have a newTabIndex',
          });
        }
      }
      break;
    }

    // Add more type-specific validation as needed
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Validate a recording
 */
export function validateRecording(recording: Recording): ValidationResult {
  const errors: ValidationError[] = [];

  // Required fields
  if (!isNonEmptyString(recording.id)) {
    errors.push({
      field: 'recording.id',
      message: 'Recording ID is required',
    });
  }

  if (!isNonEmptyString(recording.version)) {
    errors.push({
      field: 'recording.version',
      message: 'Schema version is required',
    });
  }

  if (!isNonEmptyString(recording.testName)) {
    errors.push({
      field: 'recording.testName',
      message: 'Test name cannot be empty',
    });
  }

  // URL validation
  if (!isNonEmptyString(recording.url)) {
    errors.push({
      field: 'recording.url',
      message: 'Recording URL is required',
    });
  } else {
    try {
      new URL(recording.url);
    } catch {
      errors.push({
        field: 'recording.url',
        message: 'Invalid URL format',
      });
    }
  }

  // Timestamp validation
  if (!isNonEmptyString(recording.startTime)) {
    errors.push({
      field: 'recording.startTime',
      message: 'Start time is required',
    });
  } else {
    const startDate = new Date(recording.startTime);
    if (isNaN(startDate.getTime())) {
      errors.push({
        field: 'recording.startTime',
        message: 'Start time must be valid ISO 8601 format',
      });
    }
  }

  if (recording.endTime !== undefined && recording.endTime !== null) {
    if (!isNonEmptyString(recording.endTime)) {
      errors.push({
        field: 'recording.endTime',
        message: 'End time must be valid ISO 8601 format',
      });
    } else {
      const endDate = new Date(recording.endTime);
      if (isNaN(endDate.getTime())) {
        errors.push({
          field: 'recording.endTime',
          message: 'End time must be valid ISO 8601 format',
        });
      }
    }
  }

  // Viewport validation
  if (!recording.viewport) {
    errors.push({
      field: 'recording.viewport',
      message: 'Viewport is required',
    });
  } else if (
    typeof recording.viewport.width !== 'number' ||
    typeof recording.viewport.height !== 'number' ||
    recording.viewport.width <= 0 ||
    recording.viewport.height <= 0
  ) {
    errors.push({
      field: 'recording.viewport',
      message: 'Viewport width and height must be positive numbers',
    });
  }

  // WindowSize validation (optional but validated if present)
  if (recording.windowSize) {
    if (
      typeof recording.windowSize.width !== 'number' ||
      typeof recording.windowSize.height !== 'number' ||
      recording.windowSize.width <= 0 ||
      recording.windowSize.height <= 0
    ) {
      errors.push({
        field: 'recording.windowSize',
        message: 'WindowSize width and height must be positive numbers',
      });
    }
  }

  // ScreenSize validation (optional but validated if present)
  if (recording.screenSize) {
    if (
      typeof recording.screenSize.width !== 'number' ||
      typeof recording.screenSize.height !== 'number' ||
      recording.screenSize.width <= 0 ||
      recording.screenSize.height <= 0
    ) {
      errors.push({
        field: 'recording.screenSize',
        message: 'ScreenSize width and height must be positive numbers',
      });
    }
  }

  // DevicePixelRatio validation (optional but validated if present)
  if (recording.devicePixelRatio !== undefined) {
    if (typeof recording.devicePixelRatio !== 'number' || recording.devicePixelRatio <= 0) {
      errors.push({
        field: 'recording.devicePixelRatio',
        message: 'DevicePixelRatio must be a positive number',
      });
    }
  }

  // User agent
  if (!isNonEmptyString(recording.userAgent)) {
    errors.push({
      field: 'recording.userAgent',
      message: 'User agent is required',
    });
  }

  // Actions array
  if (!Array.isArray(recording.actions)) {
    errors.push({
      field: 'recording.actions',
      message: 'Actions array is required',
    });
  } else {
    // Validate each action
    recording.actions.forEach((action, index) => {
      const actionResult = validateAction(action);
      if (!actionResult.isValid) {
        actionResult.errors.forEach((error) => {
          errors.push({
            field: `actions[${index}].${error.field}`,
            message: error.message,
          });
        });
      }
    });
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

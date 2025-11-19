import type {
  Recording,
  Action,
  SelectorStrategy,
  ClickAction,
  InputAction,
  NavigationAction,
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

/**
 * Validate a selector strategy
 */
export function validateSelector(
  selector: SelectorStrategy
): ValidationResult {
  const errors: ValidationError[] = [];

  // Check priority array
  if (!selector.priority || selector.priority.length === 0) {
    errors.push({
      field: 'selector.priority',
      message: 'Priority array cannot be empty',
    });
  }

  // Check that priority references actual selectors
  if (selector.priority) {
    for (const key of selector.priority) {
      const selectorValue = selector[key as keyof SelectorStrategy];
      if (
        !selectorValue ||
        (typeof selectorValue === 'object' &&
          !Array.isArray(selectorValue))
      ) {
        errors.push({
          field: `selector.${key}`,
          message: `Priority references "${key}" but selector is not defined`,
        });
      }
    }
  }

  // Check that at least one selector is provided
  const hasAnySelector = Object.keys(selector).some(
    (key) => key !== 'priority' && selector[key as keyof SelectorStrategy]
  );

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
  if (!action.id) {
    errors.push({
      field: 'action.id',
      message: 'Action ID is required',
    });
  }

  if (!action.type) {
    errors.push({
      field: 'action.type',
      message: 'Action type is required',
    });
  }

  if (
    typeof action.timestamp !== 'number' ||
    action.timestamp < 0
  ) {
    errors.push({
      field: 'action.timestamp',
      message: 'Timestamp must be a positive number',
    });
  }

  if (!action.url) {
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

      if (!clickAction.tagName) {
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

      if (inputAction.value === undefined || inputAction.value === null) {
        errors.push({
          field: 'action.value',
          message: 'Input action must have a value',
        });
      }

      if (!inputAction.inputType) {
        errors.push({
          field: 'action.inputType',
          message: 'Input action must have an inputType',
        });
      }
      break;
    }

    case 'navigation': {
      const navAction = action as NavigationAction;
      if (!navAction.from) {
        errors.push({
          field: 'action.from',
          message: 'Navigation action must have a "from" URL',
        });
      }

      if (!navAction.to) {
        errors.push({
          field: 'action.to',
          message: 'Navigation action must have a "to" URL',
        });
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
  if (!recording.id) {
    errors.push({
      field: 'recording.id',
      message: 'Recording ID is required',
    });
  }

  if (!recording.version) {
    errors.push({
      field: 'recording.version',
      message: 'Schema version is required',
    });
  }

  if (!recording.testName || recording.testName.trim() === '') {
    errors.push({
      field: 'recording.testName',
      message: 'Test name cannot be empty',
    });
  }

  // URL validation
  if (!recording.url) {
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
  if (!recording.startTime) {
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

  if (recording.endTime) {
    const endDate = new Date(recording.endTime);
    if (isNaN(endDate.getTime())) {
      errors.push({
        field: 'recording.endTime',
        message: 'End time must be valid ISO 8601 format',
      });
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

  // User agent
  if (!recording.userAgent) {
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

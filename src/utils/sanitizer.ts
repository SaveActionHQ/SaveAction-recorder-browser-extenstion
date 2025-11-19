import type { Action, InputAction, Recording } from '@/types';

/**
 * Mask a password with bullets
 */
export function maskPassword(value: string): string {
  return '•'.repeat(value.length);
}

/**
 * Mask credit card number, showing last 4 digits
 */
export function maskCreditCard(value: string): string {
  if (value.length <= 4) {
    return value;
  }

  // Preserve formatting (spaces, dashes)
  const last4 = value.slice(-4);
  const masked = value.slice(0, -4).replace(/\d/g, '*');
  return masked + last4;
}

/**
 * Partially mask email (show first 2 chars + domain)
 */
export function maskEmail(value: string): string {
  const atIndex = value.indexOf('@');
  if (atIndex <= 2) {
    return value; // Too short to mask meaningfully
  }

  const username = value.slice(0, atIndex);
  const domain = value.slice(atIndex);
  const visibleChars = username.slice(0, 2);
  const maskedChars = '•'.repeat(username.length - 2);

  return visibleChars + maskedChars + domain;
}

/**
 * Check if a field is sensitive based on type, name, or id
 */
export function isSensitiveField(
  type: string,
  inputType: string,
  name: string = '',
  id: string = ''
): boolean {
  // Password type is always sensitive
  if (type === 'password' || inputType === 'password') {
    return true;
  }

  const lowerName = name.toLowerCase();
  const lowerId = id.toLowerCase();
  const combined = `${lowerName} ${lowerId}`;

  // Password patterns
  const passwordPatterns = [
    'password',
    'passwd',
    'pwd',
    'pass',
    'passphrase',
  ];

  // Credit card patterns
  const cardPatterns = [
    'card',
    'cc-number',
    'cardnumber',
    'card_number',
    'creditcard',
    'credit-card',
  ];

  // CVV patterns
  const cvvPatterns = [
    'cvv',
    'cvc',
    'csc',
    'security-code',
    'security_code',
    'card-code',
  ];

  // SSN patterns
  const ssnPatterns = ['ssn', 'social-security', 'social_security'];

  // PIN patterns
  const pinPatterns = ['pin', 'pin-code', 'pincode'];

  // Check all patterns
  const allPatterns = [
    ...passwordPatterns,
    ...cardPatterns,
    ...cvvPatterns,
    ...ssnPatterns,
    ...pinPatterns,
  ];

  return allPatterns.some((pattern) => combined.includes(pattern));
}

/**
 * Sanitize a value based on field type and attributes
 */
export function sanitizeValue(
  value: string,
  type: string,
  name: string = '',
  id: string = ''
): string {
  // Check if field is sensitive
  if (!isSensitiveField(type, type, name, id)) {
    // Handle email type specially (partial masking)
    if (type === 'email' && value.includes('@')) {
      return maskEmail(value);
    }
    return value;
  }

  const lowerName = name.toLowerCase();
  const lowerId = id.toLowerCase();
  const combined = `${lowerName} ${lowerId}`;

  // Credit card number (show last 4)
  if (
    combined.includes('card') ||
    combined.includes('cc-number') ||
    /^\d{13,19}$/.test(value.replace(/[\s-]/g, ''))
  ) {
    return maskCreditCard(value);
  }

  // All other sensitive fields - full mask
  return maskPassword(value);
}

/**
 * Sanitize a single action
 */
export function sanitizeAction(action: Action): Action {
  // Only sanitize input actions
  if (action.type !== 'input') {
    return action;
  }

  const inputAction = action as InputAction;

  // Skip if not sensitive
  if (!inputAction.isSensitive) {
    return action;
  }

  // Get selector info for field detection
  const name = inputAction.selector.name || '';
  const id = inputAction.selector.id || '';

  // Sanitize the value
  const sanitizedValue = sanitizeValue(
    inputAction.value,
    inputAction.inputType,
    name,
    id
  );

  return {
    ...inputAction,
    value: sanitizedValue,
  };
}

/**
 * Sanitize all actions in a recording
 */
export function sanitizeRecording(recording: Recording): Recording {
  return {
    ...recording,
    actions: recording.actions.map((action) => sanitizeAction(action)),
  };
}

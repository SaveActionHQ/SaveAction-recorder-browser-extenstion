import type { Recording } from '@/types/recording';

interface BaseValLike {
  baseVal?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function getNormalizedStringValue(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value;
  }

  const baseVal =
    isRecord(value) && 'baseVal' in value ? (value as BaseValLike).baseVal : undefined;

  if (typeof baseVal === 'string') {
    return baseVal;
  }

  return undefined;
}

export function getNormalizedLowerStringValue(value: unknown): string {
  return getNormalizedStringValue(value)?.toLowerCase() || '';
}

export function valueIncludes(value: unknown, search: string): boolean {
  return getNormalizedStringValue(value)?.includes(search) || false;
}

export function normalizeDomStringValues<T>(value: T): T {
  const normalizedString = getNormalizedStringValue(value);
  if (normalizedString !== undefined) {
    return normalizedString as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeDomStringValues(item)) as T;
  }

  if (!isPlainObject(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, nestedValue]) => [key, normalizeDomStringValues(nestedValue)])
  ) as T;
}

export function normalizeRecording(recording: Recording): Recording {
  return normalizeDomStringValues(recording);
}

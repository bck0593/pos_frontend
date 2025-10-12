export const MAX_EAN13_LENGTH = 13;

const FULL_WIDTH_ZERO = '０'.charCodeAt(0);
const FULL_WIDTH_NINE = '９'.charCodeAt(0);

export function normalizeEAN13(raw: string): string {
  if (!raw) return '';
  let normalized = '';
  for (const char of raw.trim()) {
    if (char >= '0' && char <= '9') {
      normalized += char;
      continue;
    }
    const code = char.charCodeAt(0);
    if (code >= FULL_WIDTH_ZERO && code <= FULL_WIDTH_NINE) {
      normalized += String.fromCharCode(code - FULL_WIDTH_ZERO + 48);
    }
  }
  return normalized;
}

export function sanitizeEAN13Input(raw: string): string {
  return normalizeEAN13(raw).slice(0, MAX_EAN13_LENGTH);
}

export function isValidEAN13(raw: string): boolean {
  return normalizeEAN13(raw).length === MAX_EAN13_LENGTH;
}

export function getValidEAN13(raw: string): string | null {
  const normalized = sanitizeEAN13Input(raw);
  if (normalized.length !== MAX_EAN13_LENGTH) {
    return null;
  }
  return normalized;
}

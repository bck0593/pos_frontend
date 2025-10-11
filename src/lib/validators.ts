const FULL_WIDTH_ZERO = "０".charCodeAt(0);
const FULL_WIDTH_NINE = "９".charCodeAt(0);

export const MAX_EAN13_LENGTH = 13;

export function normalizeEAN13(raw: string): string {
  if (!raw) return "";
  let normalized = "";
  for (const char of raw.trim()) {
    if (char >= "0" && char <= "9") {
      normalized += char;
      continue;
    }
    const code = char.charCodeAt(0);
    if (code >= FULL_WIDTH_ZERO && code <= FULL_WIDTH_NINE) {
      normalized += String.fromCharCode(code - FULL_WIDTH_ZERO + 48);
      continue;
    }
  }
  return normalized;
}

export function sanitizeEAN13Input(raw: string): string {
  return normalizeEAN13(raw).slice(0, MAX_EAN13_LENGTH);
}

export function isValidEAN13(raw: string): boolean {
  const normalized = normalizeEAN13(raw);
  if (normalized.length !== MAX_EAN13_LENGTH) {
    return false;
  }
  const digits = normalized.split("").map(Number);
  const checkDigit = digits.pop()!;
  const sum = digits.reduce(
    (acc, digit, index) => acc + digit * (index % 2 === 0 ? 1 : 3),
    0,
  );
  return (10 - (sum % 10)) % 10 === checkDigit;
}

export function getValidEAN13(raw: string): string | null {
  const normalized = normalizeEAN13(raw);
  return isValidEAN13(normalized) ? normalized : null;
}

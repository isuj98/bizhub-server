/**
 * URL normalization and validation for the analysis pipeline.
 * Ensures we never send raw URLs to Gemini without validated, fetchable targets.
 */

const HTTP_OR_HTTPS = /^https?:\/\/.+/i;

/**
 * Normalizes a URL: trims, lowercases, and adds https:// if no scheme.
 */
export function normalizeUrl(url: string): string {
  const s = url.trim().toLowerCase();
  if (!s) return '';
  return s.startsWith('http') ? s : `https://${s}`;
}

/**
 * Validates that a string is a usable HTTP/HTTPS URL (format only; does not fetch).
 * Returns the normalized URL if valid, or null if invalid.
 */
export function validateUrl(input: string): { valid: true; normalized: string } | { valid: false; reason: string } {
  const trimmed = (input ?? '').trim();
  if (!trimmed) {
    return { valid: false, reason: 'URL is empty' };
  }
  const normalized = normalizeUrl(trimmed);
  try {
    const u = new URL(normalized);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
      return { valid: false, reason: 'Only HTTP and HTTPS URLs are allowed' };
    }
    if (!HTTP_OR_HTTPS.test(normalized)) {
      return { valid: false, reason: 'Invalid URL format' };
    }
    return { valid: true, normalized };
  } catch {
    return { valid: false, reason: 'Invalid URL format' };
  }
}

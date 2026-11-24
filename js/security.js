// ============================================================
// DAYMARK — SECURITY & INPUT HYGIENE UTILITIES
// ============================================================

const HTML_ESCAPE_MAP = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
  '/': '&#x2F;'
};

/**
 * Escapes HTML special characters including quotes and slashes,
 * safe for both element text and quoted HTML attributes.
 */
export function escapeHTML(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[&<>"'/]/g, (ch) => HTML_ESCAPE_MAP[ch]);
}

/**
 * RFC 4180 CSV serializer that also neutralizes spreadsheet formula injection
 * (=, +, -, @, tab, carriage return).
 */
export function sanitizeCSVCell(value) {
  if (value === null || value === undefined) return '""';
  let str = String(value).replace(/\0/g, '');
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  return `"${str.replace(/"/g, '""')}"`;
}

/**
 * Validates user-provided image URLs strictly to https: origin URLs
 * without CSS breakout characters.
 */
export function validateImageUrl(rawUrl) {
  if (typeof rawUrl !== 'string') return null;
  const trimmed = rawUrl.trim();
  if (!trimmed || trimmed.length > 2048) return null;
  if (/[\s"'()\\<>]/.test(trimmed)) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:') return null;
    return parsed.href;
  } catch {
    return null;
  }
}

/**
 * Sanitizes custom emoji / short symbol strings safely.
 */
export function sanitizeEmoji(input, fallback = '✦') {
  if (typeof input !== 'string') return fallback;
  const cleaned = input.replace(/[\u0000-\u001F\u007F<>'"&]/g, '').trim();
  if (!cleaned) return fallback;
  if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
    const segs = Array.from(new Intl.Segmenter('en', { granularity: 'grapheme' }).segment(cleaned));
    return segs.slice(0, 2).map((s) => s.segment).join('') || fallback;
  }
  return Array.from(cleaned).slice(0, 2).join('') || fallback;
}

/**
 * Cryptographically strong unique ID generator with safe fallback.
 */
export function safeId(prefix = 'h') {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
    return `${prefix}_${globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
  }
  const bytes = new Uint8Array(8);
  if (globalThis.crypto && typeof globalThis.crypto.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(bytes);
    return `${prefix}_${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Safe JSON parse that never throws on corrupt localStorage entries.
 */
export function safeJSONParse(raw, fallback) {
  if (typeof raw !== 'string' || !raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    return parsed !== null && parsed !== undefined ? parsed : fallback;
  } catch {
    return fallback;
  }
}

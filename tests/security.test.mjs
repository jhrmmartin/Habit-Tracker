import test from 'node:test';
import assert from 'node:assert/strict';
import {
  escapeHTML,
  sanitizeCSVCell,
  validateImageUrl,
  sanitizeEmoji,
  safeId
} from '../js/security.js';

test('escapeHTML escapes quotes, angle brackets, and slashes to prevent attribute XSS', () => {
  const payload = '" onmouseover="alert(1)" <script>x</script>\'';
  const escaped = escapeHTML(payload);
  assert.ok(!escaped.includes('"'));
  assert.ok(!escaped.includes("'"));
  assert.ok(!escaped.includes('<'));
  assert.ok(!escaped.includes('>'));
  assert.equal(
    escaped,
    '&quot; onmouseover=&quot;alert(1)&quot; &lt;script&gt;x&lt;&#x2F;script&gt;&#39;'
  );
});

test('sanitizeCSVCell neutralizes Excel/Sheets formula injection and quotes values', () => {
  assert.equal(sanitizeCSVCell('=CMD|\' /C calc\'!A0'), '"\'=CMD|\' /C calc\'!A0"');
  assert.equal(sanitizeCSVCell('+1+1'), '"\'+1+1"');
  assert.equal(sanitizeCSVCell('-2+3'), '"\'-2+3"');
  assert.equal(sanitizeCSVCell('@SUM(A1:A2)'), '"\'@SUM(A1:A2)"');
  assert.equal(sanitizeCSVCell('Read "Atomic Habits"'), '"Read ""Atomic Habits"""');
});

test('validateImageUrl only permits safe https URLs without CSS breakout characters', () => {
  assert.equal(validateImageUrl('https://images.unsplash.com/photo-123'), 'https://images.unsplash.com/photo-123');
  assert.equal(validateImageUrl('javascript:alert(1)'), null);
  assert.equal(validateImageUrl('http://insecure.example.com/a.jpg'), null);
  assert.equal(validateImageUrl('https://example.com/a.jpg");body{color:red}'), null);
  assert.equal(validateImageUrl('data:text/html,<script>alert(1)</script>'), null);
});

test('sanitizeEmoji strips HTML control characters and preserves valid emoji', () => {
  assert.equal(sanitizeEmoji('💧'), '💧');
  assert.equal(sanitizeEmoji('<img src=x>'), 'im');
  assert.equal(sanitizeEmoji('   ', '✦'), '✦');
});

test('safeId produces unique prefixed IDs', () => {
  const a = safeId('h');
  const b = safeId('h');
  assert.ok(a.startsWith('h_'));
  assert.notEqual(a, b);
});

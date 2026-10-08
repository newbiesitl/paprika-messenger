export class BoardError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
export const fail = (status, code, message) => { throw new BoardError(status, code, message); };
const bytes = value => new TextEncoder().encode(value).length;
export function text(value, field, max, optional = false) {
  if (optional && (value === undefined || value === null)) return null;
  if (typeof value !== 'string' || !value.trim() || bytes(value) > max || value.includes('\u0000'))
    fail(400, 'invalid_argument', `${field} must be nonempty text of at most ${max} UTF-8 bytes.`);
  return value;
}
export function id(value, field, max = 96) {
  text(value, field, max);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.:-]*$/.test(value)) fail(400, 'invalid_id', `${field} is not a valid ID.`);
  return value;
}
export function plainText(value, field, max) {
  if (typeof value !== 'string' || bytes(value) > max || value.includes('\u0000'))
    fail(400, 'invalid_argument', `${field} must be plain text of at most ${max} UTF-8 bytes.`);
  return value;
}
export function integer(value, field, min, max, fallback) {
  if (value === undefined && fallback !== undefined) return fallback;
  if (!Number.isSafeInteger(value) || value < min || value > max) fail(400, 'invalid_argument', `${field} must be an integer from ${min} to ${max}.`);
  return value;
}
export function strict(input, fields) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail(400, 'invalid_argument', 'Arguments must be an object.');
  for (const key of Object.keys(input)) if (!fields.includes(key)) fail(400, 'unknown_argument', `Unknown argument: ${key}`);
}
export function encodeCursor(board, sequence) { return btoa(JSON.stringify([1, board, sequence])); }
export function decodeCursor(value, board) {
  if (value === undefined || value === null) return 0;
  try {
    if (typeof value !== 'string' || value.length > 256) throw Error();
    const [v, b, n] = JSON.parse(atob(value));
    if (v !== 1 || b !== board || !Number.isSafeInteger(n) || n < 0) throw Error();
    return n;
  } catch { fail(400, 'invalid_cursor', 'Cursor is invalid or belongs to a different board.'); }
}

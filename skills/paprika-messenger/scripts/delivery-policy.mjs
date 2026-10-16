export const DEFAULT_SHORT_MESSAGE_LIMIT = 1500;

// Count the original body before branding/routing: JS string iteration counts
// Unicode code points, including combining marks and CR/LF separately. Do not
// normalize, trim, count UTF-16 units, or count grapheme clusters.
export function deliveryPolicy(body, policy = {}) {
  if (typeof body !== 'string' || !body.trim()) throw Error('Require the original nonempty message body.');
  const {short_message_limit = DEFAULT_SHORT_MESSAGE_LIMIT, force_reference = false} = policy;
  if (!Number.isSafeInteger(short_message_limit) || short_message_limit < 1 || short_message_limit > 15000
      || typeof force_reference !== 'boolean' || Object.keys(policy).some(k => !['short_message_limit','force_reference'].includes(k)))
    throw Error('Delivery policy accepts short_message_limit (1..15000 code points) and force_reference (boolean) only.');
  const code_points = [...body].length;
  return {mode: force_reference || code_points > short_message_limit ? 'reference' : 'inline',
    code_points, short_message_limit, force_reference, counting_rule: 'original_unicode_code_points'};
}

export function verifyReferencedMessage({board, message_id, receiver_id, result}) {
  const message = result?.message;
  const id = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,95}$/.test(value);
  if (!id(board) || !id(message_id) || !id(receiver_id) || result?.isError || !message || message.deleted_at || message.board !== board || message.id !== message_id
      || message.receiver_id !== receiver_id || typeof message.body !== 'string' || !message.body.trim()
      || typeof message.sender_id !== 'string')
    throw Error('Referenced message unavailable or addressed to another recipient; blocked, do not invent or act on a payload.');
  return message;
}

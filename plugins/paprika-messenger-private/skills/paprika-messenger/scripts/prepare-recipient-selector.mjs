import { existsSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const object = value => value && typeof value === 'object' && !Array.isArray(value);
function string(value, name, maximum = 512) {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum)
    throw Error('Require a confirmed ' + name + '.');
  return value;
}
const display = value => String(value).replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
const actions = [
  ['search', 'Search by name or ID'], ['board', 'Change board'],
  ['refresh', 'Refresh thread details'], ['clear', 'Clear recipient'], ['cancel', 'Cancel'],
];
function freezeMessage(mode, value) {
  if (!['choose', 'send_agreed'].includes(mode)) throw Error('Unknown recipient selection mode.');
  if (mode === 'choose') {
    if (value != null) throw Error('An agreed message requires send_agreed mode.');
    return null;
  }
  if (!object(value) || Object.keys(value).some(k => !['sender_id', 'sender_label', 'topic', 'body', 'idempotency_key', 'reply_to_id'].includes(k)))
    throw Error('Require the exact agreed message arguments.');
  const result = {};
  for (const [field, maximum] of [['sender_id', 128], ['sender_label', 120], ['topic', 120], ['body', 16000], ['idempotency_key', 128]])
    result[field] = string(value[field], field, maximum);
  if (value.reply_to_id != null) result.reply_to_id = string(value.reply_to_id, 'reply_to_id', 128);
  return result;
}

// The host owns the native question panel. This helper prepares data; it never
// opens UI, calls a remote tool, changes routing, or sends a message.
export function prepareRecipientSelector({ page, cursor = null, mode = 'choose', agreed_message = null } = {}) {
  if (!object(page) || !Array.isArray(page.recipients) || page.recipients.length > 50)
    throw Error('Require one confirmed recipient page of at most 50.');
  const board = string(page.board, 'board', 64), query = page.query ?? '';
  if (typeof query !== 'string' || query.length > 160) throw Error('Invalid literal search.');
  if (typeof page.has_more !== 'boolean' || (page.has_more && typeof page.next_cursor !== 'string'))
    throw Error('Require confirmed pagination metadata.');
  if (cursor != null) string(cursor, 'current page cursor', 2048);
  const frozen = freezeMessage(mode, agreed_message), seen = new Set();
  const groups = new Map();
  for (const recipient of page.recipients) {
    const participant_id = string(recipient.participant_id, 'participant_id', 128);
    if (seen.has(participant_id)) throw Error('The page repeats a recipient ID.');
    seen.add(participant_id);
    const thread_id = recipient.thread_id == null ? null : string(recipient.thread_id, 'thread_id', 160);
    const name = string(recipient.thread_name, 'thread_name');
    const assigned = recipient.project_status === 'assigned';
    if (assigned) { string(recipient.project_id, 'project_id', 160); string(recipient.project_name, 'project_name', 160); }
    const group = assigned ? 'project:' + recipient.project_id : recipient.project_status === 'unassigned' ? 'unassigned' : 'unknown';
    const annotations = [recipient.source, recipient.execution_mode, recipient.workspace_name]
      .filter(value => value && value !== 'unknown').map(display);
    if (!['assigned', 'unassigned'].includes(recipient.project_status)) annotations.push('Project unavailable');
    const address = thread_id ? 'Thread ID: ' + display(thread_id) : 'Communication ID: ' + display(participant_id);
    const extra = thread_id && participant_id !== thread_id ? ' · Communication ID: ' + display(participant_id) : '';
    const label = (assigned ? display(recipient.project_name) + ' → ' : '') + display(name) + ' · ' + address + extra
      + (annotations.length ? ' (' + annotations.join(' · ') + ')' : '');
    const choice = { id: 'recipient:' + participant_id, label, participant_id, thread_id, thread_name: name };
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(choice);
  }
  const choices = [...groups.values()].flat();
  const controls = actions.map(([action, label]) => ({ id: 'action:' + action, action, label }));
  if (page.has_more) controls.splice(3, 0, { id: 'action:more', action: 'more', label: 'More conversations' });
  const options = [...choices, ...controls];
  return { board, query, mode, agreed_message: frozen, selection_sends: mode === 'send_agreed',
    list_arguments: { board, query, limit: 50, ...(cursor != null ? { cursor } : {}) },
    next_cursor: page.has_more ? page.next_cursor : null, options,
    question: { title: (mode === 'send_agreed' ? 'Choose a recipient for the agreed message' : 'Choose a recipient; selection alone sends nothing')
      + ' · Board: ' + display(board) + (query ? ' · Search: ' + display(query) : ''), options: options.map(option => option.label) },
    metadata_bindings: page.recipients.filter(r => r.thread_id).map(r => ({ participant_id: r.participant_id, thread_id: r.thread_id,
      ...(r.source ? { source: r.source } : {}), ...(r.host_id ? { host_id: r.host_id } : {}) })) };
}

export function resolveRecipientChoice(selector, answer) {
  if (!object(selector) || !Array.isArray(selector.options)) throw Error('Require the exact presented selector snapshot.');
  const value = string(answer, 'explicit user response', 4096);
  // A displayed option is authoritative. A conversation named "Cancel" or
  // "Search by name or ID" must not make those visible controls unusable.
  const displayed = selector.options.filter(option => option.label === value);
  const matches = displayed.length ? displayed : selector.options.filter(option =>
    [option.id, option.participant_id, option.thread_id, option.thread_name].includes(value));
  if (matches.length > 1) throw Error('Ambiguous choice: show the distinct IDs for selection.');
  if (!matches.length) {
    if (value.length > 160) throw Error('Literal searches are limited to 160 characters.');
    return { action: 'search', arguments: { board: selector.board, query: value, limit: 50 } };
  }
  const choice = matches[0];
  if (choice.action) return { action: choice.action,
    ...(choice.action === 'more' ? { arguments: { board: selector.board, query: selector.query, cursor: selector.next_cursor, limit: 50 } } : {}) };
  return { action: 'selected', board: selector.board, receiver_id: choice.participant_id,
    receiver_thread_id: choice.thread_id, thread_name: choice.thread_name, mode: selector.mode,
    selection_sends: selector.selection_sends, ...(selector.agreed_message ? { agreed_message: structuredClone(selector.agreed_message) } : {}) };
}

if (process.argv[1] && existsSync(process.argv[1]) && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  try {
    const action = process.argv[2];
    if (process.argv.length !== 3 || !['prepare', 'resolve'].includes(action))
      throw Error('Usage: node prepare-recipient-selector.mjs prepare|resolve < confirmed-input.json');
    const chunks = []; let size = 0;
    for await (const chunk of process.stdin) { size += chunk.length; if (size > 262144) throw Error('Selector input exceeds 256 KiB.'); chunks.push(chunk); }
    const input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    console.log(JSON.stringify(action === 'prepare' ? prepareRecipientSelector(input) : resolveRecipientChoice(input.selector, input.answer)));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}

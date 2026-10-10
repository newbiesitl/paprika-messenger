import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareRecipientSelector, resolveRecipientChoice } from '../skills/paprika-messenger/scripts/prepare-recipient-selector.mjs';

const recipient = (id, extra = {}) => ({ participant_id: id, thread_id: 'native-' + id, thread_name: 'Conversation ' + id,
  source: 'codex', execution_mode: 'local', project_status: 'unassigned', ...extra });
const page = (recipients = [recipient('one')], extra = {}) => ({ board: 'main', query: '', recipients, has_more: false, next_cursor: null, ...extra });
const message = { sender_id: 'sender', sender_label: 'Sender', topic: 'Agreed topic', body: 'Exact body\n会話 <script> & text', idempotency_key: 'fixed-key' };

test('native choices preserve project groups and full native IDs without inferring an unbound native route', () => {
  const project = { project_status: 'assigned', project_id: 'project-one', project_name: 'First project' };
  const selector = prepareRecipientSelector({ page: page([recipient('one', project), recipient('free'), recipient('two', project), recipient('unbound', { thread_id: null, project_status: 'unknown' })]) });
  assert.deepEqual(selector.options.filter(o => o.participant_id).map(o => o.participant_id), ['one', 'two', 'free', 'unbound']);
  assert.match(selector.options[0].label, /First project → Conversation one · Thread ID: native-one/);
  assert.match(selector.options[0].label, /codex · local/);
  const unbound = selector.options.find(o => o.participant_id === 'unbound');
  assert.match(unbound.label, /Communication ID: unbound/); assert.doesNotMatch(unbound.label, /Thread ID:/);
  assert.equal(resolveRecipientChoice(selector, unbound.label).receiver_thread_id, null);
  assert.equal(selector.selection_sends, false);
});

test('selection uses the presented immutable ID snapshot; duplicate names require a distinct ID', () => {
  const input = page([recipient('one', { thread_name: 'Same name' }), recipient('two', { thread_name: 'Same name' })]);
  const selector = prepareRecipientSelector({ page: input }); input.recipients[0].participant_id = 'changed-after-presentation';
  assert.throws(() => resolveRecipientChoice(selector, 'Same name'), /Ambiguous/);
  assert.equal(resolveRecipientChoice(selector, 'recipient:one').receiver_id, 'one');
  assert.equal(resolveRecipientChoice(selector, 'native-two').receiver_id, 'two');
});

test('unknown names and IDs become literal global searches; pagination retains the exact board, query and cursor', () => {
  const selector = prepareRecipientSelector({ page: page([recipient('one')], { board: 'other', query: 'observed', has_more: true, next_cursor: 'opaque-cursor' }), cursor: 'current-page-cursor' });
  assert.deepEqual(selector.list_arguments, { board: 'other', query: 'observed', limit: 50, cursor: 'current-page-cursor' });
  assert.deepEqual(resolveRecipientChoice(selector, 'Old %_ 名前'), { action: 'search', arguments: { board: 'other', query: 'Old %_ 名前', limit: 50 } });
  assert.deepEqual(resolveRecipientChoice(selector, 'action:more'), { action: 'more', arguments: { board: 'other', query: 'observed', cursor: 'opaque-cursor', limit: 50 } });
  assert.equal(prepareRecipientSelector({ page: page() }).options.some(o => o.action === 'more'), false);
});

test('native control actions never carry a message or authorize a selection', () => {
  const selector = prepareRecipientSelector({ page: page(), mode: 'send_agreed', agreed_message: message });
  for (const action of ['search', 'board', 'refresh', 'clear', 'cancel'])
    assert.deepEqual(resolveRecipientChoice(selector, 'action:' + action), { action });
  assert.throws(() => resolveRecipientChoice(selector, undefined), /explicit user response/);
  assert.throws(() => resolveRecipientChoice(selector, ''), /explicit user response/);
});

test('agreed content and key stay frozen while preparing and resolving a native choice', () => {
  const input = { ...message }, selector = prepareRecipientSelector({ page: page(), mode: 'send_agreed', agreed_message: input });
  input.body = 'Changed'; input.idempotency_key = 'Other';
  const selected = resolveRecipientChoice(selector, 'native-one');
  assert.deepEqual(selected.agreed_message, message); assert.equal(selected.selection_sends, true);
  selected.agreed_message.body = 'Changed after selection';
  assert.equal(selector.agreed_message.body, message.body);
  assert.throws(() => prepareRecipientSelector({ page: page(), agreed_message: message }), /requires send_agreed/);
  assert.throws(() => prepareRecipientSelector({ page: page(), mode: 'send_agreed' }), /exact agreed/);
});

test('refresh bindings stay bounded to the actual page; malformed or duplicate snapshots fail', () => {
  const entries = Array.from({ length: 50 }, (_, n) => recipient('r' + n));
  assert.equal(prepareRecipientSelector({ page: page(entries) }).metadata_bindings.length, 50);
  assert.throws(() => prepareRecipientSelector({ page: page([...entries, recipient('extra')]) }), /at most 50/);
  assert.throws(() => prepareRecipientSelector({ page: page([recipient('same'), recipient('same')]) }), /repeats/);
  assert.throws(() => prepareRecipientSelector({ page: page([], { has_more: true, next_cursor: null }) }), /pagination/);
  assert.throws(() => prepareRecipientSelector({ page: page([recipient('bad', { project_status: 'assigned' })]) }), /project_id/);
});

test('titles that resemble controls cannot choose another route; display removes control characters only', () => {
  const selector = prepareRecipientSelector({ page: page([recipient('one', { thread_name: 'Search by name or ID' }), recipient('two', { thread_name: 'Line\nname' })]) });
  assert.equal(resolveRecipientChoice(selector, 'Search by name or ID').action, 'search');
  assert.equal(resolveRecipientChoice(selector, selector.options[0].label).receiver_id, 'one');
  assert.equal(resolveRecipientChoice(selector, 'action:search').action, 'search');
  const option = selector.options.find(o => o.participant_id === 'two'); assert.doesNotMatch(option.label, /\n/);
  assert.equal(resolveRecipientChoice(selector, option.label).thread_name, 'Line\nname');
});

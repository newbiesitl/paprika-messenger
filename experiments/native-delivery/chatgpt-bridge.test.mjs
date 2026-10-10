import test from 'node:test';
import assert from 'node:assert/strict';
import { digest } from '../../skills/paprika-messenger/scripts/prepare-delivery.mjs';
import { evaluateChatGptBridge } from './chatgpt-bridge.mjs';

const key = '11111111-1111-4111-8111-111111111111';
const expected = `Received the Messenger test.\nBridge test: ${key}`;
const args = {threadId: 'visible-chat', prompt: `Post this acknowledgment in this conversation:\n\n${expected}`};
const checkpoint = {schema_version: 1, native_kind: 'chatgpt', request_id: key,
  recipient_thread_id: args.threadId, payload_digest: digest(args), state: 'submitted',
  prepared_at: '2026-01-01T12:00:00.500Z', baseline_turn_ids: ['prior-turn']};
const second = Math.floor(Date.parse(checkpoint.prepared_at) / 1000);
const turn = () => ({id: 'new-chatgpt-turn', status: 'completed', startedAt: second + 1,
  items: [{type: 'userMessage', content: [{type: 'text', text: args.prompt}]},
    {id: 'chatgpt-response', type: 'agentMessage', text: expected}]});
const history = (...turns) => ({schemaVersion: 1, thread: {id: 'visible-chat', kind: 'chatgpt'}, turns});
const evaluate = (h, changes = {}) => evaluateChatGptBridge({checkpoint, args, expected_response: expected, history: h, ...changes});

test('verifies the exact input and acknowledgment in a new completed ChatGPT turn', () => {
  const report = evaluate(history(turn()));
  assert.equal(report.status, 'chatgpt_response_verified');
  assert.equal(report.native_kind, 'chatgpt'); assert.equal(report.exact_response, true);
  assert.equal(report.turn_id, 'new-chatgpt-turn');
  assert(!JSON.stringify(report).includes(expected)); assert(!JSON.stringify(report).includes(args.prompt));
});

test('rejects Codex runtime history even when its prompt and reply match', () => {
  const runtime = history(turn()); runtime.thread.kind = 'codex';
  assert.throws(() => evaluate(runtime), /not its Codex runtime/);
  runtime.thread.kind = 'chatgpt'; runtime.thread.id = 'other-visible-chat';
  assert.throws(() => evaluate(runtime), /exact ChatGPT conversation/);
});

test('a stale read can later verify without another native submission', () => {
  const old = turn(); old.id = 'prior-turn';
  assert.equal(evaluate(history(old)).status, 'awaiting_chatgpt_turn');
  assert.equal(evaluate(history(turn(), old)).status, 'chatgpt_response_verified');
  assert.equal(checkpoint.state, 'submitted');
});

test('old turns, copied references, absent timestamps and unmatched input are inconclusive', () => {
  for (const change of [
    t => {t.id = 'prior-turn';},
    t => {t.startedAt = second - 1;},
    t => {t.startedAt = undefined;},
    t => {t.items[0].content[0].text = key;},
    t => {t.items[0].type = 'toolResult';},
  ]) {
    const t = turn(); change(t);
    assert.equal(evaluate(history(t)).status, 'awaiting_chatgpt_turn');
  }
});

test('only the last assistant answer in the same completed turn establishes acknowledgment', () => {
  for (const change of [
    t => {t.items[1].phase = 'commentary';},
    t => {t.items[1].text += ' extra text';},
    t => {t.items[1].type = 'toolResult';},
    t => {t.items.push({type: 'agentMessage', text: 'Different answer.'});},
  ]) {
    const t = turn(); change(t);
    assert.equal(evaluate(history(t)).status, 'chatgpt_response_mismatch');
  }
  const running = turn(); running.status = 'inProgress';
  assert.equal(evaluate(history(running)).status, 'chatgpt_turn_observed');
  const inputOnly = turn(); inputOnly.items.pop();
  const responseOnly = turn(); responseOnly.id = 'unrelated-turn'; responseOnly.items.shift();
  assert.equal(evaluate(history(inputOnly, responseOnly)).status, 'chatgpt_response_mismatch');
});

test('duplicate turns and uncertain submission retain investigation or reconciliation', () => {
  const duplicate = turn(); duplicate.id = 'duplicate-turn';
  assert.equal(evaluate(history(turn(), duplicate)).status, 'duplicate_chatgpt_turns');
  for (const state of ['submitting', 'unknown']) {
    const report = evaluate(history(turn()), {checkpoint: {...checkpoint, state}});
    assert.equal(report.status, 'chatgpt_response_verified'); assert.equal(report.next_action, 'reconcile');
  }
  assert.equal(evaluate(history(turn()), {checkpoint: {...checkpoint, state: 'failed'}}).status, 'inconsistent_evidence');
});

test('rejects changed routes, payloads and response references', () => {
  for (const changes of [
    {args: {...args, threadId: 'another-chat'}},
    {args: {...args, prompt: args.prompt + ' changed'}},
    {expected_response: 'An acknowledgment without this request ID.'},
    {checkpoint: {...checkpoint, payload_digest: '0'.repeat(64)}},
    {checkpoint: {...checkpoint, native_kind: 'codex'}},
  ]) assert.throws(() => evaluate(history(turn()), changes));
});

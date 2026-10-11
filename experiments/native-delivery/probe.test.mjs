import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { prepareNativeProbe, evaluateNativeProbe } from './probe.mjs';
import { NotificationState } from '../../skills/paprika-messenger/scripts/notification-state.mjs';

const now = Date.parse('2026-01-01T12:00:00.500Z');
const second = Math.floor(now / 1000);
const env = {CODEX_THREAD_ID: 'sender-chat'};
const route = {deployment: 'https://messenger.example.test', board: 'main',
  sender: {board: 'main', id: 'sender', thread_id: 'sender-chat'},
  recipient: {board: 'main', id: 'receiver', thread_id: 'receiver-chat'},
  destination: {thread_id: 'receiver-chat', source: 'read_thread', host_id: 'verified-cloud-host'}};
const baseline = () => ({schemaVersion: 1,
  thread: {id: 'receiver-chat', hostId: 'verified-cloud-host', kind: 'codex', status: {type: 'idle'}},
  turns: [{id: 'old-turn', startedAt: second - 60, status: 'completed',
    items: [{type: 'agentMessage', phase: 'final_answer', text: 'Private prior conversation.'}]}]});
const prepare = (changes = {}) => prepareNativeProbe({...route, history: baseline(),
  request_id: '11111111-1111-4111-8111-111111111111', ...changes}, {env, now});
const observedTurn = probe => ({id: 'new-turn', startedAt: second + 1, completedAt: second + 2,
  status: 'completed', items: [
    {type: 'userMessage', content: [{type: 'text', text: 'Native host delegation envelope.',
      codexDelegation: {sourceThreadId: probe.plan.sender_thread_id, input: probe.plan.host_args.prompt}}]},
    {id: 'response-item', type: 'agentMessage', phase: 'final_answer', text: probe.expected_response},
  ]});
const historyWith = (...turns) => ({...baseline(), turns});
async function fixture(t, outcome = 'submitted') {
  const root = await mkdtemp(join(tmpdir(), 'paprika-probe-'));
  t.after(() => rm(root, {recursive: true, force: true}));
  const state = new NotificationState(root), probe = prepare();
  if (outcome !== 'not_started') {
    const attempt = await state.begin(probe.plan, {available: outcome !== 'unavailable'});
    if (['submitted', 'failed', 'unknown'].includes(outcome)) await state.record(probe.plan,
      {attempt_id: attempt.checkpoint.attempt_id, state: outcome,
        ...(outcome === 'submitted' ? {confirmation: {thread_id: 'receiver-chat'}} : {})});
  }
  const evaluate = history => evaluateNativeProbe({probe, history}, {state, now: now + 5000});
  return {state, probe, evaluate};
}

test('preparation retains only the idle baseline IDs and one synthetic native prompt', () => {
  const probe = prepare();
  assert.equal(probe.plan.transport, 'native');
  assert.equal(probe.plan.mode, 'direct');
  assert.deepEqual(probe.baseline.turn_ids, ['old-turn']);
  assert(!JSON.stringify(probe).includes('Private prior conversation.'));
  assert(probe.plan.host_args.prompt.includes(probe.expected_response));
  assert(probe.expected_response.startsWith('Received your Paprika Messenger native-delivery test message.\n'));
  assert.deepEqual(Object.keys(probe.plan.host_args).sort(), ['hostId', 'prompt', 'threadId']);
  const generated = prepareNativeProbe({...route, history: baseline()}, {env, now});
  assert.notEqual(generated.plan.key, probe.plan.key);
});

test('preparation rejects busy, self, guessed or unsupported destinations', () => {
  const busy = baseline(); busy.thread.status.type = 'active';
  assert.throws(() => prepare({history: busy}), /idle/);
  for (const change of [
    {history: {...baseline(), schemaVersion: 2}},
    {history: {...baseline(), thread: {...baseline().thread, kind: 'chatgpt'}}},
    {history: {...baseline(), thread: {...baseline().thread, id: 'other-chat'}}},
    {history: {...baseline(), thread: {...baseline().thread, hostId: 'other-host'}}},
    {destination: {...route.destination, source: 'title_match'}},
    {recipient: {...route.recipient, thread_id: 'sender-chat'},
      destination: {...route.destination, thread_id: 'sender-chat'}},
    {request_id: 'reused-message-id'},
  ]) assert.throws(() => prepare(change));
  assert.throws(() => prepareNativeProbe({...route, history: baseline()}, {env: {}, now}), /unavailable/);
});

test('a new turn with exact delegated input and final response verifies idle wake', async t => {
  const {state, probe, evaluate} = await fixture(t);
  const report = await evaluate(historyWith(observedTurn(probe)));
  assert.equal(report.status, 'response_verified');
  assert.equal(report.new_turn, true); assert.equal(report.exact_response, true);
  assert.equal(report.next_action, 'none'); assert.equal(report.turn_id, 'new-turn');
  assert.equal(report.response_item_id, 'response-item');
  assert(!JSON.stringify(report).includes(probe.plan.host_args.prompt));
  assert(!JSON.stringify(report).includes(probe.expected_response));
  const checkpoint = await readFile(state.path(probe.plan), 'utf8');
  assert(!checkpoint.includes('host_args')); assert(!checkpoint.includes(probe.expected_response));
  assert.equal((await state.begin(probe.plan, {available: true})).action, 'skip');
});

test('a native history entry containing the exact direct prompt is also supported', async t => {
  const {probe, evaluate} = await fixture(t);
  const turn = observedTurn(probe);
  turn.items[0].content = [{type: 'text', text: probe.plan.host_args.prompt}];
  assert.equal((await evaluate(historyWith(turn))).status, 'response_verified');
});

test('submission success, old turns and copied markers cannot prove a new recipient turn', async t => {
  const {probe, evaluate} = await fixture(t);
  const cases = [
    turn => {turn.id = 'old-turn';},
    turn => {turn.startedAt = second - 1;},
    turn => {turn.startedAt = undefined;},
    turn => {turn.items.shift();},
    turn => {turn.items[0].content[0] = {type: 'text', text: probe.expected_response};},
    turn => {turn.items[0].content[0].codexDelegation.sourceThreadId = 'another-sender';},
    turn => {turn.items[0].content[0].codexDelegation.input += ' changed';},
    turn => {turn.items[0].content[0] = {type: 'text', text: `<input>${probe.plan.host_args.prompt}</input>`};},
  ];
  assert.equal((await evaluate()).status, 'awaiting_turn');
  for (const change of cases) {
    const turn = observedTurn(probe); change(turn);
    const report = await evaluate(historyWith(turn));
    assert.equal(report.status, 'awaiting_turn'); assert.equal(report.new_turn, false);
  }
});

test('the response must be the last final answer of the same completed matching turn', async t => {
  const {probe, evaluate} = await fixture(t);
  for (const change of [
    turn => {turn.items[1].phase = 'commentary';},
    turn => {turn.items[1].type = 'toolResult';},
    turn => {turn.items[1].text += ' extra text';},
    turn => {turn.items.push({type: 'agentMessage', phase: 'final_answer', text: 'Different final answer.'});},
  ]) {
    const turn = observedTurn(probe); change(turn);
    const report = await evaluate(historyWith(turn));
    assert.equal(report.status, 'response_mismatch'); assert.equal(report.exact_response, false);
  }
  const inputOnly = observedTurn(probe); inputOnly.items.pop();
  const responseOnly = observedTurn(probe); responseOnly.id = 'another-turn'; responseOnly.items.shift();
  assert.equal((await evaluate(historyWith(inputOnly, responseOnly))).status, 'response_mismatch');
  const running = observedTurn(probe); running.status = 'inProgress';
  assert.equal((await evaluate(historyWith(running))).status, 'turn_observed');
  running.status = 'failed';
  assert.equal((await evaluate(historyWith(running))).status, 'turn_failed');
});

test('multiple matching new turns flag a duplicate instead of declaring a clean success', async t => {
  const {probe, evaluate} = await fixture(t);
  const secondTurn = observedTurn(probe); secondTurn.id = 'duplicate-turn';
  const report = await evaluate(historyWith(observedTurn(probe), secondTurn));
  assert.equal(report.status, 'duplicate_turns'); assert.equal(report.exact_response, false);
  assert.equal(report.next_action, 'investigate');
});

test('uncertain submissions stay guarded, even when history proves the response', async t => {
  for (const outcome of ['unknown', 'submitting']) {
    const {state, probe, evaluate} = await fixture(t, outcome);
    assert.equal((await evaluate(historyWith())).status, 'submission_uncertain');
    const report = await evaluate(historyWith(observedTurn(probe)));
    assert.equal(report.status, 'response_verified'); assert.equal(report.next_action, 'reconcile');
    assert.equal((await state.read(probe.plan)).state, outcome);
    assert.equal((await state.begin(probe.plan, {available: true, retry: true})).action, 'reconcile');
  }
});

test('unavailable, rejected and unstarted sends stay distinct from missing history', async t => {
  for (const [outcome, expected] of [['unavailable', 'unavailable'], ['failed', 'rejected'], ['not_started', 'not_started']]) {
    const {probe, evaluate} = await fixture(t, outcome);
    assert.equal((await evaluate(historyWith())).status, expected);
    const contradictory = await evaluate(historyWith(observedTurn(probe)));
    assert.equal(contradictory.status, 'inconsistent_evidence');
    assert.equal(contradictory.exact_response, false);
  }
});

test('route, payload and probe mutations fail before any evidence can be accepted', async t => {
  const {state, probe, evaluate} = await fixture(t);
  for (const thread of [
    {...baseline().thread, id: 'another-chat'},
    {...baseline().thread, hostId: 'another-host'},
    {...baseline().thread, kind: 'chatgpt'},
  ]) await assert.rejects(evaluate({...historyWith(observedTurn(probe)), thread}));
  for (const mutate of [
    copy => {copy.expected_response = 'another-marker';},
    copy => {copy.plan.host_args.prompt += ' changed';},
    copy => {copy.baseline.status = 'active';},
    copy => {copy.plan.payload_digest = '0'.repeat(64);},
  ]) {
    const copy = structuredClone(probe); mutate(copy);
    await assert.rejects(evaluateNativeProbe({probe: copy, history: historyWith(observedTurn(probe))}, {state, now}));
  }
});

test('CLI verifies from the durable checkpoint and emits metadata without transcript text', async t => {
  const {state, probe} = await fixture(t);
  const script = fileURLToPath(new URL('./probe.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [script, 'verify'], {encoding: 'utf8',
    input: JSON.stringify({probe, history: historyWith(observedTurn(probe)), state_root: state.root})});
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).status, 'response_verified');
  assert(!result.stdout.includes('Native host delegation envelope.'));
  assert(!result.stdout.includes(probe.expected_response));
});

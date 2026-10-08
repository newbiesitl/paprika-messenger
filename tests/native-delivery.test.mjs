import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { prepareBoardPost, prepareStoredDelivery, prepareDirectDelivery, validateRoutes,
  selectNotificationTransport } from '../skills/paprika-messenger/scripts/prepare-delivery.mjs';
import { NotificationState } from '../skills/paprika-messenger/scripts/notification-state.mjs';
import { SqliteD1 } from './d1-adapter.mjs';
import { loadMigrations } from './migrations.mjs';
import { BoardService } from '../src/service.mjs';

const env = {CODEX_THREAD_ID: 'current-chat'};
const sender = {id: 'sender', board: 'main', thread_id: 'current-chat', label: 'Sender'};
const recipient = {id: 'receiver', board: 'main', thread_id: 'recipient-chat'};
const route = {deployment: 'verified-service', board: 'main', sender, recipient,
  destination: {thread_id: 'recipient-chat', source: 'read_thread'}, subscriptions: []};
const direct = (changes = {}) => prepareDirectDelivery({...route, request_id: 'request-1', body: 'Exact requested text.', ...changes}, env);
const stateFixture = async () => new NotificationState(await mkdtemp(join(tmpdir(), 'paprika-native-')));
async function boardFixture() {
  const db = new SqliteD1(); db.connection.exec(await loadMigrations());
  const service = new BoardService(db, 'owner');
  for (const p of [sender, recipient]) await service.register_participant({board: p.board,
    participant_id: p.id, label: p.label ?? 'Receiver', kind: 'thread', thread_id: p.thread_id});
  return {db, service};
}

test('routes require current host sender metadata and exact destination verification', () => {
  assert.equal(validateRoutes(route, env).participant_id, 'sender');
  for (const bad of [
    {...route, sender: {...sender, thread_id: 'another-chat'}},
    {...route, sender: {...sender, board: 'other'}},
    {...route, recipient: {...recipient, thread_id: null}},
    {...route, destination: {thread_id: 'guessed-chat', source: 'read_thread'}},
    {...route, destination: {thread_id: 'recipient-chat', source: 'title_match'}},
    {...route, destination: {thread_id: 'recipient-chat', source: 'read_thread', host_id: '../host'}},
  ]) assert.throws(() => validateRoutes(bad, env));
  assert.throws(() => validateRoutes(route, {}), /unavailable/);
  const verifiedHost = direct({destination: {...route.destination, host_id: 'verified-host'}});
  assert.equal(verifiedHost.host_args.hostId, 'verified-host');
  assert(!Object.hasOwn(verifiedHost.host_args, 'model')); assert(!Object.hasOwn(verifiedHost.host_args, 'thinking'));
});

test('direct text includes a confirmed reply address without requiring any board post', async () => {
  const {db, service} = await boardFixture();
  try {
    const plan = direct();
    assert(plan.host_args.prompt.endsWith('Exact requested text.'));
    assert(plan.host_args.prompt.includes('"receiver_thread_id":"current-chat"'));
    assert.equal((await service.get_inbox({board: 'main', receiver_id: 'receiver'})).messages.length, 0);
    const state = await stateFixture();
    const attempt = await state.begin(plan, {available: true});
    await state.record(plan, {attempt_id: attempt.checkpoint.attempt_id, state: 'submitted', confirmation: {thread_id: 'recipient-chat'}});
    const checkpoint = await readFile(state.path(plan), 'utf8');
    assert(!checkpoint.includes('Exact requested text.')); assert(!checkpoint.includes('host_args'));
    assert.equal((await state.begin(plan, {available: true})).action, 'skip');
    assert.equal((await service.get_inbox({board: 'main', receiver_id: 'receiver'})).messages.length, 0);
  } finally {db.close();}
});

test('board write must confirm storage before a native plan and same-key retry recovers a lost result', async () => {
  const {db, service} = await boardFixture();
  try {
    const payload = prepareBoardPost({...route, idempotency_key: 'one-post', body: 'Full message', topic: 'Test'}, env);
    assert(payload.body.includes('"participant_id":"sender"'));
    const stored = await service.post_message(payload); // Simulate losing this response.
    const retry = await service.post_message(payload);
    assert.equal(retry.duplicate, true); assert.equal(retry.message.id, stored.message.id);
    const plan = prepareStoredDelivery({...route, message: retry.message}, env);
    assert.equal(plan.key, stored.message.id); assert(!plan.host_args.prompt.includes('Full message'));
    assert.throws(() => prepareStoredDelivery({...route, message: {...stored.message, created_at: undefined}}, env), /confirmed/);
    assert.throws(() => prepareStoredDelivery({...route, message: {...stored.message, sender_id: 'wrong'}}, env));
    assert.throws(() => prepareStoredDelivery({...route, message: {...stored.message, receiver_id: 'wrong'}}, env));
    assert.throws(() => prepareStoredDelivery({...route, message: {...stored.message, deleted_at: '2026-10-05'}}, env));
    await assert.rejects(service.post_message({...payload, body: 'Changed retry'}), {code: 'idempotency_conflict'});
    assert.equal((await service.get_message({board: 'main', message_id: plan.key})).acknowledgments.length, 0);
  } finally {db.close();}
});

test('failed board write prevents notification preparation and creates no checkpoint', async () => {
  const {db, service} = await boardFixture();
  try {
    const state = await stateFixture(); let nativeSends = 0;
    await assert.rejects(async () => {
      const stored = await service.post_message({board: 'main', sender_id: 'sender', sender_label: 'Sender',
        receiver_id: 'missing', topic: 'Test', body: 'Message', idempotency_key: 'failed-post'});
      const plan = prepareStoredDelivery({...route, message: stored.message}, env);
      if ((await state.begin(plan, {available: true})).action === 'send') nativeSends++;
    }, {code: 'participant_not_found'});
    assert.equal(nativeSends, 0);
  } finally {db.close();}
});

test('one notification transport preserves event receivers, even when paused', () => {
  const subscription = {board: 'main', receiver_id: 'receiver', active: true, paused: true, expires_at: 10000};
  assert.equal(selectNotificationTransport({recipient, subscriptions: [subscription]}, 1000), 'events');
  assert.equal(selectNotificationTransport({recipient, subscriptions: [{...subscription, expires_at: null}]}, 100000000), 'events');
  assert.equal(selectNotificationTransport({recipient, subscriptions: [{...subscription, expires_at: undefined}]}, 1000), 'native');
  for (const changed of [{...subscription, active: false}, {...subscription, expires_at: 999}, {...subscription, receiver_id: 'other'}, {...subscription, board: 'other'}])
    assert.equal(selectNotificationTransport({recipient, subscriptions: [changed]}, 1000), 'native');
  assert.throws(() => selectNotificationTransport({recipient}), /discovery/);
});

test('missing native capability keeps board storage separate and can resume when available', async () => {
  const {db, service} = await boardFixture();
  try {
    const {message} = await service.post_message(prepareBoardPost({...route, topic: 'Test', body: 'Stored safely', idempotency_key: 'offline'}, env));
    const plan = prepareStoredDelivery({...route, message}, env), state = await stateFixture();
    assert.equal((await state.begin(plan, {available: false})).checkpoint.state, 'unavailable');
    assert.equal((await service.get_message({board: 'main', message_id: message.id})).message.id, message.id);
    assert.equal((await state.begin(plan, {available: true})).action, 'send');
  } finally {db.close();}
});

test('uncertain native sends reconcile exact history and never retry on missing receipt or absent summary', async () => {
  const state = await stateFixture(), plan = direct();
  const attempt = await state.begin(plan, {available: true});
  await state.record(plan, {attempt_id: attempt.checkpoint.attempt_id, state: 'unknown'});
  assert.equal((await state.begin(plan, {available: true, retry: true})).action, 'reconcile');
  assert.equal((await state.begin(plan, {available: false})).checkpoint.state, 'unknown');
  const evidence = {thread_id: plan.recipient_thread_id, reference: plan.reference, evidence_id: 'host-turn-1'};
  for (const outcome of ['not_found', 'inconclusive']) {
    assert.equal((await state.reconcile(plan, {...evidence, outcome})).checkpoint.state, 'unknown');
    assert.equal((await state.begin(plan, {available: true, retry: true})).action, 'reconcile');
  }
  await assert.rejects(state.reconcile(plan, {...evidence, outcome: 'found', thread_id: 'other'}));
  await assert.rejects(state.reconcile(plan, {...evidence, outcome: 'found', reference: 'another message'}));
  assert.equal((await state.reconcile(plan, {...evidence, outcome: 'found'})).checkpoint.state, 'submitted');
  assert.equal((await state.begin(plan, {available: true})).action, 'skip');
});

test('submitting checkpoint survives a process restart and suppresses concurrent duplicate sends', async () => {
  const state = await stateFixture(), plan = direct();
  const results = await Promise.allSettled(Array.from({length: 12}, () => state.begin(plan, {available: true})));
  assert.equal(results.filter(r => r.status === 'fulfilled' && r.value.action === 'send').length, 1);
  assert(results.every(r => r.status === 'fulfilled' || /locked/.test(r.reason.message)));
  assert.equal((await new NotificationState(state.root).begin(plan, {available: true})).action, 'reconcile');
});

test('explicit failures, stale attempts, route conflicts and checkpoint tampering are guarded', async () => {
  const state = await stateFixture(), plan = direct(), first = await state.begin(plan, {available: true});
  await assert.rejects(state.record(plan, {attempt_id: first.checkpoint.attempt_id, state: 'submitted', confirmation: {thread_id: 'other'}}));
  await state.record(plan, {attempt_id: first.checkpoint.attempt_id, state: 'failed'});
  assert.equal((await state.begin(plan, {available: true})).action, 'failed');
  const retry = await state.begin(plan, {available: true, retry: true});
  await assert.rejects(state.record(plan, {attempt_id: first.checkpoint.attempt_id, state: 'submitted', confirmation: {thread_id: 'recipient-chat'}}));
  await assert.rejects(state.read(direct({body: 'Changed text'})), /conflict/);
  assert.notEqual(state.path(plan), state.path(direct({deployment: 'other-service'})));
  await assert.rejects(state.read({...plan, key: '../escape'}));
  await assert.rejects(state.begin({...plan, host_args: {...plan.host_args, threadId: 'other'}}, {available: true}));
  await state.record(plan, {attempt_id: retry.checkpoint.attempt_id, state: 'submitted', confirmation: {thread_id: 'recipient-chat', token: 'secret'}});
  assert(!((await readFile(state.path(plan), 'utf8')).includes('secret')));
});

test('legacy checkpoints remain authoritative after upgrading the helper', async () => {
  const state = await stateFixture();
  const plan = {...direct(), mode: 'board', key: 'stored-message', reference: 'New Paprika Messenger message on board main: stored-message.'};
  const directory = join(state.root, 'notifications'); await mkdir(directory);
  const legacy = {deployment: plan.deployment, board: plan.board, message_id: plan.key,
    recipient_id: plan.recipient_id, recipient_thread_id: plan.recipient_thread_id, state: 'submitting'};
  await writeFile(join(directory, `${plan.key}.json`), JSON.stringify(legacy));
  assert.equal((await state.begin(plan, {available: true})).action, 'reconcile');
  await writeFile(join(directory, `${plan.key}.json`), JSON.stringify({...legacy, state: 'submitted'}));
  assert.equal((await state.begin(plan, {available: true})).action, 'skip');
  await writeFile(join(directory, `${plan.key}.json`), JSON.stringify({...legacy, recipient_thread_id: 'other'}));
  await assert.rejects(state.read(plan), /Legacy checkpoint conflict/);
});

test('local CLI validates plans and atomically persists checkpoints on the calling host', async () => {
  const state = await stateFixture();
  const script = name => fileURLToPath(new URL(`../skills/paprika-messenger/scripts/${name}.mjs`, import.meta.url));
  const prepared = spawnSync(process.execPath, [script('prepare-delivery'), 'direct'], {
    env: {...process.env, ...env}, input: JSON.stringify({...route, request_id: 'cli-request', body: 'CLI text'}), encoding: 'utf8', windowsHide: true});
  assert.equal(prepared.status, 0, prepared.stderr);
  const plan = JSON.parse(prepared.stdout);
  const checkpoint = spawnSync(process.execPath, [script('notification-state'), 'begin'], {
    cwd: state.root, input: JSON.stringify({plan, available: true}), encoding: 'utf8', windowsHide: true});
  assert.equal(checkpoint.status, 0, checkpoint.stderr);
  assert.equal(JSON.parse(checkpoint.stdout).action, 'send');
  const malformed = spawnSync(process.execPath, [script('prepare-delivery'), 'direct'], {
    env: {...process.env, ...env}, input: '{', encoding: 'utf8', windowsHide: true});
  assert.notEqual(malformed.status, 0);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { detectSession, nativeThreadEvidence, simulatedHostEvidence, verifyReceiving } from './session-context.mjs';

const id = 'current-pilot-thread', now = Date.now();
const detect = facts => detectSession(id, [simulatedHostEvidence(id, facts, now)], now);
for (const product of ['codex', 'chatgpt']) for (const orchestration of ['local', 'cloud']) {
  test(`simulated host contract distinguishes ${product} ${orchestration}`, () => {
    const result = detect({ product, orchestration, execution: orchestration });
    assert.equal(result.session_type, `${product}_${orchestration}`);
    assert.equal(result.evidence_scope, 'simulation');
  });
}
test('cloud orchestration with local tools stays cloud; remote tools alone do not imply cloud', () => {
  assert.equal(detect({ product: 'chatgpt', orchestration: 'cloud', execution: 'local' }).session_type, 'chatgpt_cloud');
  assert.equal(detect({ product: 'codex', orchestration: 'local', execution: 'remote' }).session_type, 'codex_local');
  assert.equal(detect({ product: 'codex', execution: 'cloud' }).session_type, 'unknown');
});
test('native product metadata, local hostId and local paths do not invent a missing mode', () => {
  const result = detectSession(id, [nativeThreadEvidence({ id, kind: 'codex', hostId: 'local', cwd: 'C:/project',
    title: 'ChatGPT Cloud', originator: 'Codex Desktop' }, id, now)], now);
  assert.equal(result.product, 'codex'); assert.equal(result.orchestration, 'unknown'); assert.equal(result.session_type, 'unknown');
});
test('forged JSON evidence, stale context, conflicting mode and wrong conversation are rejected', () => {
  const original = simulatedHostEvidence(id, { product: 'codex', orchestration: 'local' }, now);
  assert.equal(detectSession(id, [JSON.parse(JSON.stringify(original))], now).session_type, 'unknown');
  assert.equal(detectSession(id, [simulatedHostEvidence(id, { product: 'codex', orchestration: 'local' }, now - 300001)], now).session_type, 'unknown');
  assert.equal(detectSession(id, [original, simulatedHostEvidence(id, { product: 'codex', orchestration: 'cloud' }, now)], now).confidence, 'conflicting');
  assert.deepEqual(detectSession(id, [original, simulatedHostEvidence('other-thread', { product: 'chatgpt' }, now)], now).conflicts, ['wrong_conversation']);
});

function route() {
  const target = { thread_id: id, board: 'test', receiver_id: 'receiver' };
  const detection = { session_type: 'unknown', evidence_scope: 'none', conflicts: [] };
  const inbox = { board: 'test', receiver_id: 'receiver', authenticated: true };
  const hostBinding = { ...target, enabled: true, verified: true, unscheduled: true, cadence_minutes: null,
    subscription_id: 'sub-test', scope: 'live' };
  const backend = { board: 'test', receiver_id: 'receiver', state: 'ready', notification_ready: true,
    subscriptions: [{ id: 'sub-test', active: true, paused: false, limited: false, expired: false, refresh_before: new Date(now + 60000).toISOString() }] };
  return { target, detection, inbox, hostBinding, backend, now };
}
test('mode-unreported host may use a verified exact live event route, without creating polling', () => {
  const result = verifyReceiving(route()); assert.equal(result.state, 'incoming_ready'); assert.equal(result.create_heartbeat, false);
});
test('backend ready cannot enable a different chat or receiver, scheduled trigger, or missing host task', () => {
  for (const patch of [{ thread_id: 'other' }, { receiver_id: 'other' }, { cadence_minutes: 5 },
    { unscheduled: false }, { enabled: false }, { verified: false }, { subscription_id: 'wrong' }]) {
    const data = route(); Object.assign(data.hostBinding, patch);
    const result = verifyReceiving(data); assert.equal(result.state, 'pending'); assert.equal(result.create_heartbeat, false);
  }
  const data = route(); data.hostBinding = null; assert.equal(verifyReceiving(data).state, 'pending');
});
test('expired, paused, limited or unverified inbox keeps setup pending; simulation never makes a live route ready', () => {
  for (const patch of [{ active: false }, { paused: true }, { limited: true }, { refresh_before: new Date(now - 1).toISOString() }]) {
    const data = route(); Object.assign(data.backend.subscriptions[0], patch); assert.equal(verifyReceiving(data).state, 'pending');
  }
  const unauthenticated = route(); unauthenticated.inbox.authenticated = false; assert.equal(verifyReceiving(unauthenticated).state, 'pending');
  const simulated = route(); simulated.detection = detect({ product: 'chatgpt', orchestration: 'cloud' });
  assert.equal(verifyReceiving(simulated).state, 'pending');
  const fixture = route(); fixture.scope = 'fixture'; fixture.hostBinding.scope = 'fixture';
  const result = verifyReceiving(fixture); assert.equal(result.state, 'pilot_ready');
  assert.equal(result.production_ready, false); assert.equal(result.may_send_handshake, false);
});

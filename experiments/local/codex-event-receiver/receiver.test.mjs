import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { webhookSignature } from '../../../src/webhooks.mjs';
import { PilotReceiver } from './receiver.mjs';

async function fixture(onEvent = async () => {}) {
  const secret = `whsec_${randomBytes(32).toString('base64')}`, token = randomBytes(32).toString('base64url');
  const receiver = new PilotReceiver({ board: 'main', receiverId: 'pilot-receiver', secret, token,
    readMessage: async args => ({ message: { id: args.message_id, board: 'main', receiver_id: 'pilot-receiver', body: 'Only this receiver.' } }), onEvent });
  await receiver.start(); receiver.subscriptionId = 'sub_pilot';
  const event = { eventId: randomUUID(), name: 'message.created',
    data: { board: 'main', receiver_id: 'pilot-receiver', message_id: randomUUID(), sequence: 1, notification_mode: 'notify_only' } };
  async function send(value = event, { seconds = String(Math.floor(Date.now() / 1000)), ...changes } = {}) {
    const body = JSON.stringify(value);
    const headers = { 'Content-Type': 'application/json', 'webhook-id': value.eventId ?? `verification_${randomUUID()}`,
      'webhook-timestamp': seconds, 'X-MCP-Subscription-Id': receiver.subscriptionId };
    headers['webhook-signature'] = await webhookSignature(secret, headers['webhook-id'], seconds, body);
    return fetch(`${receiver.origin}/wake`, { method: 'POST', headers: { ...headers, ...changes }, body });
  }
  const call = (args, authorization = `Bearer ${token}`) => fetch(`${receiver.origin}/mcp`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: authorization },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_pilot_message', arguments: args } }) });
  return { receiver, event, send, call };
}

test('signed challenge verifies without waking; invalid, stale and cross-receiver events never wake', async () => {
  let calls = 0; const f = await fixture(async () => { calls++; });
  try {
    const challenge = await f.send({ type: 'verification', challenge: randomUUID() });
    assert.equal(challenge.status, 200); assert.equal(typeof (await challenge.json()).challenge, 'string');
    assert.equal((await f.send(f.event, { 'webhook-signature': 'v1,invalid' })).status, 401);
    assert.equal((await f.send(f.event, { seconds: String(Math.floor(Date.now() / 1000) - 301) })).status, 401);
    assert.equal((await f.send(f.event, { 'X-MCP-Subscription-Id': 'sub_other' })).status, 401);
    assert.equal((await f.send({ ...f.event, data: { ...f.event.data, receiver_id: 'someone-else' } })).status, 400);
    assert.equal(calls, 0); assert.equal(f.receiver.wakeCount, 0);
  } finally { await f.receiver.close(); }
});

test('concurrent duplicate event and duplicate message IDs cause one wake, with an explicit turn budget', async () => {
  let calls = 0; const f = await fixture(async () => { calls++; });
  try {
    assert.deepEqual((await Promise.all([f.send(), f.send()])).map(r => r.status), [200, 200]);
    assert.equal((await f.send({ ...f.event, eventId: randomUUID() })).status, 200);
    assert.equal((await f.send({ ...f.event, eventId: randomUUID(), data: { ...f.event.data, message_id: randomUUID() } })).status, 429);
    await f.receiver.settle(); assert.equal(calls, 1); assert.equal(f.receiver.wakeCount, 1);
    assert.equal(f.receiver.trace.filter(r => r.stage === 'duplicate_ignored').length, 2);
  } finally { await f.receiver.close(); }
});

test('authenticated reads are confined to the exact event message; disabling the receiver stops incoming events', async () => {
  const f = await fixture();
  const args = { board: 'main', receiver_id: 'pilot-receiver', message_id: f.event.data.message_id };
  try {
    assert.equal((await f.call(args, 'Bearer invalid')).status, 401);
    assert((await (await f.call(args)).json()).error);
    await f.send();
    assert((await (await f.call({ ...args, receiver_id: 'another-receiver' })).json()).error);
    assert((await (await f.call({ ...args, message_id: randomUUID() })).json()).error);
    const read = await (await f.call(args)).json(); assert.equal(read.result.isError, false);
    assert.equal(f.receiver.trace.filter(r => r.stage === 'message_fetched').length, 1);
    f.receiver.enabled = false; assert.equal((await f.send()).status, 410);
  } finally { await f.receiver.close(); }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {SqliteD1} from './d1-adapter.mjs';
import {loadMigrations} from './migrations.mjs';
import {BoardService} from '../src/service.mjs';
import {prepareBridgeDelivery} from '../skills/paprika-messenger/scripts/prepare-bridge.mjs';
import {NotificationState} from '../skills/paprika-messenger/scripts/notification-state.mjs';

// Invented participants only. These tests never call a host send or a live service.
const sender = {board:'main', id:'relay', thread_id:'executing-relay', label:'Relay'};
const originalSender = {board:'main', id:'original', thread_id:'original-agent', label:'Original'};
const env = {CODEX_THREAD_ID:sender.thread_id};
const conversation = '11111111-2222-4333-8444-555555555555';
const history = (id='receiver-thread', kind='codex') => ({schemaVersion:1,
  thread:{id, kind, status:{type:'idle'}, ...(kind === 'codex' ? {hostId:'local'} : {})}, turns:[]});

async function fixture(t, mapped=false) {
  const db = new SqliteD1(); db.connection.exec(await loadMigrations()); t.after(()=>db.close());
  const service = new BoardService(db, 'owner');
  for (const participant of [sender, originalSender,
    {board:'main', id:'receiver', thread_id:'receiver-thread', label:'Receiver'}])
    await service.register_participant({board:participant.board, participant_id:participant.id,
      thread_id:participant.thread_id, label:participant.label, kind:'thread'});
  if (mapped) await service.set_recipient_conversation({board:'main', participant_id:'receiver',
    registered_thread_id:'receiver-thread', conversation,
    host_observation:{id:conversation, kind:'chatgpt'}, expected_revision:0});
  const {message} = await service.post_message({board:'main', sender_id:'original', sender_label:'Original',
    receiver_id:'receiver', topic:'Fixture', body:'Private fixture body. Do not include it in the notification.'});
  const input = {deployment:'https://messenger.example.test', board:'main', mode:'relay',
    receiver_id:'receiver', target_kind:mapped ? 'chatgpt' : 'codex', sender, original_sender:originalSender,
    recipient_record:await service.get_recipient({board:'main', participant_id:'receiver'}),
    history:history(mapped ? conversation : undefined, mapped ? 'chatgpt' : undefined),
    message:(await service.get_message({board:'main', message_id:message.id})).message, subscriptions:[]};
  return {db, service, input};
}

test('an explicit relay preserves the original message and attributes the executing sender', async t=>{
  const {db, service, input} = await fixture(t);
  const before = JSON.stringify(input);
  const storedBefore = db.connection.prepare('SELECT * FROM messages').all();
  const eventsBefore = db.connection.prepare('SELECT COUNT(*) n FROM events').get().n;
  const plan = prepareBridgeDelivery(input, env);
  assert.equal(plan.mode, 'board'); assert.equal(plan.transport, 'native');
  assert.equal(plan.key, input.message.id); assert.equal(plan.original_message_id, input.message.id);
  assert.equal(plan.sender_id, sender.id); assert.equal(plan.sender_thread_id, sender.thread_id);
  assert.equal(plan.original_sender_id, originalSender.id);
  assert.equal(plan.original_sender_thread_id, originalSender.thread_id);
  assert.equal(plan.delivery_kind, 'relay');
  assert.equal(plan.host_args.threadId, 'receiver-thread'); assert.equal(plan.host_args.hostId, 'local');
  assert(plan.host_args.prompt.includes(input.message.id));
  assert(plan.host_args.prompt.startsWith('From: "Original" · Sender ID: original\n'));
  assert(!plan.host_args.prompt.startsWith('From: "Relay"'));
  assert(plan.host_args.prompt.includes('"relay_id":"relay"'));
  assert(plan.host_args.prompt.includes('"original_sender_id":"original"'));
  assert(!plan.host_args.prompt.includes(input.message.body));
  assert(!Object.hasOwn(plan.host_args, 'model')); assert(!Object.hasOwn(plan.host_args, 'thinking'));
  assert.equal(JSON.stringify(input), before);
  assert.deepEqual(db.connection.prepare('SELECT * FROM messages').all(), storedBefore);
  assert.equal(db.connection.prepare('SELECT COUNT(*) n FROM events').get().n, eventsBefore);
  assert.equal((await service.get_message({board:'main', message_id:input.message.id})).acknowledgments.length, 0);
});

test('relay preparation keeps the sender guard and rejects mismatched author, message and recipient evidence', async t=>{
  const {input} = await fixture(t);
  assert.throws(()=>prepareBridgeDelivery({...input, mode:'board', sender:originalSender}, env), /Sender route conflicts/);
  assert.throws(()=>prepareBridgeDelivery({...input, mode:'board'}, env), /confirmed/);
  for (const change of [
    {sender:originalSender}, {original_sender:undefined},
    {sender:{...sender, unregistered_at:'2026-01-01T00:00:00Z'}},
    {recipient_record:{...input.recipient_record,
      recipient:{...input.recipient_record.recipient, registration_status:'unregistered'}}},
    {original_sender:{...originalSender, board:'other'}},
    {original_sender:{...originalSender, id:'wrong'}},
    {original_sender:{...originalSender, thread_id:'../invalid'}},
    {original_sender:sender, message:{...input.message, sender_id:sender.id}},
    {message:{...input.message, sender_id:'wrong'}},
    {message:{...input.message, board:'other'}},
    {message:{...input.message, receiver_id:'wrong'}},
    {message:{...input.message, created_at:undefined}},
    {message:{...input.message, deleted_at:'2026-01-01T00:00:00Z'}},
    {subscriptions:undefined},
    {history:history('wrong-thread')},
    {history:{...history(), thread:{...history().thread, status:{type:'running'}}}},
  ]) assert.throws(()=>prepareBridgeDelivery({...input, ...change}, env));
  assert.throws(()=>prepareBridgeDelivery(input, {CODEX_THREAD_ID:'someone-else'}), /Sender route conflicts/);
});

test('an existing event subscription remains the only relay notification transport, including while paused', async t=>{
  const {input} = await fixture(t);
  for (const paused of [false, true]) {
    const subscriptions = [{board:'main', receiver_id:'receiver', active:true, paused, expires_at:null}];
    const plan = prepareBridgeDelivery({...input, subscriptions}, env);
    assert.equal(plan.transport, 'events');
    const state = new NotificationState(await mkdtemp(join(tmpdir(), 'paprika-relay-events-')));
    await assert.rejects(state.begin(plan, {available:true}), /native delivery/);
  }
});

test('relay checkpoints retain both actors and suppress restarts, new request IDs and changed correlation', async t=>{
  const {input} = await fixture(t);
  const plan = prepareBridgeDelivery(input, env);
  const state = new NotificationState(await mkdtemp(join(tmpdir(), 'paprika-relay-')));
  const attempt = await state.begin(plan, {available:true});
  assert.equal(attempt.action, 'send');
  await state.record(plan, {attempt_id:attempt.checkpoint.attempt_id, state:'unknown'});
  const restarted = new NotificationState(state.root);
  const newRequest = prepareBridgeDelivery({...input, request_id:'fresh-request'}, env);
  assert.equal(state.path(newRequest), state.path(plan));
  assert.equal((await restarted.begin(newRequest, {available:true, retry:true})).action, 'reconcile');
  const saved = JSON.parse(await readFile(state.path(plan), 'utf8'));
  assert.equal(saved.sender_id, sender.id); assert.equal(saved.original_sender_id, originalSender.id);
  assert.equal(saved.original_message_id, input.message.id);
  assert.equal(saved.original_sender_thread_id, originalSender.thread_id);
  assert(!JSON.stringify(saved).includes(input.message.body)); assert(!Object.hasOwn(saved, 'host_args'));
  for (const change of [{original_message_id:'another-message'}, {original_sender_id:'another-author'},
    {original_sender_thread_id:'another-thread'}, {delivery_kind:undefined}])
    await assert.rejects(restarted.begin({...plan, ...change}, {available:true}), /relay|correlation|conflict/i);
  await restarted.reconcile(plan, {thread_id:'receiver-thread', reference:plan.reference,
    outcome:'found', evidence_id:'verified-turn'});
  assert.equal((await restarted.begin(plan, {available:true})).action, 'skip');
});

test('relays use the mapped ChatGPT destination and retain the original author separately', async t=>{
  const {input} = await fixture(t, true);
  const plan = prepareBridgeDelivery(input, env);
  assert.equal(plan.host_args.threadId, conversation); assert.equal(plan.host_args.hostId, undefined);
  assert.equal(plan.registered_thread_id, 'receiver-thread'); assert.equal(plan.mapping_revision, 1);
  assert.equal(plan.native_kind, 'chatgpt'); assert.equal(plan.original_sender_id, 'original');
  assert.equal(plan.conversation_link.conversation_id, conversation);
});

test('the installed bridge CLI can prepare an own-identity relay without invoking a host send', async t=>{
  const {input} = await fixture(t);
  const script = fileURLToPath(new URL('../skills/paprika-messenger/scripts/prepare-bridge.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [script], {input:JSON.stringify(input),
    env:{...process.env, ...env}, encoding:'utf8', windowsHide:true});
  assert.equal(result.status, 0, result.stderr);
  const plan = JSON.parse(result.stdout);
  assert.equal(plan.sender_id, 'relay'); assert.equal(plan.original_sender_id, 'original');
  assert.equal(plan.key, input.message.id);
});

test('a relay must refresh conflicting cached host metadata from its current native discovery', async t=>{
  const {input} = await fixture(t);
  const discovered = {...input.history, thread:{...input.history.thread, hostId:'connected-peer'}};
  const stale = {...input.recipient_record, recipient:{...input.recipient_record.recipient, host_id:'local'}};
  assert.throws(()=>prepareBridgeDelivery({...input, history:discovered, recipient_record:stale}, env),
    /Refresh stale recipient host metadata/);
  const refreshed = {...stale, recipient:{...stale.recipient, host_id:'connected-peer'}};
  const plan = prepareBridgeDelivery({...input, history:discovered, recipient_record:refreshed}, env);
  assert.equal(plan.host_args.hostId, 'connected-peer');
  assert.equal(plan.host_args.threadId, input.recipient_record.recipient.thread_id);
  assert.equal(input.recipient_record.recipient.host_id, null);
  assert.throws(()=>prepareBridgeDelivery({...input, history:{error:'host unavailable'}}, env), /native history/);
});

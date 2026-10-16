import test from 'node:test';
import {SqliteD1} from './d1-adapter.mjs';
import {loadMigrations} from './migrations.mjs';
import {BoardService} from '../src/service.mjs';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,stat} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {AdaptiveDelivery,deliveryPolicy,verifyReferencedMessage} from '../skills/paprika-messenger/scripts/adaptive-delivery.mjs';
import {prepareDirectDelivery} from '../skills/paprika-messenger/scripts/prepare-delivery.mjs';
const env={CODEX_THREAD_ID:'fixture-sender-chat'};
const sender={id:'sender',thread_id:env.CODEX_THREAD_ID,board:'main',label:'Registered sender'};
const recipient={id:'recipient',thread_id:'fixture-recipient-chat',board:'main',label:'Recipient'};
const input=(changes={})=>({deployment:'https://example.invalid',board:'main',request_id:'task-1',sender,recipient,
  destination:{source:'read_thread',thread_id:recipient.thread_id,host_id:'local',kind:'codex'},subscriptions:[],topic:'Task',body:'Long secret payload. '.repeat(100),...changes});
const caps={service_available:true,retrieval_available:true,native_available:true,subscriptions:[]};
const confirmed=post=>({message:{...post,id:'stored-1',created_at:'2026-01-01T00:00:00Z'}});
async function fixture(t,changes={}) {
  const root=await mkdtemp(join(tmpdir(),'adaptive-fixture-')); t.after(()=>rm(root,{recursive:true,force:true}));
  const state=new AdaptiveDelivery(root), data=input(changes); await state.start(data,env); return {state,data,root};
}
test('exact inclusive code point boundary counts astral, combining, CRLF and original whitespace without normalization',()=>{
  for(const n of [1499,1500,1501]) assert.equal(deliveryPolicy('x'.repeat(n)).mode,n<=1500?'inline':'reference');
  assert.equal(deliveryPolicy('😀'.repeat(1500)).mode,'inline');
  assert.equal(deliveryPolicy('😀'.repeat(1501)).code_points,1501);
  assert.equal(deliveryPolicy('e\u0301\r\n ').code_points,5);
  assert.equal(deliveryPolicy('small',{force_reference:true}).mode,'reference');
  assert.throws(()=>deliveryPolicy('x',{force_inline:true}));
  assert.throws(()=>prepareDirectDelivery(input(),env),/Reference delivery required/);
});
test('reference operation stores intact original text plus existing reply correlation before exposing a body-free native prompt',async t=>{
  const {state,data}=await fixture(t,{body:' \n'+input().body+'\n '});
  assert.equal((await state.next(data,{},env)).status,'setup_required');
  const post=await state.next(data,caps,env);
  assert.equal(post.status,'store'); assert(post.arguments.body.startsWith(data.body));
  assert.equal((await state.next(data,caps,env)).status,'storage_unconfirmed');
  assert.equal((await state.recordStorage(data,confirmed(post.arguments))).status,'stored');
  const native=await state.next(data,caps,env), prompt=native.arguments.prompt;
  for(const secret of [data.body,'Long secret payload.']) assert(!prompt.includes(secret));
  for(const expected of ['stored-1','main','Receiver ID: recipient','Sender ID: sender','get_message','verify board']) assert(prompt.includes(expected));
  const fetched=verifyReferencedMessage({board:'main',message_id:'stored-1',receiver_id:recipient.id,result:confirmed(post.arguments)});
  assert(fetched.body.startsWith(data.body));
  await state.recordNative(data,{attempt_id:native.attempt_id,state:'submitted',confirmation:{thread_id:recipient.thread_id}});
  assert.equal((await state.next(data,caps,env)).status,'skip');
});
test('storage errors and unavailable retrieval preserve the task without inline leakage or a second post key',async t=>{
  const {state,data}=await fixture(t);
  assert.equal((await state.next(data,{...caps,retrieval_available:false},env)).status,'setup_required');
  const first=await state.next(data,caps,env);
  await state.recordStorage(data,{isError:true});
  assert.equal((await state.next(data,caps,env)).status,'storage_unconfirmed');
  const retry=await state.next(data,{...caps,retry_storage:true},env);
  assert.deepEqual(retry.arguments,first.arguments);
  assert.equal((await state.recordStorage(data,{message:{...confirmed(first.arguments).message,receiver_id:'wrong'}})).status,'storage_unconfirmed');
  assert.equal((await state.recordStorage(data,confirmed(first.arguments))).status,'stored');
  assert.equal((await state.next(data,{...caps,native_available:false},env)).status,'unavailable');
  assert.equal((await state.next(data,caps,env)).status,'send');
});
test('policy and exact native arguments survive restart, concurrent attempts and uncertainty without duplicate wakes or mode switches',async t=>{
  const {state,data,root}=await fixture(t,{body:'Short task.'});
  const racing=await Promise.allSettled(Array.from({length:4},()=>state.next(data,caps,env)));
  assert.equal(racing.filter(r=>r.status==='fulfilled' && r.value.status==='send').length,1);
  const first=racing.find(r=>r.status==='fulfilled' && r.value.status==='send').value, journal=await readFile(state.path(data),'utf8');
  assert(journal.includes('Short task.')); if(process.platform!=='win32') assert.equal((await stat(state.path(data))).mode&0o777,0o600);
  await assert.rejects(state.start({...data,delivery_policy:{force_reference:true}},env),/conflict/);
  await state.recordNative(data,{attempt_id:first.attempt_id,state:'unknown'});
  const restored=new AdaptiveDelivery(root);
  assert.equal((await restored.next(data,caps,env)).status,'reconcile');
  const saved=JSON.parse(await readFile(state.path(data),'utf8'));
  assert.deepEqual(saved.plan.host_args,first.arguments);
  assert.equal((await restored.reconcile(data,{thread_id:recipient.thread_id,reference:saved.plan.reference,outcome:'not_found',evidence_id:'page-1'})).status,'unknown');
  assert.equal((await restored.next(data,caps,env)).status,'reconcile');
  await restored.reconcile(data,{thread_id:recipient.thread_id,reference:saved.plan.reference,outcome:'found',evidence_id:'turn-1'});
  assert.equal((await restored.next(data,caps,env)).status,'skip');
});
test('existing event subscription alone owns long-message notification, including paused routes',async t=>{
  const subscriptions=[{board:'main',receiver_id:recipient.id,active:true,paused:true,expires_at:null}];
  const {state,data}=await fixture(t,{subscriptions});
  const post=await state.next(data,caps,env); assert.equal(post.transport,'events');
  await state.recordStorage(data,confirmed(post.arguments));
  assert.equal((await state.next(data,caps,env)).status,'stored_events_only');
});
test('force reference, retrieval mismatch, service body limits and newly activated events never reveal a large task',async t=>{
  for(const result of [undefined,{message:{id:'stored-1',board:'main',receiver_id:'other',body:'wrong',sender_id:'sender'}}])
    assert.throws(()=>verifyReferencedMessage({board:'main',message_id:'stored-1',receiver_id:recipient.id,result}),/blocked/);
  const {state,data}=await fixture(t,{body:'Small.',delivery_policy:{force_reference:true}});
  const post=await state.next(data,caps,env); await state.recordStorage(data,confirmed(post.arguments));
  assert.equal((await state.next(data,{...caps,subscriptions:[{board:'main',receiver_id:recipient.id,active:true,expires_at:null}]},env)).status,'transport_changed');
  const huge=await fixture(t,{request_id:'huge',body:'😀'.repeat(5000)});
  assert.equal((await huge.state.next(huge.data,caps,env)).status,'storage_payload_unsupported');
});

test('missing subscription discovery preserves the task and storage-reported event uncertainty blocks a second transport',async t=>{
  const {state,data}=await fixture(t,{subscriptions:undefined});
  assert.equal((await state.next(data,{},env)).status,'subscription_check_required');
  const post=await state.next(data,caps,env);
  assert.equal(post.status,'store');
  await state.recordStorage(data,{...confirmed(post.arguments),notification:{state:'pending'}});
  assert.equal((await state.next(data,caps,env)).status,'transport_changed');
});


test('adaptive storage uses the real service and idempotent retry, preserving Unicode and reply correlation on retrieval',async t=>{
  const {state,data}=await fixture(t,{body:' \n😀 e\u0301 original task. '.repeat(100)+'\n '});
  const db=new SqliteD1(); t.after(()=>db.close()); db.connection.exec(await loadMigrations());
  const service=new BoardService(db,'fixture-owner');
  for(const p of [sender,recipient]) await service.register_participant({board:'main',participant_id:p.id,label:p.label,kind:'thread',thread_id:p.thread_id});
  const post=await state.next(data,caps,env), stored=await service.post_message(post.arguments);
  const retry=await service.post_message(post.arguments); assert.equal(retry.message.id,stored.message.id); assert.equal(retry.duplicate,true);
  const fetched=await service.get_message({board:'main',message_id:stored.message.id});
  const message=verifyReferencedMessage({board:'main',message_id:stored.message.id,receiver_id:recipient.id,result:fetched});
  assert.equal(message.body,post.arguments.body); assert(message.body.startsWith(data.body));
  await state.recordStorage(data,stored); const native=await state.next(data,caps,env);
  assert.equal(native.status,'send'); assert(!native.arguments.prompt.includes(data.body));
});

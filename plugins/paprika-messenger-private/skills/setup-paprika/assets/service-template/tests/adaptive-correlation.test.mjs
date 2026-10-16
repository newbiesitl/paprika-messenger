import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {SqliteD1} from './d1-adapter.mjs';
import {loadMigrations} from './migrations.mjs';
import {BoardService} from '../src/service.mjs';
import {AdaptiveDelivery} from '../skills/paprika-messenger/scripts/adaptive-delivery.mjs';
import {prepareDirectDelivery} from '../skills/paprika-messenger/scripts/prepare-delivery.mjs';
const actors={sender:{id:'sender',board:'main',label:'Sender',thread_id:'fixture-sender-thread'},receiver:{id:'receiver',board:'main',label:'Receiver',thread_id:'fixture-receiver-thread'}};
const env=sender=>({CODEX_THREAD_ID:sender.thread_id});
const caps={service_available:true,retrieval_available:true,native_available:true,subscriptions:[]};
const route=(sender=actors.sender,recipient=actors.receiver)=>({deployment:'https://example.invalid',board:'main',sender,recipient,subscriptions:[],destination:{source:'read_thread',thread_id:recipient.thread_id,host_id:'local',kind:'codex'}});
async function setup(t) {
  const root=await mkdtemp(join(tmpdir(),'adaptive-correlation-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const db=new SqliteD1();t.after(()=>db.close());db.connection.exec(await loadMigrations());
  const service=new BoardService(db,'fixture-owner'),state=new AdaptiveDelivery(root);
  for(const p of Object.values(actors)) {
    await service.register_participant({board:'main',participant_id:p.id,label:p.label,kind:'thread',thread_id:p.thread_id});
    await service.update_recipient_metadata({board:'main',entries:[{participant_id:p.id,thread_id:p.thread_id,source:'codex',execution_mode:'local',project_status:'unknown'}]});
  }
  return {db,service,state};
}
async function begin(f,input,sender=actors.sender,recipient=actors.receiver) {
  const data={...route(sender,recipient),topic:'Report',...input};
  const started=await f.state.start(data,env(sender));
  return {data,sender,recipient,started,action:await f.state.next(data,caps,env(sender))};
}
async function store(f,operation) {
  const result=await f.service.post_message(operation.action.arguments);
  const status=await f.state.recordStorage(operation.data,result);
  return {result,status,notice:await f.state.next(operation.data,caps,env(operation.sender))};
}
async function chain(f,limit=2) {
  await f.service.configure_collaboration({board:'main',enabled:true,participant_ids:['sender','receiver'],max_handoff_depth:limit,expected_revision:0});
  return (await f.service.start_collaboration({board:'main',initiator_id:'sender',goal:'Fictional authorized task',idempotency_key:'root'})).collaboration;
}
test('direct preparation rejects linked metadata while ordinary one-off short messages stay inline',()=>{
  const ordinary={...route(),request_id:'one-off',body:'Done.'};
  assert.equal(prepareDirectDelivery(ordinary,env(actors.sender)).mode,'direct');
  for(const metadata of [{reply_to_id:'parent-1'},{collaboration_id:'chain-1'},{reply_to_id:'parent-1',collaboration_id:'chain-1'},{reply_to_id:null}])
    assert.throws(()=>prepareDirectDelivery({...ordinary,...metadata},env(actors.sender)),/require confirmed storage\/reference/);
});
test('short replies force storage and retain the exact real parent even with a higher short limit',async t=>{
  const f=await setup(t),parent=(await f.service.post_message({board:'main',sender_id:'sender',sender_label:'Sender',receiver_id:'receiver',topic:'Task',body:'Parent.',idempotency_key:'parent'})).message;
  const reply=await begin(f,{request_id:'reply',body:'Done.',reply_to_id:parent.id,delivery_policy:{short_message_limit:15000}},actors.receiver,actors.sender);
  assert.equal(reply.started.policy.mode,'reference');assert.equal(reply.action.status,'store');assert.equal(reply.action.arguments.reply_to_id,parent.id);
  const stored=await store(f,reply);
  assert.equal(stored.result.message.reply_to_id,parent.id);assert(stored.result.message.body.startsWith('Done.'));
  assert.equal(stored.notice.status,'send');assert(!stored.notice.arguments.prompt.includes('Done.'));
  const ordinary=await begin(f,{request_id:'ordinary',body:'Done.'});
  assert.equal(ordinary.started.policy.mode,'inline');assert.equal(ordinary.action.status,'send');
  assert(ordinary.action.arguments.prompt.endsWith('Done.'));
});
test('short server-counted collaboration and reply handoffs preserve metadata and confirmed header counts',async t=>{
  const f=await setup(t),run=await chain(f);
  const first=await begin(f,{request_id:'first',body:'Task.',collaboration_id:run.id});
  assert.equal(first.started.policy.mode,'reference');assert.equal(first.action.arguments.collaboration_id,run.id);
  const one=await store(f,first);assert.match(one.notice.arguments.prompt,/Handoff 1\/2/);
  await f.state.recordNative(first.data,{attempt_id:one.notice.attempt_id,state:'submitted',confirmation:{thread_id:first.recipient.thread_id}});
  const reply=await begin(f,{request_id:'reply',body:'Done.',collaboration_id:run.id,reply_to_id:one.result.message.id},{...actors.receiver,handoff_depth:99,handoff_limit:100},actors.sender);
  const two=await store(f,reply);
  assert.equal(two.result.message.collaboration_id,run.id);assert.equal(two.result.message.reply_to_id,one.result.message.id);
  assert.match(two.notice.arguments.prompt,/Handoff 2\/2/);assert(!two.notice.arguments.prompt.includes('Handoff 99/100'));assert(!two.notice.arguments.prompt.includes('Done.'));
  assert.equal((await f.service.post_message(reply.action.arguments)).message.id,two.result.message.id);
  assert.equal((await f.service.get_collaboration({board:'main',collaboration_id:run.id})).collaboration.handoffs_used,2);
});
test('exhausted and stopped chains reject short linked posts and expose no native send',async t=>{
  for(const reason of ['depth_limit_reached','stopped']) {
    const f=await setup(t),run=await chain(f,reason === 'stopped' ? 2 : 1),first=await begin(f,{request_id:'first',body:'Task.',collaboration_id:run.id});
    const one=await store(f,first);
    if(reason==='stopped')await f.service.stop_collaboration({board:'main',collaboration_id:run.id});
    const reply=await begin(f,{request_id:'blocked-reply',body:'Done.',collaboration_id:run.id,reply_to_id:one.result.message.id},actors.receiver,actors.sender);
    assert.equal(reply.action.status,'store');
    await assert.rejects(f.service.post_message(reply.action.arguments),{code:reason});
    await f.state.recordStorage(reply.data,{isError:true});
    const blocked=await f.state.next(reply.data,caps,env(reply.sender));
    assert.equal(blocked.status,'storage_unconfirmed');assert(!blocked.arguments);
    assert.equal(f.db.connection.prepare('SELECT COUNT(*) AS n FROM messages').get().n,1);
    assert.equal((await f.service.get_collaboration({board:'main',collaboration_id:run.id})).collaboration.handoffs_used,1);
  }
});
test('missing or mismatched server IDs and counts cannot confirm a linked operation',async t=>{
  for(const change of [{collaboration_id:undefined},{collaboration_id:'other'},{reply_to_id:'wrong'},{handoff_depth:undefined},{handoff_limit:undefined},{handoff_depth:3,handoff_limit:2}]) {
    const f=await setup(t),operation=await begin(f,{request_id:'bad-confirmation',body:'Done.',collaboration_id:'chain-1',reply_to_id:'parent-1'});
    const message={...operation.action.arguments,id:'stored-message',created_at:'2026-01-01T00:00:00Z',handoff_depth:1,handoff_limit:2,...change};
    assert.equal((await f.state.recordStorage(operation.data,{message})).status,'storage_unconfirmed');
    assert(!((await f.state.next(operation.data,caps,env(operation.sender))).arguments));
  }
});
test('legacy inline-linked journals remain frozen and blocked rather than silently changing modes',async t=>{
  const f=await setup(t),input={...route(),request_id:'legacy-linked',topic:'Report',body:'Done.',reply_to_id:'parent-1'};
  await f.state.start(input,env(actors.sender));
  const path=f.state.path(input),saved=JSON.parse(await readFile(path,'utf8'));saved.policy.mode='inline';
  await writeFile(path,JSON.stringify(saved));
  const result=await f.state.next(input,caps,env(actors.sender));
  assert.equal(result.status,'linked_operation_unreconciled');assert(!result.arguments);
  assert.equal(JSON.parse(await readFile(path,'utf8')).policy.mode,'inline');
});

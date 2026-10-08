import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { unlink } from 'node:fs/promises';
import { SqliteD1 } from './d1-adapter.mjs';
import { loadMigrations } from './migrations.mjs';
import { BoardService } from '../src/service.mjs';
import { EventService, CallbackEndpointError } from '../src/events.mjs';
import { callbackUrl, decodeSigningSecret, maintenanceTokenDigest } from '../src/webhooks.mjs';
import { rpc } from '../src/protocol.mjs';

const signingSecret=`whsec_${randomBytes(32).toString('base64')}`;
const masterKey=randomBytes(32).toString('base64');
async function fixture(path=':memory:') {
  const db=new SqliteD1(path);db.connection.exec(await loadMigrations());
  const board=new BoardService(db,'owner');
  for(const [participant_id,label,thread_id] of [['sender','Sender',undefined],['receiver','Review chat','thread-review'],['other','Other chat','thread-other']])
    await board.register_participant({board:'main',participant_id,label,kind:'thread',...(thread_id?{thread_id}:{})});
  const env={OWNER_USER_ID:'owner',SITE_ORIGIN:'https://board.test',EVENT_SECRET_KEY:masterKey};
  let clock=Date.now(),status=204;const requests=[];
  const transport=async(url,options)=>{
    if(!['follow','manual'].includes(options.redirect))throw new TypeError('Invalid redirect value: workerd accepts follow or manual.');
    const body=JSON.parse(options.body);requests.push({url,options,body});
    return body.type==='verification'?Response.json({challenge:body.challenge}):new Response(null,{status});
  };
  const options={transport,now:()=>clock,email:'owner@example.com'};
  const events=new EventService(board,env,options);
  return {db,board,env,events,requests,options,setStatus:value=>status=value,tick:ms=>clock+=ms,now:()=>clock,
    params:selector=>({name:'message.created',arguments:{board:'main',...(selector??{receiver_id:'receiver'})},delivery:{mode:'webhook',url:'https://chatgpt.com/test-mcp-callback',secret:signingSecret}}),
    post:(receiver_id='receiver',key=randomUUID())=>board.post_message({board:'main',sender_id:'sender',sender_label:'Sender',receiver_id,topic:'test',body:'Communication only.',idempotency_key:key})};
}
function verifySignature(request,secret=signingSecret) {
  const {headers,body}=request.options;
  const expected=createHmac('sha256',Buffer.from(secret.slice(6),'base64')).update(`${headers['webhook-id']}.${headers['webhook-timestamp']}.${body}`).digest('base64');
  assert(headers['webhook-signature'].split(' ').includes(`v1,${expected}`));
}

test('exact aliases share one verified subscription; callback keys are encrypted and never returned',async()=>{
  const f=await fixture();try {
    const first=await f.events.subscribe(f.params());
    for(const selector of [{receiver_label:'Review chat'},{receiver_thread_id:'thread-review'}])assert.equal((await f.events.subscribe(f.params(selector))).id,first.id);
    assert.equal(f.requests.length,1);verifySignature(f.requests[0]);
    const stored=f.db.connection.prepare('SELECT * FROM event_subscriptions').get();
    assert(!stored.secret_box.includes(signingSecret));assert(!JSON.stringify(first).includes(signingSecret));
    const listed=await f.events.listSubscriptions({board:'main'});assert.equal(listed.subscriptions.length,1);
    assert(!JSON.stringify(listed).includes(signingSecret));assert(!JSON.stringify(listed).includes('test-mcp-callback'));
    assert.equal(first.cursor,null);assert.equal(first.truncated,false);
  }finally{f.db.close();}
});
test('matching signed events contain minimal references; stored, accepted and acknowledged stay distinct',async()=>{
  const f=await fixture();try {
    await f.events.subscribe(f.params());const sent=await f.post();await f.post('other');
    assert.deepEqual(await f.events.dispatch(),{attempted:1,accepted:1,failed:0,pending:0});
    const request=f.requests.at(-1);verifySignature(request);assert.equal(request.options.redirect,'manual');
    assert.equal(request.options.headers['webhook-id'],request.body.eventId);assert.equal(request.body.data.message_id,sent.message.id);
    assert.equal(request.body.name,'message.created');assert.equal(request.body.timestamp,sent.server_timestamp);assert.equal(request.body.data.notification_mode,'notify_only');
    assert(!JSON.stringify(request.body).includes('Communication only.'));
    const status=await f.events.status({board:'main',message_id:sent.message.id});
    assert(status.stored);assert.equal(status.deliveries[0].state,'accepted');assert.equal(status.participant_acknowledged,false);
    await f.board.get_inbox({board:'main',receiver_id:'receiver'});
    assert.equal((await f.events.status({board:'main',message_id:sent.message.id})).participant_acknowledged,false);
    await f.board.acknowledge_message({board:'main',message_id:sent.message.id,participant_id:'receiver'});
    assert.equal((await f.events.status({board:'main',message_id:sent.message.id})).participant_acknowledged,true);
    assert.equal((await f.events.dispatch()).attempted,0);
  }finally{f.db.close();}
});

test('receiver readiness distinguishes missing, paused, expired and limited subscriptions without revealing credentials',async()=>{
  const f=await fixture();try {
    const missing=await f.events.setup({board:'main',receiver_thread_id:'thread-review'});
    assert.equal(missing.state,'subscription_required');assert.equal(missing.notification_ready,false);
    assert.deepEqual(missing.event,{name:'message.created',arguments:{board:'main',receiver_id:'receiver'}});
    assert.deepEqual(missing.connection_policy,{new_binding_default:'mcp_events',cloud_binding_default:'mcp_events',local_binding_default:'on_demand',no_peer_default:'receiving_only',receiving_host_capability_verification_required:true,heartbeat_requires_explicit_choice:true,local_event_wake_bridge_available:false});
    assert.equal(f.db.connection.prepare('SELECT COUNT(*) n FROM event_subscriptions').get().n,0);
    assert.equal(f.requests.length,0);
    const noRuntime=await new EventService(f.board,{},f.options).setup({board:'main',receiver_id:'receiver'});
    assert.equal(noRuntime.state,'events_not_configured');
    assert.deepEqual(noRuntime.connection_policy,missing.connection_policy);
    const sub=await f.events.subscribe(f.params());
    assert.equal((await f.events.setup({board:'main',receiver_label:'Review chat'})).state,'ready');
    await f.events.configure({subscription_id:sub.id,paused:true});
    assert.equal((await f.events.setup({board:'main',receiver_id:'receiver'})).state,'paused');
    await f.events.configure({subscription_id:sub.id,paused:false,wake_limit:1});
    await f.post();await f.events.dispatch();
    const limited=await f.events.setup({board:'main',receiver_id:'receiver'});assert.equal(limited.state,'limited');
    assert(!JSON.stringify(limited).includes(signingSecret));assert(!JSON.stringify(limited).includes('test-mcp-callback'));
    f.tick(3600001);
    const expired=await f.events.setup({board:'main',receiver_id:'receiver'});assert.equal(expired.state,'subscription_required');assert.equal(expired.subscriptions[0].expired,true);
    assert.equal((await f.events.setup({board:'main',receiver_id:'other'})).state,'subscription_required');
    await assert.rejects(()=>f.events.setup({board:'main',receiver_id:'receiver',receiver_label:'Review chat'}),{code:'invalid_address'});
  }finally{f.db.close();}
});

test('post responses report notification readiness and preserve confirmed writes when diagnostics fail',async()=>{
  const f=await fixture();try {
    const post=key=>rpc({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'post_message',arguments:{board:'main',sender_id:'sender',sender_label:'Sender',receiver_id:'receiver',topic:'test',body:'Notification test',idempotency_key:key}}},f.board,null,f.events);
    const first=(await post('readiness-before-subscribe')).result;assert.equal(first.isError,false);assert.equal(first.structuredContent.notification.state,'subscription_required');
    const sub=await f.events.subscribe(f.params());
    const historical=await f.events.status({board:'main',message_id:first.structuredContent.message.id});assert.equal(historical.notification.state,'not_queued');
    const second=(await post('readiness-after-subscribe')).result;assert.equal(second.structuredContent.notification.state,'pending');
    await f.events.dispatch();assert.equal((await f.events.status({board:'main',message_id:second.structuredContent.message.id})).notification.state,'accepted');
    const original=f.events.reconcile;f.events.reconcile=async()=>{throw Error('Temporary queue failure');};
    const third=(await post('readiness-diagnostics-failure')).result;assert.equal(third.isError,false);assert.equal(third.structuredContent.notification.state,'status_unavailable');
    f.events.reconcile=original;
    assert.equal((await post('readiness-diagnostics-failure')).result.structuredContent.message.id,third.structuredContent.message.id);
    assert.equal((await f.board.get_inbox({board:'main',receiver_id:'receiver'})).unacknowledged_count,3);
  }finally{f.db.close();}
});
test('retries survive a real database close/reopen with stable event IDs and fresh signatures',async()=>{
  const path=join(tmpdir(),`paprika-events-${randomUUID()}.sqlite`),f=await fixture(path);let reopened;
  try {
    await f.events.subscribe(f.params());await f.post();f.setStatus(503);
    assert.equal((await f.events.dispatch()).accepted,0);const first=f.requests.at(-1);assert.equal(first.body.name,'message.created');
    assert.equal((await f.events.dispatch()).attempted,0);
    f.db.close();reopened=new SqliteD1(path);f.tick(3000);f.setStatus(204);
    const restarted=new EventService(new BoardService(reopened,'owner'),f.env,f.options);
    assert.equal((await restarted.dispatch()).accepted,1);const retry=f.requests.at(-1);
    assert.equal(retry.body.eventId,first.body.eventId);assert.equal(retry.options.body,first.options.body);assert.notEqual(retry.options.headers['webhook-timestamp'],first.options.headers['webhook-timestamp']);
    verifySignature(retry);assert.equal((await restarted.dispatch()).attempted,0);
  }finally{if(reopened)reopened.close();else f.db.close();await unlink(path);}
});
test('message committed during callback verification is queued; earlier history is recovered through the inbox',async()=>{
  const f=await fixture();try {
    const earlier=await f.post();let during;
    const events=new EventService(f.board,f.env,{...f.options,transport:async(url,options)=>{const body=JSON.parse(options.body);if(body.type==='verification'){during=await f.post();return Response.json({challenge:body.challenge});}return f.options.transport(url,options);}});
    await events.subscribe(f.params());assert.equal((await events.dispatch()).accepted,1);
    assert.equal(f.requests.at(-1).body.data.message_id,during.message.id);
    assert.equal((await events.status({board:'main',message_id:earlier.message.id})).deliveries.length,0);
    assert.equal((await f.board.get_inbox({board:'main',receiver_id:'receiver'})).unacknowledged_count,2);
  }finally{f.db.close();}
});
test('parallel dispatchers lease a delivery once and recover an abandoned lease',async()=>{
  const f=await fixture();try {
    await f.events.subscribe(f.params());await f.post();
    const other=new EventService(f.board,f.env,f.options);
    const results=await Promise.all([f.events.dispatch(1),other.dispatch(1)]);
    assert.equal(results.reduce((n,r)=>n+r.accepted,0),1);assert.equal(f.requests.filter(r=>r.body.name==='message.created').length,1);
    await f.post();await f.events.reconcile();
    f.db.connection.prepare("UPDATE event_deliveries SET lease_token='abandoned',lease_until=? WHERE state='pending'").run(f.now()+30000);
    assert.equal((await other.dispatch()).attempted,0);f.tick(31000);assert.equal((await other.dispatch()).accepted,1);
  }finally{f.db.close();}
});
test('pause and hourly attempt budget retain pending messages and resume without receipt loops',async()=>{
  const f=await fixture();try {
    const sub=await f.events.subscribe({...f.params(),ttlMs:86400000});
    await f.events.configure({subscription_id:sub.id,paused:true,wake_limit:1,notification_mode:'process_inbox'});
    const first=await f.post();await f.post();assert.equal((await f.events.dispatch()).attempted,0);
    await f.events.configure({subscription_id:sub.id,paused:false});assert.equal((await f.events.dispatch()).accepted,1);assert.equal(f.requests.at(-1).body.data.notification_mode,'process_inbox');
    assert.equal((await f.events.dispatch()).attempted,0);f.tick(3600001);assert.equal((await f.events.dispatch()).accepted,1);
    await f.board.acknowledge_message({board:'main',message_id:first.message.id,participant_id:'sender'});
    assert.equal((await f.events.dispatch()).attempted,0);
  }finally{f.db.close();}
});
test('unsubscribe, expiry, access revocation and already acknowledged or deleted messages stop sends',async()=>{
  for(const scenario of ['unsubscribe','expired','revoked','acknowledged','deleted']) {
    const f=await fixture();try {
      const params={...f.params(),ttlMs:1000};await f.events.subscribe(params);const posted=await f.post();await f.events.reconcile();
      if(scenario==='unsubscribe'){const {secret,...delivery}=params.delivery;await f.events.unsubscribe({name:params.name,arguments:params.arguments,delivery});await f.events.unsubscribe({name:params.name,arguments:params.arguments,delivery});}
      if(scenario==='expired')f.tick(1001);
      if(scenario==='revoked')f.env.OWNER_USER_ID='replacement-owner';
      if(scenario==='acknowledged')await f.board.acknowledge_message({board:'main',message_id:posted.message.id,participant_id:'receiver'});
      if(scenario==='deleted')await f.board.delete_message({board:'main',message_id:posted.message.id});
      assert.equal((await f.events.dispatch()).attempted,0,scenario);
      assert.equal(f.db.connection.prepare('SELECT state FROM event_deliveries').get().state,'cancelled');
    }finally{f.db.close();}
  }
});
test('410 and 413 are terminal; transient errors have bounded retries',async()=>{
  for(const status of [410,413,503]) {
    const f=await fixture();try {
      await f.events.subscribe({...f.params(),ttlMs:86400000});await f.post();f.setStatus(status);
      for(let i=0;i<9;i++){await f.events.dispatch();f.tick(900001);}
      const row=f.db.connection.prepare('SELECT * FROM event_deliveries').get();
      assert.equal(row.state,'failed');assert.equal(row.attempts,status===503?8:1);
    }finally{f.db.close();}
  }
});
test('callback verification failure is categorized and does not activate or replace a working subscription',async()=>{
  const f=await fixture();try {
    const active=await f.events.subscribe(f.params());f.tick(61000);
    const bad=new EventService(f.board,f.env,{...f.options,transport:async()=>Response.json({challenge:'wrong'})});
    const response=await rpc({jsonrpc:'2.0',id:1,method:'events/subscribe',params:f.params()},f.board,null,bad);
    assert.equal(response.error.code,-32015);assert.equal(response.error.data.reason,'challenge_failed');
    assert.equal(f.db.connection.prepare('SELECT active FROM event_subscriptions WHERE id=?').get(active.id).active,1);
    const stranger=new EventService(new BoardService(f.db,'stranger'),f.env,f.options);
    await assert.rejects(()=>stranger.configure({subscription_id:active.id,paused:true}),{code:'subscription_not_found'});
    await assert.rejects(()=>bad.subscribe({...f.params(),delivery:{...f.params().delivery,secret:'whsec_invalid'}}),{code:'invalid_signing_secret'});
  }finally{f.db.close();}
});
test('secret refresh signs with both keys briefly and preserves pending progress',async()=>{
  const f=await fixture();try {
    const first=await f.events.subscribe({...f.params(),ttlMs:86400000});const pending=await f.post();
    const replacement=`whsec_${randomBytes(32).toString('base64')}`;
    const refreshed=await f.events.subscribe({...f.params(),delivery:{...f.params().delivery,secret:replacement},ttlMs:86400000});assert.equal(first.id,refreshed.id);
    await f.events.dispatch();const request=f.requests.at(-1);assert.equal(request.body.data.message_id,pending.message.id);
    verifySignature(request);verifySignature(request,replacement);assert.equal(request.options.headers['webhook-signature'].split(' ').length,2);
    f.tick(300001);await f.post();await f.events.dispatch();const later=f.requests.at(-1);verifySignature(later,replacement);assert.equal(later.options.headers['webhook-signature'].split(' ').length,1);
  }finally{f.db.close();}
});

test('verification failure diagnostics distinguish HTTP, malformed echo, mismatch and transport without saving keys',async()=>{
  const cases=[
    {transport:async()=>Response.json({error:'private-response-token'},{status:403}),expected:{failure:'http_status',http_status:403}},
    {transport:async()=>new Response('private-non-json-response'),expected:{failure:'invalid_response',http_status:200}},
    {transport:async()=>Response.json({challenge:'private-wrong-challenge'}),expected:{failure:'challenge_mismatch',http_status:200}},
    {transport:async()=>{throw new TypeError('private-transport-url');},expected:{failure:'transport'}},
    {transport:async()=>{throw new DOMException('private-timeout-url','TimeoutError');},expected:{failure:'timeout'},reason:'timeout'}
  ];
  for(const entry of cases){
    const f=await fixture();try{
      const events=new EventService(f.board,f.env,{...f.options,transport:entry.transport});
      const result=await rpc({jsonrpc:'2.0',id:1,method:'events/subscribe',params:f.params()},f.board,null,events);
      assert.equal(result.error.code,-32015);assert.equal(result.error.data.reason,entry.reason??'challenge_failed');
      assert.deepEqual(result.error.data.verification,entry.expected);
      assert.equal(JSON.stringify(result).includes('private-'),false);assert.equal(JSON.stringify(result).includes(signingSecret),false);
      assert.equal(f.db.connection.prepare('SELECT COUNT(*) n FROM event_subscriptions').get().n,0);
    }finally{f.db.close();}
  }
});

test('edge-compatible transport rejects redirects during both verification and event delivery',async()=>{
  const f=await fixture();try{
    const verificationAttempts=[];
    const redirecting=new EventService(f.board,f.env,{...f.options,transport:async(url,options)=>{
      verificationAttempts.push({url,options});
      assert.equal(options.redirect,'manual');
      return Response.redirect('https://example.com/private-redirect-target',307);
    }});
    const rejected=await rpc({jsonrpc:'2.0',id:1,method:'events/subscribe',params:f.params()},f.board,null,redirecting);
    assert.deepEqual(rejected.error.data.verification,{failure:'http_status',http_status:307});
    assert.equal(verificationAttempts.length,1);assert.equal(f.db.connection.prepare('SELECT COUNT(*) n FROM event_subscriptions').get().n,0);
    await f.events.subscribe(f.params());const posted=await f.post();f.setStatus(302);
    assert.deepEqual(await f.events.dispatch(),{attempted:1,accepted:0,failed:1,pending:0});
    const delivery=(await f.events.status({board:'main',message_id:posted.message.id})).deliveries[0];
    assert.equal(delivery.http_status,302);assert.equal(delivery.state,'failed');
    assert.equal(f.requests.length,2);assert.equal(f.requests.at(-1).url,f.params().delivery.url);
    assert.equal(f.requests.at(-1).options.redirect,'manual');
  }finally{f.db.close();}
});
test('callback policy rejects arbitrary domains, local/IP URLs, ports, credentials and lookalike hosts',async()=>{
  for(const url of ['http://chatgpt.com/cb','https://localhost/cb','https://127.0.0.1/cb','https://[::1]/cb','https://169.254.169.254/cb','https://10.0.0.1/cb','https://example.com/cb','https://chatgpt.com.evil.test/cb','https://evil.chatgpt.com/cb','https://fake.connectors.api.openai.com/cb','https://connectors.api.openai.com.evil.test/cb','http://connectors.api.openai.com/cb','https://connectors.api.openai.com:444/cb','https://chatgpt.com:444/cb','https://user:secret@chatgpt.com/cb','https://chatgpt.com/cb#fragment'])assert.throws(()=>callbackUrl(url),{code:'invalid_callback'});
  assert.equal(callbackUrl('https://api.openai.com/cb'),'https://api.openai.com/cb');
  assert.equal(callbackUrl('https://connectors.api.openai.com/cb'),'https://connectors.api.openai.com/cb');
  for(const size of [0,23,65])assert.throws(()=>decodeSigningSecret(`whsec_${randomBytes(size).toString('base64')}`),{code:'invalid_signing_secret'});
  assert.equal((await maintenanceTokenDigest('test-token')).length,64);
});

test('reconciliation recovers a post committed without request work and handles out-of-order retry acceptance',async()=>{
  const f=await fixture();try {
    await f.events.subscribe(f.params());const first=await f.post();
    assert.equal(f.db.connection.prepare('SELECT COUNT(*) AS count FROM event_deliveries').get().count,0);
    f.setStatus(503);await f.events.dispatch(1);const second=await f.post();f.setStatus(204);
    await new EventService(f.board,f.env,f.options).dispatch(1);
    assert.equal(f.requests.at(-1).body.data.message_id,second.message.id);
    f.tick(3000);await f.events.dispatch(1);assert.equal(f.requests.at(-1).body.data.message_id,first.message.id);
    assert.equal((await f.board.get_inbox({board:'main',receiver_id:'receiver'})).unacknowledged_count,2);
  }finally{f.db.close();}
});
test('same routing ID on another board never enters a subscription',async()=>{
  const f=await fixture();try {
    await f.events.subscribe(f.params());await f.board.create_board({board:'second',label:'Second'});
    for(const participant_id of ['sender','receiver'])await f.board.register_participant({board:'second',participant_id,label:participant_id,kind:'thread'});
    await f.board.post_message({board:'second',sender_id:'sender',sender_label:'Sender',receiver_id:'receiver',topic:'test',body:'Other board.'});
    assert.equal((await f.events.dispatch()).attempted,0);
  }finally{f.db.close();}
});
test('deep reply handoffs remain stored but stop triggering further automatic wakes',async()=>{
  const f=await fixture();try {
    await f.events.subscribe({...f.params(),ttlMs:86400000});let parent;
    for(let depth=0;depth<=8;depth++) {
      const post=await f.board.post_message({board:'main',sender_id:'sender',sender_label:'Sender',receiver_id:'receiver',topic:'test',body:'Follow-up.',...(parent?{reply_to_id:parent}:{})});parent=post.message.id;
    }
    const result=await f.events.dispatch(20);assert.equal(result.accepted,8);
    const status=await f.events.status({board:'main',message_id:parent});assert(status.stored);assert.equal(status.deliveries[0].last_error,'handoff_limit');
  }finally{f.db.close();}
});

test('email-configured owner changes revoke subscriptions during unattended reconciliation',async()=>{
  const f=await fixture();try {
    delete f.env.OWNER_USER_ID;f.env.OWNER_EMAIL='owner@example.com';await f.events.subscribe(f.params());await f.post();
    f.env.OWNER_EMAIL='new-owner@example.com';assert.equal((await f.events.dispatch()).attempted,0);
  }finally{f.db.close();}
});

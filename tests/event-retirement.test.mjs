import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { SqliteD1 } from './d1-adapter.mjs';
import { loadMigrations } from './migrations.mjs';
import { BoardService } from '../src/service.mjs';
import { EventService } from '../src/events.mjs';
import { rpc, tools } from '../src/protocol.mjs';

async function fixture() {
  const db=new SqliteD1();db.connection.exec(await loadMigrations());
  const board=new BoardService(db,'owner'),requests=[];
  const env={OWNER_USER_ID:'owner',SITE_ORIGIN:'https://board.test',EVENT_SECRET_KEY:randomBytes(32).toString('base64')};
  let now=Date.now(),status=204;
  const options={now:()=>now,transport:async(url,options)=>{
    const body=JSON.parse(options.body);requests.push({url,body});
    return body.type==='verification'?Response.json({challenge:body.challenge}):new Response(null,{status});
  }};
  const events=new EventService(board,env,options),secret=`whsec_${randomBytes(32).toString('base64')}`;
  for(const name of ['main','other-board']) {
    if(name!=='main')await board.create_board({board:name,label:'Other board'});
    for(const participant_id of ['sender','receiver','other'])await board.register_participant({board:name,participant_id,label:participant_id,kind:'thread'});
  }
  return {db,board,env,events,options,requests,secret,tick:ms=>now+=ms,setStatus:value=>status=value,
    params:(path='old',name='main',receiver='receiver')=>({name:'message.created',arguments:{board:name,receiver_id:receiver},delivery:{mode:'webhook',url:`https://chatgpt.com/fixture-${path}`,secret}}),
    post:(name='main',receiver_id='receiver')=>board.post_message({board:name,sender_id:'sender',sender_label:'sender',receiver_id,topic:'Fixture',body:'Fixture message.',idempotency_key:randomUUID()})};
}
const rows=(f,table)=>f.db.connection.prepare(`SELECT * FROM ${table}`).all().map(row=>({...row}));
const call=(subscription_id,extra={})=>({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'retire_event_subscription',arguments:{subscription_id,...extra}}});

test('exact-ID retirement is owner-scoped, strict, redacted and available without event credentials',async()=>{
  const f=await fixture();try {
    const sub=await f.events.subscribe(f.params());await f.post();await f.events.reconcile();
    const before={subscriptions:rows(f,'event_subscriptions'),deliveries:rows(f,'event_deliveries')};
    const stranger=new EventService(new BoardService(f.db,'stranger'),{},f.options);
    for(const events of [f.events,stranger])await assert.rejects(()=>events.retire({subscription_id:'sub_unknown'}),{status:404,code:'subscription_not_found',message:'Subscription not found for this account.'});
    await assert.rejects(()=>stranger.retire({subscription_id:sub.id}),{status:404,code:'subscription_not_found',message:'Subscription not found for this account.'});
    for(const args of [{},{subscription_id:''},{subscription_id:'sub_%'},{subscription_id:'a'.repeat(81)},null])await assert.rejects(()=>f.events.retire(args));
    for(const field of ['board','owner_subject','callback_url','secret','delivery'])await assert.rejects(()=>f.events.retire({subscription_id:sub.id,[field]:'private-fixture'}),{code:'unknown_argument'});
    assert.deepEqual({subscriptions:rows(f,'event_subscriptions'),deliveries:rows(f,'event_deliveries')},before);
    const result=await rpc(call(sub.id),f.board);
    assert.equal(result.result.isError,false);assert.deepEqual(result.result.structuredContent,{subscription_id:sub.id,active:false,cancelled_pending_deliveries:1,in_flight_delivery_may_complete:true,resubscribe_can_reactivate:true});
    assert(!JSON.stringify(result).includes(f.secret));assert(!JSON.stringify(result).includes('https://'));assert(!JSON.stringify(result).includes('owner'));
    const spec=tools.find(t=>t.name==='retire_event_subscription');
    assert.deepEqual(Object.keys(spec.inputSchema.properties),['subscription_id']);assert.deepEqual(spec.inputSchema.required,['subscription_id']);assert.equal(spec.inputSchema.additionalProperties,false);
    assert.deepEqual(spec.annotations,{readOnlyHint:false,destructiveHint:true,idempotentHint:true,openWorldHint:false});
    assert.equal((await rpc(call(sub.id,{owner_subject:'stranger'}),f.board)).result.isError,true);
  } finally {f.db.close();}
});

test('retiring a paused subscription cancels only its pending deliveries and preserves all histories and replacements',async()=>{
  const f=await fixture();try {
    const old=await f.events.subscribe(f.params());
    const accepted=await f.post();await f.events.dispatch();
    await f.board.acknowledge_message({board:'main',message_id:accepted.message.id,participant_id:'receiver'});
    f.setStatus(404);await f.post();await f.events.dispatch();
    f.setStatus(503);await f.post();await f.events.dispatch();
    await f.events.configure({subscription_id:old.id,paused:true});
    const replacement=await f.events.subscribe(f.params('replacement'));
    const another=await f.events.subscribe(f.params('other','main','other'));
    const otherBoard=await f.events.subscribe(f.params('old','other-board'));
    await f.post();await f.post('main','other');await f.post('other-board');await f.events.reconcile();
    const subs=rows(f,'event_subscriptions'),deliveries=rows(f,'event_deliveries');
    const messages=rows(f,'messages'),receipts=rows(f,'acknowledgments'),events=rows(f,'events'),participants=rows(f,'participants');
    const result=await f.events.retire({subscription_id:old.id});
    assert.equal(result.cancelled_pending_deliveries,2);
    assert.deepEqual(rows(f,'event_subscriptions').find(s=>s.id===old.id),{...subs.find(s=>s.id===old.id),active:0});
    for(const sub of [replacement,another,otherBoard])assert.deepEqual(rows(f,'event_subscriptions').find(s=>s.id===sub.id),subs.find(s=>s.id===sub.id));
    for(const delivery of deliveries) {
      const after=rows(f,'event_deliveries').find(d=>d.subscription_id===delivery.subscription_id && d.event_sequence===delivery.event_sequence);
      assert.deepEqual(after,delivery.subscription_id===old.id && delivery.state==='pending'?{...delivery,state:'cancelled',last_error:'unsubscribed',lease_token:null,lease_until:0}:delivery);
    }
    assert.deepEqual(rows(f,'messages'),messages);assert.deepEqual(rows(f,'acknowledgments'),receipts);assert.deepEqual(rows(f,'events'),events);assert.deepEqual(rows(f,'participants'),participants);
    const state=rows(f,'event_deliveries');
    assert.equal((await f.events.retire({subscription_id:old.id})).cancelled_pending_deliveries,0);assert.deepEqual(rows(f,'event_deliveries'),state);
    assert.equal((await f.events.listSubscriptions({board:'main'})).subscriptions.find(s=>s.id===old.id).active,false);
    const count=rows(f,'event_deliveries').filter(d=>d.subscription_id===old.id).length;
    await f.post();await f.events.reconcile();assert.equal(rows(f,'event_deliveries').filter(d=>d.subscription_id===old.id).length,count);
    f.setStatus(204);f.tick(3600001);const sentBefore=f.requests.length;await f.events.dispatch();
    assert(f.requests.slice(sentBefore).length>0);assert(f.requests.slice(sentBefore).every(r=>r.url!==f.params().delivery.url || r.body.data.board==='other-board'));
  } finally {f.db.close();}
});

test('retirement invalidates leases and blocks a dispatcher which has not loaded its claimed delivery',async()=>{
  const f=await fixture();try {
    const sub=await f.events.subscribe(f.params());await f.post();await f.events.reconcile();
    const batch=f.db.batch.bind(f.db);let retired=false;
    f.db.batch=async statements=>{
      const result=await batch(statements);
      if(!retired && statements.some(s=>s.sql.includes('SET lease_token=?'))) {
        retired=true;assert.equal((await f.events.retire({subscription_id:sub.id})).cancelled_pending_deliveries,1);
      }
      return result;
    };
    assert.deepEqual(await f.events.dispatch(),{attempted:0,accepted:0,failed:0,pending:0});
    assert.equal(f.requests.filter(r=>r.body.name==='message.created').length,0);
    const row=rows(f,'event_deliveries')[0];assert.equal(row.state,'cancelled');assert.equal(row.lease_token,null);assert.equal(row.lease_until,0);
  } finally {f.db.close();}
});

test('reconciliation holding a pre-retirement snapshot cannot enqueue later deliveries',async()=>{
  const f=await fixture();try {
    const sub=await f.events.subscribe(f.params());await f.post();
    const batch=f.db.batch.bind(f.db);let retired=false;
    f.db.batch=async statements=>{
      if(!retired && statements.some(s=>s.sql.includes('INSERT INTO event_deliveries'))) {
        retired=true;await f.events.retire({subscription_id:sub.id});
      }
      return batch(statements);
    };
    await f.events.reconcile();assert.equal(rows(f,'event_deliveries').length,0);assert.equal(rows(f,'event_subscriptions')[0].active,0);
  } finally {f.db.close();}
});

test('a dispatch already in progress may complete but cannot overwrite cancellation or retry',async()=>{
  for(const status of [204,404,503]) {
    const f=await fixture();try {
      const sub=await f.events.subscribe(f.params());await f.post();
      let entered,release;const started=new Promise(resolve=>entered=resolve),completion=new Promise(resolve=>release=resolve);
      const dispatcher=new EventService(f.board,f.env,{...f.options,transport:async()=>{entered();await completion;return new Response(null,{status});}});
      const dispatch=dispatcher.dispatch(1);await started;
      const result=await f.events.retire({subscription_id:sub.id});assert.equal(result.cancelled_pending_deliveries,1);assert.equal(result.in_flight_delivery_may_complete,true);
      const cancelled=rows(f,'event_deliveries');release();const completed=await dispatch;
      assert.equal(completed.attempted,1);assert.equal(completed.accepted,status===204?1:0);assert.equal(completed.pending,0);
      assert.deepEqual(rows(f,'event_deliveries'),cancelled);
      f.tick(3600001);assert.equal((await dispatcher.dispatch()).attempted,0);
    } finally {f.db.close();}
  }
});

test('retirement reuses unsubscribe semantics and permits explicitly verified resubscription without replay',async()=>{
  const f=await fixture();try {
    const params=f.params(),sub=await f.events.subscribe(params);await f.post();await f.events.reconcile();
    await f.events.retire({subscription_id:sub.id});await f.post();
    await f.events.configure({subscription_id:sub.id,paused:false});assert.equal(rows(f,'event_subscriptions')[0].active,0);
    assert.equal((await f.events.dispatch()).attempted,0);
    const challenges=f.requests.length;assert.equal((await f.events.subscribe(params)).id,sub.id);assert.equal(f.requests.length,challenges+1);
    assert.equal(rows(f,'event_subscriptions')[0].active,1);assert.equal((await f.events.dispatch()).attempted,0);
    await f.post();assert.equal((await f.events.dispatch()).accepted,1);
    const {secret,...delivery}=params.delivery;assert.deepEqual(await f.events.unsubscribe({name:params.name,arguments:params.arguments,delivery}),{});
    assert.equal((await f.events.retire({subscription_id:sub.id})).cancelled_pending_deliveries,0);
    assert.equal(rows(f,'event_deliveries').filter(d=>d.state==='cancelled').length,1);
  } finally {f.db.close();}
});

test('retirement is atomic if cancelling pending deliveries fails',async()=>{
  const f=await fixture();try {
    const sub=await f.events.subscribe(f.params());await f.post();await f.events.reconcile();
    const subscriptions=rows(f,'event_subscriptions'),deliveries=rows(f,'event_deliveries');
    f.db.connection.exec("CREATE TRIGGER reject_fixture_cancel BEFORE UPDATE OF state ON event_deliveries WHEN NEW.state='cancelled' BEGIN SELECT RAISE(ABORT,'fixture_failure'); END");
    await assert.rejects(()=>f.events.retire({subscription_id:sub.id}),/fixture_failure/);
    assert.deepEqual(rows(f,'event_subscriptions'),subscriptions);assert.deepEqual(rows(f,'event_deliveries'),deliveries);
  } finally {f.db.close();}
});

test('a dispatcher holding an eligible snapshot can still send after retirement, with cancellation preserved',async()=>{
  const f=await fixture();try {
    const sub=await f.events.subscribe(f.params());await f.post();let retired=false;
    const prepare=f.db.prepare.bind(f.db);
    f.db.prepare=sql=>{
      const statement=prepare(sql),bind=statement.bind.bind(statement);
      statement.bind=(...values)=>{
        const bound=bind(...values);
        if(sql.includes('WHERE d.lease_token=?')) {
          const first=bound.first.bind(bound);
          bound.first=async()=>{
            const snapshot=await first();
            if(snapshot && !retired){retired=true;await f.events.retire({subscription_id:sub.id});}
            return snapshot;
          };
        }
        return bound;
      };
      return statement;
    };
    assert.deepEqual(await f.events.dispatch(1),{attempted:1,accepted:1,failed:0,pending:0});
    assert.equal(f.requests.filter(r=>r.body.name==='message.created').length,1);
    const delivery=rows(f,'event_deliveries')[0];assert.equal(delivery.state,'cancelled');assert.equal(delivery.http_status,null);assert.equal(delivery.accepted_at,null);
    assert.equal((await f.events.dispatch()).attempted,0);
  } finally {f.db.close();}
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SqliteD1 } from './d1-adapter.mjs';
import { loadMigrations } from './migrations.mjs';
import { BoardService } from '../src/service.mjs';
import { rpc, tools } from '../src/protocol.mjs';
import { prepareNotification } from '../skills/paprika-messenger/scripts/prepare-notification.mjs';
import { prepareBoardPost } from '../skills/paprika-messenger/scripts/prepare-delivery.mjs';
import { applyEvents, createState } from '../web/state.js';

async function setup() {
  const db=new SqliteD1();db.connection.exec(await loadMigrations());const service=new BoardService(db,'owner');
  for(const name of ['architect','worker','reviewer']){
    await service.register_participant({board:'main',participant_id:name,label:name,kind:'thread',thread_id:'native-'+name});
    await service.update_recipient_metadata({board:'main',entries:[{participant_id:name,thread_id:'native-'+name,source:'codex',execution_mode:'local',project_status:'unknown'}]});
  }
  return {db,service};
}
const configure=(service,extra={})=>service.configure_collaboration({board:'main',enabled:true,participant_ids:['architect','worker'],expected_revision:0,...extra});
async function start(service,key='root') {
  return (await service.start_collaboration({board:'main',initiator_id:'architect',goal:'Implement the authorized project assignment.',idempotency_key:key})).collaboration;
}
function handoff(run,depth,parent=null,extra={}) {
  return {board:'main',sender_id:depth%2?'architect':'worker',sender_label:depth%2?'Architect':'Worker',receiver_id:depth%2?'worker':'architect',topic:'Assignment',body:'Task-related message '+depth,
    collaboration_id:run.id,idempotency_key:'handoff-'+depth,...(parent?{reply_to_id:parent.id}:{}),...extra};
}
const runState=(service,run)=>service.get_collaboration({board:'main',collaboration_id:run.id}).then(result=>result.collaboration);

test('default depth is five; enable, participants and revision changes require explicit valid configuration',async()=>{
  const {db,service}=await setup();try{
    const defaults=(await service.get_collaboration_settings({board:'main'})).settings;
    assert.equal(defaults.max_handoff_depth,5);assert.equal(defaults.enabled,false);assert.equal(defaults.host_authorization_required,true);
    await assert.rejects(start(service),{code:'collaboration_disabled'});
    for(const maximum of [0,-1,1.5,101,null,'5'])await assert.rejects(configure(service,{max_handoff_depth:maximum}),{code:'invalid_argument'});
    for(const peers of [null,['architect','architect'],['architect']])await assert.rejects(configure(service,{participant_ids:peers}));
    const saved=(await configure(service)).settings;assert.equal(saved.max_handoff_depth,5);assert.equal(saved.revision,1);
    assert.deepEqual((await configure(service)).settings,saved);
    await assert.rejects(configure(service,{max_handoff_depth:7}),{code:'revision_conflict'});
    await service.configure_collaboration({board:'main',enabled:false,expected_revision:1});
    await service.configure_collaboration({board:'main',max_handoff_depth:8,expected_revision:2});
    assert.equal((await service.get_collaboration_settings({board:'main'})).settings.enabled,false);
  }finally{db.close();}
});

test('only active host-verified Codex conversations can join; display labels cannot grant access',async()=>{
  const {db,service}=await setup();try{
    await service.register_participant({board:'main',participant_id:'human',label:'Codex architect',kind:'human'});
    await assert.rejects(configure(service,{participant_ids:['architect','human']}),{code:'codex_thread_required'});
    db.connection.prepare("UPDATE recipient_metadata SET source='chatgpt' WHERE participant_id='worker'").run();
    await assert.rejects(configure(service),{code:'codex_thread_required'});
    db.connection.prepare("UPDATE recipient_metadata SET source='codex' WHERE participant_id='worker'").run();
    await service.unregister_thread({board:'main',participant_id:'worker'});
    await assert.rejects(configure(service),{code:'participant_unregistered'});
  }finally{db.close();}
});

test('five logical handoffs are stored with immutable counts; the sixth is blocked and retries or receipts do not count',async()=>{
  const {db,service}=await setup();try{
    await configure(service);const run=await start(service);let parent;
    const before=await service.list_messages({board:'main'});
    for(let depth=1;depth<=5;depth++){
      const args=handoff(run,depth,parent),stored=await service.post_message(args);parent=stored.message;
      assert.equal(parent.handoff_depth,depth);assert.equal(parent.handoff_limit,5);assert.equal(parent.collaboration_id,run.id);
      assert.equal((await service.post_message(args)).duplicate,true);
      assert.equal((await runState(service,run)).handoffs_used,depth);
      await service.acknowledge_message({board:'main',message_id:parent.id,participant_id:parent.receiver_id});
    }
    const state=await runState(service,run);assert.equal(state.remaining_handoffs,0);assert.equal(state.blocked_reason,'depth_limit_reached');
    await assert.rejects(service.post_message(handoff(run,6,parent)),{code:'depth_limit_reached'});
    await service.delete_message({board:'main',message_id:parent.id});await service.restore_message({board:'main',message_id:parent.id});
    assert.equal((await runState(service,run)).handoffs_used,5);
    const feed=await service.list_messages({board:'main',cursor:before.next_cursor}),replay=createState();applyEvents(replay,feed.events);
    assert.equal(replay.messages.get(parent.id).handoff_depth,5);assert.equal(replay.messages.get(parent.id).handoff_limit,5);
    assert.equal((await service.get_message({board:'main',message_id:parent.id})).message.handoff_depth,5);
    const notice=prepareNotification({message:parent,recipient:{board:'main',id:parent.receiver_id,thread_id:'native-'+parent.receiver_id}});
    assert.match(notice.prompt,/From: "Architect" · Handoff 5\/5 · Sender ID: architect/);
    assert.equal(db.connection.prepare('SELECT COUNT(*) AS n FROM messages').get().n,5);
  }finally{db.close();}
});

test('stable run keys survive settings changes and cannot create a fresh budget on retry',async()=>{
  const {db,service}=await setup();try{
    await configure(service);const run=await start(service);const message=(await service.post_message(handoff(run,1))).message;
    assert.equal((await start(service)).id,run.id);assert.equal((await start(service)).handoffs_used,1);
    await service.configure_collaboration({board:'main',enabled:false,expected_revision:1});
    assert.equal((await start(service)).id,run.id);
    await assert.rejects(service.start_collaboration({board:'main',initiator_id:'architect',goal:'Another goal',idempotency_key:'root'}),{code:'idempotency_conflict'});
    assert.equal((await service.post_message(handoff(run,1))).message.id,message.id);
    await assert.rejects(service.post_message(handoff(run,2,message)),{code:'disabled'});
  }finally{db.close();}
});

test('competing sends consume one turn and same-key concurrent retries return the original message',async()=>{
  const {db,service}=await setup();try{
    await configure(service,{participant_ids:['architect','worker','reviewer']});const run=await start(service);
    const results=await Promise.allSettled([service.post_message(handoff(run,1)),service.post_message(handoff(run,1,null,{receiver_id:'reviewer',idempotency_key:'competing'}))]);
    assert.equal(results.filter(result=>result.status==='fulfilled').length,1);assert.equal((await runState(service,run)).handoffs_used,1);
    const first=results.find(result=>result.status==='fulfilled').value.message;
    const args=handoff(run,2,first,{sender_id:first.receiver_id,sender_label:first.receiver_id});
    const retries=await Promise.all([service.post_message(args),service.post_message(args)]);
    assert.equal(retries[0].message.id,retries[1].message.id);assert.equal((await runState(service,run)).handoffs_used,2);
    assert.equal(db.connection.prepare('SELECT COUNT(*) AS n FROM messages').get().n,2);
  }finally{db.close();}
});

test('a chain cannot branch, target an unselected peer, cross boards or drop its chain on a reply',async()=>{
  const {db,service}=await setup();try{
    await configure(service);const run=await start(service);const first=(await service.post_message(handoff(run,1))).message;
    await assert.rejects(service.post_message(handoff(run,2,first,{receiver_id:'reviewer'})),{code:'participant_out_of_scope'});
    await assert.rejects(service.post_message(handoff(run,1,null,{idempotency_key:'branch'})),{code:'handoff_conflict'});
    await assert.rejects(service.post_message(handoff(run,2,first,{collaboration_id:undefined})),{code:'collaboration_required'});
    const withoutChain=handoff(run,2,first);delete withoutChain.collaboration_id;
    await assert.rejects(service.post_message(withoutChain),{code:'collaboration_required'});
    await service.create_board({board:'other',label:'Other'});
    await assert.rejects(service.get_collaboration({board:'other',collaboration_id:run.id}),{code:'collaboration_not_found'});
    await assert.rejects(service.post_message(handoff(run,2,first,{handoff_depth:1})),{code:'unknown_argument'});
    await assert.rejects(service.post_message(handoff(run,2,first,{idempotency_key:undefined})),{code:'idempotency_key_required'});
    assert.equal((await runState(service,run)).handoffs_used,1);
  }finally{db.close();}
});

test('changing a policy never enlarges an existing chain; lowering limits applies immediately',async()=>{
  const {db,service}=await setup();try{
    await configure(service);const run=await start(service);const first=(await service.post_message(handoff(run,1))).message;
    await service.configure_collaboration({board:'main',max_handoff_depth:10,expected_revision:1});
    assert.equal((await runState(service,run)).effective_max_handoff_depth,5);
    await service.configure_collaboration({board:'main',max_handoff_depth:2,expected_revision:2});
    const second=(await service.post_message(handoff(run,2,first))).message;assert.equal(second.handoff_limit,2);
    assert.equal((await service.get_message({board:'main',message_id:first.id})).message.handoff_limit,5);
    await assert.rejects(service.post_message(handoff(run,3,second)),{code:'depth_limit_reached'});
    await service.configure_collaboration({board:'main',max_handoff_depth:10,expected_revision:3});
    assert.equal((await runState(service,run)).effective_max_handoff_depth,2);
    await assert.rejects(service.post_message(handoff(run,3,second)),{code:'depth_limit_reached'});
  }finally{db.close();}
});

test('stop, board disable and participant removal block the next send without consuming a handoff',async()=>{
  for(const action of ['stop','disable','remove','scope']){
    const {db,service}=await setup();try{
      await configure(service);const run=await start(service);const first=(await service.post_message(handoff(run,1))).message;
      if(action==='stop')await service.stop_collaboration({board:'main',collaboration_id:run.id});
      if(action==='disable')await service.configure_collaboration({board:'main',enabled:false,expected_revision:1});
      if(action==='remove')await service.unregister_thread({board:'main',participant_id:'worker'});
      if(action==='scope')await service.configure_collaboration({board:'main',participant_ids:['architect','reviewer'],expected_revision:1});
      await assert.rejects(service.post_message(handoff(run,2,first)));
      assert.equal((await runState(service,run)).handoffs_used,1);
    }finally{db.close();}
  }
});

test('database guard rejects a revoked or forged turn at insert time and rolls back the count',async()=>{
  const {db,service}=await setup();try{
    await configure(service);const run=await start(service),originalPrepare=db.prepare.bind(db);let revoked=false;
    db.prepare=sql=>{
      if(!revoked && sql.startsWith('INSERT INTO messages')){revoked=true;db.connection.prepare('UPDATE collaboration_policies SET enabled=0').run();}
      return originalPrepare(sql);
    };
    await assert.rejects(service.post_message(handoff(run,1)),{code:'disabled'});
    assert.equal((await runState(service,run)).handoffs_used,0);assert.equal(db.connection.prepare('SELECT COUNT(*) AS n FROM messages').get().n,0);
    db.connection.prepare('UPDATE collaboration_policies SET enabled=1').run();
    assert.throws(()=>db.connection.prepare(`INSERT INTO messages(id,board,sender_id,sender_label,receiver_id,topic,body,authored_by,fingerprint,idempotency_key,collaboration_id,handoff_depth,handoff_limit) VALUES('forged','main','architect','Architect','worker','Task','body','owner','hash','forged',?,0,5)`).run(run.id),/collaboration_blocked/);
    assert.equal((await runState(service,run)).handoffs_used,0);
  }finally{db.close();}
});

test('MCP exposes conversation configuration and post chain ID; helpers retain chain metadata and require confirmed display counts',async()=>{
  const {db,service}=await setup();try{
    for(const name of ['get_collaboration_settings','configure_collaboration','start_collaboration','get_collaboration','stop_collaboration'])assert(tools.some(tool=>tool.name===name));
    assert(tools.find(tool=>tool.name==='post_message').inputSchema.properties.collaboration_id);
    const result=await rpc({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'get_collaboration_settings',arguments:{board:'main'}}},service);
    assert.equal(result.result.structuredContent.settings.max_handoff_depth,5);
    const input={board:'main',sender:{board:'main',id:'architect',label:'Architect',thread_id:'native-architect'},recipient:{board:'main',id:'worker',thread_id:'native-worker'},destination:{source:'read_thread',thread_id:'native-worker'},body:'Task',topic:'Task',idempotency_key:'prepared',collaboration_id:'a-chain'};
    assert.equal(prepareBoardPost(input,{CODEX_THREAD_ID:'native-architect'}).collaboration_id,'a-chain');
    const message={id:'stored',board:'main',sender_id:'architect',sender_label:'Architect',receiver_id:'worker',handoff_depth:2,handoff_limit:5};
    assert.match(prepareNotification({message,recipient:input.recipient}).prompt,/Architect.*Handoff 2\/5/);
    for(const values of [{handoff_depth:6},{handoff_limit:null},{handoff_depth:'2'}])assert.throws(()=>prepareNotification({message:{...message,...values},recipient:input.recipient}),/confirmed handoff/);
  }finally{db.close();}
});

test('a successful handoff adds no database API calls to an ordinary message',async()=>{
  const {db,service}=await setup();try{
    await configure(service);const run=await start(service),originalPrepare=db.prepare.bind(db);let queries=0;
    db.prepare=sql=>{queries++;return originalPrepare(sql);};
    const ordinary=handoff(run,1,null,{idempotency_key:'ordinary'});delete ordinary.collaboration_id;
    await service.post_message(ordinary);const baseline=queries;queries=0;
    await service.post_message(handoff(run,1));assert.equal(queries,baseline);
  }finally{db.close();}
});

test('the cloud migration uses LF and independently prepared D1 batch statements',async()=>{
  const journal=JSON.parse(await readFile('drizzle/meta/_journal.json','utf8'));
  const sql=await readFile('drizzle/'+journal.entries.at(-1).tag+'.sql','utf8');
  // Cloudflare's remote statement splitter differs from local SQLite for CRLF
  // trigger bodies and unparenthesized CASE...END (workers-sdk #14991/#4727).
  assert.equal(sql.includes('\r'),false);
  const db=new SqliteD1();try{
    for(const entry of journal.entries.slice(0,-1))db.connection.exec(await readFile('drizzle/'+entry.tag+'.sql','utf8'));
    await db.batch(sql.split('--> statement-breakpoint').map(part=>part.trim()).filter(Boolean).map(statement=>db.prepare(statement)));
    assert(db.connection.prepare("SELECT name FROM sqlite_schema WHERE type='trigger' AND name='collaboration_message_guard'").get());
  }finally{db.close();}
});

test('additive migration preserves legacy messages, event history and event triggers without enabling collaboration',async()=>{
  const journal=JSON.parse(await readFile('drizzle/meta/_journal.json','utf8')),db=new SqliteD1();try{
    for(const entry of journal.entries.slice(0,-1))db.connection.exec(await readFile('drizzle/'+entry.tag+'.sql','utf8'));
    const service=new BoardService(db,'owner');await service.register_participant({board:'main',participant_id:'old',label:'Legacy',kind:'thread',thread_id:'native-old'});
    const args={board:'main',sender_id:'old',sender_label:'Legacy',receiver_id:'old',topic:'Before',body:'Preserved',idempotency_key:'old'};
    // The old service INSERT has no new columns; this is the supported upgrade path.
    db.connection.prepare("INSERT INTO messages(id,board,sender_id,sender_label,receiver_id,topic,body,authored_by,fingerprint) VALUES('old-message','main','old','Legacy','old','Before','Preserved','owner','legacy')").run();
    const events=db.connection.prepare('SELECT * FROM events').all();
    db.connection.exec(await readFile('drizzle/'+journal.entries.at(-1).tag+'.sql','utf8'));
    assert.deepEqual(db.connection.prepare('SELECT * FROM events').all(),events);
    const old=(await service.get_message({board:'main',message_id:'old-message'})).message;
    assert.equal(old.body,'Preserved');assert.equal(Object.hasOwn(old,'handoff_depth'),false);
    assert.equal((await service.get_collaboration_settings({board:'main'})).settings.enabled,false);
    const sent=await service.post_message(args);assert.equal(Object.hasOwn(sent.message,'handoff_depth'),false);
    assert(db.connection.prepare("SELECT * FROM events WHERE kind='message_posted' AND entity_id=?").get(sent.message.id));
  }finally{db.close();}
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {SqliteD1} from './d1-adapter.mjs';
import {loadMigrations} from './migrations.mjs';
import {BoardService} from '../src/service.mjs';
import {EventService} from '../src/events.mjs';
import {rpc,tools} from '../src/protocol.mjs';
import {showRecipientPicker} from '../src/recipient-ui.mjs';
import {readRecipientResource,recipientResourceUri} from '../src/recipient-directory.mjs';
import {createState,applyEvents} from '../web/state.js';

async function fixture() {
 const db=new SqliteD1();db.connection.exec(await loadMigrations());const service=new BoardService(db,'owner');
 await service.create_board({board:'other',label:'Other board'});
 for(const board of ['main','other'])for(const participant_id of ['sender','receiver'])
  await service.register_participant({board,participant_id,label:'Thread '+participant_id,kind:'thread',thread_id:'native-'+participant_id});
 await service.register_participant({board:'main',participant_id:'person',label:'Person',kind:'human'});
 await service.update_recipient_metadata({board:'main',entries:[{participant_id:'receiver',thread_id:'native-receiver',title:'Saved thread name',source:'codex',execution_mode:'cloud',project_status:'assigned',project_id:'project-fixture',project_name:'Fixture project',conversation_url:'https://chatgpt.com/c/11111111-2222-4333-8444-555555555555'}]});
 return {db,service};
}
const post=(extra={})=>({board:'main',sender_id:'sender',sender_label:'Thread sender',receiver_id:'receiver',topic:'History',body:'Keep this exact text.',idempotency_key:'saved-key',...extra});
const remove={board:'main',participant_id:'receiver'};

test('board-scoped removal hides the thread from normal dropdowns, name/ID search and mentions while retaining history and bindings',async()=>{
 const {db,service}=await fixture();try{
  const saved=await service.post_message(post());await service.acknowledge_message({board:'main',message_id:saved.message.id,participant_id:'receiver'});
  const unread=await service.post_message(post({idempotency_key:'saved-unread-key'}));
  const before=(await service.get_recipient(remove)).recipient;
  const result=await service.unregister_thread(remove);assert.equal(result.changed,true);assert.equal(result.history_preserved,true);
  assert.equal(result.registration_status,'unregistered');
  const rows=(await service.list_recipients({board:'main'})).recipients;assert(!rows.some(r=>r.participant_id==='receiver'));
  for(const query of ['receiver','native-receiver','Saved thread name'])assert.equal((await service.list_recipients({board:'main',query})).recipients.length,0);
  assert.equal((await service.search_recipient_mentions({query:'Saved thread name'})).items.length,0);
  assert(!(await showRecipientPicker(service,{board:'main'})).recipients.some(r=>r.participant_id==='receiver'));
  assert(!(await service.list_participants({board:'main'})).participants.some(r=>r.id==='receiver'));
  const removed=(await service.list_recipients({board:'main',registration_status:'unregistered'})).recipients;
  assert.equal(removed.length,1);assert.equal(removed[0].thread_name,'Saved thread name');assert.equal(removed[0].registration_status,'unregistered');
  assert.equal((await service.get_recipient({board:'other',participant_id:'receiver'})).recipient.registration_status,'active');
  const history=await service.get_message({board:'main',message_id:saved.message.id});
  assert.equal(history.message.body,saved.message.body);assert.equal(history.acknowledgments.length,1);
  const retainedInbox=await service.get_inbox({board:'main',receiver_thread_id:'native-receiver'});
  assert.equal(retainedInbox.unacknowledged_count,1);assert.equal(retainedInbox.messages[0].id,unread.message.id);
  assert((await service.list_messages({board:'main',receiver_label:'Thread receiver'})).events.some(e=>e.entity_id===saved.message.id));
  await assert.rejects(service.get_recipient(remove),{code:'participant_unregistered'});
  await assert.rejects(readRecipientResource(service,recipientResourceUri('main','receiver')),{code:'participant_unregistered'});
  await assert.rejects(service.post_message(post({idempotency_key:'new-key'})),{code:'participant_unregistered'});
  assert.equal((await service.post_message(post())).message.id,saved.message.id);
  assert.equal((await service.post_message(post())).duplicate,true);
  await assert.rejects(service.post_message(post({body:'Different text.'})),{code:'idempotency_conflict'});
  assert.equal((await service.unregister_thread(remove)).changed,false);
  assert.equal(db.connection.prepare("SELECT COUNT(*) n FROM events WHERE kind='participant_unregistered'").get().n,1);
  const currentId=await service.get_thread_id({board:'main',thread_id:'native-receiver'});
  assert.equal(currentId.registered,false);assert.equal(currentId.unregistered,true);assert.equal(currentId.participant_id,'receiver');assert.equal(currentId.receiver,null);
  await service.restore_thread_registration({board:'main',thread_id:'native-receiver'});
  const after=(await service.get_recipient(remove)).recipient;
  for(const field of ['participant_id','thread_id','project_id','conversation_url','metadata_observed_at','recency_at'])assert.equal(after[field],before[field]);
  assert.equal(after.registration_status,'active');assert.equal((await service.restore_thread_registration(remove)).changed,false);
  assert.equal((await service.list_recipients({board:'main',registration_status:'unregistered'})).recipients.length,0);
  assert.equal(db.connection.prepare('SELECT COUNT(*) n FROM messages').get().n,2);
  const state=createState();applyEvents(state,(await service.list_messages({board:'main'})).events);
  assert.equal(state.participants.get('receiver').unregistered_at,null);assert.equal(state.messages.get(saved.message.id).body,saved.message.body);
 }finally{db.close();}
});

test('removed senders, implicit re-registration and stale routes cannot post; the database closes the check/write race',async()=>{
 const {db,service}=await fixture();try{
  await service.unregister_thread({board:'main',participant_id:'sender'});
  await assert.rejects(service.post_message(post()),{code:'participant_unregistered'});
  await assert.rejects(service.register_participant({board:'main',participant_id:'sender',label:'Thread sender',kind:'thread',thread_id:'native-sender'}),{code:'participant_unregistered'});
  await assert.rejects(service.bind_participant_thread({board:'main',participant_id:'sender',thread_id:'native-sender'}),{code:'participant_unregistered'});
  await service.restore_thread_registration({board:'main',participant_id:'sender'});
  const active=service.activeParticipant.bind(service);let intercepted=false;
  service.activeParticipant=async(board,pid)=>{const row=await active(board,pid);if(pid==='sender'&&!intercepted){intercepted=true;await service.unregister_thread(remove);}return row;};
  await assert.rejects(service.post_message(post()),{code:'participant_unregistered'});
  assert.equal(db.connection.prepare('SELECT COUNT(*) n FROM messages').get().n,0);
  await assert.rejects(service.resolve_participant({board:'main',thread_id:'native-receiver'}),{code:'participant_not_found'});
  await service.post_message(post({board:'other'}));assert.equal(db.connection.prepare('SELECT COUNT(*) n FROM messages').get().n,1);
 }finally{db.close();}
});

test('cleanup requires an exact existing thread and never creates another route or affects non-thread participants',async()=>{
 const {db,service}=await fixture();try{
  for(const operation of ['unregister_thread','restore_thread_registration']){
   await assert.rejects(service[operation]({board:'missing',participant_id:'receiver'}),{code:'board_not_found'});
   await assert.rejects(service[operation]({board:'main',participant_id:'missing'}),{code:'participant_not_found'});
   await assert.rejects(service[operation]({board:'main',participant_id:'person'}),{code:'not_a_thread'});
   await assert.rejects(service[operation]({board:'main'}),{code:'invalid_address'});
   await assert.rejects(service[operation]({...remove,thread_id:'native-receiver'}),{code:'invalid_address'});
  }
  await service.register_participant({board:'main',participant_id:'duplicate',label:'Duplicate',kind:'thread',thread_id:'native-receiver'});
  await assert.rejects(service.unregister_thread({board:'main',thread_id:'native-receiver'}),{code:'ambiguous_address'});
  assert.equal(db.connection.prepare('SELECT COUNT(*) n FROM participants WHERE unregistered_at IS NOT NULL').get().n,0);
  assert.equal(db.connection.prepare("SELECT COUNT(*) n FROM boards WHERE id='missing'").get().n,0);
 }finally{db.close();}
});

test('removed-thread search and cursors are scoped to registration status, with active legacy cursors remaining usable',async()=>{
 const {db,service}=await fixture();try{
  for(let n=0;n<105;n++){const participant_id='old-'+String(n).padStart(3,'0');await service.register_participant({board:'main',participant_id,label:'Old '+n,kind:'thread',thread_id:'old-native-'+n});await service.unregister_thread({board:'main',participant_id});}
  const first=await service.list_recipients({board:'main',registration_status:'unregistered',query:'old'});
  assert.equal(first.recipients.length,50);assert.equal(first.has_more,true);
  const second=await service.list_recipients({board:'main',registration_status:'unregistered',query:'old',cursor:first.next_cursor});assert.equal(second.recipients.length,50);
  const third=await service.list_recipients({board:'main',registration_status:'unregistered',query:'old',cursor:second.next_cursor});assert.equal(third.recipients.length,5);
  await assert.rejects(service.list_recipients({board:'main',query:'old',cursor:first.next_cursor}),{code:'invalid_cursor'});
  assert.equal((await service.list_recipients({board:'main',query:'old'})).recipients.length,0);
  const active=await service.list_recipients({board:'main',limit:1}),tail=active.recipients[0];
  const legacy=btoa(JSON.stringify([1,'main','',tail.recency_at,tail.participant_id]));
  assert((await service.list_recipients({board:'main',cursor:legacy})).recipients.length>0);
  await assert.rejects(service.list_recipients({board:'main',registration_status:'unregistered',cursor:legacy}),{code:'invalid_cursor'});
 }finally{db.close();}
});

test('removal cancels pending notifications only on its board; restoring does not resume or replay them',async()=>{
 const {db,service}=await fixture();try{
  const env={OWNER_USER_ID:'owner',SITE_ORIGIN:'https://board.test',EVENT_SECRET_KEY:randomBytes(32).toString('base64')},requests=[];
  const transport=async(url,options)=>{const body=JSON.parse(options.body);requests.push(body);return body.type==='verification'?Response.json({challenge:body.challenge}):new Response(null,{status:204});};
  const events=new EventService(service,env,{transport,email:'owner@example.com'});
  const params=board=>({name:'message.created',arguments:{board,receiver_id:'receiver'},delivery:{mode:'webhook',url:'https://chatgpt.com/test-mcp-callback',secret:'whsec_'+randomBytes(32).toString('base64')}});
  const sub=await events.subscribe(params('main')),other=await events.subscribe(params('other'));
  const saved=await service.post_message(post());await events.reconcile();
  assert.equal(db.connection.prepare("SELECT COUNT(*) n FROM event_deliveries WHERE state='pending'").get().n,1);
  await service.unregister_thread(remove);
  assert.equal((await events.listSubscriptions({board:'main'})).subscriptions[0].paused,true);
  assert.equal((await events.listSubscriptions({board:'other'})).subscriptions[0].paused,false);
  assert.equal((await events.setup({board:'main',receiver_id:'receiver'})).state,'unregistered');
  assert.equal((await events.status({board:'main',message_id:saved.message.id})).notification.state,'cancelled');
  await assert.rejects(events.configure({subscription_id:sub.id,paused:false}),{code:'participant_unregistered'});
  await assert.rejects(events.subscribe(params('main')),{code:'participant_unregistered'});
  assert.equal((await events.dispatch()).attempted,0);
  await service.restore_thread_registration(remove);
  assert.equal((await events.setup({board:'main',receiver_id:'receiver'})).state,'paused');
  assert.equal((await events.dispatch()).attempted,0);
  await events.configure({subscription_id:sub.id,paused:false});
  await service.post_message(post({idempotency_key:'after-restore'}));
  assert.equal((await events.dispatch()).accepted,1);assert.equal(requests.filter(r=>r.name==='message.created').length,1);
  assert.equal(db.connection.prepare("SELECT state FROM event_deliveries WHERE event_id LIKE ?").get('%'+saved.message.id+'%').state,'cancelled');
  const notQueued=await service.post_message(post({idempotency_key:'before-next-removal'}));
  await service.unregister_thread(remove);await service.restore_thread_registration(remove);await events.configure({subscription_id:sub.id,paused:false});
  assert.equal((await events.dispatch()).attempted,0);
  assert.equal(db.connection.prepare('SELECT COUNT(*) n FROM event_deliveries d JOIN events e ON e.sequence=d.event_sequence WHERE e.entity_id=?').get(notQueued.message.id).n,0);
  assert.equal((await events.listSubscriptions({board:'other'})).subscriptions[0].id,other.id);
 }finally{db.close();}
});

test('removal during callback verification or receiving resume cannot create or re-enable a subscription',async()=>{
 const {db,service}=await fixture();try{
  const env={OWNER_USER_ID:'owner',SITE_ORIGIN:'https://board.test',EVENT_SECRET_KEY:randomBytes(32).toString('base64')};
  const params={name:'message.created',arguments:{board:'main',receiver_id:'receiver'},delivery:{mode:'webhook',url:'https://chatgpt.com/test-mcp-callback',secret:'whsec_'+randomBytes(32).toString('base64')}};
  const events=new EventService(service,env,{transport:async(url,options)=>{
    const body=JSON.parse(options.body);await service.unregister_thread(remove);return Response.json({challenge:body.challenge});
  }});
  await assert.rejects(events.subscribe(params),{code:'participant_unregistered'});
  assert.equal(db.connection.prepare('SELECT COUNT(*) n FROM event_subscriptions').get().n,0);
  await service.restore_thread_registration(remove);
  events.transport=async(url,options)=>Response.json({challenge:JSON.parse(options.body).challenge});
  const sub=await events.subscribe(params);await service.unregister_thread(remove);await service.restore_thread_registration(remove);
  const active=service.activeParticipant.bind(service);
  service.activeParticipant=async(...args)=>{const row=await active(...args);await service.unregister_thread(remove);return row;};
  await assert.rejects(events.configure({subscription_id:sub.id,paused:false}),{code:'participant_unregistered'});
  assert.equal((await events.setup({board:'main',receiver_id:'receiver'})).notification_ready,false);
  assert.equal((await events.listSubscriptions({board:'main'})).subscriptions[0].paused,true);
 }finally{db.close();}
});

test('MCP exposes board-scoped idempotent cleanup and the removed view never authorizes message delivery',async()=>{
 const {db,service}=await fixture();try{
  const invoke=(name,args)=>rpc({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}},service);
  assert.equal(tools.find(t=>t.name==='unregister_thread').annotations.idempotentHint,true);
  const result=await invoke('unregister_thread',remove);assert.equal(result.result.isError,false);
  const active=await invoke('show_recipient_picker',{board:'main'});assert(!active.result.structuredContent.recipients.some(r=>r.participant_id==='receiver'));
  const archived=await invoke('show_recipient_picker',{board:'main',registration_status:'unregistered'});
  assert.equal(archived.result.structuredContent.selection_sends,false);assert.equal(archived.result.structuredContent.recipients[0].participant_id,'receiver');
  const archiveWithDraft=await invoke('show_recipient_picker',{board:'main',registration_status:'unregistered',mode:'send_agreed',agreed_message:{sender_id:'sender',sender_label:'Thread sender',topic:'Frozen',body:'Keep this draft.',idempotency_key:'draft-key'}});
  assert.equal(archiveWithDraft.result.structuredContent.selection_sends,false);assert.equal(archiveWithDraft.result.structuredContent.agreed_message.body,'Keep this draft.');
  await service.update_recipient_metadata({board:'main',entries:[{participant_id:'receiver',thread_id:'native-receiver',title:'New cached name'}]});
  assert.equal((await service.list_recipients({board:'main',query:'New cached name'})).recipients.length,0);
  assert.equal((await service.list_recipients({board:'main',registration_status:'unregistered',query:'New cached name'})).recipients.length,1);
  assert.equal(db.connection.prepare('SELECT COUNT(*) n FROM messages').get().n,0);
  assert.equal((await invoke('restore_thread_registration',remove)).result.isError,false);
 }finally{db.close();}
});

test('the additive migration leaves existing messages, receipts and thread addresses active',async()=>{
 const journal=JSON.parse(await readFile('drizzle/meta/_journal.json','utf8')),db=new SqliteD1();
 try{
  db.connection.exec((await Promise.all(journal.entries.filter(e=>e.idx<7).map(e=>readFile('drizzle/'+e.tag+'.sql','utf8')))).join('\n'));
  const service=new BoardService(db,'owner');
  for(const participant_id of ['sender','receiver'])await service.register_participant({board:'main',participant_id,label:participant_id,kind:'thread',thread_id:'native-'+participant_id});
  db.connection.prepare("INSERT INTO messages(id,board,sender_id,sender_label,receiver_id,topic,body,authored_by,fingerprint) VALUES('legacy-message','main','sender','Sender','receiver','Legacy','Saved history','owner','legacy-fingerprint')").run();
  db.connection.prepare("INSERT INTO acknowledgments(board,message_id,participant_id,acknowledged_by) VALUES('main','legacy-message','receiver','owner')").run();
  db.connection.exec(await readFile('drizzle/0007_thread-registration.sql','utf8'));
  assert.equal((await service.list_recipients({board:'main'})).recipients.length,2);
  assert.equal(db.connection.prepare("SELECT thread_id,unregistered_at FROM participants WHERE id='receiver'").get().thread_id,'native-receiver');
  assert.equal((await service.get_message({board:'main',message_id:'legacy-message'})).acknowledgments.length,1);
  assert.equal(db.connection.prepare('PRAGMA foreign_key_check').all().length,0);
 }finally{db.close();}
});

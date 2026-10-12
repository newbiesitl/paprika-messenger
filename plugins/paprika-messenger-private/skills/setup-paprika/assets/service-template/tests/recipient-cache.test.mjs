import test from 'node:test';
import assert from 'node:assert/strict';
import {SqliteD1} from './d1-adapter.mjs';
import {loadMigrations} from './migrations.mjs';
import {BoardService} from '../src/service.mjs';
import {createRecipientPageCache,browserRecipientPageCache} from '../web/recipient-cache.js';

async function fixture(){const db=new SqliteD1();db.connection.exec(await loadMigrations());return {db,service:new BoardService(db,'owner',{SITE_ORIGIN:'https://fixture.test'})};}
const register=(service,participant_id,board='main',thread_id='native-'+participant_id)=>service.register_participant({board,participant_id,label:'Fixture '+participant_id,kind:'thread',...(thread_id?{thread_id}:{})});
const post={board:'main',sender_id:'sender',sender_label:'Fixture sender',receiver_id:'receiver',topic:'Fixture',body:'Saved fixture text',idempotency_key:'cache-fixture-post'};

test('new boards and thread registrations update independent monotonic revisions without readers consuming flags',async()=>{
 const {db,service}=await fixture();try{
  const start=await service.get_recipient_directory_state({});
  assert.deepEqual(await service.get_recipient_directory_state({board:'main'}),start);
  await service.create_board({board:'other',label:'Other'});
  const addedBoard=await service.get_recipient_directory_state({board:'main'});
  assert.equal(addedBoard.boards_revision,start.boards_revision+1);assert.equal(addedBoard.directory_revision,start.directory_revision);
  await register(service,'new-thread');const addedThread=await service.get_recipient_directory_state({board:'main'});
  assert.equal(addedThread.directory_revision,start.directory_revision+1);assert.equal(addedThread.boards_revision,addedBoard.boards_revision);
  await register(service,'new-thread');await service.create_board({board:'other',label:'Other'});
  assert.deepEqual(await service.get_recipient_directory_state({board:'main'}),addedThread);
  const other=await service.get_recipient_directory_state({board:'other'});await register(service,'other-thread','other');
  assert.deepEqual(await service.get_recipient_directory_state({board:'main'}),addedThread);
  assert.equal((await service.get_recipient_directory_state({board:'other'})).directory_revision,other.directory_revision+1);
  const list=await service.list_boards({});assert.equal(list.boards_revision,addedThread.boards_revision);assert.equal(list.cache_scope,addedThread.cache_scope);
 }finally{db.close();}
});

test('concurrent registrations cannot lose increments and a rolled-back write rolls back its revision too',async()=>{
 const {db,service}=await fixture();try{
  const start=await service.get_recipient_directory_state({board:'main'});
  await Promise.all(Array.from({length:30},(_,n)=>register(service,'parallel-'+n)));
  const changed=await service.get_recipient_directory_state({board:'main'});
  assert.equal(changed.directory_revision,start.directory_revision+30);
  await assert.rejects(db.batch([
    db.prepare("INSERT INTO participants(board,id,label,kind,registered_by) VALUES('main','rollback-fixture','Rollback','thread','owner')"),
    db.prepare("INSERT INTO participants(board,id,label,kind,registered_by) VALUES('unknown','failure-fixture','Failure','thread','owner')")
  ]));
  assert.deepEqual(await service.get_recipient_directory_state({board:'main'}),changed);
  assert.equal(db.connection.prepare("SELECT COUNT(*) n FROM participants WHERE id='rollback-fixture'").get().n,0);
 }finally{db.close();}
});

test('metadata, bindings, routing links, removal and communication recency invalidate pages while reads and retries do not',async()=>{
 const {db,service}=await fixture();try{
  await register(service,'sender');await register(service,'receiver',undefined,null);
  let previous=(await service.get_recipient_directory_state({board:'main'})).directory_revision;
  const increased=async()=>{const state=await service.get_recipient_directory_state({board:'main'});assert(state.directory_revision>previous);previous=state.directory_revision;};
  await service.bind_participant_thread({board:'main',participant_id:'receiver',thread_id:'native-receiver'});await increased();
  await service.update_recipient_metadata({board:'main',entries:[{participant_id:'receiver',thread_id:'native-receiver',title:'New native name'}]});await increased();
  const saved=await service.post_message(post);await increased();
  await service.post_message(post);await service.get_inbox({board:'main',receiver_id:'receiver'});await service.list_recipients({board:'main'});
  await service.acknowledge_message({board:'main',message_id:saved.message.id,participant_id:'receiver'});
  assert.equal((await service.get_recipient_directory_state({board:'main'})).directory_revision,previous);
  await service.unregister_thread({board:'main',participant_id:'receiver'});await increased();
  await service.restore_thread_registration({board:'main',participant_id:'receiver'});await increased();
  const conversation_id='11111111-2222-4333-8444-555555555555';
  await service.set_recipient_conversation({board:'main',participant_id:'receiver',registered_thread_id:'native-receiver',conversation:conversation_id,host_observation:{id:conversation_id,kind:'chatgpt'},expected_revision:0});await increased();
 }finally{db.close();}
});

test('a page retains the revision of its own snapshot even if registration commits immediately afterward',async()=>{
 const {db,service}=await fixture();try{
  await register(service,'old');const before=await service.get_recipient_directory_state({board:'main'}),batch=db.batch.bind(db);let inserted=false;
  db.batch=async statements=>{const result=await batch(statements);
    if(!inserted&&statements.some(s=>s.sql.includes('FROM participants p LEFT JOIN'))){inserted=true;await register(service,'new-after-read');}return result;};
  const page=await service.list_recipients({board:'main'});
  assert.equal(page.directory_revision,before.directory_revision);assert(!page.recipients.some(r=>r.participant_id==='new-after-read'));
  assert((await service.get_recipient_directory_state({board:'main'})).directory_revision>page.directory_revision);
  assert((await service.list_recipients({board:'main'})).recipients.some(r=>r.participant_id==='new-after-read'));
 }finally{db.close();}
});

const cachePage=(extra={})=>({board:'main',query:'',registration_status:'active',page_limit:50,page_cursor:null,cache_scope:'fixture-scope',directory_revision:2,boards_revision:1,has_more:false,next_cursor:null,
 recipients:[{participant_id:'fixture',thread_id:'native-fixture',thread_name:'Fixture name',registration_status:'active',body:'Never cache a body',credential:'Never cache a credential'}],...extra});
function storageFixture(){const values=new Map();return {getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value),values};}

test('local pages survive a client reload, separate scopes/search/cursors/archive and never persist pending messages or credentials',()=>{
 const storage=storageFixture(),cache=createRecipientPageCache({storage}),context={board:'main',cache_scope:'fixture-scope'};
 const page=cachePage({agreed_message:{body:'Secret pending body',idempotency_key:'secret-pending-key'},sender_id:'secret-sender'});
 cache.write(context,{},page);const serialized=[...storage.values.values()].join('');
 for(const excluded of ['Secret pending body','secret-pending-key','secret-sender','Never cache a body','Never cache a credential'])assert(!serialized.includes(excluded));
 const restarted=createRecipientPageCache({storage}),hit=restarted.read(context,{});
 assert.equal(hit.local_cache_hit,true);assert.equal(hit.recipients[0].thread_name,'Fixture name');
 hit.recipients[0].thread_name='Changed locally';assert.equal(restarted.read(context,{}).recipients[0].thread_name,'Fixture name');
 for(const args of [{query:'different'},{cursor:'next-cursor'},{registration_status:'unregistered'},{limit:5}])assert.equal(restarted.read(context,args),null);
 assert.equal(restarted.read({board:'other',cache_scope:'fixture-scope'},{}),null);assert.equal(restarted.read({board:'main',cache_scope:'other-scope'},{}),null);
 cache.write(context,{query:' NAME '},cachePage({query:'name'}));assert(cache.read(context,{query:'name'}));
});

test('unsupported storage, malformed saved pages, expiry and bounded eviction fall back without breaking the menu',()=>{
 let time=10000;const storage=storageFixture(),cache=createRecipientPageCache({storage,maxPages:2,maxAgeMs:100,now:()=>time}),context={board:'main',cache_scope:'fixture-scope'};
 for(const query of ['one','two','three'])cache.write(context,{query},cachePage({query}));
 assert.equal(cache.read(context,{query:'one'}),null);assert(cache.read(context,{query:'three'}));time+=101;assert.equal(cache.read(context,{query:'three'}),null);
 storage.setItem('paprika-recipient-pages-v1','invalid JSON');assert.equal(createRecipientPageCache({storage}).read(context,{}),null);
 const blocked={get localStorage(){throw Error('Storage blocked');}};const unavailable=browserRecipientPageCache(blocked);
 assert.equal(unavailable.read(context,{}),null);unavailable.write(context,{},cachePage());assert(unavailable.read(context,{}));
 unavailable.write(context,{},cachePage({recipients:[null]}));assert.equal(unavailable.read(context,{}).recipients[0].participant_id,'fixture');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SqliteD1 } from './d1-adapter.mjs';
import { loadMigrations } from './migrations.mjs';
import { BoardService } from '../src/service.mjs';
import { showRecipientPicker } from '../src/recipient-ui.mjs';
import { rpc, tools } from '../src/protocol.mjs';
import { recipientResourceUri } from '../src/recipient-directory.mjs';

async function setup(count=3) {
  const db=new SqliteD1();db.connection.exec(await loadMigrations());const service=new BoardService(db,'owner');
  for(let n=0;n<count;n++){const pid='fixture-'+String(n).padStart(3,'0');await service.register_participant({board:'main',participant_id:pid,label:'Registered '+n,kind:'thread',thread_id:'native-'+n});db.connection.prepare('UPDATE participants SET created_at=? WHERE board=? AND id=?').run(new Date(Date.UTC(2020,0,1,0,0,n)).toISOString(),'main',pid);}
  return {db,service};
}
const metadata=(n,extra={})=>({participant_id:'fixture-'+String(n).padStart(3,'0'),thread_id:'native-'+n,title:'Native conversation '+n,source:'codex',execution_mode:'local',project_status:'unknown',...extra});
const post=(receiver='fixture-001',key='fixture-post')=>({board:'main',sender_id:'fixture-000',sender_label:'Registered 0',receiver_id:receiver,topic:'Agreed topic',body:'Agreed text',idempotency_key:key});

test('directory pages the communication roster, searches older IDs/names globally and isolates boards and cursors',async()=>{
  const {db,service}=await setup(105);
  try {
    await service.update_recipient_metadata({board:'main',entries:[metadata(0,{title:'Older 特別 ÉCLAIR_%',project_status:'assigned',project_id:'native-project',project_name:'Native project'})]});
    let page=await service.list_recipients({board:'main'}),ids=[...page.recipients.map(r=>r.participant_id)];assert.equal(page.recipients.length,50);assert.equal(page.has_more,true);assert.equal(page.recipients[0].participant_id,'fixture-104');assert.equal(page.metadata_refresh_candidates.length,50);
    const firstCursor=page.next_cursor;
    while(page.has_more){page=await service.list_recipients({board:'main',cursor:page.next_cursor});ids.push(...page.recipients.map(r=>r.participant_id));}
    assert.equal(ids.length,105);assert.equal(new Set(ids).size,105);assert.equal(page.next_cursor,null);
    for(const query of ['native-0','fixture-000','éclair_%','特別']){const result=await service.list_recipients({board:'main',query});assert.equal(result.recipients.length,1);assert.equal(result.recipients[0].participant_id,'fixture-000');}
    assert.equal((await service.list_recipients({board:'main',query:'%'})).recipients.length,1);
    await service.create_board({board:'other',label:'Other board'});await service.register_participant({board:'other',participant_id:'fixture-000',label:'Other',kind:'thread',thread_id:'different-native'});
    assert.equal((await service.list_recipients({board:'other'})).recipients[0].thread_id,'different-native');
    await assert.rejects(service.list_recipients({board:'other',cursor:firstCursor}),{code:'invalid_cursor'});
    await assert.rejects(service.list_recipients({board:'main',query:'different',cursor:firstCursor}),{code:'invalid_cursor'});
    for(const args of [{limit:51},{cursor:'broken'},{query:'x'.repeat(161)}])await assert.rejects(service.list_recipients({board:'main',...args}));
  }finally{db.close();}
});

test('Unicode name searches have valid multi-page cursors and literal normalized title matching',async()=>{
  const {db,service}=await setup(55);
  try {
    for(let offset=0;offset<55;offset+=50)await service.update_recipient_metadata({board:'main',entries:Array.from({length:Math.min(50,55-offset)},(_,index)=>metadata(offset+index,{title:'会話 ＡＢＣ '+index}))});
    const first=await service.list_recipients({board:'main',query:'会話 abc'});assert.equal(first.recipients.length,50);
    const second=await service.list_recipients({board:'main',query:'会話 ABC',cursor:first.next_cursor});assert.equal(second.recipients.length,5);assert.equal(second.has_more,false);
  }finally{db.close();}
});

test('50 metadata observations stay within D1 query and parameter budgets and retain cached unknown project data during the TTL',async()=>{
  const {db,service}=await setup(50);
  try {
    const originalPrepare=db.prepare.bind(db);let queries=0;db.prepare=sql=>{queries++;const statement=originalPrepare(sql),originalBind=statement.bind.bind(statement);statement.bind=(...values)=>{assert(values.length<=100);return originalBind(...values);};return statement;};
    const result=await service.update_recipient_metadata({board:'main',entries:Array.from({length:50},(_,n)=>metadata(n))});assert.equal(result.processed,50);assert(queries<=12);
    const page=await service.list_recipients({board:'main'});assert.equal(page.metadata_refresh_candidates.length,0);assert.equal(page.recipients.every(r=>r.project_status==='unknown'),true);
  }finally{db.close();}
});

test('metadata tracks renames and moves without rewriting routes, treating unavailable projects differently from unassigned',async()=>{
  const {db,service}=await setup();
  try {
    const time=new Date(Date.now()-2000).toISOString();
    await service.update_recipient_metadata({board:'main',entries:[metadata(1,{title:'Original',project_status:'assigned',project_id:'project-a',project_name:'Project A',observed_at:time})]});
    await service.update_recipient_metadata({board:'main',entries:[metadata(1,{title:'Renamed',source:'unknown',execution_mode:'unknown'})]});
    let r=(await service.get_recipient({board:'main',participant_id:'fixture-001'})).recipient;
    assert.equal(r.thread_name,'Renamed');assert.equal(r.source,'codex');assert.equal(r.execution_mode,'local');assert.equal(r.project_id,'project-a');assert.equal(r.project_status,'assigned');
    const past=new Date(Date.now()-600000).toISOString();await service.update_recipient_metadata({board:'main',entries:[metadata(1,{title:'Old observation',project_status:'unassigned',observed_at:past})]});
    r=(await service.get_recipient({board:'main',participant_id:'fixture-001'})).recipient;assert.equal(r.thread_name,'Renamed');assert.equal(r.project_id,'project-a');
    await service.update_recipient_metadata({board:'main',entries:[metadata(1,{title:'Moved',project_status:'assigned',project_id:'project-b',project_name:'Project B'})]});
    r=(await service.get_recipient({board:'main',participant_id:'fixture-001'})).recipient;assert.equal(r.project_id,'project-b');assert.equal(r.thread_id,'native-1');
    await service.update_recipient_metadata({board:'main',entries:[metadata(1,{project_status:'unassigned'})]});
    r=(await service.get_recipient({board:'main',participant_id:'fixture-001'})).recipient;assert.equal(r.project_status,'unassigned');assert.equal(r.project_id,null);
    await assert.rejects(service.update_recipient_metadata({board:'main',entries:[metadata(1,{thread_id:'wrong-native'})]}),{code:'thread_binding_conflict'});
    const count=db.connection.prepare('SELECT COUNT(*) n FROM recipient_metadata').get().n;
    await assert.rejects(service.update_recipient_metadata({board:'main',entries:[metadata(0),metadata(2,{project_status:'assigned'})]}));
    assert.equal(db.connection.prepare('SELECT COUNT(*) n FROM recipient_metadata').get().n,count);
    await assert.rejects(service.update_recipient_metadata({board:'main',entries:[metadata(0),metadata(0)]}));
    await assert.rejects(service.update_recipient_metadata({board:'main',entries:[metadata(0,{observed_at:new Date(Date.now()+120000).toISOString()})]}));
    assert.equal((await service.resolve_participant({board:'main',participant_id:'fixture-001'})).participant.label,'Registered 1');
  }finally{db.close();}
});

test('only newly posted messages update communication recency and neither picker flow sends by rendering',async()=>{
  const {db,service}=await setup(60);
  try {
    const sent=await service.post_message(post());const activity=()=>db.connection.prepare('SELECT * FROM recipient_activity ORDER BY participant_id').all();const initial=activity();assert.equal(initial.length,2);
    const first=await service.list_recipients({board:'main'});assert.deepEqual(new Set(first.recipients.slice(0,2).map(r=>r.participant_id)),new Set(['fixture-000','fixture-001']));
    await service.post_message(post());await service.get_inbox({board:'main',receiver_id:'fixture-001'});await service.acknowledge_message({board:'main',message_id:sent.message.id,participant_id:'fixture-001'});await service.delete_message({board:'main',message_id:sent.message.id});await service.restore_message({board:'main',message_id:sent.message.id});await service.update_recipient_metadata({board:'main',entries:[metadata(3)]});
    const choose=await showRecipientPicker(service,{});assert.equal(choose.board,'main');assert.equal(choose.mode,'choose');assert.equal(choose.selection_sends,false);assert.equal(choose.board_options.some(b=>b.id==='main'),true);
    const agreed=post();delete agreed.board;delete agreed.receiver_id;
    const card=await showRecipientPicker(service,{mode:'send_agreed',agreed_message:agreed});assert.deepEqual(card.agreed_message,agreed);assert.equal(card.selection_sends,true);
    assert.deepEqual(activity(),initial);assert.equal(db.connection.prepare('SELECT COUNT(*) n FROM messages').get().n,1);
    await service.create_board({board:'other',label:'Other board'});
    await assert.rejects(showRecipientPicker(service,{board:'other',mode:'send_agreed',agreed_message:agreed}),{code:'participant_not_found'});
    await assert.rejects(showRecipientPicker(service,{mode:'choose',agreed_message:agreed}));
    await assert.rejects(showRecipientPicker(service,{mode:'send_agreed',agreed_message:{...agreed,sender_label:'Guessed sender'}}),{code:'sender_label_conflict'});
  }finally{db.close();}
});

test('additive migration backfills prior communications and leaves existing API writes compatible',async()=>{
  const db=new SqliteD1();const journal=JSON.parse(await readFile('drizzle/meta/_journal.json','utf8'));
  try {
    for(const entry of journal.entries.slice(0,4))db.connection.exec(await readFile('drizzle/'+entry.tag+'.sql','utf8'));
    const service=new BoardService(db,'owner');for(const n of [0,1])await service.register_participant({board:'main',participant_id:'fixture-00'+n,label:'Registered '+n,kind:'thread',thread_id:'native-'+n});
    const sent=await service.post_message(post());await service.delete_message({board:'main',message_id:sent.message.id});
    db.connection.exec(await readFile('drizzle/0004_recipient-directory.sql','utf8'));assert.equal(db.connection.prepare('SELECT COUNT(*) n FROM recipient_activity').get().n,2);
    await service.restore_message({board:'main',message_id:sent.message.id});const retry=await service.post_message(post());assert.equal(retry.message.id,sent.message.id);
    await service.post_message(post('fixture-001','new-key'));assert.equal((await service.get_inbox({board:'main',receiver_id:'fixture-001'})).messages.length,2);
    assert.equal((await service.resolve_participant({board:'main',participant_id:'fixture-001'})).participant.thread_id,'native-1');
  }finally{db.close();}
});

test('native mention resources return canonical addresses and require authenticated data access',async()=>{
  const {db,service}=await setup();
  try {
    const initialize=await rpc({jsonrpc:'2.0',id:1,method:'initialize',params:{}},null);assert.equal(initialize.result.capabilities.extensions['openai/mentions'].searchTool,'search_recipient_mentions');
    const definition=tools.find(t=>t.name==='search_recipient_mentions');assert.equal(definition.annotations.readOnlyHint,true);assert.deepEqual(definition._meta.ui.visibility,['app']);
    const result=await rpc({jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'search_recipient_mentions',arguments:{query:'native-1'}}},service);
    assert.deepEqual(result.result.content,[]);assert.equal(result.result.structuredContent.items.length,1);const uri=recipientResourceUri('main','fixture-001');assert.equal(result.result.structuredContent.items[0].uri,uri);
    const resource=await rpc({jsonrpc:'2.0',id:3,method:'resources/read',params:{uri}},service);assert.equal(JSON.parse(resource.result.contents[0].text).receiver_id,'fixture-001');
    await assert.rejects(rpc({jsonrpc:'2.0',id:3,method:'resources/read',params:{uri}},null),{code:'authentication_required'});
    const missing=await rpc({jsonrpc:'2.0',id:3,method:'resources/read',params:{uri:recipientResourceUri('main','missing')}},service);assert.equal(missing.error.data.reason,'participant_not_found');
  }finally{db.close();}
});

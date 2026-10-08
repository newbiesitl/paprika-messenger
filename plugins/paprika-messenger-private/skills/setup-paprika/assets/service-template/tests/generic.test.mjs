import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SqliteD1 } from './d1-adapter.mjs';
import { loadMigrations, migrateDevelopmentDatabase } from './migrations.mjs';
import { BoardService } from '../src/service.mjs';
import { createState, applyEvents } from '../web/state.js';
import { stageTemplate } from '../scripts/bundle.mjs';

async function fresh() {
  const db=new SqliteD1();db.connection.exec(await loadMigrations());
  return {db,service:new BoardService(db,'owner')};
}
test('fresh deployments discover only main; arbitrary project creation is repeatable and paginated',async()=>{
  const {db,service}=await fresh();
  try{
    assert.deepEqual((await service.list_boards({})).boards.map(b=>b.id),['main']);
    assert.equal((await service.list_participants({board:'main'})).participants.length,0);
    const args={board:'design:2026',label:'Design',description:'A project unrelated to the original use case'};
    assert.deepEqual(await service.create_board(args),await service.create_board(args));
    await assert.rejects(service.create_board({...args,label:'Different'}),e=>e.code==='board_conflict');
    await assert.rejects(service.create_board({board:'../bad',label:'Invalid'}),e=>e.status===400);
    await assert.rejects(service.create_board({board:'empty-label',label:''}),e=>e.status===400);
    await assert.rejects(service.create_board({board:'long-description',label:'Example',description:'😀'.repeat(126)}),e=>e.status===400);
    await assert.rejects(service.list_messages({board:'unknown'}),e=>e.code==='board_not_found');
    await service.create_board({board:'support',label:'Support'});
    const ids=[];let after_id;
    do{const page=await service.list_boards({limit:1,...(after_id?{after_id}:{})});ids.push(...page.boards.map(b=>b.id));after_id=page.next_after_id;if(!page.has_more)break;}while(true);
    assert.deepEqual(ids,['design:2026','main','support']);
    assert.equal((await service.get_coordination_note({board:'design:2026'})).note.body,'');
  }finally{db.close();}
});

test('Dot, ChatGPT and Codex routing works on any board with no cross-board message or reply leakage',async()=>{
  const {db,service}=await fresh();
  try{
    for(const board of ['product','support']){
      await service.create_board({board,label:board});
      for(const [participant_id,kind] of [['dot-assistant','agent'],['chatgpt-plan','thread'],['codex-review','thread']])
        await service.register_participant({board,participant_id,label:participant_id,kind});
    }
    const sent=await service.post_message({board:'product',sender_id:'dot-assistant',sender_label:'Dot',receiver_id:'chatgpt-plan',topic:'design',body:'Please review the design.',idempotency_key:'first'});
    const reply=await service.post_message({board:'product',sender_id:'chatgpt-plan',sender_label:'Planning',receiver_id:'codex-review',topic:'design',body:'Here is the agreed context.',reply_to_id:sent.message.id});
    assert.equal((await service.get_inbox({board:'product',receiver_id:'codex-review'})).messages[0].id,reply.message.id);
    assert.equal((await service.get_inbox({board:'support',receiver_id:'codex-review'})).messages.length,0);
    await assert.rejects(service.get_message({board:'support',message_id:sent.message.id}),e=>e.code==='message_not_found');
    await assert.rejects(service.post_message({board:'support',sender_id:'dot-assistant',sender_label:'Dot',receiver_id:'codex-review',topic:'design',body:'Wrong board',reply_to_id:sent.message.id}),e=>e.code==='message_not_found');
    assert.equal((await service.get_message({board:'product',message_id:reply.message.id})).acknowledgments.length,0);
  }finally{db.close();}
});

test('generic pinned notes have atomic revisions, literal bodies and compatible event replay',async()=>{
  const {db,service}=await fresh();
  try{
    const body='<script>alert(1)</script>\nProject handoff';
    const before=await service.list_messages({board:'main'});
    const writes=await Promise.allSettled([
      service.updateCoordination({board:'main',expected_revision:0,title:'Handoff',body}),
      service.updateCoordination({board:'main',expected_revision:0,title:'Other',body:'Concurrent edit'})
    ]);
    assert.equal(writes.filter(r=>r.status==='fulfilled').length,1);
    assert.equal(writes.find(r=>r.status==='rejected').reason.code,'revision_conflict');
    const note=(await service.get_coordination_note({board:'main'})).note;
    assert.equal(note.body,body);assert.equal(note.launch_status,'HOLD');assert.equal(note.revision,1);
    const state=createState();applyEvents(state,(await service.list_messages({board:'main',cursor:before.next_cursor})).events);
    assert.equal(state.note.body,body);assert.equal(state.note.title,'Handoff');
    await assert.rejects(service.updateCoordination({board:'main',expected_revision:1,title:'Mixed',body:'x',launch_status:'RELEASE'}),e=>e.status===400);
    await assert.rejects(service.updateCoordination({board:'main',expected_revision:1,title:'Too large',body:'😀'.repeat(4001)}),e=>e.status===400);
    await service.updateCoordination({board:'main',expected_revision:1,title:'Cleared',body:''});
    assert.equal((await service.get_coordination_note({board:'main'})).note.body,'');
  }finally{db.close();}
});

test('additive upgrade preserves old board data, note state, event history and legacy clients',async()=>{
  const db=new SqliteD1();
  try{
    db.connection.exec(await readFile('drizzle/0000_board.sql','utf8'));
    db.connection.exec(await readFile('drizzle/0001_event-triggers.sql','utf8'));
    db.connection.exec("INSERT INTO boards(id) VALUES('vex'); INSERT INTO coordination(board) VALUES('vex'); INSERT INTO participants(board,id,label,kind,registered_by) VALUES('vex','legacy','Legacy','agent','owner')");
    db.connection.prepare('INSERT INTO messages(id,board,sender_id,sender_label,receiver_id,topic,body,authored_by,fingerprint) VALUES(?,?,?,?,?,?,?,?,?)').run('old-message','vex','legacy','Legacy','legacy','handoff','Preserved content','owner','legacy');
    const oldEvents=db.connection.prepare('SELECT * FROM events ORDER BY sequence').all();
    // Use the same upgrade runner as existing previews; it applies the generated delta.
    await migrateDevelopmentDatabase(db.connection);
    const service=new BoardService(db,'owner');
    assert.equal((await service.get_message({board:'vex',message_id:'old-message'})).message.body,'Preserved content');
    assert.deepEqual(db.connection.prepare('SELECT * FROM events ORDER BY sequence').all(),oldEvents);
    const initial=(await service.get_coordination_note({board:'vex'})).note;assert(initial.body.includes('Status: HOLD'));assert.equal(initial.revision,0);
    assert.equal((await service.list_boards({})).boards.find(b=>b.id==='vex').label,'vex');
    await service.updateCoordination({board:'vex',expected_revision:0,queue_reference:'Existing queue',execution_owner:'Existing owner',launch_status:'HOLD',reported_clock:'Reported time'});
    const feed=await service.list_messages({board:'vex'}),state=createState();applyEvents(state,feed.events);
    assert(state.note.body.includes('Existing queue'));assert.equal(state.note.launch_status,'HOLD');
    const legacyEvent={...feed.events.at(-1),payload:{...feed.events.at(-1).payload}};
    delete legacyEvent.payload.title;delete legacyEvent.payload.body;
    const oldReplay=createState();applyEvents(oldReplay,[legacyEvent]);assert(oldReplay.note.body.includes('Existing queue'));
    await service.updateCoordination({board:'vex',expected_revision:1,title:'Project context',body:'Generic note'});
    assert.equal((await service.get_coordination_note({board:'vex'})).note.queue_reference,'Existing queue');
    const count=db.connection.prepare('SELECT COUNT(*) n FROM events').get().n;
    await migrateDevelopmentDatabase(db.connection);assert.equal(db.connection.prepare('SELECT COUNT(*) n FROM events').get().n,count);
  }finally{db.close();}
});

test('reusable template excludes deployment identity, credentials, Git and runtime data',async()=>{
  const folder=await mkdtemp(join(tmpdir(),'dot-template-'));
  try{
    await stageTemplate(folder);
    const hosting=JSON.parse(await readFile(join(folder,'.openai/hosting.json'),'utf8'));
    assert.deepEqual(hosting,{d1:'DB',r2:null,capabilities:['mcp']});
    const names=await readdir(folder);
    for(const forbidden of ['.git','.dev-data','.sites-runtime','node_modules','artifacts','dist','.env'])assert(!names.includes(forbidden));
    const original=JSON.parse(await readFile('.openai/hosting.json','utf8'));
    async function inspect(path){for(const entry of await readdir(path,{withFileTypes:true})){const child=join(path,entry.name);if(entry.isDirectory())await inspect(child);else{const source=await readFile(child,'utf8');if(original.project_id)assert(!source.includes(original.project_id),`Leaked project identity in ${child}`);assert(!source.includes(process.cwd()),`Leaked workspace path in ${child}`);}}}
    await inspect(folder);
  }finally{await rm(folder,{recursive:true});}
});

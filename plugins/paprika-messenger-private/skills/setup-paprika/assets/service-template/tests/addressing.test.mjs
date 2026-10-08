import test from 'node:test';
import assert from 'node:assert/strict';
import { SqliteD1 } from './d1-adapter.mjs';
import { loadMigrations } from './migrations.mjs';
import { BoardService } from '../src/service.mjs';

async function setup() {
  const db=new SqliteD1();db.connection.exec(await loadMigrations());
  const service=new BoardService(db,'owner');
  for(const a of [
    {participant_id:'sender',label:'Sending agent',kind:'agent'},
    {participant_id:'review',label:'Design review',kind:'thread',thread_id:'thread-design'},
    {participant_id:'build',label:'Build session',kind:'thread',thread_id:'thread-build'}
  ]) await service.register_participant({board:'main',...a});
  return {db,service};
}
const post=address=>({board:'main',sender_id:'sender',sender_label:'Sending agent',topic:'handoff',body:'Please review this context.',...address});
const error=code=>e=>e.code===code;

test('all three exact addresses resolve, send and read the same canonical inbox',async()=>{
  const {db,service}=await setup();
  try {
    for(const [address,receiver,matched_by] of [
      [{participant_id:'review'},{receiver_id:'review'},'participant_id'],
      [{thread_id:'thread-design'},{receiver_thread_id:'thread-design'},'thread_id'],
      [{label:'Design review'},{receiver_label:'Design review'},'label']
    ]) {
      const resolved=await service.resolve_participant({board:'main',...address});
      assert.equal(resolved.participant.id,'review');assert.equal(resolved.matched_by,matched_by);
      const sent=await service.post_message(post(receiver));
      assert.equal(sent.message.receiver_id,'review');
      assert((await service.get_inbox({board:'main',...receiver})).messages.some(m=>m.id===sent.message.id));
    }
    const inbox=await service.get_inbox({board:'main',receiver_label:'Design review'});
    assert.equal(inbox.receiver_id,'review');assert.equal(inbox.unacknowledged_count,3);
    assert.equal((await service.get_inbox({board:'main',receiver_thread_id:'thread-build'})).unacknowledged_count,0);
    for(const m of inbox.messages) assert.equal((await service.get_message({board:'main',message_id:m.id})).acknowledgments.length,0);
  } finally {db.close();}
});

test('idempotent retries can use another address for the same participant without duplicating delivery',async()=>{
  const {db,service}=await setup();
  try {
    const sent=await service.post_message(post({receiver_label:'Design review',idempotency_key:'same-message'}));
    for(const address of [{receiver_id:'review'},{receiver_thread_id:'thread-design'}]) {
      const retried=await service.post_message(post({...address,idempotency_key:'same-message'}));
      assert.equal(retried.message.id,sent.message.id);assert.equal(retried.duplicate,true);
    }
    await assert.rejects(service.post_message(post({receiver_id:'build',idempotency_key:'same-message'})),error('idempotency_conflict'));
    assert.equal(db.connection.prepare("SELECT COUNT(*) n FROM events WHERE kind='message_posted'").get().n,1);
  } finally {db.close();}
});

test('addresses must select exactly one namespace and labels match literally',async()=>{
  const {db,service}=await setup();
  try {
    for(const address of [{},{receiver_id:'review',receiver_label:'Design review'},{receiver_id:'review',receiver_thread_id:'thread-design'}])
      await assert.rejects(service.post_message(post(address)),error('invalid_address'));
    await assert.rejects(service.get_inbox({board:'main'}),error('invalid_address'));
    await assert.rejects(service.resolve_participant({board:'main',participant_id:'review',thread_id:'thread-design'}),error('invalid_address'));
    for(const label of ['design review',' Design review','Design','missing'])
      await assert.rejects(service.post_message(post({receiver_label:label})),error('participant_not_found'));
    await assert.rejects(service.post_message(post({receiver_thread_id:'missing'})),error('participant_not_found'));
    await assert.rejects(service.post_message(post({receiver_label:null})),error('invalid_argument'));
    await assert.rejects(service.post_message(post({receiver_id:'../../bad'})),error('invalid_id'));
    assert.equal(db.connection.prepare('SELECT COUNT(*) n FROM messages').get().n,0);
  } finally {db.close();}
});

test('duplicate labels and thread IDs fail closed without changing legacy registrations',async()=>{
  const {db,service}=await setup();
  try {
    await service.register_participant({board:'main',participant_id:'other-review',label:'Design review',kind:'thread',thread_id:'thread-design'});
    for(const address of [{receiver_label:'Design review'},{receiver_thread_id:'thread-design'}]) {
      await assert.rejects(service.post_message(post(address)),error('ambiguous_address'));
      await assert.rejects(service.get_inbox({board:'main',...address}),error('ambiguous_address'));
      await assert.rejects(service.list_messages({board:'main',...address}),error('ambiguous_address'));
    }
    const sent=await service.post_message(post({receiver_id:'review'}));assert.equal(sent.message.receiver_id,'review');
    assert.equal((await service.get_inbox({board:'main',receiver_id:'other-review'})).messages.length,0);
  } finally {db.close();}
});

test('thread and label lookups stay on the selected board, including collisions between address types',async()=>{
  const {db,service}=await setup();
  try {
    await service.create_board({board:'support',label:'Support'});
    await assert.rejects(service.resolve_participant({board:'support',thread_id:'thread-design'}),error('participant_not_found'));
    await service.register_participant({board:'support',participant_id:'different',label:'Design review',kind:'thread',thread_id:'thread-design'});
    assert.equal((await service.resolve_participant({board:'support',label:'Design review'})).participant.id,'different');
    await service.register_participant({board:'main',participant_id:'collision',label:'review',kind:'thread',thread_id:'review'});
    assert.equal((await service.resolve_participant({board:'main',participant_id:'review'})).participant.id,'review');
    assert.equal((await service.resolve_participant({board:'main',label:'review'})).participant.id,'collision');
    assert.equal((await service.resolve_participant({board:'main',thread_id:'review'})).participant.id,'collision');
  } finally {db.close();}
});

test('alias event filters retain pagination, acknowledgments and visibility changes',async()=>{
  const {db,service}=await setup();
  try {
    const one=await service.post_message(post({receiver_thread_id:'thread-design'}));
    const hidden=await service.post_message(post({receiver_id:'build'}));
    await service.acknowledge_message({board:'main',message_id:one.message.id,participant_id:'review'});
    await service.delete_message({board:'main',message_id:one.message.id});await service.restore_message({board:'main',message_id:one.message.id});
    for(const address of [{receiver_label:'Design review'},{receiver_thread_id:'thread-design'}]) {
      const events=[];let cursor;
      for(let i=0;i<20;i++) {const page=await service.list_messages({board:'main',...address,cursor,limit:1});events.push(...page.events);cursor=page.next_cursor;if(!page.has_more)break;}
      assert.deepEqual(events.filter(e=>e.entity_id===one.message.id).map(e=>e.kind),['message_posted','message_acknowledged','message_deleted','message_restored']);
      assert(!events.some(e=>e.entity_id===hidden.message.id));
    }
    assert.equal((await service.get_inbox({board:'main',receiver_label:'Design review'})).unacknowledged_count,0);
    assert.equal((await service.list_messages({board:'main',receiver_id:'unregistered'})).events.some(e=>e.kind==='message_posted'),false);
  } finally {db.close();}
});

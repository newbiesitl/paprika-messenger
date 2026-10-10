import test from 'node:test';
import assert from 'node:assert/strict';
import { conversationLink, confirmationConversationLink } from '../skills/paprika-messenger/scripts/conversation-link.mjs';
import { prepareRecipientSelector, resolveRecipientChoice } from '../skills/paprika-messenger/scripts/prepare-recipient-selector.mjs';
import { addRecipientConversationLink } from '../src/protocol.mjs';
import { BoardService } from '../src/service.mjs';
import { SqliteD1 } from './d1-adapter.mjs';
import { loadMigrations } from './migrations.mjs';

const recipient={participant_id:'communication-id',thread_id:'native-thread-id',thread_name:'Example conversation',source:'codex',execution_mode:'local',host_id:'local',project_status:'unassigned'};
const page={board:'main',query:'',recipients:[recipient],has_more:false,next_cursor:null};
const agreed={sender_id:'sender',sender_label:'Sender',topic:'Agreed topic',body:'Already agreed text',idempotency_key:'same-key'};

test('conversation links use the native binding and observed source, never a label, communication ID or guessed remote route',()=>{
  assert.equal(conversationLink(recipient).url,'codex://threads/native-thread-id');
  assert.equal(conversationLink({...recipient,source:'chatgpt',host_id:null,execution_mode:'cloud'}).url,'https://chatgpt.com/c/native-thread-id');
  for(const extra of [{thread_id:null},{thread_id:'javascript:alert(1)'},{thread_id:'native/../other'},{thread_id:' native-thread-id'},
    {source:'unknown'},{source:'dot'},{execution_mode:'cloud'},{host_id:'another-computer'},{host_id:null}])
    assert.equal(conversationLink({...recipient,...extra}),null);
  const message={id:'confirmed-id',board:'main',receiver_id:recipient.participant_id};
  assert.equal(confirmationConversationLink({board:'main',message,recipient}).url,'codex://threads/native-thread-id');
  assert.throws(()=>confirmationConversationLink({board:'other',message,recipient}),/confirmed/);
  assert.throws(()=>confirmationConversationLink({board:'main',message:{...message,receiver_id:'someone-else'},recipient}),/exact canonical/);
});

test('native open action preserves the agreed content while navigation cannot authorize its delivery',()=>{
  const selecting=prepareRecipientSelector({page,mode:'send_agreed',agreed_message:agreed});
  assert.equal(resolveRecipientChoice(selecting,'Open a conversation').action,'open');
  const opening=prepareRecipientSelector({page,mode:selecting.mode,agreed_message:selecting.agreed_message,intent:'open'});
  assert.equal(opening.selection_sends,false);assert.deepEqual(opening.agreed_message,agreed);
  const selected=resolveRecipientChoice(opening,recipient.thread_id);
  assert.equal(selected.action,'open_conversation');assert.equal(selected.selection_sends,false);
  assert.equal(selected.conversation_link.url,'codex://threads/native-thread-id');assert.equal(selected.agreed_message,undefined);
  assert.equal(resolveRecipientChoice(selecting,recipient.thread_id).selection_sends,true);
  assert.deepEqual(selecting.agreed_message,agreed);
  const unknown=prepareRecipientSelector({page:{...page,recipients:[{...recipient,source:'unknown'}]},intent:'open'});
  assert.equal(unknown.options.some(o=>o.participant_id),false);
});

test('a confirmed post and an idempotent retry receive the same recipient link; missing navigation metadata cannot invalidate storage',async()=>{
  const db=new SqliteD1();db.connection.exec(await loadMigrations());
  try {
    const service=new BoardService(db,'owner');
    for(const [id,label,thread_id] of [['sender','Sender','sender-thread'],[recipient.participant_id,recipient.thread_name,recipient.thread_id]])
      await service.register_participant({board:'main',participant_id:id,label,thread_id,kind:'thread'});
    await service.update_recipient_metadata({board:'main',entries:[{participant_id:recipient.participant_id,thread_id:recipient.thread_id,source:'codex',execution_mode:'local',host_id:'local'}]});
    const payload={board:'main',...agreed,receiver_id:recipient.participant_id};
    const first=await service.post_message(payload),linked=await addRecipientConversationLink(first,service);
    assert.equal(linked.message.id,first.message.id);assert.equal(linked.recipient_conversation_link.url,'codex://threads/native-thread-id');
    const retried=await addRecipientConversationLink(await service.post_message(payload),service);
    assert.equal(retried.message.id,first.message.id);assert.deepEqual(retried.recipient_conversation_link,linked.recipient_conversation_link);
    assert.equal(db.connection.prepare('SELECT COUNT(*) AS n FROM messages').get().n,1);
    const unavailable=await addRecipientConversationLink(first,{board:async()=>{throw Error('Metadata unavailable');}});
    assert.equal(unavailable.message.id,first.message.id);assert.equal(unavailable.recipient_conversation_link,null);
    assert.equal((await service.list_recipients({board:'main'})).recipients.find(r=>r.participant_id===recipient.participant_id).conversation_link.url,linked.recipient_conversation_link.url);
  } finally { db.connection.close(); }
});

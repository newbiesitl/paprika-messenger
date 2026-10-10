import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalizeConversationUrl, conversationLink } from '../skills/paprika-messenger/scripts/conversation-link.mjs';
import { prepareRecipientSelector, resolveRecipientChoice } from '../skills/paprika-messenger/scripts/prepare-recipient-selector.mjs';
import { BoardService } from '../src/service.mjs';
import { addRecipientConversationLink } from '../src/protocol.mjs';
import { SqliteD1 } from './d1-adapter.mjs';
import { loadMigrations } from './migrations.mjs';

const webId='11111111-2222-4333-8444-555555555555';
const url='https://chatgpt.com/c/'+webId;
const projectUrl='https://chatgpt.com/g/g-p-example-project/c/'+webId+'?src=history_search#latest';
const binding={participant_id:'registered-cloud',thread_id:'immutable-execution-id'};

test('owning ChatGPT URLs normalize without treating a cloud execution ID as a web ID',()=>{
  assert.equal(normalizeConversationUrl(projectUrl),url);
  assert.equal(normalizeConversationUrl(url.toUpperCase().replace('HTTPS://CHATGPT.COM/C/','https://chatgpt.com/c/')),url);
  for(const candidate of [null,42,'javascript:alert(1)','http://chatgpt.com/c/'+webId,
    'https://chatgpt.com.evil.test/c/'+webId,'https://user@chatgpt.com/c/'+webId,
    'https://chatgpt.com:443/c/'+webId,'https://chatgpt.com/share/'+webId,
    'https://chatgpt.com/c/not-a-native-web-id',url+'/extra',' '+url,url+'\n',
    'https://chatgpt.com/g/../c/'+webId,'https://chatgpt.com/g/%2e%2e/c/'+webId,
    'https://chatgpt.com/g/project\\evil/c/'+webId])assert.equal(normalizeConversationUrl(candidate),null,String(candidate));
  const recipient={...binding,source:'codex',execution_mode:'cloud',host_id:'durable',conversation_url:projectUrl,thread_name:'Cloud chat'};
  assert.equal(conversationLink(recipient).url,url);
  assert.equal(conversationLink(recipient).conversation_id,webId);
  assert.equal(recipient.thread_id,binding.thread_id);
  assert.equal(conversationLink({...recipient,conversation_url:null}),null);
  const selector=prepareRecipientSelector({page:{board:'main',query:'',recipients:[recipient],has_more:false,next_cursor:null},intent:'open'});
  const action=resolveRecipientChoice(selector,binding.thread_id);
  assert.equal(action.conversation_link.url,url);assert.equal(action.selection_sends,false);
});

test('URL metadata survives refresh, rejects incorrect bindings and invalid batches, and never changes routing or recency',async()=>{
  const db=new SqliteD1();db.connection.exec(await loadMigrations());const service=new BoardService(db,'owner');
  try{
    await service.register_participant({board:'main',...binding,label:'Cloud chat',kind:'thread'});
    await service.create_board({board:'other',label:'Other'});
    await service.register_participant({board:'other',...binding,label:'Other chat',kind:'thread'});
    const get=async board=>(await service.get_recipient({board,participant_id:binding.participant_id})).recipient;
    const before=await get('main');
    await service.update_recipient_metadata({board:'main',entries:[{...binding,conversation_url:projectUrl,source:'codex',execution_mode:'cloud'}]});
    await service.update_recipient_metadata({board:'main',entries:[{...binding,title:'Renamed cloud chat',project_status:'unknown'}]});
    let current=await get('main');assert.equal(current.conversation_url,url);assert.equal(current.conversation_link.url,url);
    assert.equal(current.recency_at,before.recency_at);assert.equal(current.last_communicated_at,before.last_communicated_at);assert.equal(current.thread_id,binding.thread_id);
    assert.equal((await get('other')).conversation_url,null);
    await service.update_recipient_metadata({board:'main',entries:[{...binding,conversation_url:null,observed_at:new Date(Date.now()-600000).toISOString()}]});
    assert.equal((await get('main')).conversation_url,url);
    await assert.rejects(service.update_recipient_metadata({board:'main',entries:[{...binding,thread_id:webId,conversation_url:url}]}),{code:'thread_binding_conflict'});
    await service.register_participant({board:'main',participant_id:'second',thread_id:'second-native',label:'Second',kind:'thread'});
    await assert.rejects(service.update_recipient_metadata({board:'main',entries:[{...binding,conversation_url:null},{participant_id:'second',thread_id:'second-native',conversation_url:'https://evil.test/'}]}),{code:'invalid_argument'});
    assert.equal((await get('main')).conversation_url,url);
    await service.update_recipient_metadata({board:'main',entries:[{...binding,conversation_url:null}]});
    current=await get('main');assert.equal(current.conversation_url,null);assert.equal(current.conversation_link,null);
  }finally{db.connection.close();}
});

test('an upgraded database retains existing routes and posts; confirmations and retries use the independent web URL',async()=>{
  const db=new SqliteD1();
  const journal=JSON.parse(await readFile('drizzle/meta/_journal.json','utf8'));
  for(const entry of journal.entries.filter(e=>e.tag!=='0005_conversation-url'))db.connection.exec(await readFile('drizzle/'+entry.tag+'.sql','utf8'));
  const service=new BoardService(db,'owner');
  try{
    await service.register_participant({board:'main',...binding,label:'Cloud chat',kind:'thread'});
    await service.register_participant({board:'main',participant_id:'sender',thread_id:'sender-native',label:'Sender',kind:'thread'});
    const payload={board:'main',sender_id:'sender',sender_label:'Sender',receiver_id:binding.participant_id,topic:'Fixture',body:'Agreed fixture',idempotency_key:'stable-fixture'};
    const posted=await service.post_message(payload);
    db.connection.exec(await readFile('drizzle/0005_conversation-url.sql','utf8'));
    await service.update_recipient_metadata({board:'main',entries:[{...binding,conversation_url:projectUrl}]});
    const linked=await addRecipientConversationLink(posted,service);
    assert.equal(linked.recipient_conversation_link.url,url);assert.equal(linked.message.receiver_id,binding.participant_id);
    const retried=await addRecipientConversationLink(await service.post_message(payload),service);
    assert.equal(retried.message.id,posted.message.id);assert.equal(retried.recipient_conversation_link.url,url);
    assert.equal(db.connection.prepare('SELECT COUNT(*) AS n FROM messages').get().n,1);
    assert.equal(db.connection.prepare('SELECT thread_id FROM participants WHERE id=?').get(binding.participant_id).thread_id,binding.thread_id);
  }finally{db.connection.close();}
});

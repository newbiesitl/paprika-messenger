import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { SqliteD1 } from './d1-adapter.mjs';
import { loadMigrations } from './migrations.mjs';
import { BoardService } from '../src/service.mjs';
import { rpc, tools } from '../src/protocol.mjs';
import { recipientResourceUri } from '../src/recipient-directory.mjs';
import { parseChatGptConversation, conversationLink } from '../skills/paprika-messenger/scripts/conversation-link.mjs';
import { prepareBridgeDelivery } from '../skills/paprika-messenger/scripts/prepare-bridge.mjs';
import { prepareDirectDelivery, prepareStoredDelivery } from '../skills/paprika-messenger/scripts/prepare-delivery.mjs';
import { NotificationState } from '../skills/paprika-messenger/scripts/notification-state.mjs';
import { prepareRecipientSelector, resolveRecipientChoice } from '../skills/paprika-messenger/scripts/prepare-recipient-selector.mjs';

// Invented IDs only. No fixture sends a host message or touches a live service.
const conversation = '11111111-2222-4333-8444-555555555555';
const otherConversation = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const sender = {id:'sender',board:'main',thread_id:'current-codex',label:'Sender'};
const env = {CODEX_THREAD_ID: sender.thread_id};
const observation = id => ({id,kind:'chatgpt'});
const mappingArgs = (extra={}) => ({board:'main',participant_id:'cloud',registered_thread_id:'cloud-runtime',
  conversation,host_observation:observation(conversation),expected_revision:0,...extra});
const history = (id=conversation,kind='chatgpt',hostId=undefined) => ({schemaVersion:1,
  thread:{id,kind,status:{type:'idle'},...(hostId ? {hostId} : {})},turns:[]});
const prepareInput = record => ({deployment:'https://messenger.example.test',board:'main',receiver_id:'cloud',target_kind:'chatgpt',
  sender,recipient_record:record,history:history(),request_id:'bridge-one',body:'Hello. Please confirm receipt in this conversation.'});
async function setup(t) {
  const db=new SqliteD1();db.connection.exec(await loadMigrations());t.after(()=>db.close());
  const service=new BoardService(db,'owner');
  for (const [id,thread] of [['sender','current-codex'],['cloud','cloud-runtime'],['codex','codex-target']])
    await service.register_participant({board:'main',participant_id:id,label:id,kind:'thread',thread_id:thread});
  return {db,service};
}

test('accepts actual conversation IDs and original links; rejects shared links, Dot URLs and hostile origins',()=>{
  for(const input of [conversation,conversation.toUpperCase(),`https://chatgpt.com/c/${conversation}`,
    `https://chatgpt.com/g/g-p-example/c/${conversation}?view=chat#latest`])
    assert.equal(parseChatGptConversation(input).conversation_id,conversation);
  for(const input of [`https://chatgpt.com/share/${conversation}`,'https://chatgpt.com/dots/home',
    `https://chatgpt.com.example.org/c/${conversation}`,`https://example.org/c/${conversation}`,
    `https://user:password@chatgpt.com/c/${conversation}`,`http://chatgpt.com/c/${conversation}`,
    'javascript:alert(1)','runtime-id',null,`https://chatgpt.com/c/${conversation}/extra`])
    assert.throws(()=>parseChatGptConversation(input));
});

test('mapping persists separately from registration, messages and subscriptions and is available via MCP',async t=>{
  const {db,service}=await setup(t);
  const message=await service.post_message({board:'main',sender_id:'sender',sender_label:'sender',receiver_id:'cloud',topic:'Existing',body:'Keep this inbox'});
  const before=db.connection.prepare('SELECT * FROM participants ORDER BY id').all();
  const eventsBefore=db.connection.prepare('SELECT COUNT(*) n FROM events').get().n;
  const result=await rpc({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'set_recipient_conversation',arguments:mappingArgs()}},service);
  assert.equal(result.result.isError,false);assert.equal(result.result.structuredContent.sent,false);
  assert.equal(result.result.structuredContent.chatgpt_destination.revision,1);
  const loaded=await new BoardService(db,'owner').get_recipient({board:'main',participant_id:'cloud'});
  assert.equal(loaded.recipient.thread_id,'cloud-runtime');
  assert.equal(loaded.recipient.chatgpt_destination.conversation_id,conversation);
  assert.equal(loaded.recipient.conversation_link.url,`https://chatgpt.com/c/${conversation}`);
  assert.deepEqual(db.connection.prepare('SELECT * FROM participants ORDER BY id').all(),before);
  assert.equal(db.connection.prepare('SELECT COUNT(*) n FROM events').get().n,eventsBefore);
  assert.equal((await service.get_message({board:'main',message_id:message.message.id})).message.body,'Keep this inbox');
  assert.equal(db.connection.prepare('SELECT COUNT(*) n FROM event_subscriptions').get().n,0);
  assert(tools.find(x=>x.name==='set_recipient_conversation').inputSchema.required.includes('host_observation'));
});

test('mapping rejects wrong runtime/host evidence and conflicting revisions without changing the address',async t=>{
  const {service}=await setup(t);
  for(const bad of [{registered_thread_id:'wrong'}, {host_observation:{id:conversation,kind:'codex'}},
    {host_observation:observation(otherConversation)}, {conversation:`https://chatgpt.com/share/${conversation}`},
    {participant_id:'missing'}, {expected_revision:undefined}])
    await assert.rejects(service.set_recipient_conversation(mappingArgs(bad)));
  await service.set_recipient_conversation(mappingArgs());
  assert.equal((await service.set_recipient_conversation(mappingArgs())).chatgpt_destination.revision,1);
  const replacement=mappingArgs({conversation:otherConversation,host_observation:observation(otherConversation)});
  await assert.rejects(service.set_recipient_conversation(replacement),{code:'mapping_revision_conflict'});
  assert.equal((await service.set_recipient_conversation({...replacement,expected_revision:1})).chatgpt_destination.revision,2);
  await assert.rejects(service.set_recipient_conversation(mappingArgs({expected_revision:1})),{code:'mapping_revision_conflict'});
  assert.equal((await service.get_recipient({board:'main',participant_id:'cloud'})).recipient.chatgpt_destination.conversation_id,otherConversation);
});

test('a conversation is unique per board; mappings and recipient search never cross boards',async t=>{
  const {service}=await setup(t);
  await service.set_recipient_conversation(mappingArgs());
  await assert.rejects(service.set_recipient_conversation(mappingArgs({participant_id:'codex',registered_thread_id:'codex-target'})),{code:'conversation_address_conflict'});
  await service.create_board({board:'other',label:'Other'});
  await service.register_participant({board:'other',participant_id:'cloud',label:'Other',kind:'thread',thread_id:'other-runtime'});
  assert.equal((await service.list_recipients({board:'other',query:conversation})).recipients.length,0);
  await service.set_recipient_conversation(mappingArgs({board:'other',registered_thread_id:'other-runtime'}));
  assert.equal((await service.get_recipient({board:'main',participant_id:'cloud'})).recipient.chatgpt_destination.registered_thread_id,'cloud-runtime');
});

test('dropdown selection, mention resource, link and delivery resolve the same canonical recipient',async t=>{
  const {service}=await setup(t);await service.set_recipient_conversation(mappingArgs());
  const page=await service.list_recipients({board:'main',query:conversation});assert.equal(page.recipients.length,1);
  const choice=resolveRecipientChoice(prepareRecipientSelector({page}),'cloud');
  const record=await service.get_recipient({board:choice.board,participant_id:choice.receiver_id});
  const plan=prepareBridgeDelivery(prepareInput(record),env);
  assert.equal(choice.conversation_link.url,plan.conversation_link.url);
  assert.equal(plan.host_args.threadId,conversation);assert.equal(plan.recipient_id,'cloud');
  assert.equal(plan.registered_thread_id,'cloud-runtime');assert.equal(plan.native_kind,'chatgpt');
  assert.equal(plan.host_args.hostId,undefined);assert.equal(plan.host_args.model,undefined);
  const cli=spawnSync(process.execPath,[fileURLToPath(new URL('../skills/paprika-messenger/scripts/prepare-bridge.mjs',import.meta.url))],
    {input:JSON.stringify(prepareInput(record)),env:{...process.env,...env},encoding:'utf8',windowsHide:true});
  assert.equal(cli.status,0,cli.stderr);assert.deepEqual(JSON.parse(cli.stdout).host_args,plan.host_args);
  const resource=await rpc({jsonrpc:'2.0',id:2,method:'resources/read',params:{uri:recipientResourceUri('main','cloud')}},service);
  const address=JSON.parse(resource.result.contents[0].text);
  assert.equal(address.chatgpt_destination.conversation_id,conversation);
  assert.equal(address.receiver_thread_id,'cloud-runtime');
  assert.equal((await service.get_inbox({board:'main',receiver_id:'cloud'})).messages.length,0);
});

test('bridge refuses wrong selection, board, native kind, missing mapping, busy host and stale binding',async t=>{
  const {service}=await setup(t);await service.set_recipient_conversation(mappingArgs());
  const record=await service.get_recipient({board:'main',participant_id:'cloud'}), input=prepareInput(record);
  for(const bad of [{receiver_id:'codex'},{board:'other'},{target_kind:'codex'}, {target_kind:undefined},
    {history:history('cloud-runtime','codex','local')},
    {history:{...history(),thread:{...history().thread,status:{type:'running'}}}},
    {recipient_record:{...record,recipient:{...record.recipient,chatgpt_destination:null}}},
    {recipient_record:{...record,recipient:{...record.recipient,thread_id:'changed-runtime'}}}])
    assert.throws(()=>prepareBridgeDelivery({...input,...bad},env));
  assert.throws(()=>prepareBridgeDelivery(input,{CODEX_THREAD_ID:'wrong-sender'}));
  const corrupted={...record.recipient,chatgpt_destination:{...record.recipient.chatgpt_destination,registered_thread_id:'wrong'}};
  assert.equal(conversationLink(corrupted),null);
});

test('Codex to Codex retains native thread and host; direct ChatGPT registrations also work',async t=>{
  const {service}=await setup(t);
  const record=await service.get_recipient({board:'main',participant_id:'codex'});
  const input={...prepareInput(record),receiver_id:'codex',target_kind:'codex',history:history('codex-target','codex','local')};
  const plan=prepareBridgeDelivery(input,env);
  assert.equal(plan.host_args.threadId,'codex-target');assert.equal(plan.host_args.hostId,'local');assert.equal(plan.native_kind,'codex');
  assert.equal(plan.conversation_link.url,'codex://threads/codex-target');
  assert.throws(()=>prepareBridgeDelivery({...input,history:history('codex-target','codex')},env),/exact Codex host/);
  await service.register_participant({board:'main',participant_id:'actual-chat',label:'Actual',kind:'thread',thread_id:conversation});
  const chatRecord=await service.get_recipient({board:'main',participant_id:'actual-chat'});
  assert.equal(prepareBridgeDelivery({...prepareInput(chatRecord),receiver_id:'actual-chat'},env).host_args.threadId,conversation);
});

test('normal delivery helpers use mapped destinations while stored notifications preserve the event-only rule',async t=>{
  const {service}=await setup(t);await service.set_recipient_conversation(mappingArgs());
  const record=await service.get_recipient({board:'main',participant_id:'cloud'});
  const input=prepareInput(record), recipient={...record.recipient,id:'cloud',board:'main'};
  const route={...input,recipient,destination:{source:'read_thread',kind:'chatgpt',thread_id:conversation}};
  assert.equal(prepareDirectDelivery(route,env).host_args.threadId,conversation);
  const message=(await service.post_message({board:'main',sender_id:'sender',sender_label:'sender',receiver_id:'cloud',topic:'Stored',body:'Stored message'})).message;
  const stored={...input,mode:'board',message,subscriptions:[]};
  assert.equal(prepareBridgeDelivery(stored,env).host_args.threadId,conversation);
  const subscriptions=[{board:'main',receiver_id:'cloud',active:true,paused:true,expires_at:null}];
  const eventPlan=prepareBridgeDelivery({...stored,subscriptions},env);
  assert.equal(eventPlan.transport,'events');
  assert.equal(prepareStoredDelivery({...route,message,subscriptions},env).transport,'events');
  const state=new NotificationState(await mkdtemp(join(tmpdir(),'paprika-bridge-events-')));
  await assert.rejects(state.begin(eventPlan,{available:true}),/native delivery/);
});

test('uncertain bridge submissions survive restarts and mapping corrections cannot resend the same request',async t=>{
  const {service}=await setup(t);await service.set_recipient_conversation(mappingArgs());
  const record=await service.get_recipient({board:'main',participant_id:'cloud'}),input=prepareInput(record);
  const plan=prepareBridgeDelivery(input,env),root=await mkdtemp(join(tmpdir(),'paprika-bridge-'));
  const state=new NotificationState(root),attempt=await state.begin(plan,{available:true});
  assert.equal(attempt.action,'send');
  await state.record(plan,{attempt_id:attempt.checkpoint.attempt_id,state:'unknown'});
  assert.equal((await new NotificationState(root).begin(plan,{available:true,retry:true})).action,'reconcile');
  const saved=await readFile(state.path(plan),'utf8');
  assert(!saved.includes(input.body));assert(!saved.includes('host_args'));assert(saved.includes(conversation));
  await service.set_recipient_conversation(mappingArgs({conversation:otherConversation,host_observation:observation(otherConversation),expected_revision:1}));
  const changed=prepareBridgeDelivery({...input,recipient_record:await service.get_recipient({board:'main',participant_id:'cloud'}),history:history(otherConversation)},env);
  await assert.rejects(state.begin(changed,{available:true}),/conflict/);
  await state.reconcile(plan,{thread_id:conversation,reference:plan.reference,outcome:'found',evidence_id:'actual-turn'});
  assert.equal((await state.begin(plan,{available:true})).action,'skip');
});

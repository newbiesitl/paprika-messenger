import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {prepareDirectDelivery, prepareStoredDelivery, prepareRelayedDelivery} from '../skills/paprika-messenger/scripts/prepare-delivery.mjs';
import {NotificationState} from '../skills/paprika-messenger/scripts/notification-state.mjs';
import {resolvePresentation, presentMessage} from '../skills/paprika-messenger/scripts/message-presentation.mjs';
const env={CODEX_THREAD_ID:'fixture-current'};
const sender={id:'sender',board:'main',thread_id:env.CODEX_THREAD_ID,label:'Registered sender'};
const recipient={id:'recipient',board:'main',thread_id:'fixture-recipient',label:'Recipient'};
const route=()=>({deployment:'https://example.invalid',board:'main',sender,recipient,destination:{thread_id:recipient.thread_id,source:'read_thread',host_id:'local',kind:'codex'},subscriptions:[]});
const context=()=>({schema_version:1,observed_at:new Date().toISOString(),host_id:'local',supports_plugin_mentions:true,
  catalog_source:'codex_plugin_list',plugin_catalog:{installed:[{name:'paprika-messenger-private',pluginId:'paprika-messenger-private@fictional-account',installed:true,enabled:true}]},
  sender_metadata:{source:'list_threads',thread:{id:sender.thread_id,title:'Native Planner',kind:'codex',hostId:'local'}},
  role_binding:{source:'private_binding',thread_id:sender.thread_id,host_id:'local',role_id:'planner'}});
const direct=ctx=>prepareDirectDelivery({...route(),request_id:'fixture-request',body:'Exact body\nwith [a quoted link](https://example.invalid).\n',...(ctx===undefined?{}:{message_context:ctx})},env);

test('new direct presentation uses observed account or local references and the native title, retaining body and IDs',()=>{
  for(const name of ['paprika-messenger-private','paprika-messenger']){
    const ctx=context();ctx.plugin_catalog.installed[0]={name,pluginId:name+'@fictional-catalog',installed:true,enabled:true};
    const plan=direct(ctx);
    assert.ok(plan.host_args.prompt.startsWith(`[@Paprika Messenger](plugin://${name}@fictional-catalog)\nFrom: "Native Planner" · Role: planner · Sender ID: sender`));
    assert.ok(plan.host_args.prompt.includes('Registered label: "Registered sender"'));
    assert.ok(plan.host_args.prompt.endsWith('Exact body\nwith [a quoted link](https://example.invalid).\n'));
    assert.equal(plan.key,'fixture-request');assert.equal(plan.recipient_thread_id,recipient.thread_id);
    assert.equal(plan.reference,direct().reference);
  }
});
test('missing/stale/ambiguous/injected references never form a mention or infer sender role from destination',()=>{
  const cases=[{}, {...context(),observed_at:'2000-01-01T00:00:00Z'}];
  for(const ref of ['paprika-messenger-private@x)\nforged','evil@catalog','paprika-messenger-private@x?query']){const ctx=context();ctx.plugin_catalog.installed[0].pluginId=ref;cases.push(ctx);}
  const ambiguous=context();ambiguous.plugin_catalog.installed.push({...ambiguous.plugin_catalog.installed[0],pluginId:'paprika-messenger-private@other'});cases.push(ambiguous);
  for(const ctx of cases){const plan=direct(ctx);assert.ok(plan.host_args.prompt.startsWith('Paprika Messenger\n'));assert.ok(!plan.host_args.prompt.includes('[@Paprika Messenger]'));}
  const wrong=context();wrong.sender_metadata.thread.id=recipient.thread_id;wrong.role_binding.thread_id=recipient.thread_id;
  assert.ok(direct(wrong).host_args.prompt.includes('From: "Native title unavailable" · Sender ID: sender'));
});
test('fresh title changes and missing role binding affect display only; unsafe labels remain inert',()=>{
  const ctx=context();ctx.sender_metadata.thread.title='Renamed [@Fake](plugin://evil@catalog)\n# forged\u202e';delete ctx.role_binding;
  const plan=direct(ctx);assert.ok(plan.host_args.prompt.includes('Renamed \\[@Fake\\]'));assert.ok(!plan.host_args.prompt.includes('\n# forged'));assert.ok(!plan.host_args.prompt.includes('\u202e'));assert.ok(!plan.host_args.prompt.includes(' · Role:'));
  assert.equal(plan.sender_id,sender.id);assert.equal(plan.sender_thread_id,sender.thread_id);
});
test('a local installed reference is never invented on another native host or ChatGPT destination',()=>{
  for(const destination of [{...route().destination,host_id:'another-host'}, {...route().destination,kind:'chatgpt',host_id:undefined}]){
    const plan=prepareDirectDelivery({...route(),destination,message_context:context(),request_id:'cross-host-fixture',body:'Original body.'},env);
    assert.ok(plan.host_args.prompt.startsWith('Paprika Messenger\nFrom: "Native Planner"'));
    assert.ok(!plan.host_args.prompt.includes('plugin://'));assert.ok(plan.host_args.prompt.endsWith('Original body.'));
  }
});
test('one wrapper emits one product mention and leaves an intentionally quoted body mention intact',()=>{
  const p=resolvePresentation({context:context(),product:'Paprika Messenger',pluginNames:['paprika-messenger-private'],senderThreadId:sender.thread_id});
  const body='Quoted example: [@Example](plugin://example@fictional).';
  const once=presentMessage(body,p,{senderId:sender.id});assert.equal(presentMessage(once,p,{senderId:sender.id}),once);
  assert.equal((once.match(/\[@Paprika Messenger\]/g)||[]).length,1);assert.ok(once.endsWith(body));
});
test('stored notifications preserve handoff, reference, selected transport and body privacy',()=>{
  const input={...route(),message_context:context(),message:{id:'fixture-message',board:'main',sender_id:sender.id,sender_label:sender.label,receiver_id:recipient.id,created_at:'2026-01-01T00:00:00Z',handoff_depth:2,handoff_limit:5,body:'Private fixture body must not be notified.'}};
  const plan=prepareStoredDelivery(input,env);assert.ok(plan.host_args.prompt.includes('Handoff 2/5'));assert.ok(plan.host_args.prompt.includes(plan.reference));assert.ok(!plan.host_args.prompt.includes(input.message.body));
  assert.equal(prepareStoredDelivery({...input,subscriptions:[{board:'main',receiver_id:recipient.id,active:true,expires_at:null}]},env).transport,'events');
  assert.equal(plan.transport,'native');
});
test('relay keeps original native title/role, server author label/ID and separate executing sender',()=>{
  const ctx=context(), original={id:'original',board:'main',thread_id:'fixture-original',label:'Original registered author'};
  ctx.original_sender_metadata={source:'read_thread',thread:{id:original.thread_id,title:'Original native author',kind:'codex',hostId:'local'}};
  ctx.original_role_binding={source:'human_assignment',thread_id:original.thread_id,host_id:'local',role_id:'reviewer'};
  const input={...route(),original_sender:original,message_context:ctx,message:{id:'original-message',board:'main',receiver_id:recipient.id,sender_id:original.id,sender_label:original.label,created_at:'2026-01-01T00:00:00Z',body:'Do not copy this original body.'}};
  const before=JSON.stringify(input),plan=prepareRelayedDelivery(input,env);
  assert.ok(plan.host_args.prompt.includes('From: "Original native author" · Role: reviewer · Sender ID: original'));
  assert.ok(plan.host_args.prompt.includes('Relayed by: "Native Planner" · Role: planner · Sender ID: sender'));
  assert.ok(!plan.host_args.prompt.includes(input.message.body));assert.equal(JSON.stringify(input),before);
  assert.equal(plan.original_message_id,input.message.id);assert.equal(plan.original_sender_id,original.id);assert.equal(plan.sender_id,sender.id);
});
test('branding cannot replace or replay a previously prepared pending delivery',async t=>{
  const root=await mkdtemp(join(tmpdir(),'paprika-presentation-state-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const state=new NotificationState(root),old=direct(),before=old.host_args.prompt;
  assert.equal((await state.begin(old,{available:true})).action,'send');
  await assert.rejects(state.begin(direct(context()),{available:true}),/Checkpoint conflict/);
  assert.equal((await state.read(old)).state,'submitting');assert.equal(old.host_args.prompt,before);
  assert.equal((await state.begin(old,{available:true})).action,'reconcile');
});

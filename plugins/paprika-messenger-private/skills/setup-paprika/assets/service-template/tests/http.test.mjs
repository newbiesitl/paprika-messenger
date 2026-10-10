import test from 'node:test';
import assert from 'node:assert/strict';
import '../scripts/build.mjs';
import { SqliteD1 } from './d1-adapter.mjs';
import { loadMigrations } from './migrations.mjs';
import { createHash } from 'node:crypto';
import { BoardService } from '../src/service.mjs';
import { maintenanceTokenDigest } from '../src/webhooks.mjs';
import { prepareRecipientSelector, resolveRecipientChoice } from '../skills/paprika-messenger/scripts/prepare-recipient-selector.mjs';
// Load the Worker after the awaited build, not while resolving static imports of
// the previous generated file. HTTP checks must exercise this source revision.
const { handle }=await import('../dist/_worker.js');
const db=new SqliteD1();db.connection.exec(await loadMigrations());
await new BoardService(db,'owner').create_board({board:'vex',label:'Legacy project'});
const env={DB:db,OWNER_USER_ID:'owner',COORDINATOR_USER_ID:'coordinator',SITE_ORIGIN:'https://board.test'};
const request=(path,body,subject='owner',extra={})=>new Request(`https://board.test${path}`,{method:body===undefined?'GET':'POST',headers:{'oai-authenticated-user-id':subject,'Content-Type':'application/json',...extra},...(body===undefined?{}:{body:JSON.stringify(body)})});

test('HTTP and MCP confirmed sends return the native recipient link and serve the shared helper',async()=>{
  const linkDb=new SqliteD1();linkDb.connection.exec(await loadMigrations());const linkEnv={...env,DB:linkDb};
  try {
    const service=new BoardService(linkDb,'owner');
    await service.register_participant({board:'main',participant_id:'sender-fixture',label:'Sender fixture',kind:'thread',thread_id:'sender-native-fixture'});
    await service.register_participant({board:'main',participant_id:'link-fixture',label:'Link fixture',kind:'thread',thread_id:'link-native-fixture'});
    await service.update_recipient_metadata({board:'main',entries:[{participant_id:'link-fixture',thread_id:'link-native-fixture',source:'codex',execution_mode:'local',host_id:'local'}]});
    const args={board:'main',sender_id:'sender-fixture',sender_label:'Sender fixture',receiver_id:'link-fixture',topic:'Fixture topic',body:'Fixture content',idempotency_key:'fixture-link-post'};
    const http=await (await handle(request('/api/post_message',args,'owner',{Origin:'https://board.test','X-Dot-Board':'1'}),linkEnv)).json();
    assert.equal(http.error,undefined,JSON.stringify(http));
    assert.equal(http.recipient_conversation_link.url,'codex://threads/link-native-fixture');
    const rpc=await (await handle(request('/mcp',{jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'post_message',arguments:args}}),linkEnv)).json();
    assert.equal(rpc.result.structuredContent.message.id,http.message.id);
    assert.deepEqual(rpc.result.structuredContent.recipient_conversation_link,http.recipient_conversation_link);
    assert.equal(linkDb.connection.prepare('SELECT COUNT(*) AS n FROM messages').get().n,1);
    const helper=await handle(request('/conversation-link.js'),linkEnv);
    assert.match(await helper.text(),/export function conversationLink/);
  } finally { linkDb.close(); }
});

test('generated Worker saves mapped destinations through authenticated MCP and returns the same link through HTTP',async()=>{
  const localDb=new SqliteD1();localDb.connection.exec(await loadMigrations());const localEnv={...env,DB:localDb};
  try {
    const service=new BoardService(localDb,'owner');
    await service.register_participant({board:'main',participant_id:'mapped',label:'Mapped',kind:'thread',thread_id:'execution-thread'});
    const conversation='11111111-2222-4333-8444-555555555555';
    const args={board:'main',participant_id:'mapped',registered_thread_id:'execution-thread',
      conversation:`https://chatgpt.com/g/g-p-fixture/c/${conversation}`,host_observation:{id:conversation,kind:'chatgpt'},expected_revision:0};
    const body={jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'set_recipient_conversation',arguments:args}};
    assert.equal((await handle(request('/mcp',body,'other-account'),localEnv)).status,403);
    const saved=await (await handle(request('/mcp',body),localEnv)).json();
    assert.equal(saved.result.isError,false,JSON.stringify(saved));
    const loaded=await (await handle(request('/api/get_recipient',{board:'main',participant_id:'mapped'},'owner',
      {Origin:'https://board.test','X-Dot-Board':'1'}),localEnv)).json();
    assert.equal(loaded.recipient.thread_id,'execution-thread');
    assert.equal(loaded.recipient.chatgpt_destination.conversation_id,conversation);
    assert.equal(loaded.recipient.conversation_link.url,`https://chatgpt.com/c/${conversation}`);
    assert.equal((await handle(request('/api/set_recipient_conversation',args,'owner',{Origin:'https://attacker.test','X-Dot-Board':'1'}),localEnv)).status,403);
    assert.equal(localDb.connection.prepare('SELECT COUNT(*) n FROM messages').get().n,0);
  } finally {localDb.close();}
});

test('modern resource responses satisfy the per-request cache contract while legacy clients keep their wire shape',async()=>{
  const uiUri='ui://paprika-messenger/recipients/v1.html';
  const modernMeta={'io.modelcontextprotocol/protocolVersion':'2026-07-28',
    'io.modelcontextprotocol/clientInfo':{name:'host-fixture',version:'1.0.0'},'io.modelcontextprotocol/clientCapabilities':{}};
  const invoke=async(method,params={},extra={})=>(await (await handle(request('/mcp',{jsonrpc:'2.0',id:1,method,params},'',extra),env)).json()).result;
  for(const [method,params] of [['server/discover',{}],['tools/list',{}],['resources/list',{}],['resources/templates/list',{}],['resources/read',{uri:uiUri}]]) {
    const result=await invoke(method,{...params,_meta:modernMeta});
    assert.equal(result.resultType,'complete');assert.equal(result.ttlMs,0);assert.equal(result.cacheScope,'private');
    if(method==='resources/read'){assert.equal(result.contents[0].mimeType,'text/html;profile=mcp-app');assert.match(result.contents[0].text,/createRecipientHost/);}
  }
  const header=await invoke('resources/read',{uri:uiUri},{'MCP-Protocol-Version':'2026-07-28'});
  assert.equal(header.ttlMs,0);assert.equal(header.cacheScope,'private');
  const initialized=await invoke('initialize',{protocolVersion:'2025-06-18'});
  assert.match(initialized.instructions,/prefer an available routine host user-choice panel/);
  for(const params of [{uri:uiUri},{uri:uiUri,_meta:{'io.modelcontextprotocol/protocolVersion':'2025-06-18'}}]) {
    const legacy=await invoke('resources/read',params,{'MCP-Protocol-Version':'2025-06-18'});
    assert.deepEqual(Object.keys(legacy),['contents']);assert.equal(legacy.contents[0].uri,uiUri);
  }
});

test('authenticated recipient pages feed native selection without a widget or outbound writes',async()=>{
  const pickerDb=new SqliteD1();pickerDb.connection.exec(await loadMigrations());const pickerEnv={...env,DB:pickerDb};
  const service=new BoardService(pickerDb,'owner');
  await service.register_participant({board:'main',participant_id:'native-fixture',label:'Registered name',kind:'thread',thread_id:'native-host-fixture'});
  await service.update_recipient_metadata({board:'main',entries:[{participant_id:'native-fixture',thread_id:'native-host-fixture',title:'Observed title',
    project_status:'assigned',project_id:'native-project',project_name:'Project name',source:'chatgpt',execution_mode:'cloud'}]});
  const invoke=async(method,params)=>(await (await handle(request('/mcp',{jsonrpc:'2.0',id:1,method,
    params:{...params,_meta:{'io.modelcontextprotocol/protocolVersion':'2026-07-28'}}}),pickerEnv)).json()).result;
  try {
    const result=await invoke('tools/call',{name:'list_recipients',arguments:{board:'main'}});
    assert.equal(result._meta,undefined);
    const selector=prepareRecipientSelector({page:result.structuredContent});
    const choice=selector.options.find(o=>o.participant_id==='native-fixture');assert.match(choice.label,/Project name → Observed title · Thread ID: native-host-fixture/);
    const selected=resolveRecipientChoice(selector,choice.label);
    const verified=await invoke('tools/call',{name:'get_recipient',arguments:{board:selected.board,participant_id:selected.receiver_id}});
    assert.equal(verified.structuredContent.recipient.thread_id,selected.receiver_thread_id);
    const privateResource=await invoke('resources/read',{uri:'paprika://recipient/main/native-fixture'});
    assert.equal(privateResource.cacheScope,'private');assert.equal(privateResource.ttlMs,0);
    const helpers=await invoke('resources/read',{uri:'skill://dot-agent-board/paprika-messenger/scripts/prepare-recipient-selector.mjs'});
    assert.match(helpers.contents[0].text,/prepareRecipientSelector/);
    for(const table of ['messages','acknowledgments','event_subscriptions'])assert.equal(pickerDb.connection.prepare('SELECT COUNT(*) n FROM '+table).get().n,0);
  }finally{pickerDb.close();}
});

test('recipient picker resources are packaged, owner-gated and usable through MCP and the browser API',async()=>{
  const pickerDb=new SqliteD1();pickerDb.connection.exec(await loadMigrations());const pickerEnv={...env,DB:pickerDb};
  const service=new BoardService(pickerDb,'owner');await service.register_participant({board:'main',participant_id:'fixture-recipient',label:'Example',kind:'thread',thread_id:'fixture-native'});
  const call=(name,args,subject='owner')=>request('/mcp',{jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}},subject);
  try {
    assert.equal((await handle(call('show_recipient_picker',{},''),pickerEnv)).status,401);assert.equal((await handle(call('list_recipients',{board:'main'},'other'),pickerEnv)).status,403);
    const card=(await (await handle(call('show_recipient_picker',{}),pickerEnv)).json()).result;assert.equal(card.isError,false);assert.equal(card.structuredContent.board,'main');assert.equal(card._meta.ui.resourceUri,'ui://paprika-messenger/recipients/v1.html');
    const template={jsonrpc:'2.0',id:2,method:'resources/read',params:{uri:card._meta.ui.resourceUri}};const ui=(await (await handle(request('/mcp',template,''),pickerEnv)).json()).result.contents[0];assert.match(ui.text,/createRecipientHost/);assert.match(ui.text,/id="board-filter"/);assert.doesNotMatch(ui.text,/RECIPIENT_SCRIPT|RECIPIENT_CSS/);
    const privateRead={...template,params:{uri:'paprika://recipient/main/fixture-recipient'}};assert.equal((await handle(request('/mcp',privateRead,''),pickerEnv)).status,401);assert.equal((await handle(request('/mcp',privateRead,'other'),pickerEnv)).status,403);
    const address=(await (await handle(request('/mcp',privateRead),pickerEnv)).json()).result.contents[0];assert.equal(JSON.parse(address.text).receiver_thread_id,'fixture-native');
    const browser=await handle(request('/api/list_recipients',{board:'main'},'owner',{Origin:'https://board.test','X-Dot-Board':'1'}),pickerEnv);assert.equal(browser.status,200);assert.equal((await browser.json()).recipients[0].thread_id,'fixture-native');
    assert.equal((await handle(request('/recipient-picker.js'),pickerEnv)).status,200);assert.equal((await handle(request('/recipient-picker.css',undefined,'other'),pickerEnv)).status,403);
    assert.equal(pickerDb.connection.prepare('SELECT COUNT(*) n FROM messages').get().n,0);
  }finally{pickerDb.close();}
});

test('service type stays authenticated and consistent across MCP, browser controls and event configuration',async()=>{
  const profileDb=new SqliteD1();profileDb.connection.exec(await loadMigrations());
  const profileEnv={DB:profileDb,OWNER_USER_ID:'owner',SITE_ORIGIN:'https://board.test',PAPRIKA_SERVICE_TYPE:'chatgpt-codex'};
  const call=(name,args={},subject='owner')=>request('/mcp',{jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}},subject);
  const csrf={Origin:'https://board.test','X-Dot-Board':'1'};
  try {
    assert.equal((await handle(call('get_service_config',{},''),profileEnv)).status,401);
    assert.equal((await handle(call('get_service_config',{},'intruder'),profileEnv)).status,403);
    assert.equal((await handle(request('/api/get_service_config',{}),profileEnv)).status,403);
    const config=(await (await handle(call('get_service_config'),profileEnv)).json()).result.structuredContent;
    assert.equal(config.service_type,'chatgpt-codex');assert.equal(config.dot_enabled,false);
    assert.deepEqual(config.supported_clients,['chatgpt','codex_local','codex_cloud']);
    assert.equal(config.receiving_surfaces.includes('Dot'),false);
    assert.equal(config.service_type_source,'runtime_setting');
    assert.deepEqual(await (await handle(request('/api/get_service_config',{},'owner',csrf),profileEnv)).json(),config);
    assert.equal((await (await handle(call('get_service_config',{dot_available:true}),profileEnv)).json()).result.isError,true);
    const legacy=(await (await handle(call('get_service_config'),{...profileEnv,PAPRIKA_SERVICE_TYPE:undefined})).json()).result.structuredContent;
    assert.equal(legacy.service_type,'dot-chatgpt-codex');assert.equal(legacy.dot_enabled,true);
    assert.equal(legacy.service_type_source,'legacy_default');
    const invalid=(await (await handle(call('get_service_config'),{...profileEnv,PAPRIKA_SERVICE_TYPE:'invalid'})).json()).result;
    assert.equal(invalid.isError,true);assert.equal(JSON.parse(invalid.content[0].text).error,'invalid_service_type');
    await new BoardService(profileDb,'owner').register_participant({board:'main',participant_id:'current',label:'Current chat',kind:'thread'});
    for(const runtime of [profileEnv,{...profileEnv,EVENT_SECRET_KEY:btoa('c'.repeat(32))}]) {
      for(const [name,args] of [['show_connection_controls',{board:'main'}],['show_connection_controls',{board:'main',receiver_id:'current'}],['get_notification_setup',{board:'main',receiver_id:'current'}]]) {
        const response=(await (await handle(call(name,args),runtime)).json()).result;
        assert.equal(response.isError,false);
        assert.equal(response.structuredContent.service_type,'chatgpt-codex');
        assert.equal(response.structuredContent.receiving_surfaces.includes('Dot'),false);
        assert.equal(response.structuredContent.notification_ready,false);
        assert.equal(response.structuredContent.connection_policy.local_binding_default,'on_demand');
      }
    }
    assert.deepEqual((await (await handle(call('list_event_subscriptions',{board:'main'}),profileEnv)).json()).result.structuredContent,{subscriptions:[]});
    assert.deepEqual(await (await handle(request('/api/list_event_subscriptions',{board:'main'},'owner',csrf),profileEnv)).json(),{subscriptions:[]});
    assert.equal(profileDb.connection.prepare('SELECT COUNT(*) n FROM event_subscriptions').get().n,0);
    assert.equal(profileDb.connection.prepare('SELECT COUNT(*) n FROM messages').get().n,0);
  } finally {profileDb.close();}
});

test('ChatGPT exchanges linked replies with local and cloud Codex without Dot or event runtime',async()=>{
  const exchangeDb=new SqliteD1();exchangeDb.connection.exec(await loadMigrations());
  const exchangeEnv={DB:exchangeDb,OWNER_USER_ID:'owner',SITE_ORIGIN:'https://board.test',PAPRIKA_SERVICE_TYPE:'chatgpt-codex'};
  const invoke=async(name,args)=>{
    const response=await handle(request('/mcp',{jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}}),exchangeEnv);
    assert.equal(response.status,200);const result=(await response.json()).result;
    assert.equal(result.isError,false,result.content[0].text);return result.structuredContent;
  };
  try {
    for(const id of ['chatgpt','codex-local','codex-cloud'])
      await invoke('register_participant',{board:'main',participant_id:id,label:id,kind:'thread',thread_id:'fixture-'+id});
    const replyIds=[];
    for(const receiver of ['codex-local','codex-cloud']) {
      const sent=await invoke('post_message',{board:'main',sender_id:'chatgpt',sender_label:'chatgpt',receiver_label:receiver,topic:'handoff',body:'Please review this fixture.',idempotency_key:'request-'+receiver});
      assert.equal(sent.notification.state,'events_not_configured');
      const inbox=await invoke('get_inbox',{board:'main',receiver_thread_id:'fixture-'+receiver});
      assert.equal(inbox.messages[0].id,sent.message.id);
      const reply=await invoke('post_message',{board:'main',sender_id:receiver,sender_label:receiver,receiver_id:'chatgpt',topic:'handoff',body:'Fixture review complete.',reply_to_id:sent.message.id,idempotency_key:'reply-'+receiver});
      replyIds.push(reply.message.id);
      const original=await invoke('get_message',{board:'main',message_id:sent.message.id});
      assert.equal(original.replies[0].id,reply.message.id);
      const delivery=await invoke('get_delivery_status',{board:'main',message_id:sent.message.id});
      assert.equal(delivery.stored,true);assert.equal(delivery.participant_acknowledged,false);
      assert.equal(delivery.notification.state,'events_not_configured');
      const browser=await handle(request('/api/get_delivery_status',{board:'main',message_id:sent.message.id},'owner',{Origin:'https://board.test','X-Dot-Board':'1'}),exchangeEnv);
      assert.equal(browser.status,200);assert.equal((await browser.json()).stored,true);
    }
    const replies=await invoke('get_inbox',{board:'main',receiver_id:'chatgpt'});
    assert.deepEqual(replies.messages.map(message=>message.id).sort(),replyIds.sort());
    assert.equal(exchangeDb.connection.prepare('SELECT COUNT(*) n FROM participants').get().n,3);
    assert.equal(exchangeDb.connection.prepare('SELECT COUNT(*) n FROM event_subscriptions').get().n,0);
    assert.equal(exchangeDb.connection.prepare('SELECT COUNT(*) n FROM acknowledgments').get().n,0);
  } finally {exchangeDb.close();}
});

test('generated MCP exposes connection controls and bundled UI without changing receiving state',async()=>{
  const uiDb=new SqliteD1();uiDb.connection.exec(await loadMigrations());
  const service=new BoardService(uiDb,'owner');
  const uiEnv={DB:uiDb,OWNER_USER_ID:'owner',SITE_ORIGIN:'https://board.test',EVENT_SECRET_KEY:btoa('u'.repeat(32))};
  const call=(method,params={},subject='owner')=>request('/mcp',{jsonrpc:'2.0',id:1,method,params},subject);
  const toolCall=(args,subject='owner')=>call('tools/call',{name:'show_connection_controls',arguments:args},subject);
  try {
    await service.register_participant({board:'main',participant_id:'current',label:'Current chat',kind:'thread',thread_id:'current-host-thread'});
    const counts=()=>Object.fromEntries(['participants','messages','acknowledgments','event_subscriptions'].map(table=>[table,uiDb.connection.prepare('SELECT COUNT(*) n FROM '+table).get().n]));
    const before=counts();
    assert.equal((await handle(toolCall({board:'main'},''),uiEnv)).status,401);
    assert.equal((await handle(toolCall({board:'main'},'intruder'),uiEnv)).status,403);
    assert.equal((await handle(request('/api/show_connection_controls',{board:'main'}),uiEnv)).status,403);
    const initialized=(await (await handle(call('initialize'),uiEnv)).json()).result;
    assert(initialized.capabilities.resources);assert(initialized.capabilities.events);
    const catalog=(await (await handle(call('tools/list'),uiEnv)).json()).result;
    const control=catalog.tools.find(t=>t.name==='show_connection_controls');
    assert.equal(control.annotations.readOnlyHint,true);
    assert.equal(control.inputSchema.type,'object');
    assert.equal(Object.hasOwn(control.inputSchema,'oneOf'),false);
    assert.equal(control._meta.ui.resourceUri,'ui://paprika-messenger/connection/v1.html');
    const uiUri=control._meta.ui.resourceUri;
    const resources=(await (await handle(call('resources/list'),uiEnv)).json()).result.resources;
    assert(resources.some(r=>r.uri===uiUri));
    assert(resources.some(r=>r.uri.endsWith('/references/connection-ui.md')));
    const resource=(await (await handle(call('resources/read',{uri:uiUri}),uiEnv)).json()).result.contents[0];
    assert.equal(resource.mimeType,'text/html;profile=mcp-app');
    assert(resource.text.includes('Enable incoming messages'));
    assert.deepEqual(resource._meta.ui.csp,{connectDomains:[],resourceDomains:[]});
    const initial=(await (await handle(toolCall({board:'main'}),uiEnv)).json()).result;
    assert.equal(initial.isError,false);assert.equal(initial.structuredContent.state,'receiver_required');
    assert.equal(initial.structuredContent.notification_ready,false);assert.equal(initial._meta.ui.resourceUri,uiUri);
    assert.equal(initial.structuredContent.connection_policy.heartbeat_requires_explicit_choice,true);
    assert.equal(initial.structuredContent.connection_policy.receiving_host_capability_verification_required,true);
    const mapped=(await (await handle(toolCall({board:'main',receiver_thread_id:'current-host-thread'}),uiEnv)).json()).result;
    assert.equal(mapped.structuredContent.receiver_id,'current');assert.equal(mapped.structuredContent.state,'subscription_required');
    const invalid=(await (await handle(toolCall({board:'main',receiver_id:'current',receiver_label:'Current chat'}),uiEnv)).json()).result;
    assert.equal(invalid.isError,true);
    assert.equal(JSON.parse(invalid.content[0].text).error,'invalid_address');
    const missing=(await (await handle(toolCall({board:'main',receiver_id:'current'}),{...uiEnv,EVENT_SECRET_KEY:undefined})).json()).result;
    assert.equal(missing.structuredContent.state,'events_not_configured');
    const browser=await handle(request('/api/show_connection_controls',{board:'main'},'owner',{Origin:'https://board.test','X-Dot-Board':'1'}),uiEnv);
    assert.equal(browser.status,200);assert.equal((await browser.json()).state,'receiver_required');
    assert.deepEqual(counts(),before);
  }finally{uiDb.close();}
});

test('generated HTTP MCP exposes resolver and alias sends with the existing owner authorization',async()=>{
  const addressDb=new SqliteD1();addressDb.connection.exec(await loadMigrations());
  const service=new BoardService(addressDb,'owner'), addressEnv={DB:addressDb,OWNER_USER_ID:'owner'};
  try {
    await service.register_participant({board:'main',participant_id:'sender',label:'Sender',kind:'agent'});
    await service.register_participant({board:'main',participant_id:'review',label:'Design review',kind:'thread',thread_id:'thread-design'});
    const callRequest=(name,args,subject='owner')=>request('/mcp',{jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}},subject);
    assert.equal((await handle(callRequest('resolve_participant',{board:'main',label:'Design review'},'intruder'),addressEnv)).status,403);
    const resolved=(await (await handle(callRequest('resolve_participant',{board:'main',thread_id:'thread-design'}),addressEnv)).json()).result;
    assert.equal(resolved.structuredContent.participant.id,'review');
    const sent=(await (await handle(callRequest('post_message',{board:'main',sender_id:'sender',sender_label:'Sender',receiver_label:'Design review',topic:'handoff',body:'Review this context.'}),addressEnv)).json()).result;
    assert.equal(sent.isError,false);assert.equal(sent.structuredContent.message.receiver_id,'review');
    const inbox=(await (await handle(callRequest('get_inbox',{board:'main',receiver_thread_id:'thread-design'}),addressEnv)).json()).result;
    assert.equal(inbox.structuredContent.messages[0].id,sent.structuredContent.message.id);
    await service.register_participant({board:'main',participant_id:'other',label:'Other chat',kind:'thread'});
    const other=await service.post_message({board:'main',sender_id:'sender',sender_label:'Sender',receiver_id:'other',topic:'handoff',body:'Only for the other chat.'});
    const catalog=(await (await handle(request('/mcp',{jsonrpc:'2.0',id:1,method:'tools/list'}),addressEnv)).json()).result;
    const schema=catalog.tools.find(t=>t.name==='list_messages').inputSchema;
    assert.equal(schema.type,'object');assert.deepEqual(schema.required,['board']);
    assert.equal(schema.additionalProperties,false);assert.equal(Object.hasOwn(schema,'oneOf'),false);
    for(const address of [{receiver_id:'review'},{receiver_thread_id:'thread-design'},{receiver_label:'Design review'},{}]) {
      const feed=(await (await handle(callRequest('list_messages',{board:'main',...address}),addressEnv)).json()).result;
      assert.equal(feed.isError,false);
      const messageIds=feed.structuredContent.events.filter(e=>e.kind==='message_posted').map(e=>e.entity_id);
      assert.deepEqual(messageIds,Object.keys(address).length?[sent.structuredContent.message.id]:[sent.structuredContent.message.id,other.message.id]);
    }
    const multiple=(await (await handle(callRequest('list_messages',{board:'main',receiver_id:'review',receiver_label:'Design review'}),addressEnv)).json()).result;
    assert.equal(multiple.isError,true);assert.equal(JSON.parse(multiple.content[0].text).error,'invalid_address');
    const extra=(await (await handle(callRequest('list_messages',{board:'main',unexpected:'value'}),addressEnv)).json()).result;
    assert.equal(extra.isError,true);assert.equal(JSON.parse(extra.content[0].text).error,'unknown_argument');
  } finally {addressDb.close();}
});
test('HTTP boundary denies anonymous, wrong account, cross origin and non-coordinator writes',async()=>{
  const tool={jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'list_messages',arguments:{board:'vex'}}};
  assert.equal((await handle(request('/mcp',tool,''),env)).status,401);
  assert.equal((await handle(request('/mcp',tool,'intruder'),env)).status,403);
  assert.equal((await handle(request('/mcp',tool,'owner',{Origin:'https://evil.test'}),env)).status,403);
  assert.equal((await handle(request('/api/coordination',{},'owner',{Origin:'https://board.test','X-Dot-Board':'1'}),env)).status,403);
  assert.equal((await handle(request('/api/post_message',{},'owner'),env)).status,403);
  const asset=await handle(request('/'),env);assert.equal(asset.status,200);assert(asset.headers.get('content-security-policy').includes("script-src 'self'"));
});

test('current thread address API uses host input and retains MCP authentication and browser CSRF controls',async()=>{
  const threadDb=new SqliteD1();threadDb.connection.exec(await loadMigrations());
  const threadEnv={DB:threadDb,OWNER_USER_ID:'owner',SITE_ORIGIN:'https://board.test'};
  const args={board:'main',thread_id:'host-current'};
  const call=(arguments_=args,subject='owner')=>request('/mcp',{jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'get_thread_id',arguments:arguments_}},subject);
  try {
    assert.equal((await handle(call(args,''),threadEnv)).status,401);
    assert.equal((await handle(call(args,'intruder'),threadEnv)).status,403);
    const absent=(await (await handle(call({board:'main'}),threadEnv)).json()).result;
    assert.equal(absent.isError,true);assert.equal(JSON.parse(absent.content[0].text).error,'current_thread_unavailable');
    const unregistered=(await (await handle(call(),threadEnv)).json()).result.structuredContent;
    assert.equal(unregistered.thread_id,'host-current');assert.equal(unregistered.registered,false);
    await new BoardService(threadDb,'owner').register_participant({board:'main',participant_id:'current',label:'Current chat',kind:'thread',thread_id:'host-current'});
    const resolved=(await (await handle(call(),threadEnv)).json()).result.structuredContent;
    assert.equal(resolved.participant_id,'current');assert.deepEqual(resolved.receiver,{receiver_thread_id:'host-current'});
    assert.equal((await handle(request('/api/get_thread_id',args),threadEnv)).status,403);
    const browser=await handle(request('/api/get_thread_id',args,'owner',{Origin:'https://board.test','X-Dot-Board':'1'}),threadEnv);
    assert.equal(browser.status,200);assert.equal((await browser.json()).thread_id,'host-current');
    const binding={board:'main',participant_id:'paprika',thread_id:'verified-recipient'};
    await new BoardService(threadDb,'owner').register_participant({board:'main',participant_id:'paprika',label:'Paprika',kind:'agent'});
    const bindCall=subject=>request('/mcp',{jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'bind_participant_thread',arguments:binding}},subject);
    assert.equal((await handle(bindCall('intruder'),threadEnv)).status,403);
    assert.equal((await handle(request('/api/bind_participant_thread',binding),threadEnv)).status,403);
    const linked=(await (await handle(bindCall('owner'),threadEnv)).json()).result;
    assert.equal(linked.isError,false);assert.equal(linked.structuredContent.participant.thread_id,'verified-recipient');
    const retry=await handle(request('/api/bind_participant_thread',binding,'owner',{Origin:'https://board.test','X-Dot-Board':'1'}),threadEnv);
    assert.equal(retry.status,200);assert.equal((await retry.json()).participant.id,'paprika');
    assert.equal(threadDb.connection.prepare('SELECT COUNT(*) n FROM messages').get().n,0);
  } finally {threadDb.close();}
});
test('real stateless HTTP MCP initialization and independent clients use the same backend',async()=>{
  const call=async(name,args)=>{const response=await handle(request('/mcp',{jsonrpc:'2.0',id:crypto.randomUUID(),method:'tools/call',params:{name,arguments:args}}),env);assert.equal(response.status,200);return (await response.json()).result;};
  const init=await handle(request('/mcp',{jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-06-18'}}),env);assert.equal((await init.json()).result.protocolVersion,'2025-06-18');
  const notification=await handle(request('/mcp',{jsonrpc:'2.0',method:'notifications/initialized'}),env);assert.equal(notification.status,202);
  for(const participant_id of ['client-one','client-two'])assert.equal((await call('register_participant',{board:'vex',participant_id,label:participant_id,kind:'agent'})).isError,false);
  const args={board:'vex',sender_id:'client-one',sender_label:'Client One',receiver_id:'client-two',topic:'acceptance',body:'Test message',idempotency_key:'http-retry'};
  const posted=await call('post_message',args),again=await call('post_message',args);const message_id=posted.structuredContent.message.id;assert.equal(again.structuredContent.message.id,message_id);
  assert.equal((await call('get_inbox',{board:'vex',receiver_id:'client-two'})).structuredContent.unacknowledged_count,1);
  assert.equal((await call('get_message',{board:'vex',message_id})).structuredContent.message.body,'Test message');
  assert((await call('delete_message',{board:'vex',message_id})).structuredContent.message.deleted_at);
  assert.equal((await call('restore_message',{board:'vex',message_id})).structuredContent.message.deleted_at,null);
});
test('HTTP parser limits memory and rejects malformed JSON and batch requests',async()=>{
  assert.equal((await handle(new Request('https://board.test/mcp',{method:'POST',headers:{'Content-Type':'application/json'},body:'x'.repeat(32769)}),env)).status,413);
  assert.equal((await handle(new Request('https://board.test/mcp',{method:'POST',headers:{'Content-Type':'application/json'},body:'{'}),env)).status,400);
  const batch=await handle(request('/mcp',[]),env);assert.equal((await batch.json()).error.code,-32600);
});
test('MCP skill import advertises extension and returns complete resources with verified digests',async()=>{
  const call=async(method,params={})=>(await (await handle(request('/mcp',{jsonrpc:'2.0',id:1,method,params}),env)).json()).result;
  const initialized=await call('initialize');assert(initialized.capabilities.extensions['io.modelcontextprotocol/skills']);
  const catalog=await call('skills/list');assert.equal(catalog.skills.length,1);const entry=catalog.skills[0];assert.equal(entry.frontmatter.name,'paprika-messenger');
  assert(entry.resources.some(r=>r.uri.endsWith('/references/connect.md')));
  assert(entry.resources.some(r=>r.uri.endsWith('/scripts/parse-cadence.mjs')));
  assert(entry.resources.some(r=>r.uri.endsWith('/references/direct.md')));
  assert(entry.resources.some(r=>r.uri.endsWith('/references/notifications.md')));
  assert(entry.resources.some(r=>r.uri.endsWith('/scripts/get-thread-id.mjs')));
  assert(entry.resources.some(r=>r.uri.endsWith('/scripts/prepare-notification.mjs')));
  assert(entry.resources.some(r=>r.uri.endsWith('/scripts/prepare-delivery.mjs')));
  assert(entry.resources.some(r=>r.uri.endsWith('/scripts/notification-state.mjs')));
  assert.deepEqual((await call('skills/get',{uri:entry.uri})).skill,entry);
  for(const r of entry.resources){const result=await call('resources/read',{uri:r.uri});assert.equal(result.contents.length,1);const content=result.contents[0];assert.equal(content.uri,r.uri);assert.equal(`sha256:${createHash('sha256').update(content.blob?Buffer.from(content.blob,'base64'):content.text,'utf8').digest('hex')}`,r.digest);}
});

test('new board tools enforce account access and generic note edits retain coordinator and revision checks',async()=>{
  const payload=(name,args)=>({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}});
  assert.equal((await handle(request('/mcp',payload('list_boards',{}),''),env)).status,401);
  assert.equal((await handle(request('/mcp',payload('create_board',{board:'product',label:'Product'}),'intruder'),env)).status,403);
  const created=await (await handle(request('/mcp',payload('create_board',{board:'product',label:'Product'})),env)).json();
  assert.equal(created.result.structuredContent.board.id,'product');
  const listed=await (await handle(request('/mcp',payload('list_boards',{})),env)).json();assert(listed.result.structuredContent.boards.some(b=>b.id==='product'));
  const args={board:'product',expected_revision:0,title:'Project handoff',body:'Shared context'};
  const csrf={Origin:'https://board.test','X-Dot-Board':'1'};
  assert.equal((await handle(request('/api/coordination',args,'owner',csrf),env)).status,403);
  const coordinatorEnv={...env,COORDINATOR_USER_ID:'owner'};
  const saved=await handle(request('/api/coordination',args,'owner',csrf),coordinatorEnv);assert.equal(saved.status,200);assert.equal((await saved.json()).note.body,'Shared context');
  assert.equal((await handle(request('/api/coordination',args,'owner',csrf),coordinatorEnv)).status,409);
  assert.equal((await handle(request('/mcp',payload('list_boards',{})),{...env,DB:undefined})).status,503);
});

test('installation discovers events before secrets are provisioned while subscriptions remain disabled',async()=>{
  const installDb=new SqliteD1();installDb.connection.exec(await loadMigrations());
  const installEnv={DB:installDb,OWNER_USER_ID:'owner'};
  const call=(method,params={},subject='owner')=>request('/mcp',{jsonrpc:'2.0',id:1,method,params},subject);
  try {
    const discovered=(await (await handle(call('server/discover',{},''),installEnv)).json()).result;
    assert.deepEqual(discovered.supportedVersions,['2026-07-28']);assert(discovered.capabilities.events);
    const initialized=(await (await handle(call('initialize',{protocolVersion:'2026-07-28'},''),installEnv)).json()).result;
    assert.equal(initialized.protocolVersion,'2026-07-28');assert(initialized.capabilities.events);
    assert.equal((await handle(call('events/list',{},''),installEnv)).status,401);
    assert.equal((await handle(call('events/list',{},'intruder'),installEnv)).status,403);
    const catalog=(await (await handle(call('events/list'),installEnv)).json()).result;
    assert.equal(catalog.events.length,1);assert.equal(catalog.events[0].name,'message.created');
    const metadata={progressToken:'catalog-progress','openai/locale':'en-US','oai-authenticated-user-id':'intruder'};
    assert.deepEqual((await (await handle(call('events/list',{_meta:metadata,cursor:null}),installEnv)).json()).result,catalog);
    assert.equal((await handle(call('events/list',{_meta:metadata},'intruder'),installEnv)).status,403);
    assert.equal((await handle(call('events/list',{_meta:{'oai-authenticated-user-id':'owner'}},''),installEnv)).status,401);
    assert.equal((await (await handle(call('events/list',{_meta:'invalid'}),installEnv)).json()).error.code,-32602);
    const invalidCursor=(await (await handle(call('events/list',{cursor:'unknown'}),installEnv)).json()).error;
    assert.equal(invalidCursor.code,-32602);
    const attempted=await handle(call('events/subscribe'),installEnv);
    assert.equal(attempted.status,503);assert.equal((await attempted.json()).error,'events_not_configured');
    assert.equal(installDb.connection.prepare('SELECT COUNT(*) n FROM event_subscriptions').get().n,0);
    const configured={...installEnv,EVENT_SECRET_KEY:btoa('e'.repeat(32))};
    assert.deepEqual((await (await handle(call('events/list'),configured)).json()).result,catalog);
  } finally {installDb.close();}
});

test('MCP Events discovery and subscription methods enforce owner authentication and maintenance credentials',async()=>{
  const eventEnv={...env,EVENT_SECRET_KEY:btoa('e'.repeat(32)),EVENT_DISPATCH_PRIVATE_GATE:'owner-private',EVENT_DISPATCH_TOKEN_HASH:await maintenanceTokenDigest('maintenance-test-token')};
  const rpcRequest=(method,params={},subject='owner')=>request('/mcp',{jsonrpc:'2.0',id:10,method,params},subject);
  const discovery=(await (await handle(rpcRequest('server/discover',{},''),eventEnv)).json()).result;
  assert.deepEqual(discovery.supportedVersions,['2026-07-28']);assert(discovery.capabilities.events);
  assert.equal((await handle(rpcRequest('events/list',{},''),eventEnv)).status,401);
  assert.equal((await handle(rpcRequest('events/list',{},'intruder'),eventEnv)).status,403);
  const listed=(await (await handle(rpcRequest('events/list'),eventEnv)).json()).result;
  assert.equal(listed.events[0].name,'message.created');
  const init=(await (await handle(rpcRequest('initialize',{protocolVersion:'2026-07-28'}),eventEnv)).json()).result;
  assert.equal(init.protocolVersion,'2026-07-28');
  assert.equal((await handle(request('/api/event-dispatch',{},''),eventEnv)).status,401);
  assert.equal((await handle(request('/api/event-dispatch',{},'',{'X-Paprika-Maintenance-Token':'wrong'}),eventEnv)).status,401);
  const maintenance=await handle(request('/api/event-dispatch',{},'',{'X-Paprika-Maintenance-Token':'maintenance-test-token'}),eventEnv);
  assert.equal(maintenance.status,200);assert.deepEqual(await maintenance.json(),{attempted:0,accepted:0,failed:0,pending:0});
  assert.equal((await handle(request('/api/event-dispatch',{},'',{'X-Paprika-Maintenance-Token':'maintenance-test-token'}),{...eventEnv,EVENT_DISPATCH_PRIVATE_GATE:undefined})).status,503);
  const malformed=await handle(request('/mcp',{jsonrpc:'2.0',id:10,method:3}),eventEnv);assert.equal((await malformed.json()).error.code,-32600);
});

test('notification setup is owner-only and reports missing runtime without losing message storage',async()=>{
  const setupDb=new SqliteD1();setupDb.connection.exec(await loadMigrations());
  const setupEnv={DB:setupDb,OWNER_USER_ID:'owner'},service=new BoardService(setupDb,'owner');
  const call=(name,args,subject='owner')=>request('/mcp',{jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}},subject);
  try {
    for(const participant_id of ['sender','receiver'])await service.register_participant({board:'main',participant_id,label:participant_id,kind:'thread'});
    const args={board:'main',receiver_id:'receiver'};
    assert.equal((await handle(call('get_notification_setup',args,''),setupEnv)).status,401);
    assert.equal((await handle(call('get_notification_setup',args,'intruder'),setupEnv)).status,403);
    const missing=(await (await handle(call('get_notification_setup',args),setupEnv)).json()).result;
    assert.equal(missing.isError,false);assert.equal(missing.structuredContent.state,'events_not_configured');
    const eventEnv={...setupEnv,EVENT_SECRET_KEY:btoa('n'.repeat(32))};
    const ready=(await (await handle(call('get_notification_setup',args),eventEnv)).json()).result;
    assert.equal(ready.structuredContent.state,'subscription_required');
    const posted=(await (await handle(call('post_message',{board:'main',sender_id:'sender',sender_label:'Sender',receiver_id:'receiver',topic:'test',body:'Stored with clear readiness',idempotency_key:'http-readiness'}),eventEnv)).json()).result;
    assert.equal(posted.isError,false);assert.equal(posted.structuredContent.notification.state,'subscription_required');
    const browser=await handle(request('/api/get_notification_setup',args,'owner',{Origin:'https://board.test','X-Dot-Board':'1'}),eventEnv);
    assert.equal((await browser.json()).state,'subscription_required');
  }finally{setupDb.close();}
});

test('generated Worker sends an authenticated subscription’s notification in request background work',async t=>{
  const eventDb=new SqliteD1();eventDb.connection.exec(await loadMigrations());
  const eventEnv={DB:eventDb,OWNER_USER_ID:'owner',SITE_ORIGIN:'https://board.test',EVENT_SECRET_KEY:btoa('g'.repeat(32))};
  const service=new BoardService(eventDb,'owner');
  for(const participant_id of ['sender','receiver'])await service.register_participant({board:'main',participant_id,label:participant_id,kind:'thread'});
  const sent=[];
  t.mock.method(globalThis,'fetch',async(url,options)=>{const body=JSON.parse(options.body);sent.push(body);return body.type==='verification'?Response.json({challenge:body.challenge}):new Response(null,{status:204});});
  const jobs=[],ctx={waitUntil:job=>jobs.push(job)};
  const params={name:'message.created',arguments:{board:'main',receiver_id:'receiver'},delivery:{mode:'webhook',url:'https://connectors.api.openai.com/test-callback',secret:`whsec_${btoa('s'.repeat(32))}`},_meta:{progressToken:'subscription-progress','oai-authenticated-user-id':'intruder'}};
  try {
    const subscribe=await handle(request('/mcp',{jsonrpc:'2.0',id:1,method:'events/subscribe',params}),eventEnv,ctx);assert.equal(subscribe.status,200);assert((await subscribe.json()).result.id);
    await Promise.all(jobs);
    const args={board:'main',sender_id:'sender',sender_label:'Sender',receiver_id:'receiver',topic:'handoff',body:'Review context',idempotency_key:'http-event'};
    const posted=await handle(request('/mcp',{jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'post_message',arguments:args}}),eventEnv,ctx);
    assert.equal((await posted.json()).result.isError,false);await Promise.all(jobs);
    assert.equal(sent.filter(e=>e.name==='message.created').length,1);
    assert.equal(eventDb.connection.prepare('SELECT COUNT(*) AS count FROM acknowledgments').get().count,0);
    await handle(request('/mcp',{jsonrpc:'2.0',id:3,method:'tools/call',params:{name:'post_message',arguments:args}}),eventEnv,ctx);await Promise.all(jobs);
    assert.equal(sent.filter(e=>e.name==='message.created').length,1);
    const unsubscribeParams={name:params.name,arguments:params.arguments,delivery:{mode:params.delivery.mode,url:params.delivery.url},_meta:{progressToken:'unsubscribe-progress'}};
    const stopped=await handle(request('/mcp',{jsonrpc:'2.0',id:4,method:'events/unsubscribe',params:unsubscribeParams}),eventEnv,ctx);
    assert.deepEqual((await stopped.json()).result,{});
    assert.equal(eventDb.connection.prepare('SELECT active FROM event_subscriptions').get().active,0);
  }finally{eventDb.close();}
});

test('rejected callbacks expose a policy reason and hostname without saving a subscription or logging credentials',async t=>{
  const callbackDb=new SqliteD1();callbackDb.connection.exec(await loadMigrations());
  const callbackEnv={DB:callbackDb,OWNER_USER_ID:'owner',EVENT_SECRET_KEY:btoa('d'.repeat(32))};
  await new BoardService(callbackDb,'owner').register_participant({board:'main',participant_id:'private-receiver',label:'Private receiver',kind:'thread'});
  const logs=[];
  t.mock.method(console,'info',line=>logs.push(JSON.parse(line)));
  t.mock.method(globalThis,'fetch',()=>{assert.fail('Rejected callbacks must never be fetched.');});
  const url='https://events.openai.com/private-callback-id?token=private-callback-token';
  const secret=`whsec_${btoa('private-signing-key'.padEnd(32,'s'))}`;
  try {
    for(const method of ['events/subscribe','events/unsubscribe']){
      const params={name:'message.created',arguments:{board:'main',receiver_id:'private-receiver'},delivery:{mode:'webhook',url,...(method==='events/subscribe'?{secret}:{})},_meta:{progressToken:'private-progress-id'}};
      const result=await (await handle(request('/mcp',{jsonrpc:'2.0',id:1,method,params}),callbackEnv)).json();
      assert.equal(result.error.data.reason,'invalid_callback');
      assert.equal(logs.at(-1).callback_policy_reason,'unapproved_host');
      assert.equal(logs.at(-1).callback_host,'events.openai.com');
    }
    for(const url of ['https://127.0.0.1/secret','https://localhost/secret','https://board.internal/secret']){
      const params={name:'message.created',arguments:{board:'main',receiver_id:'private-receiver'},delivery:{mode:'webhook',url,secret}};
      await handle(request('/mcp',{jsonrpc:'2.0',id:2,method:'events/subscribe',params}),callbackEnv);
      assert.equal(Object.hasOwn(logs.at(-1),'callback_host'),false);
    }
    const recorded=JSON.stringify(logs);
    for(const value of ['private-callback-id','private-callback-token','private-receiver','private-progress-id',secret,'127.0.0.1','localhost','board.internal'])assert.equal(recorded.includes(value),false);
    assert.equal(callbackDb.connection.prepare('SELECT COUNT(*) n FROM event_subscriptions').get().n,0);
  }finally{callbackDb.close();}
});

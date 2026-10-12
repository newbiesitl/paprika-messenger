import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const hostSource=(await readFile('web/recipient-host.js','utf8')).replace(/^import .*?;\r?\n/gm,'').replace(/^export /gm,'');
const cacheSource=(await readFile('web/recipient-cache.js','utf8')).replace(/^export /gm,'');
const pickerSource=(await readFile('skills/paprika-messenger/scripts/conversation-link.mjs','utf8')).replace(/^export /gm,'')+'\n'
  +(await readFile('web/recipient-picker.js','utf8')).replace(/^import .*?;\r?\n/gm,'').replace(/^export /gm,'');
const flush=async()=>{for(let n=0;n<12;n++)await Promise.resolve();};
class Element {
  constructor(tag='div'){this.tagName=tag;this.children=[];this.listeners={};this.attributes={};this.value='';this.textContent='';this.hidden=false;this.disabled=false;this.open=false;this.classList={add(){}};}
  append(...nodes){this.children.push(...nodes);}
  replaceChildren(...nodes){this.children=[...nodes];}
  setAttribute(name,value){this.attributes[name]=value;}
  addEventListener(name,handler){this.listeners[name]=handler;}
  querySelectorAll(tag){return this.children.flatMap(n=>[...(n.tagName===tag?[n]:[]),...n.querySelectorAll(tag)]);}
  querySelector(tag){return this.querySelectorAll(tag)[0];}
  focus(){this.focused=true;}
}
const recipient={participant_id:'fixture-recipient',thread_id:'native-recipient',thread_name:'Native <script> title',source:'codex',execution_mode:'local',host_id:'local',project_status:'assigned',project_id:'fixture-project',project_name:'Fixture project',metadata_stale:false,project_metadata_stale:false};
const page=(extra={})=>({board:'main',mode:'choose',recipients:[recipient],query:'',next_cursor:null,has_more:false,board_options:[{id:'main',label:'General'},{id:'other',label:'Other'}],...extra});
const agreed={sender_id:'fixture-sender',sender_label:'Sender',topic:'Agreed topic',body:'Agreed "body"\n会話 & <script> text',idempotency_key:'fixture-key'};
function harness() {
  const elements=Object.fromEntries(['picker','board-filter','more-boards','refresh-metadata','mode','draft','draft-body','feedback','command','fallback'].map(id=>[id,new Element()]));
  const sent=[],timers=new Map();let timerId=0,listener,callbacks;
  const parent={postMessage(message){sent.push(message);}};
  const window={parent,addEventListener(name,callback){if(name==='message')listener=callback;}};
  const document={getElementById:id=>elements[id],createElement:tag=>new Element(tag),body:{},documentElement:{clientWidth:400,scrollHeight:600}};
  const picker={disabled:true,selected:null,page:null,setDisabled(value){this.disabled=value;},reset(){this.selected=null;},setPage(value){this.page=value;callbacks?.onPage(value);},setSelected(value){this.selected=value;},open(){},getQuery(){return '';},getRegistrationStatus(){return this.page?.registration_status||'active';}};
  let host;
  const context={window,document,setTimeout(callback){const id=++timerId;timers.set(id,callback);return id;},clearTimeout(id){timers.delete(id);},mountStub(root,options){callbacks=options;return picker;}};
  runInNewContext(pickerSource+'\n'+cacheSource+'\n'+hostSource+'\nglobalThis.host=createRecipientHost({window,document,mount:mountStub});',context);host=context.host;
  const emit=(data,source=parent)=>listener({source,data});
  const reply=(request,result={},error)=>emit({jsonrpc:'2.0',id:request.id,...(error?{error}:{result})});
  const initialize=async()=>{reply(sent[0],{protocolVersion:'2026-01-26',hostCapabilities:{updateModelContext:{text:{},structuredContent:{}}}});await flush();};
  const show=data=>emit({jsonrpc:'2.0',method:'ui/notifications/tool-result',params:{structuredContent:data}});
  const verify=async()=>{const req=sent.at(-1);assert.equal(req.method,'tools/call');assert.equal(req.params.name,'get_recipient');reply(req,{structuredContent:{board:'main',recipient}});await flush();};
  return {elements,sent,timers,parent,emit,reply,initialize,show,verify,picker,host,get callbacks(){return callbacks;}};
}

test('initial render is read-only, defaults to main, rejects non-host events and selection attaches an address without sending',async()=>{
  const h=harness();h.emit({jsonrpc:'2.0',method:'ui/notifications/tool-result',params:{structuredContent:page({board:'wrong'})}},{});assert.equal(h.picker.page,null);
  await h.initialize();h.show(page());assert.equal(h.elements['board-filter'].value,'main');assert.equal(h.picker.disabled,false);assert.equal(h.sent.filter(m=>m.method==='ui/message'||m.method==='tools/call').length,0);
  const selecting=h.callbacks.onSelect(recipient);await h.verify();const context=h.sent.at(-1);assert.equal(context.method,'ui/update-model-context');assert.equal(context.params.structuredContent.paprika_recipient.receiver_id,'fixture-recipient');assert.equal(context.params.content[0]._meta['openai/title'],'To: '+recipient.thread_name);
  h.reply(context,{_meta:{'openai/modelContext':{updateId:'fixture-context'}}});await selecting;assert.equal(h.sent.filter(m=>m.method==='ui/message').length,0);
  h.emit({jsonrpc:'2.0',method:'ui/notifications/host-context-changed',params:{'openai/modelContext':null}});assert.equal(h.picker.selected,null);assert.match(h.elements.feedback.textContent,/removed/);
});

test('board changes clear attached context, reset search and verify the selected existing board without creating routing',async()=>{
  const h=harness();await h.initialize();h.show(page());
  const selecting=h.callbacks.onSelect(recipient);await h.verify();h.reply(h.sent.at(-1),{_meta:{'openai/modelContext':{updateId:'selected'}}});await selecting;
  h.elements['board-filter'].value='other';const changing=h.elements['board-filter'].onchange();assert.equal(h.sent.at(-1).method,'ui/update-model-context');assert.equal(h.sent.at(-1).params.content.length,0);
  h.reply(h.sent.at(-1),{});await flush();const lookup=h.sent.at(-1);assert.equal(lookup.params.name,'show_recipient_picker');assert.equal(lookup.params.arguments.board,'other');assert.equal(lookup.params.arguments.query,undefined);
  h.reply(lookup,{structuredContent:page({board:'other',recipients:[]})});await changing;assert.equal(h.picker.selected,null);assert.equal(h.elements['board-filter'].value,'other');assert.equal(h.sent.filter(m=>m.method==='ui/message').length,0);
  assert.equal(h.sent.some(m=>['create_board','register_participant','bind_participant_thread','post_message'].includes(m.params?.name)),false);
});

test('agreed selection submits the frozen payload once, remains locked after a rerender and reports request acceptance separately',async()=>{
  const h=harness();await h.initialize();const original=page({mode:'send_agreed',agreed_message:{...agreed}});h.show(original);original.agreed_message.body='Changed after rendering';
  const selecting=h.callbacks.onSelect(recipient);await assert.rejects(h.callbacks.onSelect(recipient));await h.verify();
  const request=h.sent.at(-1);assert.equal(request.method,'ui/message');assert.equal(request.params.role,'user');const args=JSON.parse(request.params.content[0].text.split('\n').at(-1));assert.deepEqual(args,{board:'main',...agreed,receiver_id:recipient.participant_id});
  assert.equal(h.picker.disabled,true);assert.equal(h.elements['board-filter'].disabled,true);h.reply(request,{});await selecting;
  assert.match(h.elements.feedback.textContent,/Send requested/);assert.doesNotMatch(h.elements.feedback.textContent,/delivered|stored|confirmed/i);
  h.show(page({mode:'send_agreed',agreed_message:agreed}));await assert.rejects(h.callbacks.onSelect(recipient));assert.equal(h.sent.filter(m=>m.method==='ui/message').length,1);assert.equal(h.picker.disabled,true);
});

test('uncertain host send keeps the exact key and recipient, disables resubmission and exposes a reconciliation command',async()=>{
  const h=harness();await h.initialize();h.show(page({mode:'send_agreed',agreed_message:agreed}));const selecting=h.callbacks.onSelect(recipient);await h.verify();
  const request=h.sent.at(-1);assert.equal(request.method,'ui/message');const timeout=[...h.timers.values()][0];timeout();await selecting;
  assert.equal(h.elements.fallback.open,true);assert.match(h.elements.feedback.textContent,/not confirmed/);assert.equal(h.elements.command.value,request.params.content[0].text);
  await assert.rejects(h.callbacks.onSelect(recipient));assert.equal(h.sent.filter(m=>m.method==='ui/message').length,1);assert.equal(h.picker.disabled,true);
});

test('unsupported recipient attachment exposes a copyable address without sending or silently persisting it',async()=>{
  const h=harness();await h.initialize();h.show(page());const selecting=h.callbacks.onSelect(recipient);await h.verify();h.reply(h.sent.at(-1),null,{message:'Unsupported'});await selecting;
  assert.equal(h.elements.fallback.open,true);assert.match(h.elements.command.value,/fixture-recipient/);assert.match(h.elements.feedback.textContent,/could not attach/);assert.equal(h.sent.filter(m=>m.method==='ui/message').length,0);
});

test('explicit metadata refresh requests only the current 50 bindings and preserves the unsent agreed content',async()=>{
  const h=harness();await h.initialize();h.show(page({mode:'send_agreed',agreed_message:agreed}));h.callbacks.onPage({recipients:Array.from({length:70},(_,n)=>({...recipient,participant_id:'fixture-'+n,thread_id:'native-'+n}))});
  const refreshing=h.elements['refresh-metadata'].onclick();const request=h.sent.at(-1);assert.equal(request.method,'ui/message');const context=JSON.parse(request.params.content[0].text.split('\n').at(-1));assert.equal(context.bindings.length,50);assert.equal(context.board,'main');assert.equal(context.mode,'send_agreed');assert.equal(context.agreed_message.body,agreed.body);assert.equal(context.agreed_message.idempotency_key,agreed.idempotency_key);assert.match(request.params.content[0].text,/does not send/);
  h.reply(request,{});await refreshing;assert.equal(h.picker.disabled,false);assert.equal(h.sent.some(m=>m.params?.name==='post_message'),false);assert.match(h.elements.feedback.textContent,/Refresh requested/);
});

test('refreshing removed threads keeps the archive view and cannot authorize the frozen agreed message',async()=>{
  const h=harness();await h.initialize();h.show(page({registration_status:'unregistered',mode:'send_agreed',agreed_message:agreed}));
  assert.match(h.elements.mode.textContent,/Restore a removed thread/);
  const refreshing=h.elements['refresh-metadata'].onclick(),request=h.sent.at(-1);
  const context=JSON.parse(request.params.content[0].text.split('\n').at(-1));
  assert.equal(context.registration_status,'unregistered');assert.deepEqual(context.agreed_message,agreed);
  assert.match(request.params.content[0].text,/does not send the message/);
  h.reply(request,{});await refreshing;assert.equal(h.sent.some(m=>m.params?.name==='post_message'),false);
});

test('shared picker groups native projects, displays text safely, ignores stale searches and follows cursor pages',async()=>{
  const root=new Element(),timers=new Map(),requests=[];let timerId=0;
  const document={createElement:tag=>new Element(tag)};
  const context={document,setTimeout(fn){const id=++timerId;timers.set(id,fn);return id;},clearTimeout(id){timers.delete(id);}};
  runInNewContext(pickerSource+'\nglobalThis.mount=mountRecipientPicker;',context);
  const picker=context.mount(root,{load:args=>new Promise(resolve=>requests.push({args,resolve})),onSelect:async r=>r});
  picker.setPage(page());assert.equal(root.querySelector('h3').textContent,'Fixture project');assert.equal(root.querySelector('strong').textContent,recipient.thread_name);assert.equal(root.querySelectorAll('script').length,0);
  const search=root.querySelector('input');search.value='old';search.listeners.input();[...timers.values()].at(-1)();assert.equal(requests[0].args.query,'old');
  search.value='new';search.listeners.input();[...timers.values()].at(-1)();requests[1].resolve(page({recipients:[{...recipient,thread_name:'Newest',project_status:'unassigned'}],next_cursor:'fixture-cursor'}));await flush();requests[0].resolve(page());await flush();assert.equal(root.querySelector('strong').textContent,'Newest');assert.equal(root.querySelectorAll('h3').length,0);
  const more=root.querySelectorAll('button').find(b=>b.textContent==='Load more');const loading=more.onclick();assert.equal(requests[2].args.cursor,'fixture-cursor');requests[2].resolve(page({recipients:[{...recipient,participant_id:'another',thread_id:'another-native',thread_name:'Another',project_status:'unassigned'}]}));await loading;assert.equal(root.querySelectorAll('strong').length,2);
  picker.reset();assert.equal(root.querySelectorAll('strong').length,0);assert.equal(search.value,'');
});

test('opening a conversation uses the host navigation bridge without selecting or submitting an agreed message',async()=>{
  const h=harness();await h.initialize();h.show(page({mode:'send_agreed',agreed_message:agreed}));
  const opening=h.callbacks.onOpen({url:'codex://threads/native-recipient'});
  const request=h.sent.at(-1);assert.equal(request.method,'ui/open-link');assert.equal(request.params.url,'codex://threads/native-recipient');
  h.reply(request,{});await opening;
  assert.equal(h.sent.some(m=>m.method==='ui/message'||m.method==='ui/update-model-context'||m.params?.name==='post_message'),false);
  assert.equal(h.picker.selected,null);assert.equal(h.picker.disabled,false);
  const rejected=h.callbacks.onOpen({url:'codex://threads/native-recipient'});h.reply(h.sent.at(-1),{isError:true});await assert.rejects(rejected,/refused/);
});

test('cloud ChatGPT links open on the client without an assistant message or a desktop navigation command',async()=>{
  const h=harness();await h.initialize();h.show(page({mode:'send_agreed',agreed_message:agreed}));
  const url='https://chatgpt.com/c/11111111-2222-4333-8444-555555555555';
  const opening=h.callbacks.onOpen({url,kind:'chatgpt'});
  const request=h.sent.at(-1);assert.equal(request.method,'ui/open-link');assert.equal(request.params.url,url);
  h.reply(request,{});await opening;
  assert.equal(h.sent.some(m=>m.method==='ui/message'||m.method==='ui/update-model-context'||m.params?.name==='post_message'||m.params?.name==='navigate_to_codex_page'),false);
  assert.equal(h.picker.selected,null);assert.equal(h.picker.disabled,false);
});

test('a cloud recipient with distinct execution and web IDs displays its verified URL in the dropdown',()=>{
  const root=new Element(),document={createElement:tag=>new Element(tag)};
  const context={document,setTimeout,clearTimeout};runInNewContext(pickerSource+'\nglobalThis.mount=mountRecipientPicker;',context);
  const picker=context.mount(root,{load:async()=>page()});
  const url='https://chatgpt.com/c/11111111-2222-4333-8444-555555555555';
  picker.setPage(page({recipients:[{...recipient,source:'codex',execution_mode:'cloud',host_id:'durable',conversation_url:url}]}));
  assert.equal(root.querySelector('a').href,url);
  assert.equal(root.querySelectorAll('button').find(b=>b.className==='recipient-option').querySelector('a'),undefined);
});

test('dropdown links are separate from recipient buttons and remain copyable when the host refuses navigation',async()=>{
  const root=new Element(),document={createElement:tag=>new Element(tag)};let selections=0,opens=0;
  const context={document,setTimeout,clearTimeout};runInNewContext(pickerSource+'\nglobalThis.mount=mountRecipientPicker;',context);
  const picker=context.mount(root,{load:async()=>page(),onSelect:async r=>{selections++;return r;},onOpen:async()=>{opens++;throw Error('Unsupported');}});
  picker.setPage(page());const anchor=root.querySelector('a'),button=root.querySelectorAll('button').find(b=>b.className==='recipient-option');
  assert.equal(anchor.href,'codex://threads/native-recipient');assert.equal(anchor.rel,'noopener noreferrer');
  assert.equal(button.querySelector('a'),undefined);assert.equal(root.querySelectorAll('script').length,0);
  let prevented=false;await anchor.onclick({preventDefault(){prevented=true;},stopPropagation(){}});
  assert.equal(prevented,true);assert.equal(opens,1);assert.equal(selections,0);assert.match(root.querySelectorAll('p').find(p=>p.className==='recipient-status').textContent,/Copy this link: codex:\/\/threads\/native-recipient/);
  picker.setSelected(recipient);assert.equal(root.querySelectorAll('a').length,2);
  picker.setPage(page({recipients:[{...recipient,source:'unknown'}]}));assert.equal(root.querySelectorAll('a').filter(a=>a.href?.startsWith('javascript:')).length,0);
});

function cleanupPicker(options) {
  const root=new Element(),document={createElement:tag=>new Element(tag)},context={document,setTimeout,clearTimeout};
  runInNewContext(pickerSource+'\nglobalThis.mount=mountRecipientPicker;',context);
  return {root,picker:context.mount(root,options),button:text=>root.querySelectorAll('button').find(b=>b.textContent===text)};
}
const cleanupRecipient={...recipient,kind:'thread',registration_status:'active'};

test('remove hides the normal dropdown row and clears its selection; undo restores without selecting or sending',async()=>{
  let removed=false,selections=0;const mutations=[];
  const h=cleanupPicker({load:async args=>page({registration_status:args.registration_status,recipients:removed?[]:[cleanupRecipient]}),
    onSelect:async r=>{selections++;return r;},onUnregister:async r=>{mutations.push(['remove',r.participant_id]);removed=true;},
    onRestore:async r=>{mutations.push(['restore',r.participant_id]);removed=false;}});
  h.picker.setPage(page({recipients:[cleanupRecipient]}));h.picker.setSelected(cleanupRecipient);
  const option=h.root.querySelectorAll('button').find(b=>b.className==='recipient-option');
  assert.equal(option.querySelector('button'),undefined);
  await h.button('Remove from board').onclick();
  assert.equal(h.root.querySelectorAll('strong').length,0);assert.equal(h.root.querySelector('summary').textContent,'Choose recipient');
  assert.equal(h.button('Clear recipient').hidden,true);assert.equal(h.button('Undo removal').hidden,false);
  await h.button('Undo removal').onclick();
  assert.equal(h.root.querySelectorAll('strong').length,1);assert.equal(h.button('Undo removal').hidden,true);
  assert.equal(h.root.querySelector('summary').textContent,'Choose recipient');assert.equal(selections,0);
  assert.deepEqual(mutations,[['remove',recipient.participant_id],['restore',recipient.participant_id]]);
});

test('removed threads are a separate searchable view with disabled recipient selection and an explicit restore action',async()=>{
  let removed=true,selections=0;const reads=[];
  const h=cleanupPicker({load:async args=>{reads.push(args);return page({registration_status:args.registration_status,
    recipients:args.registration_status==='unregistered'&&removed?[{...cleanupRecipient,registration_status:'unregistered'}]:[]});},
    onSelect:async()=>{selections++;},onUnregister:async()=>{},onRestore:async()=>{removed=false;}});
  h.picker.setPage(page({recipients:[]}));
  await h.button('Removed threads').onclick();
  assert.equal(reads[0].registration_status,'unregistered');assert.equal(h.picker.getRegistrationStatus(),'unregistered');
  assert.equal(h.root.querySelector('summary').textContent,'Removed threads');
  const option=h.root.querySelectorAll('button').find(b=>b.className==='recipient-option');
  assert.equal(option.disabled,true);await option.onclick();assert.equal(selections,0);
  const search=h.root.querySelector('input');search.value='native-recipient';await h.picker.refresh();
  assert.equal(reads.at(-1).query,'native-recipient');assert.equal(reads.at(-1).registration_status,'unregistered');
  await h.button('Restore to board').onclick();assert.equal(h.root.querySelectorAll('strong').length,0);
  await h.button('Back to recipients').onclick();assert.equal(reads.at(-1).registration_status,'active');
  assert.equal(h.root.querySelector('summary').textContent,'Choose recipient');
  assert.equal(selections,0);
});

test('stale list reads cannot resurrect a removed row and an old-board mutation cannot alter the new board',async()=>{
  const reads=[];let finishRemoval;
  const h=cleanupPicker({load:args=>new Promise(resolve=>reads.push({args,resolve})),onSelect:async r=>r,
    onUnregister:async()=>{},onRestore:async()=>{}});
  h.picker.setPage(page({recipients:[cleanupRecipient]}));const oldRead=h.picker.refresh();
  const removing=h.button('Remove from board').onclick();await flush();assert.equal(reads.length,2);
  reads[0].resolve(page({recipients:[cleanupRecipient]}));await oldRead;
  assert.equal(h.root.querySelectorAll('strong').length,0);
  reads[1].resolve(page({recipients:[]}));await removing;

  const boardTest=cleanupPicker({load:async()=>page(),onSelect:async r=>r,
    onUnregister:()=>new Promise(resolve=>{finishRemoval=resolve;}),onRestore:async()=>{}});
  boardTest.picker.setPage(page({recipients:[cleanupRecipient]}));const changing=boardTest.button('Remove from board').onclick();
  boardTest.picker.reset();boardTest.picker.setPage(page({board:'other',recipients:[{...cleanupRecipient,thread_name:'Other board thread'}]}));
  finishRemoval();await changing;
  assert.equal(boardTest.root.querySelector('strong').textContent,'Other board thread');assert.equal(boardTest.button('Undo removal').hidden,true);
});

test('failed removal leaves the recipient available and reports that no change was confirmed',async()=>{
  const h=cleanupPicker({load:async()=>page(),onUnregister:async()=>{throw Error('Removal not confirmed.');},onRestore:async()=>{}});
  h.picker.setPage(page({recipients:[cleanupRecipient]}));await h.button('Remove from board').onclick();
  assert.equal(h.root.querySelectorAll('strong').length,1);assert.equal(h.button('Undo removal').hidden,true);
  assert.equal(h.button('Remove from board').disabled,false);
  assert.match(h.root.querySelectorAll('p').find(p=>p.className==='recipient-status').textContent,/not confirmed/);
});

test('host removal calls the exact board address and clears only its matching selected attachment',async()=>{
  const h=harness();await h.initialize();h.show(page());
  const selecting=h.callbacks.onSelect(recipient);await h.verify();h.reply(h.sent.at(-1),{_meta:{'openai/modelContext':{updateId:'selected'}}});await selecting;
  const removing=h.callbacks.onUnregister(recipient),request=h.sent.at(-1);
  assert.equal(request.params.name,'unregister_thread');assert.deepEqual(JSON.parse(JSON.stringify(request.params.arguments)),{board:'main',participant_id:recipient.participant_id});
  h.reply(request,{structuredContent:{board:'main',participant_id:recipient.participant_id,registration_status:'unregistered'}});await flush();
  const clearing=h.sent.at(-1);assert.equal(clearing.method,'ui/update-model-context');assert.equal(clearing.params.content.length,0);
  h.reply(clearing,{});await removing;assert.equal(h.picker.selected,null);assert.equal(h.picker.disabled,false);
  assert.equal(h.sent.some(m=>m.method==='ui/message'||m.params?.name==='post_message'),false);
});

test('cleanup preserves the pending agreed message and key; only an actual active recipient selection requests sending',async()=>{
  const h=harness();await h.initialize();h.show(page({mode:'send_agreed',agreed_message:{...agreed}}));
  const removing=h.callbacks.onUnregister(recipient);h.reply(h.sent.at(-1),{structuredContent:{registration_status:'unregistered'}});await removing;
  const restoring=h.callbacks.onRestore(recipient);assert.equal(h.sent.at(-1).params.name,'restore_thread_registration');
  h.reply(h.sent.at(-1),{structuredContent:{registration_status:'active'}});await restoring;
  assert.equal(h.sent.some(m=>m.method==='ui/message'),false);assert.equal(h.elements['draft-body'].textContent,agreed.body);
  const other={...recipient,participant_id:'active-other'},selecting=h.callbacks.onSelect(other);
  assert.equal(h.sent.at(-1).params.name,'get_recipient');h.reply(h.sent.at(-1),{structuredContent:{board:'main',recipient:other}});await flush();
  const send=h.sent.at(-1);assert.equal(send.method,'ui/message');
  assert.deepEqual(JSON.parse(send.params.content[0].text.split('\n').at(-1)),{board:'main',...agreed,receiver_id:other.participant_id});
  h.reply(send,{});await selecting;
});

test('a removal completed after a board rerender cannot clear a different board attachment',async()=>{
  const h=harness();await h.initialize();h.show(page());
  const selecting=h.callbacks.onSelect(recipient);await h.verify();h.reply(h.sent.at(-1),{_meta:{'openai/modelContext':{updateId:'selected'}}});await selecting;
  const removing=h.callbacks.onUnregister(recipient),request=h.sent.at(-1);
  h.show(page({board:'other',recipients:[{...recipient,thread_name:'Other board thread'}]}));
  h.reply(request,{structuredContent:{registration_status:'unregistered'}});await assert.rejects(removing,/previous board/);
  assert.equal(h.picker.page.board,'other');assert.equal(h.picker.disabled,false);
  assert.equal(h.sent.filter(m=>m.method==='tools/call').at(-1),request);assert.equal(h.sent.some(m=>m.method==='ui/message'),false);
  const attachments=h.sent.filter(m=>m.method==='ui/update-model-context').length;
  const otherRemoval=h.callbacks.onUnregister(recipient),otherRequest=h.sent.filter(m=>m.method==='tools/call').at(-1);
  assert.equal(otherRequest.params.arguments.board,'other');
  h.reply(otherRequest,{structuredContent:{registration_status:'unregistered'}});await otherRemoval;
  assert.equal(h.sent.filter(m=>m.method==='ui/update-model-context').length,attachments);
});

const versionedPage=extra=>page({registration_status:'active',directory_revision:1,boards_revision:1,cache_scope:'fixture-cache-scope',page_cursor:null,page_limit:50,...extra});

test('cached rows remain visible and interactive while a lightweight revision check is pending; unchanged data skips a reload',async()=>{
  let finishCheck,loads=0;
  const h=cleanupPicker({load:async()=>{loads++;return versionedPage();},onSelect:async r=>r,
    checkUpdates:()=>new Promise(resolve=>{finishCheck=resolve;}),getBoardsRevision:()=>1});
  h.picker.setPage(versionedPage());const details=h.root.querySelector('details');details.open=true;details.listeners.toggle();await flush();
  assert.equal(h.root.querySelector('strong').textContent,recipient.thread_name);
  assert.equal(h.root.querySelectorAll('button').find(b=>b.className==='recipient-option').disabled,false);
  assert.equal(loads,0);finishCheck({directory_revision:1,boards_revision:1,cache_scope:'fixture-cache-scope'});await flush();assert.equal(loads,0);
});

test('changed directory and board flags refresh once without native metadata reads or mixing old cursor pages',async()=>{
  const calls=[];let boardsRevision=1,boardReloads=0;
  const h=cleanupPicker({load:async(args,options)=>{calls.push({args,options});return versionedPage({directory_revision:2,boards_revision:2,recipients:[{...recipient,thread_name:'New registration'}]});},onSelect:async r=>r,
    checkUpdates:async()=>({directory_revision:2,boards_revision:2,cache_scope:'fixture-cache-scope'}),getBoardsRevision:()=>boardsRevision,
    onBoardsChanged:async()=>{boardsRevision=2;boardReloads++;}});
  h.picker.setPage(versionedPage({next_cursor:'old-cursor'}));const details=h.root.querySelector('details');details.open=true;details.listeners.toggle();await flush();
  assert.equal(boardReloads,1);assert.equal(calls.length,1);assert.equal(calls[0].options.bypassCache,true);assert.equal(calls[0].args.cursor,undefined);
  assert.equal(h.root.querySelector('strong').textContent,'New registration');
  details.open=false;details.listeners.toggle();details.open=true;details.listeners.toggle();await flush();assert.equal(calls.length,1);
});

test('a late revision response cannot refresh the wrong board and an unavailable check retains saved rows',async()=>{
  let finishCheck,loads=0;
  const h=cleanupPicker({load:async()=>{loads++;return versionedPage();},checkUpdates:()=>new Promise(resolve=>{finishCheck=resolve;}),getBoardsRevision:()=>1});
  h.picker.setPage(versionedPage());const details=h.root.querySelector('details');details.open=true;details.listeners.toggle();await flush();
  h.picker.reset();h.picker.setPage(versionedPage({board:'other',recipients:[{...recipient,thread_name:'Other board'}]}));
  finishCheck({directory_revision:2,boards_revision:1,cache_scope:'old-scope'});await flush();
  assert.equal(loads,0);assert.equal(h.root.querySelector('strong').textContent,'Other board');
  const failure=cleanupPicker({load:async()=>versionedPage(),checkUpdates:async()=>{throw Error('Unavailable');}});
  failure.picker.setPage(versionedPage());const failedDetails=failure.root.querySelector('details');failedDetails.open=true;failedDetails.listeners.toggle();await flush();
  assert.equal(failure.root.querySelector('strong').textContent,recipient.thread_name);
  assert.match(failure.root.querySelectorAll('p').find(p=>p.className==='recipient-status').textContent,/could not be verified/);
});

test('load more restarts from a fresh first page when the directory changed after the old cursor was issued',async()=>{
  const calls=[];
  const h=cleanupPicker({load:async(args,options)=>{calls.push({args,options});return versionedPage({directory_revision:2,recipients:[{...recipient,thread_name:args.cursor?'Later row':'Newest row'}]});}});
  h.picker.setPage(versionedPage({next_cursor:'old-cursor'}));await h.button('Load more').onclick();
  assert.equal(calls.length,2);assert.equal(calls[0].args.cursor,'old-cursor');assert.equal(calls[1].args.cursor,undefined);assert.equal(calls[1].options.bypassCache,true);
  assert.equal(h.root.querySelectorAll('strong').length,1);assert.equal(h.root.querySelector('strong').textContent,'Newest row');
});

test('the host uses local pages when available and the private board on a miss or forced refresh',async()=>{
  const h=harness();await h.initialize();h.show(versionedPage({mode:'send_agreed',agreed_message:agreed}));
  const hit=await h.callbacks.load({query:'',limit:50,registration_status:'active'});
  assert.equal(hit.local_cache_hit,true);assert.equal(hit.agreed_message,undefined);assert.equal(h.sent.some(m=>m.method==='tools/call'),false);
  const loading=h.callbacks.load({query:'new-name',limit:50,registration_status:'active'}),request=h.sent.at(-1);
  assert.equal(request.params.name,'list_recipients');assert.equal(request.params.arguments.query,'new-name');
  h.reply(request,{structuredContent:versionedPage({query:'new-name',directory_revision:2})});await loading;
  const forced=h.callbacks.load({query:'',limit:50,registration_status:'active'},{bypassCache:true});
  assert.equal(h.sent.at(-1).params.name,'list_recipients');h.reply(h.sent.at(-1),{structuredContent:versionedPage({directory_revision:2})});await forced;
  assert.equal(h.elements['draft-body'].textContent,agreed.body);assert.equal(h.sent.some(m=>m.method==='ui/message'),false);
});

test('a newly created board refreshes the filter without changing a frozen message or requesting a send',async()=>{
  const h=harness();await h.initialize();h.show(versionedPage({mode:'send_agreed',agreed_message:agreed}));
  const checking=h.callbacks.checkUpdates();assert.equal(h.sent.at(-1).params.name,'get_recipient_directory_state');
  h.reply(h.sent.at(-1),{structuredContent:{board:'main',directory_revision:1,boards_revision:2,cache_scope:'fixture-cache-scope'}});await checking;
  const updating=h.callbacks.onBoardsChanged();assert.equal(h.sent.at(-1).params.name,'list_boards');
  h.reply(h.sent.at(-1),{structuredContent:{boards:[{id:'main',label:'Main'},{id:'new-board',label:'New board'}],boards_revision:2,has_more:false,next_after_id:null}});await updating;
  assert(h.elements['board-filter'].children.some(option=>option.value==='new-board'));assert.equal(h.elements['board-filter'].value,'main');
  assert.equal(h.elements['draft-body'].textContent,agreed.body);assert.equal(h.sent.some(m=>m.method==='ui/message'),false);
});

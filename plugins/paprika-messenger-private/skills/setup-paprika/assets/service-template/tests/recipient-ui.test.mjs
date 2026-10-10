import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const hostSource=(await readFile('web/recipient-host.js','utf8')).replace(/^import .*?;\r?\n/gm,'').replace(/^export /gm,'');
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
  const picker={disabled:true,selected:null,page:null,setDisabled(value){this.disabled=value;},reset(){this.selected=null;},setPage(value){this.page=value;},setSelected(value){this.selected=value;},open(){},getQuery(){return '';}};
  let host;
  const context={window,document,setTimeout(callback){const id=++timerId;timers.set(id,callback);return id;},clearTimeout(id){timers.delete(id);},mountStub(root,options){callbacks=options;return picker;}};
  runInNewContext(pickerSource+'\n'+hostSource+'\nglobalThis.host=createRecipientHost({window,document,mount:mountStub});',context);host=context.host;
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

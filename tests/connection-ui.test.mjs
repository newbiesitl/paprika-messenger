import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const html=await readFile(new URL('../web/connection-controls.html',import.meta.url),'utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
const flush=async()=>{for(let i=0;i<6;i++)await Promise.resolve();};

function harness({standalone=false}={}) {
  const elements=Object.fromEntries(['status','state','address','detail','method','acknowledge','enable','refresh','stop','feedback','fallback','prompt'].map(id=>[id,{checked:false,disabled:true,hidden:false,textContent:'',value:'',open:false,classList:{toggle(){}},addEventListener(name,callback){this[name]=callback;}}]));
  elements.method.value='auto';
  const sent=[],timers=new Map();let timerId=0,listener;
  const parent={postMessage(message){sent.push(message);}};
  const window={parent,addEventListener(name,callback){if(name==='message')listener=callback;}};
  if(standalone)window.parent=window;
  const document={getElementById:id=>elements[id],body:{},documentElement:{clientWidth:360,scrollHeight:540}};
  runInNewContext(script,{window,document,setTimeout(callback){const id=++timerId;timers.set(id,callback);return id;},clearTimeout(id){timers.delete(id);}});
  const emit=(data,source=parent)=>listener({source,data});
  const reply=(request,result={},error)=>emit({jsonrpc:'2.0',id:request.id,...(error?{error}:{result})});
  const show=data=>emit({jsonrpc:'2.0',method:'ui/notifications/tool-result',params:{structuredContent:data}});
  const initialize=async()=>{const req=sent.find(m=>m.method==='ui/initialize');reply(req,{protocolVersion:'2026-01-26',hostInfo:{name:'Test host'},hostCapabilities:{message:{text:{}}}});await flush();};
  return {elements,sent,timers,parent,emit,reply,show,initialize};
}

test('connection card rendering does not request monitoring and rejects messages outside its host',async()=>{
  const h=harness();
  assert.deepEqual(h.sent.map(m=>m.method),['ui/initialize']);
  assert.deepEqual(Array.from(h.sent[0].params.appCapabilities.availableDisplayModes),['inline']);
  h.emit({jsonrpc:'2.0',method:'ui/notifications/tool-result',params:{structuredContent:{board:'wrong',state:'ready'}}},{});
  assert.equal(h.elements.enable.disabled,true);
  await h.initialize();h.show({board:'main',receiver_id:null,state:'receiver_required'});
  assert.equal(h.elements.enable.disabled,false);assert.equal(h.elements.acknowledge.checked,false);
  assert.equal(h.sent.filter(m=>m.method==='ui/message'||m.method==='tools/call').length,0);
  assert.match(h.elements.prompt.value,/this current chat/);
  assert.match(h.elements.prompt.value,/Do not automatically acknowledge/);
  assert.match(h.elements.prompt.value,/establish event monitoring by default/);
  assert.match(h.elements.prompt.value,/heartbeat only if I explicitly choose/);
  assert.match(h.elements.prompt.value,/Respect explicit events-only or no-polling/);
  assert.equal(h.timers.size,0);
});

test('ChatGPT and Codex service type is visible without requesting Dot or creating monitoring',async()=>{
  const h=harness();await h.initialize();
  h.show({board:'main',receiver_id:'current',state:'events_not_configured',service_type:'chatgpt-codex'});
  assert.match(h.elements.address.textContent,/ChatGPT \+ Codex/);
  assert.doesNotMatch(h.elements.prompt.value,/\bDot\b/);
  assert.match(h.elements.detail.textContent,/on-demand inbox reads need no event setup or task/);
  assert.equal(h.sent.filter(message=>message.method==='ui/message'||message.method==='tools/call').length,0);
  assert.equal(h.timers.size,0);
});

test('enable is an explicit same-chat request, receipts are optional, and host acceptance is not readiness',async()=>{
  const h=harness();await h.initialize();h.show({board:'main',receiver_id:'displayed-address',state:'subscription_required'});
  h.elements.acknowledge.checked=true;h.elements.acknowledge.change();
  const action=h.elements.enable.onclick();
  h.elements.enable.onclick();
  const requests=h.sent.filter(m=>m.method==='ui/message');assert.equal(requests.length,1);
  const prompt=requests[0].params.content[0].text;
  assert.equal(requests[0].params.role,'user');assert.match(prompt,/explicitly acknowledge each message/);
  assert.match(prompt,/lookup hint, not proof of this chat/);
  assert.match(prompt,/Reconcile any existing task/);assert.match(prompt,/saved task destination, enabled state and trigger/);
  assert.match(prompt,/unscheduled same-chat event task and get_notification_setup ready/);
  assert.match(prompt,/Explain what receiving task was created, reused or resumed/);
  assert.match(prompt,/quiet unchanged checks and how to stop it/);
  h.reply(requests[0],{});await action;
  assert.match(h.elements.feedback.textContent,/Request sent/);
  assert.equal(h.elements.state.textContent,'No event subscription for this inbox');assert.equal(h.timers.size,0);
  assert.equal(h.elements.stop.hidden,false);
  h.show({board:'main',receiver_id:'displayed-address',state:'ready'});
  assert.equal(h.elements.stop.hidden,false);
});

test('receiving-only choice sends an on-demand request without event or scheduler setup',async()=>{
  const h=harness();await h.initialize();h.show({board:'main',receiver_id:'current',state:'subscription_required'});
  h.elements.method.value='on_demand';h.elements.method.change();
  assert.equal(h.sent.filter(m=>m.method==='ui/message').length,0);
  const action=h.elements.enable.onclick(),request=h.sent.at(-1);
  assert.equal(request.params.role,'user');
  assert.match(request.params.content[0].text,/transport on_demand, no cadence and no task IDs/);
  assert.match(request.params.content[0].text,/Do not create a hook, subscription, heartbeat, scheduled service or background process/);
  assert.doesNotMatch(request.params.content[0].text,/subscribe to message\.created|I explicitly choose heartbeat|An event route requires/);
  h.reply(request,{});await action;
  assert.equal(h.timers.size,0);
  assert.equal(h.sent.filter(m=>m.method==='ui/message').length,1);
  assert.equal(h.sent.filter(m=>m.method==='tools/call').length,0);
});

test('receiving-method choices request events or a five-minute heartbeat only after the user acts',async()=>{
  const h=harness();await h.initialize();h.show({board:'main',receiver_id:'current',state:'subscription_required'});
  h.elements.method.value='inbox_checks';h.elements.method.change();
  assert.equal(h.sent.filter(m=>m.method==='ui/message').length,0);
  assert.match(h.elements.prompt.value,/I explicitly choose heartbeat inbox checks every 5 minutes/);
  assert.doesNotMatch(h.elements.prompt.value,/An event route requires/);
  const polling=h.elements.enable.onclick(),pollRequest=h.sent.at(-1);
  assert.match(pollRequest.params.content[0].text,/verify the saved task and its exact 5-minute interval/);
  h.reply(pollRequest,{});await polling;
  assert.equal(h.elements.state.textContent,'No event subscription for this inbox');
  h.elements.method.value='mcp_events';h.elements.method.change();
  assert.match(h.elements.prompt.value,/I choose event notifications only, with no periodic inbox checks/);
  assert.doesNotMatch(h.elements.prompt.value,/I explicitly choose heartbeat/);
  const event=h.elements.enable.onclick(),eventRequest=h.sent.at(-1);
  assert.match(eventRequest.params.content[0].text,/unscheduled same-chat event task and get_notification_setup ready/);
  h.reply(eventRequest,{});await event;
  assert.equal(h.elements.state.textContent,'No event subscription for this inbox');
  assert.equal(h.timers.size,0);
});

test('status is a read-only tool call and stop preserves other chats with a safe command fallback',async()=>{
  const h=harness();await h.initialize();h.show({board:'main',receiver_id:'current',state:'ready'});
  const refresh=h.elements.refresh.onclick();const query=h.sent.at(-1);
  assert.equal(query.method,'tools/call');assert.equal(query.params.name,'show_connection_controls');
  assert.equal(query.params.arguments.receiver_id,'current');
  h.reply(query,{structuredContent:{board:'main',receiver_id:'current',state:'paused'}});await refresh;
  assert.equal(h.elements.state.textContent,'Event subscription is paused');
  const stop=h.elements.stop.onclick();const command=h.sent.at(-1);
  assert.equal(command.method,'ui/message');assert.match(command.params.content[0].text,/only this current chat’s verified/);
  assert.match(command.params.content[0].text,/Preserve messages and other chats/);
  h.reply(command,{}, {code:-32601,message:'Unavailable'});await stop;
  assert.equal(h.elements.fallback.open,true);assert.equal(h.elements.prompt.value,command.params.content[0].text);
  assert.match(h.elements.feedback.textContent,/finish setup in this chat/);assert.equal(h.timers.size,0);
});

test('an unsupported host or rejected setup exposes the exact command without claiming enabled',async()=>{
  const h=harness();const init=h.sent[0];h.reply(init,{protocolVersion:'unsupported'});await flush();
  h.show({board:'main',state:'receiver_required'});
  await h.elements.enable.onclick();
  assert.equal(h.sent.filter(m=>m.method==='ui/message').length,0);
  assert.equal(h.elements.fallback.open,true);assert.match(h.elements.prompt.value,/Enable incoming Paprika Messenger messages/);
  assert.equal(h.elements.state.textContent,'Connect this chat');
  const supported=harness();await supported.initialize();supported.show({board:'main',state:'subscription_required'});
  const action=supported.elements.enable.onclick();supported.reply(supported.sent.at(-1),{isError:true});await action;
  assert.equal(supported.elements.state.textContent,'No event subscription for this inbox');assert.equal(supported.elements.fallback.open,true);
});

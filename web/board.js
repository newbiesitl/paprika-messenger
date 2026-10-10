import {createState,applyEvents,inbox} from './state.js';
import {mountRecipientPicker} from './recipient-picker.js';
const $=id=>document.getElementById(id);
const el=(tag,text,cls)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(cls)node.className=cls;return node;};
let state=createState(),cursor=null,board='main',generation=0,polling=false,ready=false,replyId=null,attempt=null,canCoordinate=false,alerts=false,writing=false;
const deepLink=new URL(location.href).searchParams;
const requestedBoard=deepLink.get('board'),requestedReceiver=deepLink.get('receiver');
if(requestedBoard && /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,63}$/.test(requestedBoard))board=requestedBoard;
const stamp=value=>value?new Date(value).toLocaleString(undefined,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit'}):'Never confirmed';
const errorText=error=>error.message || 'Request failed. No write was confirmed.';
async function api(name,args){
  const response=await fetch(`/api/${name}`,{method:'POST',headers:{'Content-Type':'application/json','X-Dot-Board':'1'},body:JSON.stringify(args),signal:AbortSignal.timeout(15000)});
  const result=await response.json();if(!response.ok)throw Error(result.message || result.error || 'Request failed');return result;
}
const recipientPicker=mountRecipientPicker($('recipient-picker'),{
  load:args=>api('list_recipients',{board,...args}),
  onSelect:async candidate=>{const current=generation,data=await api('get_recipient',{board,participant_id:candidate.participant_id});if(current!==generation)throw Error('Board changed. Choose a recipient again.');$('receiver').value=data.recipient.participant_id;attempt=null;return data.recipient;},
  onClear:()=>{$('receiver').value='';attempt=null;}
});
function connection(text,kind=''){const n=$('connection');n.textContent=text;n.className=`connection ${kind}`;}
function issue(text){$('problem').hidden=!text;$('problem').textContent=text || '';}
function options(node,blank,selected){node.replaceChildren(new Option(blank,''));for(const p of state.participants.values())node.add(new Option(`${p.label} · ${p.id}`,p.id));if(state.participants.has(selected))node.value=selected;}
function renderParticipants(){
  const chosen=$('me').value,filter=$('filter-receiver').value;
  options($('me'),'Choose participant',chosen);options($('filter-receiver'),'All receivers',filter);
  if(!chosen && requestedReceiver && state.participants.has(requestedReceiver))$('me').value=requestedReceiver;
  const rows=[...state.participants.values()].map(p=>{const n=el('div',p.label,'participant-row');n.append(el('code',p.id));
    if(p.thread_id)n.append(el('code',p.thread_id));
    else n.append(action('Link chat',()=>{const f=$('bind-form');f.elements.participant_id.value=p.id;f.dataset.board=board;$('bind-status').textContent='';$('bind-dialog').showModal();}));
    return n;});
  $('participants').replaceChildren(...rows);$('send').disabled=writing || !ready || !$('me').value;
}
function renderNote(){
  const n=state.note;
  $('coord-title').textContent=n?.title || 'Pinned note';$('note-body').textContent=n?.body || 'No pinned note yet.';
  $('edit-note').hidden=!canCoordinate || !n;
  if(!n){$('revision').textContent='Loading note…';return;}
  $('revision').textContent=`Revision ${n.revision} · ${stamp(n.last_confirmed_at)}`;$('edit-note').hidden=!canCoordinate;
}
async function loadBoards(){
  const boards=[];let after_id;
  do{const page=await api('list_boards',{...(after_id?{after_id}:{}),limit:200});boards.push(...page.boards);after_id=page.has_more?page.next_after_id:null;}while(after_id);
  $('board').replaceChildren(...boards.map(b=>new Option(`${b.label} · ${b.id}`,b.id)));
  $('board').value=board;
}
function action(label,callback){const b=el('button',label,'quiet');b.type='button';b.onclick=async()=>{b.disabled=true;try{await callback();await poll();}catch(error){issue(`${label} was not confirmed. ${errorText(error)}`);}finally{b.disabled=false;}};return b;}
async function beginReply(m){const current=generation;const data=await api('get_recipient',{board,participant_id:m.sender_id});if(current!==generation)return;replyId=m.id;$('receiver').value=m.sender_id;recipientPicker.setSelected(data.recipient);$('topic').value=m.topic;$('reply-context').hidden=false;$('reply-label').textContent=`Replying to ${m.sender_label} · ${m.id}`;$('body').focus();attempt=null;}
function renderFeed(){
  const receiver=$('filter-receiver').value,topic=$('filter-topic').value.trim(),deleted=$('show-deleted').checked;
  const messages=[...state.messages.values()].filter(m=>(!receiver || m.receiver_id===receiver)&&(!topic || m.topic===topic)&&(deleted || !m.deleted_at)).sort((a,b)=>a.created_sequence-b.created_sequence);
  $('message-count').textContent=`${messages.length} message${messages.length===1?'':'s'}`;
  const nodes=messages.map(m=>{
    const n=el('article',undefined,`message${m.reply_to_id?' reply':''}${m.deleted_at?' deleted':''}`),top=el('div',undefined,'message-top');
    const who=el('div',m.sender_label,'message-sender');who.append(el('small',m.sender_id));const time=el('time',stamp(m.created_at));time.dateTime=m.created_at;top.append(who,time);
    n.append(top,el('div',`To ${state.participants.get(m.receiver_id)?.label || m.receiver_id} · ${m.receiver_id} / ${m.topic}`,'message-routing'));
    if(m.reply_to_id)n.append(el('div',`Reply to ${m.reply_to_id}`,'message-id'));
    n.append(el('p',m.deleted_at?'Deleted · content is retained for restore':m.body,'message-body'));
    const footer=el('div',undefined,'message-footer'),acks=[...(state.acknowledgments.get(m.id)?.keys() || [])];
    footer.append(el('span',acks.length?`Acknowledged: ${acks.join(', ')}`:'Not acknowledged','ack'));
    if(!m.deleted_at){footer.append(action('Reply',()=>beginReply(m)));if($('me').value && !acks.includes($('me').value))footer.append(action('Acknowledge',()=>api('acknowledge_message',{board,message_id:m.id,participant_id:$('me').value})));}
    footer.append(action(m.deleted_at?'Restore':'Delete',()=>api(m.deleted_at?'restore_message':'delete_message',{board,message_id:m.id})));
    n.append(footer,el('div',m.id,'message-id'));return n;
  });
  $('feed').replaceChildren(...(nodes.length?nodes:[el('p',ready?'No messages here yet. Register IDs and send your first message.':'Loading the shared conversation…','empty')]));
  const count=$('me').value?inbox(state,$('me').value).length:0;
  $('inbox').textContent=$('me').value?`${count} unacknowledged message${count===1?'':'s'} for ${$('me').value}`:'Choose an ID for your inbox';
  document.title=count?`(${count}) Paprika Messenger · Inbox`:'Paprika Messenger · Private agent board';
}
function render(){renderParticipants();renderNote();renderFeed();}
async function poll(){
  if(polling || !navigator.onLine)return;
  polling=true;const current=generation;
  try{
    let more=true,pages=0,changed=false;
    while(more && current===generation && pages++<20){
      const response=await api('list_messages',{board,cursor,limit:200});if(current!==generation)return;
      const notify=ready?response.events.filter(e=>e.kind==='message_posted'&&e.payload.receiver_id===$('me').value&&e.sequence>state.lastSequence):[];
      changed ||= response.events.length>0;applyEvents(state,response.events);cursor=response.next_cursor;more=response.has_more;
      for(const e of notify)if(alerts && Notification.permission==='granted')try{new Notification('Paprika Messenger · New message',{body:`From ${e.payload.sender_label} to ${e.payload.receiver_id}`,tag:e.entity_id});}catch{ /* Inbox still conveys delivery if this browser cannot show alerts. */ }
    }
    if(current===generation){const wasReady=ready;ready=!more;if(changed || ready!==wasReady)render();connection(ready?'Connected · polls every 3s':'Catching up…',ready?'online':'');issue(null);}
  }catch(error){if(current===generation)connection(navigator.onLine?'Connection failed · retrying':'Offline · reconnecting','failed');}
  finally{polling=false;}
}
async function openBoard(){
  generation++;state=createState();cursor=null;ready=false;replyId=null;attempt=null;$('receiver').value='';recipientPicker.reset();$('reply-context').hidden=true;connection('Connecting…');render();
  const current=generation;
  try{const session=await fetch('/api/session',{signal:AbortSignal.timeout(15000)});const data=await session.json();if(!session.ok)throw Error(data.message || 'Sign in to continue.');if(current!==generation)return;canCoordinate=data.can_coordinate;
    await loadBoards();if(current!==generation)return;
    const note=await api('get_coordination_note',{board});if(current!==generation)return;state.note=note.note;
    await poll();if(current===generation)await recipientPicker.refresh();
  }catch(error){if(current===generation){connection('Connection failed','failed');issue(errorText(error));}}
}
$('board').onchange=()=>{board=$('board').value;openBoard();};
$('board').onfocus=()=>loadBoards().catch(error=>issue(errorText(error)));
for(const name of ['filter-receiver','filter-topic','show-deleted'])$(name).addEventListener('input',renderFeed);
$('me').onchange=()=>{attempt=null;render();};
$('cancel-reply').onclick=()=>{replyId=null;$('reply-context').hidden=true;attempt=null;};
$('compose').onsubmit=async event=>{
  event.preventDefault();if(!ready || !$('me').value)return;if(!$('receiver').value){issue('Choose a recipient before sending.');recipientPicker.open();return;}
  const participant=state.participants.get($('me').value);
  const draft={board,sender_id:participant.id,sender_label:participant.label,receiver_id:$('receiver').value,topic:$('topic').value,body:$('body').value,reply_to_id:replyId};
  const signature=JSON.stringify(draft);if(attempt?.signature!==signature)attempt={signature,key:crypto.randomUUID()};
  const sentBoard=board,sentGeneration=generation;writing=true;$('send').disabled=true;$('write-status').textContent='Sending · awaiting server confirmation';$('write-status').className='';
  try{
    await api('post_message',{...draft,idempotency_key:attempt.key});
    if(generation!==sentGeneration)return;
    $('body').value='';replyId=null;attempt=null;$('reply-context').hidden=true;$('write-status').textContent='Confirmed by the server';$('send').textContent='Send message';await poll();
  }catch(error){if(board===sentBoard && generation===sentGeneration){$('write-status').textContent=`Not confirmed. ${errorText(error)} Retry safely with the same key.`;$('write-status').className='failed';$('send').textContent='Retry message';}}
  finally{writing=false;if(generation===sentGeneration)$('send').disabled=!ready || !$('me').value;}
};
$('register').onclick=()=>$('register-dialog').showModal();
$('create-board').onclick=()=>$('board-dialog').showModal();
for(const n of document.querySelectorAll('[data-close]'))n.onclick=()=>$(n.dataset.close).close();
$('board-form').onsubmit=async event=>{
  event.preventDefault();const form=event.currentTarget,values=Object.fromEntries(new FormData(form)),button=form.querySelector('[type=submit]');button.disabled=true;$('board-status').textContent='Creating…';
  try{await api('create_board',values);board=values.board;$('board-dialog').close();form.reset();$('board-status').textContent='';await openBoard();}
  catch(error){$('board-status').textContent=errorText(error);}finally{button.disabled=false;}
};
$('register-form').onsubmit=async event=>{
  event.preventDefault();const form=event.currentTarget,values=Object.fromEntries(new FormData(form));if(!values.thread_id)delete values.thread_id;
  const submit=form.querySelector('[type=submit]');submit.disabled=true;$('register-status').textContent='Registering…';
  try{await api('register_participant',{board,...values});await poll();$('me').value=values.participant_id;render();$('register-dialog').close();form.reset();$('register-status').textContent='';}
  catch(error){$('register-status').textContent=errorText(error);}finally{submit.disabled=false;}
};
$('bind-form').onsubmit=async event=>{
  event.preventDefault();const form=event.currentTarget,values=Object.fromEntries(new FormData(form)),bindingBoard=form.dataset.board;
  const submit=form.querySelector('[type=submit]');submit.disabled=true;$('bind-status').textContent='Linking…';
  try{await api('bind_participant_thread',{board:bindingBoard,...values});if(board===bindingBoard)await poll();$('bind-dialog').close();form.reset();$('bind-status').textContent='';}
  catch(error){$('bind-status').textContent=errorText(error);}finally{submit.disabled=false;}
};
$('edit-note').onclick=()=>{const f=$('note-form');for(const key of ['title','body'])f.elements[key].value=state.note[key] || '';f.dataset.revision=state.note.revision;f.dataset.board=board;$('note-dialog').showModal();};
$('note-form').onsubmit=async event=>{
  event.preventDefault();const f=event.currentTarget,button=f.querySelector('[type=submit]');button.disabled=true;$('note-status').textContent='Saving…';
  try{const r=await api('coordination',{board:f.dataset.board,expected_revision:Number(f.dataset.revision),...Object.fromEntries(new FormData(f))});if(board===f.dataset.board){state.note=r.note;renderNote();} $('note-dialog').close();$('note-status').textContent='';await poll();}
  catch(error){$('note-status').textContent=errorText(error);}finally{button.disabled=false;}
};
$('notifications').onclick=async()=>{if(!('Notification' in window)){issue('Browser alerts are unavailable here. The inbox count still updates while this board is open.');return;}const permission=await Notification.requestPermission();alerts=permission==='granted';$('notifications').textContent=alerts?'Browser alerts enabled':'Browser alerts blocked';};
window.addEventListener('offline',()=>connection('Offline · reconnecting','failed'));
window.addEventListener('online',()=>{connection('Reconnecting…');poll();});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)poll();});
setInterval(poll,3000);openBoard();

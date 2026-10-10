import { conversationLink } from './conversation-link.js';

export function recipientLabel(recipient) {
  return recipient.thread_name || recipient.registered_label || recipient.participant_id;
}

// The website and in-chat card share this component. All displayed metadata is
// plain text; selection always returns the canonical communication address.
export function mountRecipientPicker(root,{load,onSelect,onClear=()=>{},onPage=()=>{},onOpen=null}) {
  const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
  const details=node('details',undefined,'recipient-dropdown'),summary=node('summary','Choose recipient'),panel=node('div',undefined,'recipient-panel');
  const searchLabel=node('label','Search by thread name or ID'),search=node('input');
  search.type='search';search.maxLength=160;search.placeholder='Name, thread ID or communication ID';search.autocomplete='off';search.setAttribute('aria-label','Search recipients by name or ID');searchLabel.append(search);
  const status=node('p','Recent conversations · 50 at a time','recipient-status');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  const results=node('div',undefined,'recipient-results'),more=node('button','Load more'),refresh=node('button','Refresh list'),clear=node('button','Clear recipient');
  for(const button of [more,refresh,clear])button.type='button';
  const actions=node('div',undefined,'recipient-actions');actions.append(more,refresh);panel.append(searchLabel,status,results,actions);details.append(summary,panel);
  const chosen=node('p','','recipient-chosen');chosen.hidden=true;clear.hidden=true;root.replaceChildren(details,chosen,clear);root.classList.add('recipient-picker');
  let rows=[],nextCursor=null,query='',selected=null,generation=0,loading=false,busy=false,disabled=false,searchTimer=null,loaded=false;
  function openLink(recipient) {
    const link=conversationLink(recipient);if(!link)return null;
    const anchor=node('a',link.label,'recipient-open');anchor.href=link.url;anchor.target='_blank';anchor.rel='noopener noreferrer';
    anchor.title=link.hint;anchor.setAttribute('aria-label','Open conversation: '+recipientLabel(recipient));
    if(onOpen)anchor.onclick=async event=>{event.preventDefault();event.stopPropagation();
      try{await onOpen(link,recipient);}
      catch{status.textContent='This host could not open the conversation. Copy this link: '+link.url;}};
    return anchor;
  }
  function showSelected() {
    chosen.replaceChildren();chosen.textContent=selected?(selected.thread_id||selected.participant_id):'';
    const link=selected&&openLink(selected);if(link)chosen.append(link);
    chosen.hidden=!selected;clear.hidden=!selected;
  }
  function buttons(){for(const button of results.querySelectorAll('button'))button.disabled=busy||disabled;more.disabled=loading||busy||disabled;refresh.disabled=loading||busy||disabled;clear.disabled=busy||disabled;search.disabled=busy||disabled;}
  function draw() {
    const groups=new Map();
    for(const r of rows){const key=r.project_status==='assigned'?JSON.stringify([r.source,r.project_id]):'ungrouped';
      if(!groups.has(key))groups.set(key,{name:key==='ungrouped'?null:r.project_name,rows:[]});groups.get(key).rows.push(r);}
    const sections=[];
    for(const group of groups.values()) {
      const section=node('section',undefined,'recipient-group');if(group.name)section.append(node('h3',group.name));
      for(const r of group.rows) {
        const button=node('button',undefined,'recipient-option');button.type='button';button.title='Communication ID: '+r.participant_id;button.setAttribute('aria-pressed',String(selected?.participant_id===r.participant_id));
        button.append(node('strong',recipientLabel(r)),node('span',r.thread_id || r.participant_id,'recipient-id'));
        const annotations=[r.source==='unknown'?null:r.source==='chatgpt'?'ChatGPT':r.source==='codex'?'Codex':'Dot',
          r.execution_mode==='unknown'?null:r.execution_mode==='cloud'?'Cloud':'Local',r.workspace_name,
          r.project_status==='unknown'?'Project unavailable':null,r.metadata_stale||r.project_metadata_stale?'Cached metadata':null,
          !r.thread_id?'Communication ID':null].filter(Boolean);
        if(annotations.length)button.append(node('small',annotations.join(' · ')));
        button.onclick=()=>select(r);const row=node('div',undefined,'recipient-row');row.append(button);
        const link=openLink(r);if(link)row.append(link);section.append(row);
      }
      sections.push(section);
    }
    results.replaceChildren(...sections);more.hidden=!nextCursor;buttons();
  }
  async function select(recipient) {
    if(busy||disabled)return;
    busy=true;const current=generation;buttons();status.textContent='Checking recipient…';
    try {
      const verified=await onSelect(recipient);
      if(current!==generation)return;
      selected=verified || recipient;summary.textContent=recipientLabel(selected);showSelected();details.open=false;
      status.textContent='Recipient selected';draw();
    }catch(error){status.textContent=error.message||'Unable to select this recipient.';}
    finally{busy=false;buttons();}
  }
  async function fetchPage(append=false) {
    if((loading&&append)||busy||disabled)return;
    const current=++generation,cursor=append?nextCursor:null,currentQuery=search.value.trim();query=currentQuery;loading=true;buttons();status.textContent='Loading recipients…';
    try {
      const page=await load({query:currentQuery,...(cursor?{cursor}:{}),limit:50});if(current!==generation)return;
      rows=append?[...new Map([...rows,...page.recipients].map(r=>[r.participant_id,r])).values()]:page.recipients;
      nextCursor=page.next_cursor;loaded=true;draw();onPage(page);
      status.textContent=rows.length?`${rows.length} conversation${rows.length===1?'':'s'}${nextCursor?' · more available':''}`:(currentQuery?'No recipients match this name or ID.':'No conversations registered on this board yet.');
    }catch(error){if(current===generation){status.textContent=error.message||'Unable to load recipients.';if(!append){rows=[];nextCursor=null;draw();}}}
    finally{if(current===generation){loading=false;buttons();}}
  }
  search.addEventListener('input',()=>{clearTimeout(searchTimer);generation++;loading=false;nextCursor=null;rows=[];draw();status.textContent='Searching…';searchTimer=setTimeout(()=>fetchPage(),250);});
  search.addEventListener('keydown',event=>{if(event.key==='ArrowDown'){event.preventDefault();results.querySelector('button')?.focus();}if(event.key==='Escape')details.open=false;});
  details.addEventListener('toggle',()=>{if(details.open&&!loaded)fetchPage();});
  more.onclick=()=>fetchPage(true);refresh.onclick=()=>fetchPage();
  clear.onclick=async()=>{if(busy||disabled)return;try{await onClear();selected=null;summary.textContent='Choose recipient';chosen.hidden=true;clear.hidden=true;draw();}catch(error){status.textContent=error.message||'Unable to clear the recipient.';}};
  return {
    refresh:()=>fetchPage(),
    setPage(page){generation++;loading=false;rows=page.recipients;nextCursor=page.next_cursor;search.value=page.query||'';query=search.value;loaded=true;draw();onPage(page);status.textContent=rows.length?`${rows.length} conversations${nextCursor?' · more available':''}`:'No registered recipients match.';},
    setSelected(recipient){selected=recipient;summary.textContent=recipient?recipientLabel(recipient):'Choose recipient';showSelected();draw();},
    setDisabled(value){disabled=value;buttons();},
    open(){details.open=true;},
    reset(){generation++;clearTimeout(searchTimer);loading=false;loaded=false;rows=[];nextCursor=null;query='';search.value='';selected=null;summary.textContent='Choose recipient';chosen.hidden=true;clear.hidden=true;draw();status.textContent='Recent conversations · 50 at a time';},
    getQuery:()=>query
  };
}

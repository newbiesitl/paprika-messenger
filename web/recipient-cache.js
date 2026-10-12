const recipientCacheFields=['participant_id','thread_id','thread_name','title_source','registered_label','kind','registration_status','unregistered_at',
  'source','execution_mode','host_id','workspace_name','project_status','project_id','project_name','conversation_url','metadata_observed_at',
  'metadata_stale','project_metadata_stale','project_metadata_observed_at','last_communicated_at','recency_at'];
const recipientCachePageFields=['board','query','registration_status','has_more','next_cursor','page_cursor','page_limit','directory_revision','boards_revision','cache_scope','metadata_ttl_seconds','recency_source'];
const recipientCacheVersion=value=>Number.isSafeInteger(value)&&value>=0;
const recipientCacheQuery=value=>String(value||'').trim().normalize('NFKC').toLowerCase();
export function recipientCachePage(page){
  if(!page||typeof page.cache_scope!=='string'||!page.cache_scope||!recipientCacheVersion(page.directory_revision)||!recipientCacheVersion(page.boards_revision)
    ||!Array.isArray(page.recipients)||page.recipients.length>50||page.recipients.some(row=>!row||typeof row!=='object'||Array.isArray(row))
    ||typeof page.board!=='string'||!['active','unregistered'].includes(page.registration_status))return null;
  const saved=Object.fromEntries(recipientCachePageFields.filter(field=>Object.hasOwn(page,field)).map(field=>[field,page[field]]));
  saved.recipients=page.recipients.map(recipient=>{
    const row=Object.fromEntries(recipientCacheFields.filter(field=>Object.hasOwn(recipient,field)).map(field=>[field,recipient[field]]));
    if(recipient.chatgpt_destination)row.chatgpt_destination=Object.fromEntries(['registered_thread_id','conversation_id','conversation_url','revision','observed_at'].filter(field=>Object.hasOwn(recipient.chatgpt_destination,field)).map(field=>[field,recipient.chatgpt_destination[field]]));
    return row;
  });
  if(saved.recipients.some(row=>typeof row.participant_id!=='string'||typeof row.thread_name!=='string'
    ||Object.entries(row).some(([field,value])=>field!=='chatgpt_destination'&&value!==null&&!['string','boolean','number'].includes(typeof value))))return null;
  // JSON cloning keeps private cache objects independent of the pending draft.
  // No message body, sender, agreed payload, idempotency key or credential is saved.
  return JSON.parse(JSON.stringify(saved));
}
export function createRecipientPageCache({storage=null,maxPages=16,maxAgeMs=86400000,now=()=>Date.now()}={}){
  const storageKey='paprika-recipient-pages-v1';let memory=[];
  try{const value=storage?.getItem(storageKey);if(value&&value.length<=2097152){const parsed=JSON.parse(value);if(Array.isArray(parsed))memory=parsed;}}catch{}
  const key=(context,args)=>context?.cache_scope&&context?.board?JSON.stringify([context.cache_scope,context.board,args.registration_status||'active',recipientCacheQuery(args.query),args.cursor||null,args.limit||50]):null;
  function prune(){memory=memory.filter(entry=>typeof entry?.key==='string'&&Number.isFinite(entry.saved_at)&&now()-entry.saved_at<maxAgeMs&&entry.saved_at<=now()+1000).slice(-maxPages);}
  function persist(){prune();try{storage?.setItem(storageKey,JSON.stringify(memory));}catch{}}
  prune();
  return {
    read(context,args={}){
      prune();const cacheKey=key(context,args),entry=cacheKey&&memory.find(item=>item.key===cacheKey);
      const page=entry&&recipientCachePage(entry.page);
      if(!page||page.cache_scope!==context.cache_scope||page.board!==context.board)return null;
      const stale=value=>{const age=now()-Date.parse(value);return !value||!Number.isFinite(age)||age>=(page.metadata_ttl_seconds||300)*1000;};
      for(const row of page.recipients){
        row.metadata_stale=stale(row.metadata_observed_at);
        if(Object.hasOwn(row,'project_metadata_observed_at'))row.project_metadata_stale=stale(row.project_metadata_observed_at);
      }
      memory=memory.filter(item=>item!==entry);memory.push(entry);
      return {...page,local_cache_hit:true};
    },
    write(context,args,page){
      const cacheKey=key(context,args),saved=recipientCachePage(page);
      if(!cacheKey||!saved||saved.cache_scope!==context.cache_scope||saved.board!==context.board)return;
      memory=memory.filter(entry=>entry.key!==cacheKey);memory.push({key:cacheKey,saved_at:now(),page:saved});persist();
    },
    clearScope(scope){memory=memory.filter(entry=>entry.page?.cache_scope!==scope);persist();}
  };
}
export function browserRecipientPageCache(browserWindow){
  let storage=null;try{storage=browserWindow.localStorage;}catch{}
  return createRecipientPageCache({storage});
}

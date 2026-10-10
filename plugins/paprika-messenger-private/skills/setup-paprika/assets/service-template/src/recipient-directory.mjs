import { fail, id, text, plainText, strict, integer } from './validation.mjs';
import { conversationLink, normalizeConversationUrl } from '../skills/paprika-messenger/scripts/conversation-link.mjs';

const rdStmt = (db, sql, ...values) => db.prepare(sql).bind(...values);
const rdAll = async (db, sql, ...values) => (await rdStmt(db, sql, ...values).all()).results;
export const recipientMetadataTtlSeconds = 300;
export const normalizeRecipientSearch = value => value.normalize('NFKC').toLowerCase();
const recipientColumns = `p.id AS participant_id,p.thread_id,p.label AS registered_label,p.kind,
  m.title,m.source,m.execution_mode,m.host_id,m.workspace_name,m.project_status,m.project_id,m.project_name,
  m.observed_at,m.project_observed_at,m.conversation_url,a.last_communicated_at,
  c.conversation_id,c.registered_thread_id,c.revision AS mapping_revision,c.observed_at AS mapping_observed_at,
  COALESCE(a.last_communicated_at,p.created_at) AS recency_at`;
const recipientJoins = `FROM participants p LEFT JOIN recipient_metadata m ON m.board=p.board AND m.participant_id=p.id
  LEFT JOIN recipient_activity a ON a.board=p.board AND a.participant_id=p.id
  LEFT JOIN recipient_conversations c ON c.board=p.board AND c.participant_id=p.id`;
function recipientSnapshot(row) {
  const fresh = value => value && Date.now()-Date.parse(value) < recipientMetadataTtlSeconds*1000;
  const recipient={participant_id:row.participant_id,thread_id:row.thread_id,thread_name:row.title ?? row.registered_label,
    title_source:row.title === null ? 'registered_label' : 'host_reported',registered_label:row.registered_label,kind:row.kind,
    source:row.source ?? 'unknown',execution_mode:row.execution_mode ?? 'unknown',host_id:row.host_id ?? null,
    workspace_name:row.workspace_name ?? null,project_status:row.project_status ?? 'unknown',
    project_id:row.project_id ?? null,project_name:row.project_name ?? null,
    // Explicit delivery mapping is authoritative over a navigation-only cache.
    conversation_url:row.conversation_id ? 'https://chatgpt.com/c/'+row.conversation_id : row.conversation_url ?? null,
    metadata_observed_at:row.observed_at ?? null,metadata_stale:!fresh(row.observed_at),
    project_metadata_stale:!fresh(row.project_observed_at),last_communicated_at:row.last_communicated_at ?? null,
    recency_at:row.recency_at,chatgpt_destination:row.conversation_id ? {
      registered_thread_id:row.registered_thread_id,conversation_id:row.conversation_id,
      conversation_url:'https://chatgpt.com/c/'+row.conversation_id,revision:row.mapping_revision,observed_at:row.mapping_observed_at
    } : null};
  return {...recipient,conversation_link:conversationLink(recipient)};
}
function recipientCursor(value, board, query) {
  if (value === undefined || value === null) return null;
  try {
    if(typeof value !== 'string' || value.length>2048)throw Error();
    const data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(atob(value),character=>character.charCodeAt(0))));
    if(data.length!==5 || data[0]!==1 || data[1]!==board || data[2]!==query || typeof data[3]!=='string' || !Number.isFinite(Date.parse(data[3])))throw Error();
    id(data[4],'cursor_participant_id');return data;
  } catch {fail(400,'invalid_cursor','Recipient cursor is invalid or belongs to another board or search.');}
}
export async function listRecipients(service, args) {
  strict(args,['board','query','cursor','limit']);
  const board=await service.board(args.board),limit=integer(args.limit,'limit',1,50,50);
  const query=normalizeRecipientSearch(plainText(args.query ?? '','query',160).trim());
  const cursor=recipientCursor(args.cursor,board,query),values=[board];
  let where='p.board=?';
  if(query){where+=` AND (instr(lower(p.id),?)>0 OR instr(lower(COALESCE(p.thread_id,'')),?)>0
    OR instr(COALESCE(m.search_name,lower(p.label)),?)>0 OR instr(COALESCE(c.conversation_id,''),?)>0)`;values.push(query,query,query,query);}
  if(cursor){where+=` AND (COALESCE(a.last_communicated_at,p.created_at)<? OR
    (COALESCE(a.last_communicated_at,p.created_at)=? AND p.id>?))`;values.push(cursor[3],cursor[3],cursor[4]);}
  values.push(limit+1);
  const rows=await rdAll(service.db,`SELECT ${recipientColumns} ${recipientJoins} WHERE ${where}
    ORDER BY recency_at DESC,p.id ASC LIMIT ?`,...values);
  const recipients=rows.slice(0,limit).map(recipientSnapshot),last=recipients.at(-1),has_more=rows.length>limit;
  return {board,query,recipients,has_more,next_cursor:has_more?btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify([1,board,query,last.recency_at,last.participant_id])))):null,
    recency_source:'paprika_communication',metadata_ttl_seconds:recipientMetadataTtlSeconds,
    metadata_refresh_candidates:recipients.filter(r=>r.thread_id && r.metadata_stale)
      .map(r=>({participant_id:r.participant_id,thread_id:r.thread_id,source:r.source,host_id:r.host_id})),
    identity_kind:'declared_routing_metadata'};
}
export async function getRecipient(service,args) {
  strict(args,['board','participant_id']);
  const board=await service.board(args.board),pid=id(args.participant_id,'participant_id');
  const rows=await rdAll(service.db,`SELECT ${recipientColumns} ${recipientJoins} WHERE p.board=? AND p.id=?`,board,pid);
  if(!rows.length)fail(404,'participant_not_found','This recipient is not registered on the selected board.');
  return {board,recipient:recipientSnapshot(rows[0]),identity_kind:'declared_routing_metadata'};
}
const recipientMetadataFields=['participant_id','thread_id','title','source','execution_mode','host_id','workspace_name',
  'project_status','project_id','project_name','observed_at','conversation_url'];
export async function updateRecipientMetadata(service,args) {
  strict(args,['board','entries']);
  const board=await service.board(args.board);
  if(!Array.isArray(args.entries) || !args.entries.length || args.entries.length>50)fail(400,'invalid_argument','Supply 1 to 50 metadata entries.');
  const statements=[],seen=new Set(),rows=[];
  for(const entry of args.entries){strict(entry,recipientMetadataFields);const pid=id(entry.participant_id,'participant_id');if(seen.has(pid))fail(400,'invalid_argument','A metadata batch cannot repeat a participant.');seen.add(pid);}
  const registered=new Map((await rdAll(service.db,`SELECT id,label,thread_id FROM participants WHERE board=? AND id IN (${args.entries.map(()=>'?').join(',')})`,board,...seen)).map(row=>[row.id,row]));
  for(const entry of args.entries) {
    strict(entry,recipientMetadataFields);
    const pid=id(entry.participant_id,'participant_id'),thread=text(entry.thread_id,'thread_id',160);
    const participant=registered.get(pid);if(!participant)fail(404,'participant_not_found','This recipient is not registered on the selected board.');
    if(participant.thread_id!==thread)fail(409,'thread_binding_conflict','Metadata must refer to the existing immutable native thread binding.');
    const observed=entry.observed_at ?? new Date().toISOString();
    if(typeof observed!=='string' || !Number.isFinite(Date.parse(observed)) || new Date(observed).toISOString()!==observed
      || Date.parse(observed)>Date.now()+60000)fail(400,'invalid_argument','observed_at must be a canonical ISO timestamp without a future clock jump.');
    const metadata={title:null,search_name:normalizeRecipientSearch(participant.label),source:'unknown',execution_mode:'unknown',
      host_id:null,workspace_name:null,project_status:'unknown',project_id:null,project_name:null,project_observed_at:null,conversation_url:null};
    if(Object.hasOwn(entry,'conversation_url') && entry.conversation_url!==null) {
      metadata.conversation_url=normalizeConversationUrl(entry.conversation_url);
      if(!metadata.conversation_url)fail(400,'invalid_argument','conversation_url must be a verified https://chatgpt.com conversation URL with a UUID.');
    }
    for(const field of ['title','host_id','workspace_name'])if(Object.hasOwn(entry,field))metadata[field]=entry[field]===null?null:text(entry[field],field,field==='title'?512:160);
    if(Object.hasOwn(entry,'title'))metadata.search_name=normalizeRecipientSearch(metadata.title ?? participant.label);
    for(const [field,allowed] of [['source',['chatgpt','codex','dot','unknown']],['execution_mode',['local','cloud','unknown']]]) {
      if(!Object.hasOwn(entry,field))continue;
      if(!allowed.includes(entry[field]))fail(400,'invalid_argument','Invalid '+field+'.');
      // An unavailable field is not evidence that a known host value was removed.
      if(entry[field]!=='unknown')metadata[field]=entry[field];
    }
    const project=entry.project_status;
    if(project!==undefined && !['assigned','unassigned','unknown'].includes(project))fail(400,'invalid_argument','Invalid project_status.');
    if((Object.hasOwn(entry,'project_id') || Object.hasOwn(entry,'project_name')) && project!=='assigned' && project!=='unassigned')
      fail(400,'invalid_argument','Project fields require an explicit assigned or unassigned project_status.');
    if(project==='assigned') {
      metadata.project_id=text(entry.project_id,'project_id',160);metadata.project_name=text(entry.project_name,'project_name',160);
      metadata.project_status=project;metadata.project_observed_at=observed;
    } else if(project==='unassigned') {
      if(entry.project_id!=null || entry.project_name!=null)fail(400,'invalid_argument','An unassigned project cannot include a project ID or name.');
      metadata.project_id=null;metadata.project_name=null;metadata.project_status=project;metadata.project_observed_at=observed;
    }
    const mask=(Object.hasOwn(entry,'title')?1:0)|(Object.hasOwn(entry,'host_id')?2:0)|(Object.hasOwn(entry,'workspace_name')?4:0)|(Object.hasOwn(entry,'conversation_url')?8:0);
    rows.push([board,pid,metadata.title,metadata.search_name,metadata.source,
      metadata.execution_mode,metadata.host_id,metadata.workspace_name,metadata.project_status,metadata.project_id,metadata.project_name,
      metadata.project_observed_at,observed,metadata.conversation_url,mask]);
  }
  // Seven 14-field observations fit D1's 100-bound-parameter limit. The field
  // mask is a locally computed integer literal, not interpolated user input.
  // At most eight writes keep a 50-entry refresh within the existing query budget.
  // Preserve unspecified fields at write time, including concurrent host reads.
  const columns='board,participant_id,title,search_name,source,execution_mode,host_id,workspace_name,project_status,project_id,project_name,project_observed_at,observed_at,conversation_url';
  const fieldMask='(SELECT field_mask FROM incoming WHERE incoming.participant_id=excluded.participant_id)';
  for(let offset=0;offset<rows.length;offset+=7) {
    const chunk=rows.slice(offset,offset+7);
    statements.push(rdStmt(service.db,`WITH incoming(${columns},field_mask) AS (VALUES ${chunk.map(row=>'(?,?,?,?,?,?,?,?,?,?,?,?,?,?,'+row[14]+')').join(',')})
      INSERT INTO recipient_metadata(${columns}) SELECT ${columns} FROM incoming WHERE 1
      ON CONFLICT(board,participant_id) DO UPDATE SET
        title=CASE WHEN ${fieldMask}&1 THEN excluded.title ELSE recipient_metadata.title END,
        search_name=CASE WHEN ${fieldMask}&1 THEN excluded.search_name ELSE recipient_metadata.search_name END,
        source=CASE WHEN excluded.source<>'unknown' THEN excluded.source ELSE recipient_metadata.source END,
        execution_mode=CASE WHEN excluded.execution_mode<>'unknown' THEN excluded.execution_mode ELSE recipient_metadata.execution_mode END,
        host_id=CASE WHEN ${fieldMask}&2 THEN excluded.host_id ELSE recipient_metadata.host_id END,
        workspace_name=CASE WHEN ${fieldMask}&4 THEN excluded.workspace_name ELSE recipient_metadata.workspace_name END,
        conversation_url=CASE WHEN ${fieldMask}&8 THEN excluded.conversation_url ELSE recipient_metadata.conversation_url END,
        project_status=CASE WHEN excluded.project_status<>'unknown' THEN excluded.project_status ELSE recipient_metadata.project_status END,
        project_id=CASE WHEN excluded.project_status<>'unknown' THEN excluded.project_id ELSE recipient_metadata.project_id END,
        project_name=CASE WHEN excluded.project_status<>'unknown' THEN excluded.project_name ELSE recipient_metadata.project_name END,
        project_observed_at=CASE WHEN excluded.project_status<>'unknown' THEN excluded.project_observed_at ELSE recipient_metadata.project_observed_at END,
        observed_at=excluded.observed_at WHERE excluded.observed_at>=recipient_metadata.observed_at`,...chunk.flatMap(row=>row.slice(0,14))));
  }
  await service.db.batch(statements);
  return {board,processed:rows.length,identity_kind:'host_reported_metadata',routes_changed:false};
}
export const recipientResourceUri = (board,pid) => 'paprika://recipient/'+encodeURIComponent(board)+'/'+encodeURIComponent(pid);
export async function recipientMentions(service,args) {
  strict(args,['query']);
  const page=await listRecipients(service,{board:'main',query:args.query ?? '',limit:50});
  return {items:page.recipients.map(r=>({type:'resource_link',uri:recipientResourceUri(page.board,r.participant_id),
    name:r.thread_name,description:[r.project_status==='assigned'?r.project_name:null,r.thread_id ?? r.participant_id,
      r.source!=='unknown'?r.source:null,r.execution_mode!=='unknown'?r.execution_mode:null].filter(Boolean).join(' · '),mimeType:'application/json'}))};
}
export async function readRecipientResource(service,uri) {
  const match=/^paprika:\/\/recipient\/([^/]+)\/([^/]+)$/.exec(uri);
  if(!match)fail(400,'invalid_argument','Invalid recipient resource URI.');
  let board,pid;try{board=decodeURIComponent(match[1]);pid=decodeURIComponent(match[2]);}catch{fail(400,'invalid_argument','Invalid recipient resource URI.');}
  const {recipient}=await getRecipient(service,{board,participant_id:pid});
  return {contents:[{uri,mimeType:'application/json',text:JSON.stringify({board,receiver_id:recipient.participant_id,
    receiver_thread_id:recipient.thread_id,chatgpt_destination:recipient.chatgpt_destination,
    thread_name:recipient.thread_name,project_id:recipient.project_id,
    conversation_link:recipient.conversation_link,
    purpose:'Recipient selection only. Deliver only the message explicitly requested by the user.'})}]};
}

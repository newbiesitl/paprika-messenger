import { fail, id, text, plainText, strict, integer, encodeCursor, decodeCursor } from './validation.mjs';

// All user identities originate at the Sites hosting boundary. Never trust caller-supplied labels.
export function authorize(request, env) {
  const subject = request.headers.get('oai-authenticated-user-id');
  if (!subject) fail(401, 'authentication_required', 'Sign in through Sites to use this board.');
  const email=request.headers.get('oai-authenticated-user-email')?.toLowerCase();
  if (!env.OWNER_USER_ID && !env.OWNER_EMAIL) fail(503, 'owner_not_configured', 'The owner identity has not been configured.');
  if (env.OWNER_USER_ID ? subject!==env.OWNER_USER_ID : email!==env.OWNER_EMAIL.toLowerCase()) fail(403, 'access_denied', 'This board is private to its owner.');
  return subject;
}
const stmt = (db, sql, ...values) => db.prepare(sql).bind(...values);
const first = (db, sql, ...values) => stmt(db, sql, ...values).first();
const all = async (db, sql, ...values) => (await stmt(db, sql, ...values).all()).results;
const hash = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), x => x.toString(16).padStart(2, '0')).join('');
const resultMessage = row => { const { fingerprint, idempotency_key, ...message } = row; return message; };
const resultBoard = row => ({...row, label:row.label || row.id});
const legacyNoteBody = row => `Reference: ${row.queue_reference}\nResponsible participant: ${row.execution_owner}\nStatus: ${row.launch_status}\nReported time: ${row.reported_clock || 'Not reported'}`;
const resultNote = row => ({...row, body:row.body ?? legacyNoteBody(row)});
const participantAddressFields = ['participant_id','thread_id','label'];
const receiverAddressFields = ['receiver_id','receiver_thread_id','receiver_label'];
export class BoardService {
  constructor(db, subject) { this.db = db; this.subject = subject; }
  async board(value) {
    id(value, 'board', 64);
    if (value === 'main') await this.ensureDefaultBoard();
    if (!await first(this.db, 'SELECT id FROM boards WHERE id=?', value)) fail(404, 'board_not_found', 'Board not found. Use create_board first.');
    return value;
  }
  async ensureDefaultBoard() {
    await this.db.batch([
      stmt(this.db,"INSERT INTO boards(id,label) VALUES('main','General') ON CONFLICT DO NOTHING"),
      stmt(this.db,"INSERT INTO coordination(board,title,body) VALUES('main','Coordination','') ON CONFLICT DO NOTHING")
    ]);
  }
  async create_board(a) {
    strict(a,['board','label','description']);
    const board=id(a.board,'board',64), label=text(a.label,'label',120), description=plainText(a.description ?? '', 'description',500);
    await this.db.batch([
      stmt(this.db,'INSERT INTO boards(id,label,description) VALUES(?,?,?) ON CONFLICT DO NOTHING',board,label,description),
      stmt(this.db,"INSERT INTO coordination(board,title,body) VALUES(?,'Coordination','') ON CONFLICT DO NOTHING",board)
    ]);
    const row=resultBoard(await first(this.db,'SELECT * FROM boards WHERE id=?',board));
    if (row.label!==label || row.description!==description) fail(409,'board_conflict','This board ID already exists with different details.');
    return {board:row};
  }
  async list_boards(a) {
    strict(a,['after_id','limit']); await this.ensureDefaultBoard();
    const limit=integer(a.limit,'limit',1,200,100), after=a.after_id===undefined?'':id(a.after_id,'after_id',64);
    const rows=await all(this.db,'SELECT * FROM boards WHERE id>? ORDER BY id LIMIT ?',after,limit+1);
    return {boards:rows.slice(0,limit).map(resultBoard),has_more:rows.length>limit,next_after_id:rows.length>limit?rows[limit-1].id:null,default_board:'main'};
  }
  async participant(board, value) {
    id(value, 'participant_id');
    const row = await first(this.db, 'SELECT * FROM participants WHERE board=? AND id=?', board, value);
    if (!row) fail(404, 'participant_not_found', `Register participant ${value} on this board first.`);
    return row;
  }
  async resolveAddress(board, args, fields=participantAddressFields) {
    const supplied=fields.filter(field=>Object.hasOwn(args,field));
    if (supplied.length!==1) fail(400,'invalid_address',`Supply exactly one of ${fields.join(', ')}.`);
    const field=supplied[0], index=fields.indexOf(field), matched_by=participantAddressFields[index];
    if (index===0) return {participant:await this.participant(board,args[field]),matched_by};
    const value=text(args[field],field,index===1?160:120);
    // Column names are fixed by the selector, never supplied by a caller. Labels and
    // thread IDs match exactly within a board; duplicates cannot choose a recipient.
    const column=index===1?'thread_id':'label';
    const rows=await all(this.db,`SELECT * FROM participants WHERE board=? AND ${column}=? ORDER BY id LIMIT 2`,board,value);
    if (!rows.length) fail(404,'participant_not_found','No registered participant matches this address on this board.');
    if (rows.length>1) fail(409,'ambiguous_address','This address matches multiple participants. Use a participant ID.');
    return {participant:rows[0],matched_by};
  }
  async resolve_participant(a) {
    strict(a,['board',...participantAddressFields]);
    const board=await this.board(a.board);
    return {...await this.resolveAddress(board,a),identity_kind:'declared_label'};
  }
  async get_thread_id(a) {
    strict(a,['board','thread_id']);
    if (a.thread_id === undefined) fail(400,'current_thread_unavailable','The calling host must supply its current thread_id. This service cannot infer it from account identity.');
    const thread_id=text(a.thread_id,'thread_id',160), board=await this.board(a.board);
    const rows=await all(this.db,'SELECT id,label FROM participants WHERE board=? AND thread_id=? ORDER BY id LIMIT 2',board,thread_id);
    if (rows.length>1) fail(409,'ambiguous_address','This thread ID has multiple registrations on this board. Use a participant ID to disambiguate.');
    return {board,thread_id,thread_id_source:'caller_supplied',registered:rows.length===1,
      participant_id:rows[0]?.id ?? null,label:rows[0]?.label ?? null,
      receiver:rows.length?{receiver_thread_id:thread_id}:null,identity_kind:'declared_label'};
  }
  async message(board, value) {
    id(value, 'message_id');
    const row = await first(this.db, 'SELECT * FROM messages WHERE board=? AND id=?', board, value);
    if (!row) fail(404, 'message_not_found', 'Message not found on this board.');
    return row;
  }
  async event(board, entity, kind) {
    const row = await first(this.db, 'SELECT * FROM events WHERE board=? AND entity_id=? AND kind=? ORDER BY sequence DESC LIMIT 1', board, entity, kind);
    return { event_cursor: encodeCursor(board, row.sequence), sequence: row.sequence, server_timestamp: row.occurred_at };
  }
  async register_participant(a) {
    strict(a, ['board','participant_id','label','kind','thread_id']);
    const board = await this.board(a.board), pid = id(a.participant_id, 'participant_id'), label = text(a.label, 'label', 120);
    if (!['human','agent','thread'].includes(a.kind)) fail(400, 'invalid_argument', 'kind must be human, agent, or thread.');
    const thread = text(a.thread_id, 'thread_id', 160, true);
    await stmt(this.db, 'INSERT INTO participants(board,id,label,kind,thread_id,registered_by) VALUES(?,?,?,?,?,?) ON CONFLICT(board,id) DO NOTHING', board, pid, label, a.kind, thread, this.subject).run();
    const row = await this.participant(board, pid);
    if (row.label !== label || row.kind !== a.kind || row.thread_id !== thread) fail(409, 'participant_conflict', 'This participant ID is already registered with different details.');
    return { participant: row, identity_kind: 'declared_label', ...await this.event(board, pid, 'participant_registered') };
  }
  async list_participants(a) {
    strict(a, ['board','after_id','limit']);
    const board = await this.board(a.board), limit = integer(a.limit, 'limit', 1, 200, 100);
    const after = a.after_id ? id(a.after_id, 'after_id') : '';
    const rows = await all(this.db, 'SELECT * FROM participants WHERE board=? AND id>? ORDER BY id LIMIT ?', board, after, limit + 1);
    return { participants: rows.slice(0, limit), has_more: rows.length > limit, next_after_id: rows.length > limit ? rows[limit - 1].id : null, identity_kind: 'declared_label' };
  }
  async bind_participant_thread(a) {
    strict(a,['board','participant_id','thread_id']);
    const board=await this.board(a.board), pid=id(a.participant_id,'participant_id'), thread_id=text(a.thread_id,'thread_id',160);
    await this.participant(board,pid);
    // A single conditional write claims an unused address without replacing an
    // existing route. The matching event is in the same transaction.
    await this.db.batch([
      stmt(this.db,`UPDATE participants SET thread_id=? WHERE board=? AND id=? AND thread_id IS NULL
        AND NOT EXISTS (SELECT 1 FROM participants WHERE board=? AND thread_id=? AND id<>?)`,thread_id,board,pid,board,thread_id,pid),
      stmt(this.db,`INSERT INTO events(board,kind,entity_id,payload)
        SELECT ?,'participant_thread_bound',?,json_object('participant_id',?,'thread_id',?,'bound_by',?) WHERE changes()=1`,board,pid,pid,thread_id,this.subject)
    ]);
    const participant=await this.participant(board,pid);
    if (participant.thread_id!==null && participant.thread_id!==thread_id) fail(409,'thread_binding_conflict','This participant already has a different thread ID. Existing routes cannot be replaced.');
    const matches=await all(this.db,'SELECT id FROM participants WHERE board=? AND thread_id=? LIMIT 2',board,thread_id);
    if(participant.thread_id!==thread_id || matches.length!==1) fail(409,'ambiguous_address','This thread ID is already registered to another participant on this board.');
    return {participant,identity_kind:'declared_label'};
  }
  async post_message(a) {
    strict(a, ['board','sender_id','sender_label',...receiverAddressFields,'topic','body','reply_to_id','idempotency_key']);
    const board = await this.board(a.board);
    await this.participant(board, a.sender_id);
    const {participant:receiver}=await this.resolveAddress(board,a,receiverAddressFields), receiver_id=receiver.id;
    const label = text(a.sender_label, 'sender_label', 120), topic = text(a.topic, 'topic', 120), body = text(a.body, 'body', 16000);
    const key = text(a.idempotency_key, 'idempotency_key', 128, true);
    const reply = a.reply_to_id === undefined || a.reply_to_id === null ? null : id(a.reply_to_id, 'reply_to_id');
    if (reply) await this.message(board, reply);
    const fingerprint = await hash(JSON.stringify([board,a.sender_id,label,receiver_id,topic,body,reply]));
    const mid = crypto.randomUUID();
    await stmt(this.db, `INSERT INTO messages(id,board,sender_id,sender_label,receiver_id,topic,body,reply_to_id,authored_by,idempotency_key,fingerprint)
      VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(board,authored_by,sender_id,idempotency_key) DO NOTHING`,
    mid,board,a.sender_id,label,receiver_id,topic,body,reply,this.subject,key,fingerprint).run();
    const row = key ? await first(this.db, 'SELECT * FROM messages WHERE board=? AND authored_by=? AND sender_id=? AND idempotency_key=?', board,this.subject,a.sender_id,key) : await this.message(board,mid);
    if (row.fingerprint !== fingerprint) fail(409, 'idempotency_conflict', 'The idempotency key was used with a different message.');
    return { message: resultMessage(row), duplicate: row.id !== mid, ...await this.event(board,row.id,'message_posted') };
  }
  async list_messages(a) {
    strict(a, ['board','cursor',...receiverAddressFields,'topic','limit']);
    const board = await this.board(a.board), from = decodeCursor(a.cursor,board), limit = integer(a.limit,'limit',1,200,100);
    const addresses=receiverAddressFields.filter(field=>Object.hasOwn(a,field));
    let receiver_id;
    // Preserve the old ID-only filter, including filtering for an unregistered ID.
    if (addresses.length===1 && addresses[0]==='receiver_id') receiver_id=id(a.receiver_id,'receiver_id');
    else if (addresses.length) receiver_id=(await this.resolveAddress(board,a,receiverAddressFields)).participant.id;
    if (a.topic !== undefined) text(a.topic,'topic',120);
    // Page through the unfiltered event log, then filter. next_cursor always advances through
    // hidden events, preserving progress and exposing deletes/restores to the same filter.
    const rows = await this.db.batch([
      stmt(this.db,'SELECT COALESCE(MAX(sequence),0) AS watermark FROM events WHERE board=?',board),
      stmt(this.db,'SELECT * FROM events WHERE board=? AND sequence>? ORDER BY sequence LIMIT ?',board,from,limit + 1)
    ]);
    const watermark = rows[0].results[0].watermark;
    if (from > watermark) fail(400,'cursor_ahead','Cursor is ahead of this board.');
    const page = rows[1].results.filter(r => r.sequence <= watermark).slice(0,limit);
    const next = page.length ? page.at(-1).sequence : from;
    const events = page.filter(r => (!r.receiver_id || receiver_id === undefined || r.receiver_id === receiver_id) && (!r.topic || a.topic === undefined || r.topic === a.topic))
      .map(r => ({ ...r, payload:JSON.parse(r.payload), cursor:encodeCursor(board,r.sequence) }));
    return { board, events, next_cursor:encodeCursor(board,next), watermark_cursor:encodeCursor(board,watermark), has_more:next < watermark, server_timestamp:new Date().toISOString() };
  }
  async get_message(a) {
    strict(a,['board','message_id','reply_cursor','limit']);
    const board = await this.board(a.board), message = resultMessage(await this.message(board,a.message_id));
    const after = integer(a.reply_cursor,'reply_cursor',0,Number.MAX_SAFE_INTEGER,0), limit = integer(a.limit,'limit',1,100,50);
    const rows = await this.db.batch([
      stmt(this.db,'SELECT rowid AS reply_cursor,* FROM messages WHERE board=? AND reply_to_id=? AND rowid>? ORDER BY rowid LIMIT ?',board,a.message_id,after,limit + 1),
      stmt(this.db,'SELECT * FROM acknowledgments WHERE board=? AND message_id=? ORDER BY acknowledged_at,participant_id LIMIT 200',board,a.message_id)
    ]);
    return { message, replies:rows[0].results.slice(0,limit).map(resultMessage), acknowledgments:rows[1].results,
      replies_has_more:rows[0].results.length > limit, next_reply_cursor:rows[0].results.length > limit ? rows[0].results[limit - 1].reply_cursor : null };
  }
  async acknowledge_message(a) {
    strict(a,['board','message_id','participant_id']);
    const board = await this.board(a.board); await this.message(board,a.message_id); await this.participant(board,a.participant_id);
    await stmt(this.db,'INSERT INTO acknowledgments(board,message_id,participant_id,acknowledged_by) VALUES(?,?,?,?) ON CONFLICT DO NOTHING',board,a.message_id,a.participant_id,this.subject).run();
    const ack = await first(this.db,'SELECT * FROM acknowledgments WHERE board=? AND message_id=? AND participant_id=?',board,a.message_id,a.participant_id);
    const row = await first(this.db,`SELECT * FROM events WHERE board=? AND entity_id=? AND kind='message_acknowledged' AND json_extract(payload,'$.participant_id')=?`,board,a.message_id,a.participant_id);
    return { acknowledgment:ack, event_cursor:encodeCursor(board,row.sequence), sequence:row.sequence, server_timestamp:ack.acknowledged_at };
  }
  async visibility(a, deleted) {
    strict(a,['board','message_id']);
    const board = await this.board(a.board); await this.message(board,a.message_id);
    await stmt(this.db, deleted ? `UPDATE messages SET deleted_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),deleted_by=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE board=? AND id=? AND deleted_at IS NULL` :
      `UPDATE messages SET deleted_at=NULL,deleted_by=NULL,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE board=? AND id=? AND deleted_at IS NOT NULL`,
    ...(deleted ? [this.subject,board,a.message_id] : [board,a.message_id])).run();
    const row = await this.message(board,a.message_id);
    const event = await first(this.db,'SELECT * FROM events WHERE board=? AND entity_id=? ORDER BY sequence DESC LIMIT 1',board,a.message_id);
    return { message:resultMessage(row), event_cursor:encodeCursor(board,event.sequence), sequence:event.sequence, server_timestamp:event.occurred_at };
  }
  delete_message(a) { return this.visibility(a,true); }
  restore_message(a) { return this.visibility(a,false); }
  async get_coordination_note(a) {
    strict(a,['board']); const board = await this.board(a.board);
    return { note:resultNote(await first(this.db,'SELECT * FROM coordination WHERE board=?',board)) };
  }
  async updateCoordination(a) {
    strict(a,['board','expected_revision','title','body','queue_reference','execution_owner','launch_status','reported_clock']);
    const board = await this.board(a.board), revision = integer(a.expected_revision,'expected_revision',0,Number.MAX_SAFE_INTEGER);
    let update;
    if (a.title!==undefined || a.body!==undefined) {
      if (['queue_reference','execution_owner','launch_status','reported_clock'].some(key=>key in a)) fail(400,'invalid_argument','Use either title/body or legacy coordination fields, not both.');
      const title=text(a.title,'title',120), body=plainText(a.body,'body',16000);
      update=stmt(this.db,`UPDATE coordination SET title=?,body=?,revision=revision+1,
        last_confirmed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),confirmed_by=? WHERE board=? AND revision=?`,title,body,this.subject,board,revision);
    } else {
      // Preserve old client calls and data during the upgrade; new notes use title/body.
      const queue=text(a.queue_reference,'queue_reference',500), owner=text(a.execution_owner,'execution_owner',160), clock=text(a.reported_clock,'reported_clock',160);
      if (!['HOLD','RELEASE'].includes(a.launch_status)) fail(400,'invalid_argument','launch_status must be HOLD or RELEASE.');
      update=stmt(this.db,`UPDATE coordination SET queue_reference=?,execution_owner=?,launch_status=?,reported_clock=?,body=NULL,revision=revision+1,
        last_confirmed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),confirmed_by=? WHERE board=? AND revision=?`,queue,owner,a.launch_status,clock,this.subject,board,revision);
    }
    const result=await update.run();
    if (result.meta.changes !== 1) fail(409,'revision_conflict','The coordination note changed. Reload and review it before saving.');
    return this.get_coordination_note({board});
  }
  async get_inbox(a) {
    strict(a,['board',...receiverAddressFields,'limit']); const board = await this.board(a.board);
    const receiver_id=(await this.resolveAddress(board,a,receiverAddressFields)).participant.id;
    const limit = integer(a.limit,'limit',1,100,50);
    const clause = `FROM messages m WHERE m.board=? AND m.receiver_id=? AND m.deleted_at IS NULL AND NOT EXISTS
      (SELECT 1 FROM acknowledgments k WHERE k.board=m.board AND k.message_id=m.id AND k.participant_id=m.receiver_id)`;
    const rows = await this.db.batch([stmt(this.db,`SELECT COUNT(*) AS unacknowledged_count ${clause}`,board,receiver_id),stmt(this.db,`SELECT m.* ${clause} ORDER BY m.rowid DESC LIMIT ?`,board,receiver_id,limit)]);
    return { receiver_id, unacknowledged_count:rows[0].results[0].unacknowledged_count, messages:rows[1].results.map(resultMessage), truncated:rows[0].results[0].unacknowledged_count > limit };
  }
}

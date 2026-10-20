import { fail, id, text, plainText, strict, integer } from './validation.mjs';

const mtStmt = (db, sql, ...values) => db.prepare(sql).bind(...values);
const mtNow = service => new Date(service.env.MEETING_NOW?.() ?? Date.now()).toISOString();
const mtBytes = value => new TextEncoder().encode(value).length;
const mtClosed = state => ['closed', 'cancelled'].includes(state.status);
const mtClone = value => structuredClone(value);
function mtRoster(values) {
  if (!Array.isArray(values) || values.length < 1 || values.length > 12) fail(400, 'invalid_roster', 'Select 1 to 12 participants.');
  const result = values.map(value => id(value, 'participant_id'));
  if (new Set(result).size !== result.length) fail(400, 'invalid_roster', 'Participants must be unique.');
  return result;
}
function mtExpire(state, now) {
  if (state.status === 'running' && state.deadline_at && now >= state.deadline_at) {
    state.status = 'paused'; state.pause_reason = 'deadline';
  }
  return state;
}
function mtNotice(state, kind, recipient, sender = state.coordinator_id, round = state.current_round) {
  const key = `${kind}:${round}:${sender}:${recipient}`;
  if (state.notifications.some(entry => entry.key === key)) return;
  const notice = {id:crypto.randomUUID(), key, kind, round, sender_id:sender, recipient_id:recipient, delivery:null};
  const after = Math.max(0, state.round_limit - round);
  notice.topic = `Meeting ${kind.replaceAll('_', ' ').toLowerCase()}`;
  notice.body = `${kind} board=${state.board} meeting=${state.id} round=${round}/${state.round_limit} after=${after} sender=${sender} recipient=${recipient}. `;
  notice.body += kind === 'MEETING_INVITE'
    ? 'Read get_meeting for the goals and expectations, then accept_meeting_invitation. This invitation is outside the discussion rounds.'
    : kind === 'ROUND_START' || kind.startsWith('ROUND_RESUME_')
      ? `Read get_meeting_round input_round=${round - 1}. Submit one comments bundle or explicit pass using submit_meeting_round. ${after === 0 ? 'FINAL ROUND: answer outstanding questions and state conclusions; no further discussion round follows.' : 'Address the designated recipients and include reply_to for answers.'}`
      : kind === 'INVITATION_ACCEPTED'
        ? 'Invitation accepted. Read get_meeting; start after every selected participant accepts.'
      : kind === 'SUBMISSION_RECEIVED'
        ? 'A participant submission is stored. Read get_meeting, display newly published rounds with attribution in this meeting chat, and relay actionable notices through Inc. Preserve original text and avoid duplicate board contributions. At closure, record the conclusions and unresolved questions.'
      : kind.startsWith('MEETING_UPDATED_')
        ? 'The meeting configuration changed. Read get_meeting for the current budget and status. Preserve any existing contribution; if this round is running and you have not submitted, read its previous published round and contribute once.'
        : 'Read the final published round. No further participant submission is requested. The coordinator records conclusions, decisions, actions and unresolved questions in meeting notes.';
  state.notifications.push(notice);
}
function mtStartRound(state, now) {
  state.status = 'running'; state.pause_reason = null;
  state.active_signal_kind = 'ROUND_START';
  state.deadline_at = new Date(Date.parse(now) + state.deadline_minutes * 60000).toISOString();
  for (const participant of state.participants) mtNotice(state, 'ROUND_START', participant.id);
}
function mtView(state, now) {
  const value = mtExpire(mtClone(state), now);
  const pending = value.submissions; delete value.submissions; delete value.creation;
  if (value.status === 'cancelled') value.incomplete_round = {number:value.current_round, submissions:Object.values(pending)};
  value.submitted_ids = Object.keys(pending);
  value.waiting_for = value.status === 'inviting'
    ? value.participants.filter(p => !p.accepted_at).map(p => p.id)
    : mtClosed(value) ? [] : value.participants.filter(p => !Object.hasOwn(pending, p.id)).map(p => p.id);
  value.rounds_remaining = value.round_limit - value.rounds.length;
  value.rounds_after_current = Math.max(0, value.round_limit - value.current_round);
  const lastSubmission = value.notifications.filter(n => n.kind === 'SUBMISSION_RECEIVED').at(-1)?.id;
  for (const notice of value.notifications) {
    notice.actionable = !notice.delivery && (notice.kind === 'MEETING_INVITE' ? value.status === 'inviting' && value.participants.some(p => p.id === notice.recipient_id && !p.accepted_at)
      : notice.kind === 'INVITATION_ACCEPTED' ? value.status === 'inviting'
      : notice.kind === 'MEETING_CLOSED' ? mtClosed(value)
      : notice.kind === 'SUBMISSION_RECEIVED' ? notice.id === lastSubmission || value.status === 'running' && notice.round === value.current_round
      : notice.kind.startsWith('MEETING_UPDATED_') ? !mtClosed(value) && notice.kind === value.active_signal_kind
      : value.status === 'running' && notice.round === value.current_round && notice.kind === value.active_signal_kind && !value.submitted_ids.includes(notice.recipient_id));
  }
  value.identity_kind = 'declared_label';
  return value;
}
function mtCoordinator(state, actor) {
  if (id(actor, 'actor_id') !== state.coordinator_id) fail(403, 'meeting_coordinator_required', 'Use the meeting coordinator address. Labels are declared addresses, not separate authenticated users.');
}
function mtSubmission(state, args) {
  if (!['comments', 'pass'].includes(args.kind)) fail(400, 'invalid_submission', 'kind must be comments or pass.');
  const comments = args.comments ?? [];
  if (!Array.isArray(comments) || comments.length > 8 || (args.kind === 'pass' ? comments.length !== 0 : comments.length === 0))
    fail(400, 'invalid_submission', 'Submit 1 to 8 comments, or pass with no comments.');
  const prior = new Set(state.rounds.flatMap(round => round.submissions.flatMap(s => s.comments.map(c => c.id))));
  const result = comments.map((comment, index) => {
    strict(comment, ['text', 'recipients', 'reply_to', 'kind']);
    const recipients = mtRoster(comment.recipients).sort();
    if (recipients.some(pid => !state.participants.some(p => p.id === pid))) fail(400, 'invalid_recipient', 'Every designated recipient must belong to this meeting.');
    const reply_to = comment.reply_to == null ? null : id(comment.reply_to, 'reply_to');
    if (reply_to && !prior.has(reply_to)) fail(400, 'invalid_reply', 'Reply only to a published comment from an earlier round.');
    const kind = comment.kind ?? 'comment';
    if (!['comment', 'question', 'answer', 'conclusion'].includes(kind)) fail(400, 'invalid_submission', 'Unknown comment kind.');
    return {id:`r${args.round}.p${state.participants.findIndex(p => p.id === args.participant_id) + 1}.c${index + 1}`, text:text(comment.text, 'comment.text', 4096), recipients, reply_to, kind};
  });
  if (result.reduce((sum, c) => sum + mtBytes(c.text), 0) > 4096) fail(400, 'submission_too_large', 'A round contribution may contain at most 4096 UTF-8 bytes of comment text.');
  return {participant_id:args.participant_id, kind:args.kind, comments:result};
}

// One conditional row update commits submissions, the published batch, counters,
// and notification records together. CAS works in both D1 and local SQLite.
export class MeetingService {
  constructor(boardService) { this.service = boardService; this.db = boardService.db; }
  async load(args) {
    const board = await this.service.board(args.board), mid = id(args.meeting_id, 'meeting_id');
    const row = await mtStmt(this.db, 'SELECT document FROM meetings WHERE board=? AND id=?', board, mid).first();
    if (!row) fail(404, 'meeting_not_found', 'Meeting not found on this board.');
    return JSON.parse(row.document);
  }
  async change(args, reducer) {
    for (let attempt = 0; attempt < 32; attempt++) {
      const state = await this.load(args), revision = state.revision, now = mtNow(this.service);
      if (args.expected_revision !== undefined && args.expected_revision !== revision) fail(409, 'meeting_revision_conflict', 'The meeting changed. Reload it before editing.');
      mtExpire(state, now);
      const outcome = reducer(state, now) ?? {};
      if (outcome.duplicate) return {meeting:mtView(state, now), duplicate:true};
      state.revision++; state.updated_at = now;
      const document = JSON.stringify(state);
      if (mtBytes(document) > 1000000) fail(409, 'meeting_capacity', 'The pilot meeting reached its storage bound. Close it and export the recorded notes.');
      const updated = await mtStmt(this.db, 'UPDATE meetings SET document=?,revision=? WHERE board=? AND id=? AND revision=?', document, state.revision, state.board, state.id, revision).run();
      if (updated.meta.changes === 1) return {meeting:mtView(state, now), ...outcome};
    }
    fail(409, 'meeting_busy', 'Concurrent updates are still arriving. Retry the same submission.');
  }
  async create(args) {
    strict(args, ['board', 'meeting_id', 'coordinator_id', 'participant_ids', 'title', 'goals', 'expectations', 'round_limit', 'deadline_minutes']);
    const board = await this.service.board(args.board), mid = id(args.meeting_id, 'meeting_id');
    const coordinator = await this.service.activeParticipant(board, args.coordinator_id), roster = mtRoster(args.participant_ids);
    if (roster.includes(coordinator.id)) fail(400, 'invalid_roster', 'The facilitator has its own coordinator chat; select the other meeting participants.');
    const creation = {coordinator_id:coordinator.id, participant_ids:roster, title:text(args.title, 'title', 120),
      goals:text(args.goals, 'goals', 4000), expectations:plainText(args.expectations ?? '', 'expectations', 2000),
      round_limit:integer(args.round_limit, 'round_limit', 1, 12), deadline_minutes:integer(args.deadline_minutes, 'deadline_minutes', 1, 1440, 30)};
    const participants = await Promise.all(roster.map(pid => this.service.activeParticipant(board, pid)));
    const now = mtNow(this.service), state = {format:1, id:mid, board, ...creation, creation, revision:1, status:'inviting',
      participants:participants.map(p => ({id:p.id, label:p.label, accepted_at:null})), current_round:0, rounds:[], submissions:{}, notifications:[],
      notes:{conclusions:'', decisions:'', action_items:'', unresolved:'', additional_notes:''}, deadline_at:null, pause_reason:null,
      created_at:now, updated_at:now, closed_at:null};
    delete state.participant_ids;
    for (const participant of participants) mtNotice(state, 'MEETING_INVITE', participant.id);
    const inserted = await mtStmt(this.db, 'INSERT INTO meetings(board,id,revision,document) VALUES(?,?,?,?) ON CONFLICT(board,id) DO NOTHING', board, mid, 1, JSON.stringify(state)).run();
    const stored = await this.load({board, meeting_id:mid});
    if (JSON.stringify(stored.creation) !== JSON.stringify(creation)) fail(409, 'meeting_conflict', 'This meeting ID already has different creation details.');
    return {meeting:mtView(stored, now), duplicate:inserted.meta.changes === 0};
  }
  async list(args) {
    strict(args, ['board', 'after_id', 'limit']);
    const board = await this.service.board(args.board), limit = integer(args.limit, 'limit', 1, 100, 50);
    const after = args.after_id === undefined ? '' : id(args.after_id, 'after_id');
    const {results} = await mtStmt(this.db, 'SELECT document FROM meetings WHERE board=? AND id>? ORDER BY id LIMIT ?', board, after, limit + 1).all();
    return {meetings:results.slice(0, limit).map(row => {
      const m = mtView(JSON.parse(row.document), mtNow(this.service));
      return {id:m.id, title:m.title, status:m.status, revision:m.revision, current_round:m.current_round, round_limit:m.round_limit, rounds_remaining:m.rounds_remaining};
    }), has_more:results.length > limit, next_after_id:results.length > limit ? JSON.parse(results[limit - 1].document).id : null};
  }
  async get(args) { strict(args, ['board', 'meeting_id']); return {meeting:mtView(await this.load(args), mtNow(this.service))}; }
  async accept(args) {
    strict(args, ['board', 'meeting_id', 'participant_id']);
    await this.service.activeParticipant(await this.service.board(args.board), args.participant_id);
    return this.change(args, (state, now) => {
      const participant = state.participants.find(p => p.id === args.participant_id);
      if (!participant) fail(403, 'not_invited', 'This participant was not invited.');
      if (participant.accepted_at) return {duplicate:true};
      if (state.status !== 'inviting') fail(409, 'meeting_started', 'The participant roster is frozen once the meeting starts.');
      participant.accepted_at = now;
      mtNotice(state, 'INVITATION_ACCEPTED', state.coordinator_id, participant.id);
    });
  }
  async control(args) {
    strict(args, ['board', 'meeting_id', 'actor_id', 'expected_revision', 'action']);
    integer(args.expected_revision, 'expected_revision', 1, Number.MAX_SAFE_INTEGER);
    return this.change(args, (state, now) => {
      mtCoordinator(state, args.actor_id);
      if (mtClosed(state)) fail(409, 'meeting_closed', 'The meeting is already closed.');
      if (args.action === 'start') {
        if (state.status !== 'inviting' || state.participants.some(p => !p.accepted_at)) fail(409, 'invitations_pending', 'Start after every selected participant accepts.');
        state.current_round = 1; mtStartRound(state, now);
      } else if (args.action === 'pause') {
        if (state.status !== 'running') fail(409, 'meeting_not_running', 'Only a running meeting can pause.');
        state.status = 'paused'; state.pause_reason = 'manual';
      } else if (args.action === 'resume') {
        if (state.status !== 'paused') fail(409, 'meeting_not_paused', 'Only a paused meeting can resume.');
        // Reuse the current round, preserve submissions and reset its deadline.
        // A resume signal has its own epoch; no extra round is consumed.
        state.resume_epoch = (state.resume_epoch ?? 0) + 1;
        mtStartRound(state, now);
        state.active_signal_kind = `ROUND_RESUME_${state.resume_epoch}`;
        for (const participant of state.participants.filter(p => !Object.hasOwn(state.submissions, p.id)))
          mtNotice(state, `ROUND_RESUME_${state.resume_epoch}`, participant.id);
      } else if (args.action === 'close') {
        state.status = 'cancelled'; state.closed_at = now; state.deadline_at = null;
        for (const participant of state.participants) mtNotice(state, 'MEETING_CLOSED', participant.id);
      } else fail(400, 'invalid_action', 'Use start, pause, resume, or close.');
    });
  }
  async configure(args) {
    strict(args, ['board', 'meeting_id', 'actor_id', 'expected_revision', 'title', 'goals', 'expectations', 'round_limit', 'deadline_minutes']);
    integer(args.expected_revision, 'expected_revision', 1, Number.MAX_SAFE_INTEGER);
    return this.change(args, state => {
      mtCoordinator(state, args.actor_id);
      if (mtClosed(state)) fail(409, 'meeting_closed', 'Closed meetings cannot be extended.');
      if (args.title !== undefined) state.title = text(args.title, 'title', 120);
      for (const [key, max] of [['goals', 4000], ['expectations', 2000]]) if (args[key] !== undefined) {
        if (state.status !== 'inviting') fail(409, 'brief_frozen', 'Goals and expectations are frozen when the discussion starts.');
        state[key] = key === 'goals' ? text(args[key], key, max) : plainText(args[key], key, max);
      }
      if (args.round_limit !== undefined) {
        const value = integer(args.round_limit, 'round_limit', 1, 12);
        if (value < Math.max(1, state.current_round)) fail(409, 'invalid_budget', 'Keep capacity for the current round.');
        state.round_limit = value;
      }
      if (args.deadline_minutes !== undefined) state.deadline_minutes = integer(args.deadline_minutes, 'deadline_minutes', 1, 1440);
      if (state.current_round > 0) {
        state.active_signal_kind = `MEETING_UPDATED_${state.revision + 1}`;
        for (const participant of state.participants) mtNotice(state, state.active_signal_kind, participant.id);
      }
    });
  }
  async readRound(args) {
    strict(args, ['board', 'meeting_id', 'round']);
    const state = mtView(await this.load(args), mtNow(this.service)), round = integer(args.round, 'round', 0, 12);
    if (round === 0) return {meeting_id:state.id, round:0, title:state.title, goals:state.goals, expectations:state.expectations, round_limit:state.round_limit};
    const published = state.rounds.find(entry => entry.number === round);
    if (!published) fail(409, 'round_not_published', 'This round is not published yet. Read the previous completed round.');
    return {meeting_id:state.id, round:published};
  }
  async submit(args) {
    strict(args, ['board', 'meeting_id', 'participant_id', 'round', 'kind', 'comments']);
    integer(args.round, 'round', 1, 12);
    await this.service.activeParticipant(await this.service.board(args.board), args.participant_id);
    return this.change(args, (state, now) => {
      if (!state.participants.some(p => p.id === args.participant_id && p.accepted_at)) fail(403, 'not_joined', 'Accept your invitation before contributing.');
      const submission = mtSubmission(state, args);
      const prior = state.rounds.find(round => round.number === args.round)?.submissions.find(s => s.participant_id === args.participant_id)
        ?? (args.round === state.current_round && Object.hasOwn(state.submissions, args.participant_id) ? state.submissions[args.participant_id] : null);
      if (prior) {
        const {submitted_at, ...payload} = prior;
        if (JSON.stringify(payload) !== JSON.stringify(submission)) fail(409, 'submission_conflict', 'A different submission is already stored for this participant and round.');
        return {duplicate:true};
      }
      if (mtClosed(state)) fail(409, 'meeting_closed', 'The meeting has ended.');
      if (state.status !== 'running') fail(409, 'meeting_paused', 'The meeting is paused or has not started. Missing replies never become automatic passes.');
      if (args.round !== state.current_round) fail(409, 'stale_round', 'This is not the current round.');
      state.submissions[args.participant_id] = {...submission, submitted_at:now};
      mtNotice(state, 'SUBMISSION_RECEIVED', state.coordinator_id, args.participant_id);
      if (state.participants.some(p => !Object.hasOwn(state.submissions, p.id))) return;
      state.rounds.push({number:state.current_round, published_at:now, submissions:state.participants.map(p => state.submissions[p.id])});
      state.submissions = {};
      if (state.rounds.length === state.round_limit) {
        state.status = 'closed'; state.closed_at = now; state.deadline_at = null;
        for (const participant of state.participants) mtNotice(state, 'MEETING_CLOSED', participant.id);
      } else { state.current_round++; mtStartRound(state, now); }
    });
  }
  async notes(args) {
    strict(args, ['board', 'meeting_id', 'actor_id', 'expected_revision', 'notes']);
    integer(args.expected_revision, 'expected_revision', 1, Number.MAX_SAFE_INTEGER);
    strict(args.notes, ['conclusions', 'decisions', 'action_items', 'unresolved', 'additional_notes']);
    return this.change(args, state => {
      mtCoordinator(state, args.actor_id);
      for (const key of Object.keys(state.notes)) if (args.notes[key] !== undefined) state.notes[key] = plainText(args.notes[key], key, 16000);
      if (Object.values(state.notes).reduce((sum, body) => sum + mtBytes(body), 0) > 16000) fail(400, 'notes_too_large', 'Keep the combined meeting notes within 16000 UTF-8 bytes.');
    });
  }
  async recordNotice(args) {
    strict(args, ['board', 'meeting_id', 'notification_id', 'sender_id', 'recipient_id', 'operation_id', 'delivery_state']);
    return this.change(args, state => {
      const notice = state.notifications.find(n => n.id === args.notification_id);
      if (!notice || notice.sender_id !== args.sender_id || notice.recipient_id !== args.recipient_id) fail(403, 'invalid_notification', 'Use the exact stored notification, sender and recipient.');
      const delivery = {operation_id:id(args.operation_id, 'operation_id'), state:args.delivery_state};
      if (!['submitted', 'stored_events_only'].includes(delivery.state)) fail(400, 'delivery_unconfirmed', 'Record only the confirmed Inc outbound status. This does not prove participant reading.');
      if (notice.delivery) {
        if (JSON.stringify(notice.delivery) !== JSON.stringify(delivery)) fail(409, 'notification_conflict', 'This notification already has another delivery receipt.');
        return {duplicate:true};
      }
      notice.delivery = delivery;
    });
  }
  async export(args) {
    strict(args, ['board', 'meeting_id']);
    const state = await this.load(args);
    if (!mtClosed(state)) fail(409, 'meeting_not_closed', 'Close the meeting before exporting its notes.');
    const md = value => value.replace(/[\\`*_{}\[\]<>#|]/g, '\\$&').replace(/[\r\n]+/g, ' ');
    const title = md(state.title), n = state.notes;
    const section = (name, body) => `## ${name}\n\n${body || 'Not recorded.'}\n\n`;
    const notes = `# ${title} — meeting notes\n\nDate: ${state.closed_at.slice(0, 10)} (UTC)\n\nParticipants: ${state.participants.map(p => md(p.label)).join(', ')}\n\nCompleted rounds: ${state.rounds.length}/${state.round_limit}\n\n` +
      section('Goals', state.goals) + section('Expectations', state.expectations) + section('Notes', n.additional_notes) +
      'The full attributed round transcript stays on the private board. Review these curated notes before committing them to Git.\n';
    const summary = `# ${title} — summary\n\n` + section('Conclusions', n.conclusions) + section('Decisions', n.decisions) + section('Action items', n.action_items) + section('Unresolved questions', n.unresolved) +
      'No consensus or resolution is inferred from a pass, acknowledgment, or the meeting ending.\n';
    const slug = state.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'meeting';
    return {format:'paprika-meeting-export/v1', board:state.board, meeting_id:state.id, source_revision:state.revision,
      suggested_directory:`${state.closed_at.slice(0, 10)}-${slug}`, documents:{'notes.md':notes, 'summary.md':summary}};
  }
}

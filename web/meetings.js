const $ = name => document.getElementById(name);
const node = (tag, text, className) => { const e = document.createElement(tag); if (text !== undefined) e.textContent = text; if (className) e.className = className; return e; };
const params = new URL(location.href).searchParams;
let board = params.get('board') || 'main', selected = params.get('meeting'), actor = params.get('receiver') || '';
let meeting = null, participants = [], generation = 0, polling = false, saving = false, notesDirty = false, configDirty = false, draftRound = null;
const roster = new Set(); let createId = null;
async function api(name, args) {
  const response = await fetch(`/api/${name}`, {method:'POST', headers:{'Content-Type':'application/json', 'X-Dot-Board':'1'}, body:JSON.stringify(args), signal:AbortSignal.timeout(15000)});
  const data = await response.json(); if (!response.ok) throw Error(data.message || 'Request was not confirmed.'); return data;
}
function error(value) { $('meeting-error').hidden = !value; $('meeting-error').textContent = value || ''; }
function download(name, value, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([typeof value === 'string' ? value : JSON.stringify(value, null, 2)], {type}));
  const link = node('a'); link.href = url; link.download = name; document.body.append(link); link.click(); link.remove(); URL.revokeObjectURL(url);
}
function button(label, run) {
  const b = node('button', label, 'quiet'); b.type = 'button';
  b.onclick = () => work(run); return b;
}
async function work(run) {
  if (saving) return; saving = true; error(null);
  try { await run(); await refresh(); } catch (e) { error(e.message); } finally { saving = false; render(); }
}
function label(pid) { return meeting?.participants.find(p => p.id === pid)?.label || participants.find(p => p.id === pid)?.label || pid; }
function rosterOptions() {
  const query = $('meeting-roster-search').value.toLowerCase();
  $('meeting-roster-options').replaceChildren(...participants.filter(p => p.id !== actor && `${p.label} ${p.id}`.toLowerCase().includes(query)).map(p => {
    const line = node('label'), check = document.createElement('input'); check.type = 'checkbox'; check.value = p.id; check.checked = roster.has(p.id);
    check.onchange = () => { check.checked ? roster.add(p.id) : roster.delete(p.id); $('meeting-roster-count').textContent = `${roster.size} participants selected`; };
    line.append(check, node('span', p.label), node('small', p.id)); return line;
  }));
}
function fillNotes() {
  const form = $('meeting-notes-form');
  for (const [key, value] of Object.entries(meeting.notes)) form.elements[key].value = value;
  form.dataset.revision = meeting.revision; notesDirty = false;
}
function fillConfig() {
  const form = $('meeting-config-form');
  for (const key of ['title', 'round_limit', 'deadline_minutes']) form.elements[key].value = meeting[key];
  form.dataset.revision = meeting.revision; configDirty = false;
}
function addComment() {
  if (!meeting || $('meeting-comment-drafts').children.length >= 8) return;
  const row = node('div', undefined, 'meeting-comment-draft'), text = document.createElement('textarea'); text.rows = 3; text.required = true; text.maxLength = 4096; text.dataset.field = 'text'; text.setAttribute('aria-label', 'Comment text');
  const recipients = document.createElement('select'); recipients.multiple = true; recipients.dataset.field = 'recipients'; recipients.setAttribute('aria-label', 'Designated recipients');
  for (const p of meeting.participants) { const option = new Option(p.label, p.id); option.selected = p.id !== actor; recipients.add(option); }
  const kind = document.createElement('select'); kind.dataset.field = 'kind'; kind.setAttribute('aria-label', 'Comment kind');
  for (const value of ['comment', 'question', 'answer', 'conclusion']) kind.add(new Option(value, value));
  const reply = document.createElement('select'); reply.dataset.field = 'reply_to'; reply.setAttribute('aria-label', 'Reply to published comment'); reply.add(new Option('New comment', ''));
  for (const r of meeting.rounds) for (const s of r.submissions) for (const c of s.comments) reply.add(new Option(`${c.id} · ${label(s.participant_id)} · ${c.text.slice(0, 70)}`, c.id));
  const fields = node('div', undefined, 'meeting-row');
  const recipientLabel = node('label', 'Designated recipients'); recipientLabel.append(recipients);
  const replyLabel = node('label', 'Type and reply'); replyLabel.append(kind, reply); fields.append(recipientLabel, replyLabel);
  row.append(text, fields, button('Remove comment', async () => row.remove())); $('meeting-comment-drafts').append(row);
}
function render() {
  if (!meeting) return;
  const m = meeting, coordinator = actor === m.coordinator_id, closed = ['closed', 'cancelled'].includes(m.status);
  $('meeting-detail').hidden = false; $('meeting-empty').hidden = true;
  $('meeting-title').textContent = m.title; $('meeting-state').textContent = m.status === 'inviting' ? 'Invitations open' : m.status;
  $('meeting-id').value = m.id; $('meeting-goals').textContent = m.goals; $('meeting-expectations').textContent = m.expectations || 'No additional expectations.';
  $('meeting-budget').textContent = m.status === 'inviting' ? `${m.round_limit} rounds planned` : closed ? `${m.rounds.length}/${m.round_limit} rounds completed` : `Round ${m.current_round}/${m.round_limit} · ${m.rounds_after_current} after this`;
  $('meeting-guidance').textContent = closed ? 'Discussion is closed. Record conclusions and unanswered questions, then export the notes.' : m.status === 'inviting' ? 'Read the brief and accept your invitation. Discussion starts after everyone joins.' : m.status === 'paused' ? `Meeting paused${m.pause_reason === 'deadline' ? ': the round deadline passed' : ''}. Missing responses remain pending.` : m.rounds_after_current === 0 ? 'Final round. Answer outstanding questions and state conclusions or unresolved concerns. No further round follows.' : `Read published round ${m.current_round - 1} before contributing. Everyone works from the same snapshot.`;
  $('meeting-progress').textContent = closed ? 'Meeting ended.' : `Waiting for: ${m.waiting_for.map(label).join(', ') || 'No one'}.${m.deadline_at && m.status === 'running' ? ` Deadline: ${new Date(m.deadline_at).toLocaleString()}.` : ''}`;
  const controls = [];
  if (m.status === 'inviting' && m.participants.some(p => p.id === actor && !p.accepted_at)) controls.push(button('Accept invitation', () => api('accept_meeting_invitation', {board, meeting_id:m.id, participant_id:actor})));
  if (coordinator && !closed) {
    const action = m.status === 'inviting' ? 'start' : m.status === 'paused' ? 'resume' : 'pause';
    const control = button(`${action[0].toUpperCase()}${action.slice(1)} meeting`, () => api('control_meeting', {board, meeting_id:m.id, actor_id:actor, expected_revision:m.revision, action}));
    control.disabled = saving || action === 'start' && m.waiting_for.length > 0; controls.push(control);
    controls.push(button('Close meeting', () => api('control_meeting', {board, meeting_id:m.id, actor_id:actor, expected_revision:m.revision, action:'close'})));
  }
  $('meeting-controls').replaceChildren(...controls); $('meeting-settings').hidden = !coordinator || closed;
  if (!configDirty) fillConfig(); if (!notesDirty) fillNotes();
  for (const input of $('meeting-notes-form').elements) input.disabled = !coordinator || saving;
  const transcript = m.rounds.map(r => {
    const card = node('article', undefined, 'meeting-round'); card.append(node('h4', `Round ${r.number}`));
    for (const s of r.submissions) {
      const contribution = node('div', undefined, `meeting-contribution${s.kind === 'pass' ? ' meeting-pass' : ''}`); contribution.append(node('strong', label(s.participant_id)));
      if (s.kind === 'pass') contribution.append(node('p', '[pass]'));
      for (const c of s.comments) contribution.append(node('small', `${c.kind} · to ${c.recipients.map(label).join(', ')} · ${c.id}${c.reply_to ? ` · reply to ${c.reply_to}` : ''}`), node('p', c.text));
      card.append(contribution);
    }
    return card;
  });
  if (m.incomplete_round?.submissions.length) {
    const incomplete = node('article', undefined, 'meeting-round'); incomplete.append(node('h4', `Incomplete round ${m.incomplete_round.number} · retained at closure`));
    for (const s of m.incomplete_round.submissions) { incomplete.append(node('strong', label(s.participant_id))); for (const c of s.comments) incomplete.append(node('p', c.text)); if (s.kind === 'pass') incomplete.append(node('p', '[pass]')); }
    transcript.push(incomplete);
  }
  $('meeting-transcript').replaceChildren(...(transcript.length ? transcript : [node('p', 'Completed rounds will appear here.', 'empty')]));
  const eligible = m.status === 'running' && m.participants.some(p => p.id === actor && p.accepted_at) && !m.submitted_ids.includes(actor);
  $('meeting-contribute').hidden = !eligible;
  if (draftRound !== `${m.id}:${m.current_round}:${actor}`) { draftRound = `${m.id}:${m.current_round}:${actor}`; $('meeting-comment-drafts').replaceChildren(); addComment(); }
  for (const input of $('meeting-submit-form').elements) input.disabled = saving;
  const notices = m.notifications.filter(n => !actor || n.sender_id === actor);
  $('meeting-delivery-count').textContent = `Paprika Inc delivery references · ${notices.filter(n => n.actionable).length} ready`;
  $('meeting-notifications').replaceChildren(...notices.map(n => {
    const entry = node('div', undefined, 'meeting-notice'); entry.append(node('strong', `${n.kind} → ${label(n.recipient_id)}`), node('small', ` ${n.delivery?.state || (n.actionable ? 'Ready; not confirmed' : 'Obsolete or paused; do not send')} · ${n.id}`), node('pre', n.body)); return entry;
  }));
  $('export-meeting').disabled = !closed || saving;
}
async function refresh() {
  if (polling) return; polling = true; const current = generation, requestBoard = board, requestMeeting = selected;
  try {
    const rows = []; let after;
    do { const page = await api('list_meetings', {board:requestBoard, ...(after ? {after_id:after} : {})}); rows.push(...page.meetings); after = page.has_more ? page.next_after_id : null; } while (after);
    if (current !== generation) return;
    $('meeting-list').replaceChildren(...rows.map(m => { const b = node('button', undefined, 'meeting-list-item'); b.type = 'button'; b.append(node('span', m.title), node('small', `${m.status} · ${m.current_round}/${m.round_limit}`)); b.setAttribute('aria-current', String(m.id === selected)); b.onclick = () => { selected = m.id; meeting = null; notesDirty = configDirty = false; draftRound = null; generation++; refresh(); }; return b; }));
    if (requestMeeting) {
      const result = await api('get_meeting', {board:requestBoard, meeting_id:requestMeeting});
      if (current !== generation) return;
      const changed = !meeting || meeting.id !== result.meeting.id || meeting.revision !== result.meeting.revision || meeting.status !== result.meeting.status;
      meeting = result.meeting; if (changed) render();
    }
    $('meeting-connection').textContent = 'Connected';
  } catch (e) { if (current === generation) { $('meeting-connection').textContent = 'Connection interrupted'; error(e.message); } }
  finally { polling = false; if (current !== generation) queueMicrotask(refresh); }
}
async function openBoard() {
  generation++; meeting = null; selected = null; notesDirty = configDirty = false; draftRound = null;
  $('meeting-detail').hidden = true; $('meeting-empty').hidden = false; $('meeting-list').replaceChildren(); $('new-meeting').disabled = true;
  const current = generation; participants = []; let after;
  do { const page = await api('list_participants', {board, ...(after ? {after_id:after} : {}), limit:200}); if (current !== generation) return; participants.push(...page.participants); after = page.has_more ? page.next_after_id : null; } while (after);
  $('meeting-actor').replaceChildren(new Option('Choose participant', ''), ...participants.map(p => new Option(`${p.label} · ${p.id}`, p.id)));
  if (!participants.some(p => p.id === actor)) actor = ''; $('meeting-actor').value = actor;
  $('new-meeting').disabled = !actor; $('back-board').href = `/?board=${encodeURIComponent(board)}`; await refresh();
}
$('meeting-board').onchange = () => { board = $('meeting-board').value; openBoard().catch(e => error(e.message)); };
$('meeting-actor').onchange = () => { actor = $('meeting-actor').value; $('new-meeting').disabled = !actor; render(); };
$('new-meeting').onclick = () => { createId = `meeting-${crypto.randomUUID()}`; roster.clear(); $('meeting-create-form').reset(); $('meeting-roster-count').textContent = 'Choose participants'; $('meeting-create-error').textContent = ''; rosterOptions(); $('meeting-create-dialog').showModal(); };
$('meeting-roster-search').oninput = rosterOptions; $('meeting-create-cancel').onclick = () => $('meeting-create-dialog').close();
$('meeting-create-form').onsubmit = async event => {
  event.preventDefault(); const form = event.currentTarget, b = form.querySelector('[type=submit]'); b.disabled = true;
  const values = Object.fromEntries(new FormData(form));
  try {
    const result = await api('create_meeting', {board, meeting_id:createId, coordinator_id:actor, participant_ids:[...roster], ...values, round_limit:Number(values.round_limit), deadline_minutes:Number(values.deadline_minutes)});
    selected = result.meeting.id; meeting = result.meeting; notesDirty = configDirty = false; $('meeting-create-dialog').close(); await refresh();
  } catch (e) { $('meeting-create-error').textContent = e.message; } finally { b.disabled = false; }
};
$('meeting-config-form').oninput = () => { configDirty = true; };
$('meeting-notes-form').oninput = () => { notesDirty = true; };
$('reload-config').onclick = () => { if (meeting) fillConfig(); }; $('reload-notes').onclick = () => { if (meeting) fillNotes(); };
$('meeting-config-form').onsubmit = event => { event.preventDefault(); const form = event.currentTarget, values = Object.fromEntries(new FormData(form)); work(async () => { await api('configure_meeting', {board, meeting_id:meeting.id, actor_id:actor, expected_revision:Number(form.dataset.revision), ...values, round_limit:Number(values.round_limit), deadline_minutes:Number(values.deadline_minutes)}); configDirty = false; }); };
$('meeting-notes-form').onsubmit = event => { event.preventDefault(); const form = event.currentTarget; work(async () => { await api('update_meeting_notes', {board, meeting_id:meeting.id, actor_id:actor, expected_revision:Number(form.dataset.revision), notes:Object.fromEntries(new FormData(form))}); notesDirty = false; }); };
$('add-comment').onclick = addComment;
async function submit(kind) {
  const comments = kind === 'pass' ? [] : [...$('meeting-comment-drafts').children].map(row => {
    const get = field => row.querySelector(`[data-field="${field}"]`);
    return {text:get('text').value, kind:get('kind').value, recipients:[...get('recipients').selectedOptions].map(o => o.value), ...(get('reply_to').value ? {reply_to:get('reply_to').value} : {})};
  });
  const result = await api('submit_meeting_round', {board, meeting_id:meeting.id, participant_id:actor, round:meeting.current_round, kind, comments}); meeting = result.meeting;
}
$('meeting-submit-form').onsubmit = event => { event.preventDefault(); work(() => submit('comments')); };
$('meeting-pass').onclick = () => work(() => submit('pass'));
$('download-meeting-report').onclick = () => { if (meeting) download('meeting-report.json', {meeting}); };
$('export-meeting').onclick = () => work(async () => { const result = await api('export_meeting_notes', {board, meeting_id:meeting.id}); download('meeting-export.json', result); $('meeting-export-status').textContent = 'Bundle downloaded. Use Inc meeting export to save notes.md and summary.md under meetings/.'; });
async function initialize() {
  let after; const boards = [];
  do { const page = await api('list_boards', {...(after ? {after_id:after} : {})}); boards.push(...page.boards); after = page.has_more ? page.next_after_id : null; } while (after);
  $('meeting-board').replaceChildren(...boards.map(b => new Option(`${b.label} · ${b.id}`, b.id))); $('meeting-board').value = board;
  const requested = selected; await openBoard(); if (requested) { selected = requested; await refresh(); }
}
initialize().catch(e => error(e.message)); setInterval(() => { if (!document.hidden && !saving) refresh(); }, 5000);

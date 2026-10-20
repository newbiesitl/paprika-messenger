import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm, readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {SqliteD1} from './d1-adapter.mjs';
import {loadMigrations} from './migrations.mjs';
import {BoardService} from '../src/service.mjs';
import {rpc, tools} from '../src/protocol.mjs';
const sql = await loadMigrations();
const address = {board:'team', meeting_id:'pilot'};
const draft = {...address, coordinator_id:'room', participant_ids:['a', 'b'], title:'Design review', goals:'Choose an approach.', expectations:'Preserve disagreements.', round_limit:2, deadline_minutes:30};
async function fixture(t, path) {
  const db = new SqliteD1(path); db.connection.exec(sql); t.after(() => db.close());
  let now = Date.parse('2026-10-20T01:00:00Z');
  const service = new BoardService(db, 'owner', {MEETING_NOW:() => now});
  await service.create_board({board:'team', label:'Fictional team'});
  for (const participant_id of ['room', 'a', 'b', 'outsider'])
    await service.register_participant({board:'team', participant_id, label:participant_id.toUpperCase(), kind:'thread'});
  return {db, service, advance:minutes => { now += minutes * 60000; }};
}
const state = async service => (await service.get_meeting(address)).meeting;
async function control(service, action) { return service.control_meeting({...address, actor_id:'room', expected_revision:(await state(service)).revision, action}); }
async function start(service, options = {}) {
  await service.create_meeting({...draft, ...options});
  for (const participant_id of ['a', 'b']) await service.accept_meeting_invitation({...address, participant_id});
  return control(service, 'start');
}
const pass = (participant_id, round = 1) => ({...address, participant_id, round, kind:'pass'});
const comment = (participant_id, round = 1, text = 'My original words.\nKeep line breaks.', more = {}) => ({...address, participant_id, round, kind:'comments', comments:[{text, recipients:['a', 'b'], ...more}]});

test('additive meeting migration preserves existing boards, messages and acknowledgments', async t => {
  const migration = await readFile('drizzle/0010_meetings.sql', 'utf8');
  const db = new SqliteD1(); t.after(() => db.close()); db.connection.exec(sql.slice(0, sql.lastIndexOf('CREATE TABLE meetings')));
  const s = new BoardService(db, 'owner');
  await s.create_board({board:'team', label:'Existing team'});
  for (const participant_id of ['room', 'a', 'b']) await s.register_participant({board:'team', participant_id, label:participant_id, kind:'thread'});
  const original = await s.post_message({board:'team', sender_id:'a', sender_label:'A', receiver_id:'b', topic:'Existing conversation', body:'Preserve this message.', idempotency_key:'pre-meeting'});
  await s.acknowledge_message({board:'team', message_id:original.message.id, participant_id:'b'});
  db.connection.exec(migration);
  const retained = await s.get_message({board:'team', message_id:original.message.id});
  assert.equal(retained.message.body, 'Preserve this message.'); assert.equal(retained.acknowledgments.length, 1);
  assert.equal((await s.create_meeting(draft)).meeting.status, 'inviting');
  const snapshot = JSON.parse(await readFile('drizzle/meta/0010_snapshot.json', 'utf8'));
  assert.ok(snapshot.tables.meetings); assert.ok(snapshot.tables.messages);
});

test('invitations, snapshot barrier, recipient lists and terminal budget follow the protocol', async t => {
  const {service:s} = await fixture(t);
  const created = await s.create_meeting(draft);
  assert.equal(created.meeting.status, 'inviting'); assert.equal(created.meeting.rounds_remaining, 2);
  assert.equal((await s.create_meeting(draft)).duplicate, true);
  await assert.rejects(s.create_meeting({...draft, title:'Different'}), e => e.code === 'meeting_conflict');
  await assert.rejects(control(s, 'start'), e => e.code === 'invitations_pending');
  await assert.rejects(s.accept_meeting_invitation({...address, participant_id:'outsider'}), e => e.status === 403);
  for (const participant_id of ['a', 'b']) await s.accept_meeting_invitation({...address, participant_id});
  await control(s, 'start');
  assert.equal((await s.get_meeting_round({...address, round:0})).goals, draft.goals);
  await s.submit_meeting_round(comment('a', 1, 'Question for B?', {recipients:['b'], kind:'question'}));
  const waiting = await state(s);
  assert.deepEqual(waiting.waiting_for, ['b']); assert.equal(waiting.rounds.length, 0);
  assert.equal(JSON.stringify(waiting).includes('Question for B?'), false, 'staged comments are hidden from the shared snapshot');
  await assert.rejects(s.get_meeting_round({...address, round:1}), e => e.code === 'round_not_published');
  await s.submit_meeting_round(pass('b'));
  const round1 = (await s.get_meeting_round({...address, round:1})).round;
  assert.equal(round1.submissions[0].comments[0].text, 'Question for B?');
  assert.deepEqual(round1.submissions[0].comments[0].recipients, ['b']);
  assert.equal((await state(s)).rounds_remaining, 1);
  await s.submit_meeting_round(pass('a', 2));
  const answer = comment('b', 2, 'My answer.', {reply_to:round1.submissions[0].comments[0].id});
  await s.submit_meeting_round(answer);
  const done = await state(s);
  assert.equal(done.status, 'closed'); assert.equal(done.rounds_remaining, 0); assert.equal(done.rounds.length, 2);
  assert.equal(done.notifications.filter(n => n.kind === 'ROUND_START').length, 4);
  assert.equal(done.notifications.filter(n => n.kind === 'MEETING_CLOSED').length, 2);
  assert.equal((await s.submit_meeting_round(answer)).duplicate, true, 'final-round retries stay idempotent');
  await assert.rejects(s.submit_meeting_round(pass('a', 3)), e => e.code === 'meeting_closed');
  await assert.rejects(control(s, 'resume'), e => e.code === 'meeting_closed');
});

test('concurrent contributions and retries seal each round and create signals exactly once', async t => {
  const {service:s, db} = await fixture(t); await start(s);
  const peer = new BoardService(db, 'owner', s.env);
  await Promise.all(Array.from({length:24}, (_, i) => (i % 2 ? s : peer).submit_meeting_round(i % 2 ? pass('a') : pass('b'))));
  const m = await state(s);
  assert.equal(m.current_round, 2); assert.equal(m.rounds.length, 1); assert.equal(m.rounds_remaining, 1);
  assert.equal(m.notifications.filter(n => n.kind === 'ROUND_START' && n.round === 2).length, 2);
  assert.equal(m.notifications.filter(n => n.kind === 'SUBMISSION_RECEIVED').length, 2);
  await assert.rejects(s.submit_meeting_round(comment('a')), e => e.code === 'submission_conflict');
});

test('deadline pauses without fabricated passes; resume preserves contributions and consumes no round', async t => {
  const {service:s, advance} = await fixture(t); await start(s);
  await s.submit_meeting_round(pass('a')); advance(31);
  const paused = await state(s);
  assert.equal(paused.status, 'paused'); assert.equal(paused.pause_reason, 'deadline');
  assert.deepEqual(paused.waiting_for, ['b']); assert.equal(paused.rounds_remaining, 2);
  await assert.rejects(s.submit_meeting_round(pass('b')), e => e.code === 'meeting_paused');
  await control(s, 'resume');
  assert.deepEqual((await state(s)).submitted_ids, ['a']);
  assert.equal((await state(s)).notifications.filter(n => n.kind.startsWith('ROUND_RESUME_')).length, 1);
  await s.submit_meeting_round(pass('b')); assert.equal((await state(s)).current_round, 2);
});

test('revision checks, roster validation and published-reply validation fail without partial writes', async t => {
  const {service:s} = await fixture(t); await start(s);
  const before = await state(s);
  await assert.rejects(s.configure_meeting({...address, actor_id:'a', expected_revision:before.revision, title:'Hijack'}), e => e.status === 403);
  await s.configure_meeting({...address, actor_id:'room', expected_revision:before.revision, title:'Updated title'});
  await assert.rejects(s.configure_meeting({...address, actor_id:'room', expected_revision:before.revision, title:'Lost update'}), e => e.code === 'meeting_revision_conflict');
  await assert.rejects(s.submit_meeting_round(comment('outsider')), e => e.code === 'not_joined');
  await assert.rejects(s.submit_meeting_round(comment('a', 1, 'x', {recipients:['outsider']})), e => e.code === 'invalid_recipient');
  await assert.rejects(s.submit_meeting_round(comment('a', 1, 'x', {reply_to:'invented'})), e => e.code === 'invalid_reply');
  await assert.rejects(s.submit_meeting_round({...pass('a'), comments:[{text:'Not a pass', recipients:['b']}]}), e => e.code === 'invalid_submission');
  await assert.rejects(s.submit_meeting_round(comment('a', 1, '😀'.repeat(1025))), e => e.status === 400);
  await assert.rejects(s.submit_meeting_round(pass('a', 2)), e => e.code === 'stale_round');
  assert.equal((await state(s)).title, 'Updated title'); assert.deepEqual((await state(s)).submitted_ids, []);
});

test('restart preserves progress; closing retains incomplete work and curated export excludes private routing and raw comments', async t => {
  const folder = await mkdtemp(join(tmpdir(), 'meeting-'));
  const path = join(folder, 'board.sqlite'); const {service:s} = await fixture(t, path);
  await start(s); await s.submit_meeting_round(comment('a', 1, 'PRIVATE RAW COMMENT'));
  const connection = new SqliteD1(path); t.after(() => connection.close()); const other = new BoardService(connection, 'owner');
  t.after(() => rm(folder, {recursive:true, force:true}));
  assert.deepEqual((await state(other)).submitted_ids, ['a']);
  await control(other, 'close');
  assert.equal((await state(other)).incomplete_round.submissions[0].comments[0].text, 'PRIVATE RAW COMMENT');
  const closed = await state(other);
  await other.update_meeting_notes({...address, actor_id:'room', expected_revision:closed.revision, notes:{conclusions:'Choose A.', unresolved:'B disagrees; follow up separately.', additional_notes:'Reviewed discussion notes.'}});
  const exported = await other.export_meeting_notes(address), rendered = JSON.stringify(exported.documents);
  assert.match(rendered, /Choose A/); assert.match(rendered, /B disagrees/);
  assert.equal(rendered.includes('PRIVATE RAW COMMENT'), false); assert.equal(rendered.includes('meeting_id'), false);
  assert.deepEqual(Object.keys(exported.documents), ['notes.md', 'summary.md']);
});

test('MCP exposes meeting tools without sending notifications or creating normal inbox messages', async t => {
  const {service:s, db} = await fixture(t);
  const response = await rpc({jsonrpc:'2.0', id:1, method:'tools/call', params:{name:'create_meeting', arguments:draft}}, s);
  assert.equal(response.result.isError, false);
  assert.equal(db.connection.prepare('SELECT COUNT(*) n FROM messages').get().n, 0);
  assert.ok(tools.some(t => t.name === 'submit_meeting_round'));
  const m = response.result.structuredContent.meeting, notice = m.notifications[0];
  assert.match(notice.body, /MEETING_INVITE board=team meeting=pilot/);
  const receipt = {...address, notification_id:notice.id, sender_id:'room', recipient_id:notice.recipient_id, operation_id:'meeting-op-1', delivery_state:'submitted'};
  await s.record_meeting_notification(receipt);
  assert.equal((await s.record_meeting_notification(receipt)).duplicate, true);
  await assert.rejects(s.record_meeting_notification({...receipt, operation_id:'different'}), e => e.code === 'notification_conflict');
});

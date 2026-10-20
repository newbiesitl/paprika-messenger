import test from 'node:test';
import assert from 'node:assert/strict';
import {SqliteD1} from './d1-adapter.mjs';
import {loadMigrations} from './migrations.mjs';
import {BoardService} from '../src/service.mjs';
await import('../scripts/build.mjs');
const {handle} = await import('../dist/_worker.js');
const migration = await loadMigrations();

test('in-chat meeting picker advertises its embedded resource, filters active members and performs no writes', async t => {
  const db = new SqliteD1(); t.after(() => db.close()); db.connection.exec(migration);
  const env = {DB:db, OWNER_USER_ID:'owner', SITE_ORIGIN:'https://board.example'};
  const service = new BoardService(db, 'owner');
  await service.create_board({board:'team', label:'Team'});
  for (const participant_id of ['room', 'a', 'b', 'removed']) await service.register_participant({board:'team', participant_id, label:participant_id, kind:'thread'});
  await service.unregister_thread({board:'team', participant_id:'removed'});
  const rpc = async (method, params, authenticated = true) => handle(new Request('https://board.example/mcp', {method:'POST',
    headers:{'Content-Type':'application/json', ...(authenticated ? {'oai-authenticated-user-id':'owner'} : {})},
    body:JSON.stringify({jsonrpc:'2.0', id:1, method, params})}), env);
  const catalog = (await (await rpc('tools/list', {})).json()).result;
  const tool = catalog.tools.find(item => item.name === 'show_meeting_participant_picker');
  assert.equal(tool.annotations.readOnlyHint, true); assert.ok(tool.inputSchema.required.includes('board'));
  const args = {board:'team', coordinator_id:'room', limit:2};
  assert.equal((await rpc('tools/call', {name:tool.name, arguments:args}, false)).status, 401);
  const result = (await (await rpc('tools/call', {name:tool.name, arguments:args})).json()).result;
  assert.equal(result.isError, false); assert.equal(result._meta.ui.resourceUri, tool._meta.ui.resourceUri);
  assert.equal(result.structuredContent.selection_sends, false); assert.equal(result.structuredContent.max_participants, 12);
  assert.ok(result.structuredContent.recipients.every(item => !['room', 'removed'].includes(item.participant_id)));
  const next = await service.show_meeting_participant_picker({...args, cursor:result.structuredContent.next_cursor});
  assert.ok(next.recipients.every(item => item.participant_id !== 'room'));
  const search = await service.show_meeting_participant_picker({board:'team', query:'b'}); assert.equal(search.recipients[0].participant_id, 'b');
  await assert.rejects(service.show_meeting_participant_picker({}), /board/);
  await assert.rejects(service.show_meeting_participant_picker({...args, coordinator_id:'removed'}));
  await assert.rejects(service.show_meeting_participant_picker({...args, registration_status:'unregistered'}));
  const resource = (await (await rpc('resources/read', {uri:tool._meta.ui.resourceUri}, false)).json()).result.contents[0];
  assert.equal(resource.mimeType, 'text/html;profile=mcp-app'); assert.match(resource.text, /createMeetingParticipantHost/);
  assert.doesNotMatch(resource.text, /MEETING_PARTICIPANTS_SCRIPT/); assert.match(resource.text, /type = 'checkbox'/);
  assert.equal(resource._meta['openai/ui'].preferredDisplayMode, 'inline');
  for (const table of ['meetings', 'messages', 'event_subscriptions']) assert.equal(db.connection.prepare(`SELECT COUNT(*) n FROM ${table}`).get().n, 0);
});

test('built private meeting UI and HTTP tools retain owner authentication, origin protection and durable rounds', async t => {
  const db = new SqliteD1(); t.after(() => db.close()); db.connection.exec(migration);
  const env = {DB:db, OWNER_USER_ID:'owner', SITE_ORIGIN:'https://board.example'};
  const service = new BoardService(db, 'owner');
  await service.create_board({board:'team', label:'Team'});
  for (const participant_id of ['room', 'a']) await service.register_participant({board:'team', participant_id, label:participant_id, kind:'thread'});
  const request = (path, args, headers = {}) => handle(new Request(`https://board.example${path}`, {method:args ? 'POST' : 'GET',
    headers:{'oai-authenticated-user-id':'owner', Origin:'https://board.example', 'X-Dot-Board':'1', 'Content-Type':'application/json', ...headers}, ...(args ? {body:JSON.stringify(args)} : {})}), env);
  assert.equal((await handle(new Request('https://board.example/meetings.html'), env)).status, 401);
  assert.equal((await request('/meetings.html', null, {'oai-authenticated-user-id':'other'})).status, 403);
  for (const path of ['/meetings.html', '/meetings.js', '/meetings.css']) {
    const response = await request(path); assert.equal(response.status, 200); assert.match(response.headers.get('Content-Security-Policy'), /default-src 'self'/);
  }
  const draft = {board:'team', meeting_id:'pilot', coordinator_id:'room', participant_ids:['a'], title:'HTTP pilot', goals:'Exercise rounds', round_limit:1};
  assert.equal((await request('/api/create_meeting', draft, {Origin:'https://outside.example'})).status, 403);
  assert.equal((await request('/api/create_meeting', draft, {'X-Dot-Board':'0'})).status, 403);
  assert.equal((await request('/api/create_meeting', draft)).status, 200);
  const address = {board:'team', meeting_id:'pilot'};
  await request('/api/accept_meeting_invitation', {...address, participant_id:'a'});
  const get = await (await request('/api/get_meeting', address)).json();
  await request('/api/control_meeting', {...address, actor_id:'room', expected_revision:get.meeting.revision, action:'start'});
  const done = await (await request('/api/submit_meeting_round', {...address, participant_id:'a', round:1, kind:'pass'})).json();
  assert.equal(done.meeting.status, 'closed'); assert.equal(done.meeting.rounds_remaining, 0);
  assert.equal(done.meeting.notifications.some(n => n.kind === 'ROUND_START' && n.actionable), false);
  assert.equal(db.connection.prepare('SELECT COUNT(*) n FROM messages').get().n, 0, 'HTTP state changes do not bypass Inc delivery');
  const exported = await (await request('/api/export_meeting_notes', address)).json();
  assert.equal(exported.format, 'paprika-meeting-export/v1'); assert.match(exported.documents['summary.md'], /No consensus/);
});

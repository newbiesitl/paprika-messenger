import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';

const source = (await readFile('web/meeting-participants.js', 'utf8')).replace(/^export /gm, '');
const flush = async () => { for (let i = 0; i < 24; i++) await Promise.resolve(); };
class Element {
  constructor(tag = 'div') { this.tagName = tag; this.children = []; this.attributes = {}; this.value = ''; this.textContent = ''; this.hidden = false; this.disabled = false; this.checked = false; this.open = false; }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = [...nodes]; }
  setAttribute(key, value) { this.attributes[key] = value; }
  querySelectorAll(tag) { return this.children.flatMap(child => [...(child.tagName === tag ? [child] : []), ...child.querySelectorAll(tag)]); }
}
const person = (id, extra = {}) => ({participant_id:id, thread_name:'Agent ' + id, registration_status:'active', ...extra});
const page = (recipients = [person('a'), person('b')], extra = {}) => ({picker_kind:'meeting_participants', board:'company', coordinator_id:'room', coordinator_label:'Coordinator', recipients, has_more:false, next_cursor:null, ...extra});
function harness() {
  const elements = Object.fromEntries(['board', 'dropdown', 'selection-label', 'search-form', 'search', 'search-button', 'refresh', 'choices', 'page-status', 'more', 'selected', 'apply', 'clear', 'feedback', 'fallback', 'command'].map(id => [id, new Element()]));
  const sent = [], timers = new Map(); let listener, timer = 0;
  const parent = {postMessage:message => sent.push(message)};
  const window = {parent, addEventListener:(name, callback) => { if (name === 'message') listener = callback; }};
  const document = {getElementById:id => elements[id], createElement:tag => new Element(tag), body:{}, documentElement:{clientWidth:375, scrollHeight:650, style:{setProperty(){}}}};
  const context = {window, document, setTimeout:fn => { timers.set(++timer, fn); return timer; }, clearTimeout:id => timers.delete(id)};
  runInNewContext(source + '\nglobalThis.host = createMeetingParticipantHost({window,document});', context);
  const emit = (data, sender = parent) => listener({source:sender, data});
  const reply = (request, result, error) => emit({jsonrpc:'2.0', id:request.id, ...(error ? {error:{message:error}} : {result})});
  const initialize = async (extra = {}) => { reply(sent[0], {protocolVersion:'2026-01-26', hostCapabilities:{updateModelContext:{text:{}, structuredContent:{}}}, ...extra}); await flush(); };
  const show = async data => { emit({jsonrpc:'2.0', method:'ui/notifications/tool-result', params:{structuredContent:data}}); await flush(); };
  const inputs = () => elements.choices.querySelectorAll('input');
  const choose = async (id, checked = true) => { const input = inputs().find(item => item.value === id); assert.ok(input, id); input.checked = checked; input.onchange(); await flush(); };
  const calls = name => sent.filter(message => message.method === 'tools/call' && (!name || message.params.name === name));
  const verify = async () => { for (const request of calls('get_recipient').filter(item => !item.replied)) { request.replied = true; reply(request, {structuredContent:{board:request.params.arguments.board, recipient:person(request.params.arguments.participant_id)}}); } await flush(); };
  return {elements, sent, emit, reply, initialize, show, inputs, choose, calls, verify, host:context.host};
}

test('multi-select stays read-only, rejects other windows and excludes coordinator; search and pagination retain choices', async () => {
  const h = harness(); await h.initialize();
  h.emit({jsonrpc:'2.0', method:'ui/notifications/tool-result', params:{structuredContent:page()}}, {});
  assert.equal(h.inputs().length, 0);
  await h.show(page([person('room'), person('a', {thread_name:'<script> hostile title'}), person('b')]));
  assert.equal(h.inputs().length, 2); assert.equal(h.calls().length, 0);
  assert.equal(h.elements.choices.querySelectorAll('strong')[0].textContent, '<script> hostile title');
  await h.choose('a');
  h.elements.search.value = 'Reviewer'; const searching = h.elements['search-button'].onclick();
  const lookup = h.calls().at(-1); assert.equal(lookup.params.arguments.query, 'Reviewer'); assert.equal(lookup.params.arguments.board, 'company');
  h.reply(lookup, {structuredContent:page([person('c')], {has_more:true, next_cursor:'cursor-1'})}); await searching;
  await h.choose('c'); assert.equal(h.elements.selected.children.length, 2);
  const more = h.elements.more.onclick(); assert.equal(h.calls().at(-1).params.arguments.cursor, 'cursor-1');
  h.reply(h.calls().at(-1), {structuredContent:page([person('d')])}); await more;
  assert.deepEqual(h.inputs().map(input => input.value), ['c', 'd']);
  assert.equal(h.elements.selected.children.length, 2);
  assert.equal(h.sent.filter(item => item.method === 'ui/message' || item.method === 'ui/update-model-context').length, 0);
  let prevented = false;
  const byKeyboard = h.elements.search.onkeydown({key:'Enter', preventDefault(){prevented = true;}});
  assert.equal(prevented, true); h.reply(h.calls().at(-1), {structuredContent:page([person('c')])}); await byKeyboard;
});

test('all selected recipients are revalidated and attached once; editing removes old model context before changing roster', async () => {
  const h = harness(); await h.initialize(); await h.show(page()); await h.choose('a'); await h.choose('b');
  const applying = h.elements.apply.onclick(); await h.elements.apply.onclick();
  assert.equal(h.calls('get_recipient').length, 2); assert.equal(h.elements.apply.disabled, true);
  await h.verify(); const context = h.sent.findLast(item => item.method === 'ui/update-model-context');
  assert.deepEqual(Array.from(context.params.structuredContent.paprika_meeting_selection.participant_ids), ['a', 'b']);
  assert.equal(context.params.structuredContent.paprika_meeting_selection.board, 'company');
  h.reply(context, {_meta:{'openai/modelContext':{updateId:'selected-1'}}}); await applying;
  assert.match(h.elements.feedback.textContent, /attached/);
  await h.choose('b', false); const clear = h.sent.at(-1);
  assert.equal(clear.method, 'ui/update-model-context'); assert.equal(clear.params.content.length, 0);
  assert.equal(h.elements.selected.children.length, 2, 'retain old roster until host confirms its removal');
  h.reply(clear, {}); await flush(); assert.equal(h.elements.selected.children.length, 1);
  assert.equal(h.sent.some(item => item.method === 'ui/message'), false);
  assert.ok(h.calls().every(item => ['list_recipients', 'get_recipient'].includes(item.params.name)));
});

test('cap is enforced across pages, and clearing the applied attachment clears the visible roster', async () => {
  const h = harness(); await h.initialize(); await h.show(page(Array.from({length:13}, (_, i) => person('p' + i))));
  for (let i = 0; i < 12; i++) await h.choose('p' + i);
  assert.equal(h.inputs().at(-1).disabled, true); await h.choose('p12'); assert.equal(h.elements.selected.children.length, 12);
  const applying = h.elements.apply.onclick(); await h.verify();
  h.reply(h.sent.findLast(item => item.method === 'ui/update-model-context'), {_meta:{'openai/modelContext':{updateId:'selected'}}}); await applying;
  h.emit({jsonrpc:'2.0', method:'ui/notifications/host-context-changed', params:{'openai/modelContext':null}}); await flush();
  assert.equal(h.elements.selected.children.length, 0); assert.equal(h.elements.apply.disabled, true);
});

test('removed, misrouted and failed lookups never attach a roster or send a message', async () => {
  for (const response of [
    {isError:true},
    {structuredContent:{board:'other', recipient:person('a')}},
    {structuredContent:{board:'company', recipient:person('a', {registration_status:'unregistered'})}},
    {structuredContent:{board:'company', recipient:person('wrong')}}
  ]) {
    const h = harness(); await h.initialize(); await h.show(page()); await h.choose('a');
    const applying = h.elements.apply.onclick(); h.reply(h.calls().at(-1), response); await applying;
    assert.equal(h.sent.some(item => ['ui/message', 'ui/update-model-context'].includes(item.method)), false);
    assert.equal(h.elements.selected.children.length, 1); assert.equal(h.elements.apply.disabled, false);
  }
});

test('unsupported or rejected context attachment exposes copyable verified selection without claiming success', async () => {
  for (const supported of [false, true]) {
    const h = harness(); await h.initialize({hostCapabilities:supported ? {updateModelContext:{text:{}}} : {}});
    await h.show(page()); await h.choose('a'); const applying = h.elements.apply.onclick(); await h.verify();
    if (supported) h.reply(h.sent.findLast(item => item.method === 'ui/update-model-context'), {isError:true});
    await applying; assert.equal(h.elements.fallback.hidden, false); assert.match(h.elements.command.value, /"participant_ids":\["a"\]/);
    assert.match(h.elements.feedback.textContent, /could not attach/); assert.equal(h.sent.some(item => item.method === 'ui/message'), false);
  }
});

test('a stale page cannot replace a newer board and failed context clearing preserves the applied roster', async () => {
  const h = harness(); await h.initialize(); await h.show(page()); await h.choose('a');
  const search = h.elements.refresh.onclick(), stale = h.calls().at(-1);
  await h.show(page([person('new')], {board:'new-board'}));
  h.reply(stale, {structuredContent:page([person('stale')])}); await search;
  assert.deepEqual(h.inputs().map(input => input.value), ['new']); assert.equal(h.elements.selected.children.length, 0);
  await h.choose('new'); const applying = h.elements.apply.onclick(); await h.verify();
  h.reply(h.sent.findLast(item => item.method === 'ui/update-model-context'), {_meta:{'openai/modelContext':{updateId:'attached'}}}); await applying;
  const clearing = h.elements.clear.onclick(); h.reply(h.sent.at(-1), {isError:true}); await clearing;
  assert.equal(h.elements.selected.children.length, 1); assert.match(h.elements.feedback.textContent, /Could not clear/);
});

test('remount restores the attached roster only on its original board and coordinator scope', async () => {
  const h = harness(); await h.initialize({hostContext:{'openai/modelContext':{updateId:'restored', structuredContent:{paprika_meeting_selection:{board:'company', coordinator_id:'room', participant_ids:['a'], participants:[person('a')]}}}}});
  await h.show(page()); assert.equal(h.inputs()[0].checked, true);
  const changing = h.host.render(page([person('z')], {board:'other'}));
  assert.equal(h.sent.at(-1).method, 'ui/update-model-context'); h.reply(h.sent.at(-1), {}); await changing;
  assert.equal(h.elements.selected.children.length, 0); assert.deepEqual(h.inputs().map(input => input.value), ['z']);
});

test('removing the attachment during revalidation cannot resurrect the roster; host removal during Apply also wins', async () => {
  const h = harness(); await h.initialize(); await h.show(page()); await h.choose('a');
  const applying = h.elements.apply.onclick(); await h.verify();
  h.reply(h.sent.findLast(item => item.method === 'ui/update-model-context'), {_meta:{'openai/modelContext':{updateId:'attached'}}}); await applying;
  const reapplying = h.elements.apply.onclick();
  h.emit({jsonrpc:'2.0', method:'ui/notifications/host-context-changed', params:{'openai/modelContext':null}});
  await h.verify(); await reapplying;
  assert.equal(h.elements.selected.children.length, 0);
  assert.equal(h.sent.filter(item => item.method === 'ui/update-model-context').length, 1);
  await h.choose('b'); const next = h.elements.apply.onclick(); await h.verify();
  h.emit({jsonrpc:'2.0', method:'ui/notifications/host-context-changed', params:{'openai/modelContext':null}});
  h.reply(h.sent.findLast(item => item.method === 'ui/update-model-context'), {_meta:{'openai/modelContext':{updateId:'new-attachment'}}}); await next;
  assert.equal(h.elements.selected.children.length, 0); assert.match(h.elements.feedback.textContent, /attachment removed/);
});

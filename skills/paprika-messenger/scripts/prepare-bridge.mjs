import { existsSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { prepareDirectDelivery, prepareStoredDelivery, readJsonInput } from './prepare-delivery.mjs';
import { conversationLink } from './conversation-link.mjs';

// The host supplies a fresh get_recipient result and actual native read_thread
// metadata. This builds arguments; only the calling Codex host can send them.
export function prepareBridgeDelivery(input, env = process.env) {
  const {recipient_record: record, history, mode = 'direct'} = input;
  if (!['codex','chatgpt'].includes(input.target_kind)) throw Error('Declare the intended target_kind: codex or chatgpt.');
  if (!record || record.board !== input.board || record.recipient?.participant_id !== input.receiver_id)
    throw Error('Require a fresh get_recipient result for the exact selected board and receiver ID.');
  const recipient = {...record.recipient, board: record.board, id: record.recipient.participant_id};
  const mapping = recipient.chatgpt_destination;
  const target = mapping?.conversation_id ?? recipient.thread_id;
  if (history?.schemaVersion !== 1 || history.thread?.id !== target
      || history.thread.kind !== input.target_kind)
    throw Error('Require native history for the exact destination; a runtime reply is not ChatGPT delivery.');
  const native = history.thread;
  if (mapping && native.kind !== 'chatgpt') throw Error('The mapped destination must be an actual ChatGPT conversation.');
  if (!mapping && recipient.source === 'chatgpt' && native.kind !== 'chatgpt')
    throw Error('Missing ChatGPT conversation mapping; do not fall back to its execution thread.');
  if (native.status?.type !== 'idle') throw Error('Wait until the selected recipient is idle before preparing a bridge send.');
  if (native.kind === 'codex' && (!native.hostId || (recipient.host_id && native.hostId !== recipient.host_id)))
    throw Error('Require the exact Codex host from native discovery.');
  const destination = {source: 'read_thread', kind: native.kind, thread_id: native.id,
    ...(native.kind === 'codex' ? {host_id: native.hostId} : {})};
  const resolved = {...input, recipient, destination};
  if (!['direct','board'].includes(mode)) throw Error('Bridge mode must be direct or board.');
  const plan = (mode === 'direct' ? prepareDirectDelivery : prepareStoredDelivery)(resolved, env);
  return {...plan, native_kind: native.kind,
    conversation_link: conversationLink({...recipient, source: native.kind,
      ...(native.kind === 'codex' && native.hostId === 'local' ? {host_id: 'local', execution_mode: 'local'} : {})})};
}

if (process.argv[1] && existsSync(process.argv[1]) && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  try { console.log(JSON.stringify(prepareBridgeDelivery(await readJsonInput(2 * 1024 * 1024)))); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}

import { existsSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { digest, routingId, readJsonInput } from '../../skills/paprika-messenger/scripts/prepare-delivery.mjs';

// A Codex execution reply is not proof of a ChatGPT conversation update. Verify
// the actual ChatGPT route separately, using genuine parsed host history. This
// is a consistency check, not authentication of caller-supplied JSON.
export function evaluateChatGptBridge({checkpoint, args, expected_response, history}) {
  if (checkpoint?.schema_version !== 1 || checkpoint.native_kind !== 'chatgpt')
    throw new Error('Require a ChatGPT bridge checkpoint.');
  routingId(checkpoint.request_id, 'request_id');
  routingId(checkpoint.recipient_thread_id, 'recipient_thread_id', 160);
  if (args?.threadId !== checkpoint.recipient_thread_id || typeof args.prompt !== 'string'
      || digest(args) !== checkpoint.payload_digest)
    throw new Error('Host arguments conflict with the recorded destination or payload.');
  if (typeof expected_response !== 'string' || !expected_response.trim()
      || !expected_response.includes(checkpoint.request_id) || !args.prompt.includes(expected_response))
    throw new Error('Require the exact planned response containing this unique test reference.');
  const prepared = Date.parse(checkpoint.prepared_at);
  if (!Number.isFinite(prepared) || !Array.isArray(checkpoint.baseline_turn_ids))
    throw new Error('Require a recorded preparation time and baseline turn IDs.');
  for (const id of checkpoint.baseline_turn_ids) routingId(id, 'baseline turn ID', 160);
  const states = {not_submitted: 'not_started', unavailable: 'unavailable', failed: 'rejected',
    submitting: 'submission_uncertain', unknown: 'submission_uncertain', submitted: 'awaiting_chatgpt_turn'};
  if (!Object.hasOwn(states, checkpoint.state)) throw new Error('Unrecognized native submission state.');
  const uncertain = ['submitting', 'unknown'].includes(checkpoint.state);
  const report = {schema_version: 1, request_id: checkpoint.request_id,
    recipient_thread_id: checkpoint.recipient_thread_id, native_kind: 'chatgpt',
    submission_state: checkpoint.state, status: states[checkpoint.state],
    new_turn: false, exact_response: false, next_action: uncertain ? 'reconcile' : 'none'};
  if (!history) return report;
  if (history.schemaVersion !== 1 || history.thread?.kind !== 'chatgpt'
      || history.thread.id !== checkpoint.recipient_thread_id || !Array.isArray(history.turns))
    throw new Error('Require history from the exact ChatGPT conversation, not its Codex runtime.');
  const old = new Set(checkpoint.baseline_turn_ids);
  const matches = history.turns.filter(turn => !old.has(turn.id)
    && Number.isFinite(turn.startedAt) && turn.startedAt >= Math.floor(prepared / 1000)
    && Array.isArray(turn.items) && turn.items.some(item => item.type === 'userMessage'
      && Array.isArray(item.content) && item.content.some(entry => entry.type === 'text' && entry.text === args.prompt)));
  if (!matches.length) return report; // A stale/page-limited read never permits a resend.
  for (const turn of matches) routingId(turn.id, 'observed turn ID', 160);
  if (!uncertain && checkpoint.state !== 'submitted')
    return {...report, status: 'inconsistent_evidence', next_action: 'investigate'};
  if (matches.length !== 1)
    return {...report, status: 'duplicate_chatgpt_turns', new_turn: true, next_action: 'investigate'};
  const turn = matches[0];
  // Schema-v1 ChatGPT history omits phase for its assistant message. Explicit
  // commentary is still insufficient, and the completed turn must match.
  const final = turn.items.filter(item => item.type === 'agentMessage').at(-1);
  const exact = turn.status === 'completed' && [undefined, 'final_answer'].includes(final?.phase)
    && typeof final?.text === 'string' && final.text.trim() === expected_response;
  return {...report, status: exact ? 'chatgpt_response_verified'
    : turn.status === 'completed' ? 'chatgpt_response_mismatch'
    : turn.status === 'failed' ? 'chatgpt_turn_failed' : 'chatgpt_turn_observed',
    new_turn: true, exact_response: exact, turn_id: turn.id,
    ...(final?.id && exact ? {response_item_id: routingId(final.id, 'response item ID', 160)} : {})};
}

if (process.argv[1] && existsSync(process.argv[1]) && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  try { console.log(JSON.stringify(evaluateChatGptBridge(await readJsonInput(2 * 1024 * 1024)))); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}

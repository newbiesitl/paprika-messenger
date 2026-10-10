import { existsSync, realpathSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { prepareDirectDelivery, routingId, readJsonInput } from '../../skills/paprika-messenger/scripts/prepare-delivery.mjs';
import { NotificationState } from '../../skills/paprika-messenger/scripts/notification-state.mjs';

const responsePrefix = 'PAPRIKA_NATIVE_PROBE_RECEIVED:';
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;

function expectedResponse(key) {
  if (typeof key !== 'string' || !uuid.test(key)) throw new Error('Use a fresh UUID v4 for the probe request_id.');
  return `${responsePrefix}${key}`;
}

function acknowledgment(key) {
  return `Received your Paprika Messenger native-delivery test message.\n${expectedResponse(key)}`;
}

function timestamp(value) {
  const ms = typeof value === 'number' ? value : Date.parse(value);
  if (!Number.isFinite(ms) || ms <= 0) throw new Error('Require a valid probe timestamp.');
  return new Date(ms).toISOString();
}

// Consume the parsed schema-v1 read_thread result, never a retrieval summary.
// This checks consistency; the caller must obtain genuine host evidence.
function nativeHistory(history, plan) {
  if (history?.schemaVersion !== 1 || history.thread?.kind !== 'codex' || !Array.isArray(history.turns))
    throw new Error('Unsupported native history: require a schema-v1 Codex read_thread result.');
  if (history.thread.id !== plan.recipient_thread_id
      || (plan.host_id !== undefined && history.thread.hostId !== plan.host_id))
    throw new Error('History must belong to the exact verified recipient and host.');
  for (const turn of history.turns) routingId(turn?.id, 'history turn ID', 160);
  return history;
}

function validateProbe(probe) {
  if (probe?.schema_version !== 1 || probe.plan?.mode !== 'direct' || probe.plan.transport !== 'native'
      || !probe.plan.host_args || probe.plan.sender_thread_id === probe.plan.recipient_thread_id)
    throw new Error('Require a prepared native probe for a different recipient.');
  // Also recognize the marker-only manual probe used for the initial live test.
  if (![acknowledgment(probe.plan.key), expectedResponse(probe.plan.key)].includes(probe.expected_response)
      || !probe.plan.host_args.prompt?.includes(probe.expected_response))
    throw new Error('Probe response marker conflicts with its prepared request.');
  timestamp(probe.prepared_at);
  const baseline = probe.baseline;
  if (baseline?.thread_id !== probe.plan.recipient_thread_id || baseline.native_kind !== 'codex'
      || baseline.status !== 'idle' || !Array.isArray(baseline.turn_ids))
    throw new Error('Require an idle baseline for this exact native recipient.');
  for (const id of baseline.turn_ids) routingId(id, 'baseline turn ID', 160);
  if (new Set(baseline.turn_ids).size !== baseline.turn_ids.length)
    throw new Error('Baseline contains duplicate turn IDs.');
}

export function prepareNativeProbe(input, {env = process.env, now = Date.now()} = {}) {
  const key = input.request_id ?? randomUUID();
  const expected = acknowledgment(key);
  const plan = prepareDirectDelivery({...input, request_id: key,
    body: `Human-authorized native-delivery diagnostic. Post the following acknowledgment as your final response in this chat, exactly as written. This test requests only that text response in this chat.\n\n${expected}`}, env);
  if (plan.sender_thread_id === plan.recipient_thread_id) throw new Error('Select a different recipient for the wake test.');
  const history = nativeHistory(input.history, plan);
  if (history.thread.status?.type !== 'idle') throw new Error('The wake probe requires an idle recipient; read its status again later.');
  const probe = {schema_version: 1, plan, expected_response: expected, prepared_at: timestamp(now),
    baseline: {thread_id: history.thread.id, native_kind: history.thread.kind,
      status: 'idle', turn_ids: history.turns.map(turn => turn.id)}};
  validateProbe(probe);
  return probe;
}

function containsInput(turn, plan) {
  return Array.isArray(turn.items) && turn.items.some(item => item.type === 'userMessage'
    && Array.isArray(item.content) && item.content.some(entry => {
      if (entry.type !== 'text') return false;
      if (entry.codexDelegation) return entry.codexDelegation.sourceThreadId === plan.sender_thread_id
        && entry.codexDelegation.input === plan.host_args.prompt;
      return entry.text === plan.host_args.prompt;
    }));
}

function turnTime(value) {
  // Native history timestamps are Unix seconds, with second precision.
  return Number.isFinite(value) && value > 0 ? new Date(value * 1000).toISOString() : undefined;
}

// Read-only: never sends, retries, reconciles or writes raw recipient history.
export async function evaluateNativeProbe({probe, history}, {state = new NotificationState(), now = Date.now()} = {}) {
  validateProbe(probe);
  // Reuse the production checkpoint's route/digest validation and restart guard.
  const checkpoint = await state.read(probe.plan);
  const submission = checkpoint?.state ?? 'not_started';
  const uncertain = ['submitting', 'unknown'].includes(submission);
  const status = {not_started: 'not_started', unavailable: 'unavailable', failed: 'rejected',
    submitting: 'submission_uncertain', unknown: 'submission_uncertain', submitted: 'awaiting_turn'}[submission];
  const report = {schema_version: 1, request_id: probe.plan.key,
    recipient_thread_id: probe.plan.recipient_thread_id,
    ...(probe.plan.host_id ? {host_id: probe.plan.host_id} : {}), native_kind: 'codex',
    prepared_at: probe.prepared_at, observed_at: timestamp(now), submission_state: submission,
    status, new_turn: false, exact_response: false, next_action: uncertain ? 'reconcile' : 'none'};
  if (!history) return report;
  const observed = nativeHistory(history, probe.plan);
  const oldIds = new Set(probe.baseline.turn_ids);
  const preparedSecond = Math.floor(Date.parse(probe.prepared_at) / 1000);
  const matches = observed.turns.filter(turn => !oldIds.has(turn.id)
    && Number.isFinite(turn.startedAt) && turn.startedAt >= preparedSecond && containsInput(turn, probe.plan));
  if (!matches.length) return report; // A page/summary without a match is not proof of non-delivery.
  if (!uncertain && submission !== 'submitted')
    return {...report, status: 'inconsistent_evidence', next_action: 'investigate'};
  if (matches.length > 1)
    return {...report, status: 'duplicate_turns', new_turn: true,
      turn_ids: matches.map(turn => turn.id), next_action: 'investigate'};
  const turn = matches[0];
  const final = turn.items.filter(item => item.type === 'agentMessage' && item.phase === 'final_answer').at(-1);
  const exact = turn.status === 'completed' && typeof final?.text === 'string'
    && final.text.trim() === probe.expected_response;
  if (exact && final.id !== undefined) routingId(final.id, 'response item ID', 160);
  return {...report, status: exact ? 'response_verified' : turn.status === 'completed' ? 'response_mismatch'
    : turn.status === 'failed' ? 'turn_failed' : 'turn_observed', new_turn: true, exact_response: exact,
    turn_id: turn.id, started_at: turnTime(turn.startedAt),
    ...(turnTime(turn.completedAt) ? {completed_at: turnTime(turn.completedAt)} : {}),
    ...(exact && final.id ? {response_item_id: final.id} : {})};
}

if (process.argv[1] && existsSync(process.argv[1]) && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  try {
    const action = process.argv[2];
    if (process.argv.length !== 3 || !['prepare', 'verify'].includes(action))
      throw new Error('Usage: node experiments/native-delivery/probe.mjs prepare|verify < input.json');
    const input = await readJsonInput(2 * 1024 * 1024);
    console.log(JSON.stringify(action === 'prepare' ? prepareNativeProbe(input)
      : await evaluateNativeProbe(input, {state: new NotificationState(input.state_root)})));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}

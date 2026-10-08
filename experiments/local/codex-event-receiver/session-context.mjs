// This prototype consumes evidence collected by a host adapter. It is not an
// authentication boundary and does not infer capabilities from message content.
const evidenceRecords = new WeakSet();
const values = { product: ['codex', 'chatgpt', 'dot'], orchestration: ['local', 'cloud'], execution: ['local', 'cloud', 'remote'] };
function evidence(source, scope, threadId, facts, observedAt) {
  const record = Object.freeze({ source, scope, thread_id: threadId, facts: Object.freeze({ ...facts }), observed_at: observedAt });
  evidenceRecords.add(record); return record;
}
export function nativeThreadEvidence(thread, currentThreadId, observedAt = Date.now()) {
  // kind identifies the backing product. hostId/cwd/originator/title are NOT a
  // universal orchestration-mode API; deliberately leave mode unreported.
  const product = ['codex', 'chatgpt', 'dot'].includes(thread?.kind) ? thread.kind : undefined;
  return evidence('native_read_thread', 'live', thread?.id, { ...(product ? { product } : {}) }, observedAt);
}
export function ownedRuntimeEvidence(app, thread, observedAt = Date.now()) {
  if (!app.ownedThreadIds?.has(thread?.id) || app.closed || !Number.isInteger(app.child?.pid))
    throw Error('The companion does not own this live app-server session.');
  // The pilot starts this stdio controller here and uses its local MCP fixture.
  // These facts do not classify some other desktop or managed cloud runtime.
  return evidence('locally_started_app_server', 'live', thread.id,
    { product: 'codex', orchestration: 'local', execution: 'local' }, observedAt);
}
export function simulatedHostEvidence(threadId, facts, observedAt = Date.now()) {
  // Explicit test contract only. No platform adapter for all four hosts is
  // claimed by these fixtures, and they cannot establish production readiness.
  return evidence('simulated_host_context', 'simulation', threadId, facts, observedAt);
}
export function detectSession(currentThreadId, observations, now = Date.now()) {
  const accepted = [], ignored = [], conflicts = [], collected = { product: new Set(), orchestration: new Set(), execution: new Set() };
  for (const record of observations) {
    if (!evidenceRecords.has(record)) { ignored.push('unverified_input'); continue; }
    if (record.thread_id !== currentThreadId) { conflicts.push('wrong_conversation'); continue; }
    if (!Number.isFinite(record.observed_at) || now - record.observed_at > 300000 || record.observed_at > now + 5000) {
      ignored.push('stale_or_future_evidence'); continue;
    }
    accepted.push(record);
    for (const key of Object.keys(collected)) if (record.facts[key] !== undefined) {
      if (!values[key].includes(record.facts[key])) conflicts.push(`invalid_${key}`);
      else collected[key].add(record.facts[key]);
    }
  }
  const facts = {};
  for (const [key, set] of Object.entries(collected)) {
    if (set.size > 1) conflicts.push(`conflicting_${key}`);
    facts[key] = set.size === 1 ? [...set][0] : 'unknown';
  }
  let session_type = facts.product === 'dot' ? 'dot' :
    ['codex', 'chatgpt'].includes(facts.product) && facts.orchestration !== 'unknown'
      ? `${facts.product}_${facts.orchestration}` : 'unknown';
  if (conflicts.length) session_type = 'unknown';
  return { session_type, ...facts, confidence: conflicts.length ? 'conflicting' : session_type === 'unknown' ? 'partial_or_unknown' : 'verified',
    evidence_scope: accepted.some(r => r.scope === 'simulation') ? 'simulation' : accepted.length ? 'live' : 'none',
    missing: Object.entries(facts).filter(([, value]) => value === 'unknown').map(([key]) => key),
    conflicts, ignored, sources: accepted.map(r => r.source) };
}

export function verifyReceiving({ target, detection, inbox, hostBinding, backend, scope = 'live', now = Date.now() }) {
  const missing = [];
  if (detection.conflicts.length) missing.push('conflicting_host_evidence');
  if (scope === 'live' && detection.evidence_scope === 'simulation') missing.push('simulated_host_evidence');
  if (!inbox?.authenticated || inbox.board !== target.board || inbox.receiver_id !== target.receiver_id)
    missing.push('authenticated_exact_inbox');
  if (!hostBinding || hostBinding.thread_id !== target.thread_id || hostBinding.board !== target.board ||
    hostBinding.receiver_id !== target.receiver_id || !hostBinding.enabled || !hostBinding.verified)
    missing.push('verified_exact_host_binding');
  if (!hostBinding?.unscheduled || hostBinding.cadence_minutes !== null) missing.push('event_only_host_trigger');
  if (scope === 'live' && hostBinding?.scope !== 'live') missing.push('live_host_binding');
  if (!backend?.notification_ready || backend.state !== 'ready' || backend.board !== target.board || backend.receiver_id !== target.receiver_id)
    missing.push('exact_backend_ready');
  const subscription = backend?.subscriptions?.find(s => s.id === hostBinding?.subscription_id);
  if (!subscription?.active || subscription.paused || subscription.expired || subscription.limited ||
    !Number.isFinite(Date.parse(subscription.refresh_before)) || Date.parse(subscription.refresh_before) <= now)
    missing.push('matching_active_unexpired_subscription');
  return { state: missing.length ? 'pending' : scope === 'fixture' ? 'pilot_ready' : 'incoming_ready', missing,
    production_ready: !missing.length && scope === 'live', transport: missing.length ? null : 'mcp_events',
    create_heartbeat: false, may_send_handshake: !missing.length && scope === 'live' };
}

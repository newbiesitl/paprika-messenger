import { realpathSync } from 'node:fs';
import { mkdir, open, readFile, rename, unlink, rmdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { digest, routingId, readJsonInput } from './prepare-delivery.mjs';

const fields = ['deployment', 'board', 'mode', 'key', 'sender_id', 'sender_thread_id',
  'recipient_id', 'recipient_thread_id', 'host_id', 'payload_digest', 'reference', 'transport'];
const states = ['submitting', 'submitted', 'failed', 'unknown', 'unavailable'];

function metadata(plan) {
  if (!plan || !['board', 'direct'].includes(plan.mode) || plan.transport !== 'native')
    throw new Error('Checkpoint only a prepared native delivery plan.');
  if (typeof plan.deployment !== 'string' || !plan.deployment.trim() || Buffer.byteLength(plan.deployment) > 300)
    throw new Error('Require the verified deployment identity.');
  routingId(plan.board, 'board', 64); routingId(plan.key, 'key');
  for (const field of ['sender_id', 'recipient_id']) routingId(plan[field], field);
  for (const field of ['sender_thread_id', 'recipient_thread_id']) routingId(plan[field], field, 160);
  if (plan.host_id !== undefined) routingId(plan.host_id, 'host_id', 160);
  if (!/^[a-f0-9]{64}$/.test(plan.payload_digest)) throw new Error('Require a prepared payload digest.');
  const reference = plan.mode === 'board' ? `New Paprika Messenger message on board ${plan.board}: ${plan.key}.`
    : `Paprika Messenger direct delivery: ${plan.key}.`;
  if (plan.reference !== reference) throw new Error('Invalid delivery reference.');
  if (plan.host_args && (digest(plan.host_args) !== plan.payload_digest || plan.host_args.threadId !== plan.recipient_thread_id
      || plan.host_args.hostId !== plan.host_id)) throw new Error('Prepared host arguments do not match checkpoint routing.');
  return Object.fromEntries(fields.filter(k => plan[k] !== undefined).map(k => [k, plan[k]]));
}

export class NotificationState {
  constructor(root = resolve('.paprika')) { this.root = resolve(root); }
  path(plan) {
    const m = metadata(plan);
    return resolve(this.root, m.mode === 'board' ? 'notifications' : 'direct', digest(m.deployment), m.board, `${m.key}.json`);
  }
  async read(plan) {
    let saved;
    try { saved = JSON.parse(await readFile(this.path(plan), 'utf8')); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      if (plan.mode !== 'board') return null;
      // Honor checkpoints written by the previous skill workflow. Never start
      // another send just because the newer helper uses a scoped directory.
      try { saved = JSON.parse(await readFile(resolve(this.root, 'notifications', `${plan.key}.json`), 'utf8')); }
      catch (legacyError) { if (legacyError.code === 'ENOENT') return null; throw legacyError; }
      if (saved.deployment !== plan.deployment || saved.board !== plan.board
          || saved.message_id !== plan.key || saved.recipient_id !== plan.recipient_id
          || saved.recipient_thread_id !== plan.recipient_thread_id || !states.includes(saved.state))
        throw new Error('Legacy checkpoint conflict: reconcile the existing delivery before migrating.');
      saved = {...metadata(plan), state: saved.state, attempt_id: saved.attempt_id,
        updated_at: saved.updated_at, ...(saved.state === 'submitted' ? {confirmation: {thread_id: plan.recipient_thread_id}} : {})};
    }
    const m = metadata(plan);
    if (fields.some(k => saved[k] !== m[k]) || !states.includes(saved.state))
      throw new Error('Checkpoint conflict: do not change the existing route, payload or transport.');
    return saved;
  }
  async update(plan, operation) {
    const path = this.path(plan), lock = `${path}.lock`;
    await mkdir(dirname(path), {recursive: true});
    try { await mkdir(lock); }
    catch (error) { if (error.code === 'EEXIST') throw new Error('Checkpoint is locked; reconcile before removing an abandoned lock.'); throw error; }
    try {
      const {next, action} = await operation(await this.read(plan));
      if (next) {
        // Rename in the same directory is atomic on Windows and Unix. Flush the
        // file before replacing the checkpoint; never expose a partially written JSON.
        const temp = `${path}.${randomUUID()}.tmp`;
        const file = await open(temp, 'wx', 0o600);
        try { await file.writeFile(JSON.stringify(next) + '\n'); await file.sync(); }
        finally { await file.close(); }
        try { await rename(temp, path); }
        finally { await unlink(temp).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
      }
      return {action, checkpoint: next ?? await this.read(plan), path};
    } finally { await rmdir(lock); }
  }
  async begin(plan, {available, retry = false} = {}) {
    if (typeof available !== 'boolean') throw new Error('Declare actual native host capability availability.');
    return this.update(plan, saved => {
      if (saved?.state === 'submitted') return {action: 'skip'};
      if (saved && ['submitting', 'unknown'].includes(saved.state)) return {action: 'reconcile'};
      if (saved?.state === 'failed' && !retry) return {action: 'failed'};
      const state = available ? 'submitting' : 'unavailable';
      return {action: available ? 'send' : 'unavailable', next: {...metadata(plan), state,
        attempt_id: randomUUID(), updated_at: new Date().toISOString()}};
    });
  }
  async record(plan, {attempt_id, state, confirmation} = {}) {
    if (!['submitted', 'failed', 'unknown'].includes(state)) throw new Error('Record a confirmed submission, explicit failure, or uncertain result.');
    if (state === 'submitted' && (!confirmation || confirmation.thread_id !== plan.recipient_thread_id))
      throw new Error('Require explicit host submission confirmation for the exact recipient.');
    return this.update(plan, saved => {
      if (!saved || saved.attempt_id !== attempt_id || saved.state !== 'submitting')
        throw new Error('Only the current submitting attempt can record its outcome.');
      return {action: state, next: {...saved, state, updated_at: new Date().toISOString(),
        ...(state === 'submitted' ? {confirmation: {thread_id: confirmation.thread_id}} : {})}};
    });
  }
  async reconcile(plan, {thread_id, reference, outcome, evidence_id} = {}) {
    if (thread_id !== plan.recipient_thread_id || reference !== plan.reference
        || !['found', 'not_found', 'inconclusive'].includes(outcome)) throw new Error('Require history evidence for this exact destination and delivery reference.');
    routingId(evidence_id, 'evidence_id', 160);
    return this.update(plan, saved => {
      if (!saved || !['submitting', 'unknown'].includes(saved.state)) throw new Error('Only an uncertain attempt needs history reconciliation.');
      // Absence from a summary or a page cannot prove non-submission. Never
      // permit an automatic retry just because a read or acknowledgment is absent.
      const state = outcome === 'found' ? 'submitted' : 'unknown';
      return {action: outcome === 'found' ? 'skip' : 'reconcile', next: {...saved, state,
        evidence: {thread_id, reference, outcome, evidence_id}, updated_at: new Date().toISOString()}};
    });
  }
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  try {
    const action = process.argv[2];
    if (process.argv.length !== 3 || !['begin', 'record', 'reconcile', 'status'].includes(action))
      throw new Error('Usage: node notification-state.mjs begin|record|reconcile|status < checkpoint-input.json');
    const {plan, ...options} = await readJsonInput();
    const state = new NotificationState();
    console.log(JSON.stringify(action === 'status' ? {checkpoint: await state.read(plan), path: state.path(plan)}
      : await state[action](plan, options)));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}

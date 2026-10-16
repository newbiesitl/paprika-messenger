import {mkdir, readFile, writeFile, rename, rm} from 'node:fs/promises';
import {resolve, dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
import {existsSync, realpathSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {deliveryPolicy, verifyReferencedMessage, hasLinkedMetadata} from './delivery-policy.mjs';
import {prepareBoardPost, prepareStoredDelivery, prepareDirectDelivery, validateRoutes,
  selectNotificationTransport, digest, routingId, readJsonInput} from './prepare-delivery.mjs';
import {NotificationState} from './notification-state.mjs';
export {deliveryPolicy, verifyReferencedMessage};

// Private outbound payload journal, separate from transcript-free delivery
// receipts. One shared root per deployment on this host; never put it in Git.
export class AdaptiveDelivery {
  constructor(root = resolve('.paprika')) { this.root = resolve(root); this.notifications = new NotificationState(this.root); }
  path({deployment, board, request_id}) {
    if (typeof deployment !== 'string' || !deployment.trim() || deployment.length > 300) throw Error('Require selected deployment identity.');
    routingId(board, 'board', 64); routingId(request_id, 'request_id');
    return resolve(this.root, 'outbound', digest(deployment), board, request_id + '.json');
  }
  async update(key, operation) {
    const path = this.path(key), lock = path + '.lock';
    await mkdir(dirname(path), {recursive:true, mode:0o700});
    try { await mkdir(lock, {mode:0o700}); }
    catch (error) { if (error.code === 'EEXIST') throw Error('Outbound operation locked; reconcile, do not discard its lock.'); throw error; }
    try {
      let state;
      try { state = JSON.parse(await readFile(path, 'utf8')); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
      const {next, output} = await operation(state);
      if (next) {
        const temporary = path + '.' + randomUUID() + '.tmp';
        await writeFile(temporary, JSON.stringify(next) + '\n', {flag:'wx',mode:0o600});
        await rename(temporary, path);
      }
      return output;
    } finally { await rm(lock, {recursive:true}); }
  }
  async start(input, env = process.env) {
    validateRoutes(input, env);
    const policy = deliveryPolicy(input.body, input.delivery_policy, input);
    const frozen = structuredClone(input);
    const fingerprint = digest(frozen);
    return this.update(input, state => {
      if (state && state.fingerprint !== fingerprint) throw Error('Outbound operation conflict: preserve original body, policy and route.');
      return {next:state ? null : {format:1, fingerprint, input:frozen, policy,
        transport:policy.mode === 'reference' ? (Array.isArray(input.subscriptions) ? selectNotificationTransport(input) : null) : 'native', phase:'prepared'},
        output:{status:state?.phase ?? 'prepared', policy:state?.policy ?? policy}};
    });
  }
  async next(key, {service_available = false, retrieval_available = false, native_available = false, retry_storage = false, subscriptions} = {}, env = process.env) {
    return this.update(key, async state => {
      if (!state || state.format !== 1) throw Error('Start the outbound operation before requesting an action.');
      const input = state.input;
      if (env.CODEX_THREAD_ID !== input.sender.thread_id) throw Error('Resume this operation in its original sending chat.');
      const blocked = (status, detail) => ({next:state,output:{status,detail,policy:state.policy}});
      if (state.policy.mode === 'inline' && hasLinkedMetadata(input)) return blocked('linked_operation_unreconciled','Legacy inline-linked operation preserved; reconcile any previous native submission before an explicit storage-first replacement. Do not change modes or resend.');
      if (!state.transport) {
        if (!Array.isArray(subscriptions)) return blocked('subscription_check_required','Read actual subscriptions before selecting one transport.');
        state.input.subscriptions=structuredClone(subscriptions);
        state.transport=selectNotificationTransport({recipient:input.recipient,subscriptions});
      }
      if (state.policy.mode === 'reference' && !state.plan) {
        if (!service_available || !retrieval_available) return blocked('setup_required','Selected service and recipient get_message capability must be available; task preserved, no inline fallback.');
        if (['storage_submitting','storage_unknown'].includes(state.phase) && !retry_storage)
          return blocked('storage_unconfirmed','Reconcile storage or intentionally retry the exact frozen idempotent post; no native send.');
        if (!state.post) {
          try { state.post = prepareBoardPost({...input,idempotency_key:input.idempotency_key ?? input.request_id}, {CODEX_THREAD_ID:input.sender.thread_id}); }
          catch (error) { return blocked('storage_payload_unsupported',error.message); }
        }
        state.phase = 'storage_submitting';
        return {next:state,output:{status:'store',transport:state.transport,policy:state.policy,
          tool:'post_message',arguments:state.post,call_once:true,retry_same_key_only:true}};
      }
      if (!state.plan) state.plan = prepareDirectDelivery(input, {CODEX_THREAD_ID:input.sender.thread_id});
      if (state.notification_conflict) return blocked('transport_changed','Storage reported an event or unknown route; reconcile before native notification.');
      if (state.transport === 'events') return blocked('stored_events_only','Existing recipient event route owns notification; no native send.');
      if (state.policy.mode === 'reference' && !Array.isArray(subscriptions)) return blocked('subscription_check_required','Refresh actual subscriptions before native notification.');
      if (state.policy.mode === 'reference' && subscriptions && selectNotificationTransport({recipient:input.recipient,subscriptions}) !== state.transport)
        return blocked('transport_changed','Reconcile the recipient subscription change; do not send via a second transport.');
      const attempt = await this.notifications.begin(state.plan, {available:native_available});
      state.phase = attempt.checkpoint.state;
      return {next:state,output:{status:attempt.action,policy:state.policy,attempt_id:attempt.checkpoint.attempt_id,
        ...(attempt.action === 'send' ? {tool:'mcp__codex_app__send_message_to_thread',arguments:state.plan.host_args} : {})}};
    });
  }
  async recordStorage(key, result) {
    return this.update(key, state => {
      if (!state || !['storage_submitting','storage_unknown'].includes(state.phase)) throw Error('No correlated storage operation is pending.');
      try {
        const message = verifyReferencedMessage({board:state.input.board,message_id:result?.message?.id,receiver_id:state.input.recipient.id,result});
        if (message.body !== state.post.body || message.sender_id !== state.input.sender.id
            || (message.reply_to_id ?? null) !== (state.post.reply_to_id ?? null)
            || (message.collaboration_id ?? null) !== (state.post.collaboration_id ?? null))
          throw Error('Storage confirmation conflicts with the exact frozen payload.');
        if (state.post.collaboration_id !== undefined && (!Number.isSafeInteger(message.handoff_depth) || !Number.isSafeInteger(message.handoff_limit)
          || message.handoff_depth < 1 || message.handoff_depth > message.handoff_limit || message.handoff_limit > 100))
          throw Error('Require server-confirmed handoff depth and limit before notification.');
        const plan = prepareStoredDelivery({...state.input,message}, {CODEX_THREAD_ID:state.input.sender.thread_id});
        if (plan.transport !== state.transport) throw Error('Storage transport conflicts with the frozen operation.');
        state.notification_conflict = state.transport === 'native' && result.notification && !['events_not_configured','subscription_required'].includes(result.notification.state);
        state.plan = plan; state.message_id = message.id; state.phase = 'stored';
        return {next:state,output:{status:'stored',message_id:message.id,transport:state.transport}};
      } catch (error) { state.phase = 'storage_unknown'; return {next:state,output:{status:'storage_unconfirmed',detail:error.message}}; }
    });
  }
  async recordNative(key, result) {
    return this.update(key, async state => {
      if (!state?.plan || state.transport !== 'native') throw Error('No native operation is pending.');
      const recorded = await this.notifications.record(state.plan,result);
      state.phase = recorded.checkpoint.state;
      return {next:state,output:{status:state.phase}};
    });
  }
  async reconcile(key, evidence) {
    return this.update(key, async state => {
      if (!state?.plan) throw Error('No native operation to reconcile.');
      const result = await this.notifications.reconcile(state.plan,evidence);
      state.phase = result.checkpoint.state;
      return {next:state,output:{status:state.phase}};
    });
  }
}

if (process.argv[1] && existsSync(process.argv[1]) && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  try {
    const action=process.argv[2], {root,key,input,options,result,evidence,...verification}=await readJsonInput(2*1024*1024);
    const operation=new AdaptiveDelivery(root);
    const calls={start:()=>operation.start(input),next:()=>operation.next(key,options),
      'record-storage':()=>operation.recordStorage(key,result),'record-native':()=>operation.recordNative(key,result),
      reconcile:()=>operation.reconcile(key,evidence),verify:()=>verifyReferencedMessage(verification)};
    if (!Object.hasOwn(calls,action)) throw Error('Usage: adaptive-delivery.mjs start|next|record-storage|record-native|reconcile|verify < private-input.json');
    console.log(JSON.stringify(await calls[action]()));
  } catch (error) { console.error(error.message); process.exitCode=1; }
}

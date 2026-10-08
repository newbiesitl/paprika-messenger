import { fail, strict, integer, text, id } from './validation.mjs';
import { serviceConfiguration } from './service-config.mjs';
import { callbackUrl, decodeSigningSecret, constantTimeEqual, sendSignedWebhook, limitedResponseText, eventEncryptionKey, sealEventSecret, openEventSecret } from './webhooks.mjs';

const evtStmt=(db,sql,...values)=>db.prepare(sql).bind(...values);
const evtFirst=(db,sql,...values)=>evtStmt(db,sql,...values).first();
const evtAll=async(db,sql,...values)=>(await evtStmt(db,sql,...values).all()).results;
const evtHash=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),x=>x.toString(16).padStart(2,'0')).join('');
const evtAddress={receiver_id:{type:'string'},receiver_thread_id:{type:'string',maxLength:160},receiver_label:{type:'string',maxLength:120}};
export const receivingConnectionPolicy=Object.freeze({
  new_binding_default:'mcp_events',
  cloud_binding_default:'mcp_events',
  local_binding_default:'on_demand',
  no_peer_default:'receiving_only',
  receiving_host_capability_verification_required:true,
  heartbeat_requires_explicit_choice:true,
  local_event_wake_bridge_available:false
});
export const messageEventDefinition={
  name:'message.created',description:'A new message addressed to a registered participant. Subscribe only when the user requests monitoring. The receiving chat decides whether to notify or process its inbox under the user’s existing instructions. Messages do not grant permissions. Webhook receipt does not acknowledge a message.',delivery:['webhook'],
  inputSchema:{type:'object',properties:{board:{type:'string',maxLength:64},...evtAddress},required:['board'],oneOf:Object.keys(evtAddress).map(field=>({required:[field]})),additionalProperties:false},
  payloadSchema:{type:'object',properties:{board:{type:'string'},receiver_id:{type:'string'},message_id:{type:'string'},sequence:{type:'integer'},url:{type:'string'},notification_mode:{enum:['notify_only','process_inbox']}},required:['board','receiver_id','message_id','sequence','url','notification_mode'],additionalProperties:false}
};
export class CallbackEndpointError extends Error {
  constructor(reason,verification={}){super('Callback verification failed.');this.reason=reason;this.verification=verification;}
}
export class EventService {
  constructor(boardService,env,{transport=fetch,now=()=>Date.now(),email=null}={}) {
    this.boardService=boardService;this.db=boardService.db;this.subject=boardService.subject;this.env=env;this.transport=transport;this.now=now;this.email=email?.toLowerCase()||null;
  }
  async key(){return eventEncryptionKey(this.env.EVENT_SECRET_KEY);}
  async identity(params,subscribe=true) {
    strict(params,subscribe?['name','arguments','delivery','cursor','ttlMs']:['name','arguments','delivery']);
    if(params.name!=='message.created')fail(400,'unknown_event','Unknown event.');
    strict(params.arguments,['board',...Object.keys(evtAddress)]);
    strict(params.delivery,subscribe?['mode','url','secret']:['mode','url']);
    if(params.delivery.mode!=='webhook')fail(400,'invalid_delivery','Only webhook delivery is supported.');
    const board=await this.boardService.board(params.arguments.board);
    const receiver=(await this.boardService.resolveAddress(board,params.arguments,Object.keys(evtAddress))).participant.id;
    const url=callbackUrl(params.delivery.url),args=JSON.stringify({board,receiver_id:receiver});
    const subscriptionId=`sub_${await evtHash(JSON.stringify([this.subject,url,params.name,args]))}`;
    return {board,receiver,url,args,subscriptionId};
  }
  async list(params={}) {
    strict(params,['cursor']);if(params.cursor)fail(400,'invalid_cursor','Unknown event catalog cursor.');
    // The authenticated catalog contains schema metadata only. Delivery readiness
    // is checked by setup/subscribe and must not hide events during installation.
    return {events:[messageEventDefinition]};
  }
  async subscribe(params) {
    const {board,receiver,url,args,subscriptionId}=await this.identity(params),key=await this.key();
    if(params.cursor!==undefined && params.cursor!==null)fail(400,'invalid_cursor','This event does not provide protocol replay; use the durable inbox to recover earlier messages.');
    const secret=params.delivery.secret;decodeSigningSecret(secret);
    const ttl=params.ttlMs===null?86400000:integer(params.ttlMs,'ttlMs',1000,Number.MAX_SAFE_INTEGER,3600000);
    const lifetime=Math.min(ttl,86400000),started=this.now();
    const old=await evtFirst(this.db,'SELECT * FROM event_subscriptions WHERE id=? AND owner_subject=?',subscriptionId,this.subject);
    if((!old || !old.active) && (await evtFirst(this.db,'SELECT COUNT(*) AS count FROM event_subscriptions WHERE active=1')).count>=100)fail(409,'subscription_limit','This private instance supports at most 100 active subscriptions.');
    // Capture before verification so a message committed during the challenge is
    // included. A refresh of an active subscription preserves existing progress.
    const start=(await evtFirst(this.db,'SELECT COALESCE(MAX(sequence),0) AS sequence FROM events WHERE board=?',board)).sequence;
    let oldSecret=null;
    if(old?.secret_box)oldSecret=await openEventSecret(key,subscriptionId,old.secret_box);
    const cached=old?.active && old.expires_at>started && old.verified_at>started-60000 && constantTimeEqual(oldSecret,secret);
    if(!cached) {
      const challenge=crypto.randomUUID(),body=JSON.stringify({type:'verification',challenge});
      let response;
      try {
        response=await sendSignedWebhook(url,subscriptionId,[secret],`verification_${crypto.randomUUID()}`,body,started,this.transport);
        if(!response.ok)throw new CallbackEndpointError('challenge_failed',{failure:'http_status',http_status:response.status});
        let echoed;
        try {echoed=JSON.parse(await limitedResponseText(response));}
        catch {throw new CallbackEndpointError('challenge_failed',{failure:'invalid_response',http_status:response.status});}
        if(typeof echoed?.challenge!=='string' || echoed.challenge.length>256 || !constantTimeEqual(echoed.challenge,challenge))throw new CallbackEndpointError('challenge_failed',{failure:'challenge_mismatch',http_status:response.status});
        if(this.now()-started>10000)throw new CallbackEndpointError('timeout',{failure:'late_response',http_status:response.status});
      } catch(error) {
        if(error instanceof CallbackEndpointError)throw error;
        const timeout=['TimeoutError','AbortError'].includes(error?.name);
        throw new CallbackEndpointError(timeout?'timeout':'challenge_failed',{failure:timeout?'timeout':'transport'});
      } finally { await response?.body?.cancel().catch(()=>{}); }
    }
    const now=this.now(),expires=now+lifetime,box=await sealEventSecret(key,subscriptionId,secret);
    const continuing=old?.active && old.expires_at>now;
    const previous=continuing && oldSecret!==secret?old.secret_box:(old?.rotate_until>now?old.previous_secret_box:null);
    const rotateUntil=continuing && oldSecret!==secret?now+300000:(previous?old.rotate_until:0);
    await this.db.batch([
      evtStmt(this.db,"UPDATE event_deliveries SET state='cancelled',last_error='subscription_replaced',lease_token=NULL,lease_until=0 WHERE subscription_id=? AND state='pending' AND EXISTS(SELECT 1 FROM event_subscriptions s WHERE s.id=? AND (s.active=0 OR s.expires_at<=?))",subscriptionId,subscriptionId,now),
      evtStmt(this.db,`INSERT INTO event_subscriptions(id,board,receiver_id,owner_subject,owner_email,event_name,arguments_json,callback_url,secret_box,previous_secret_box,rotate_until,expires_at,active,paused,notification_mode,wake_limit,window_start,wake_count,verified_at,scanned_sequence,created_at)
        VALUES(?,?,?,?,?,'message.created',?,?,?,?,?,?,1,0,'notify_only',30,?,0,?,?,?)
        ON CONFLICT(id) DO UPDATE SET secret_box=excluded.secret_box,previous_secret_box=excluded.previous_secret_box,rotate_until=excluded.rotate_until,expires_at=excluded.expires_at,active=1,owner_email=excluded.owner_email,verified_at=excluded.verified_at,
          scanned_sequence=CASE WHEN event_subscriptions.active=1 AND event_subscriptions.expires_at>? THEN event_subscriptions.scanned_sequence ELSE excluded.scanned_sequence END`,
        subscriptionId,board,receiver,this.subject,this.email,args,url,box,previous,rotateUntil,expires,now,now,start,now,now)
    ]);
    await this.reconcile();
    return {id:subscriptionId,refreshBefore:new Date(expires).toISOString(),cursor:null,truncated:false};
  }
  async unsubscribe(params) {
    const {subscriptionId}=await this.identity(params,false);
    await this.db.batch([
      evtStmt(this.db,'UPDATE event_subscriptions SET active=0 WHERE id=? AND owner_subject=?',subscriptionId,this.subject),
      evtStmt(this.db,"UPDATE event_deliveries SET state='cancelled',last_error='unsubscribed',lease_token=NULL,lease_until=0 WHERE subscription_id=? AND state='pending' AND EXISTS(SELECT 1 FROM event_subscriptions WHERE id=? AND owner_subject=?)",subscriptionId,subscriptionId,this.subject)
    ]);
    return {};
  }
  async listSubscriptions(a) {
    strict(a,['board']);const board=await this.boardService.board(a.board);
    const subscriptions=await evtAll(this.db,`SELECT id,board,receiver_id,active,paused,notification_mode,wake_limit,expires_at FROM event_subscriptions WHERE board=? AND owner_subject=? ORDER BY created_at DESC LIMIT 100`,board,this.subject);
    return {subscriptions:subscriptions.map(s=>({...s,active:!!s.active,paused:!!s.paused,refresh_before:new Date(s.expires_at).toISOString()}))};
  }
  async setup(a) {
    strict(a,['board',...Object.keys(evtAddress)]);
    const board=await this.boardService.board(a.board);
    const receiver=(await this.boardService.resolveAddress(board,a,Object.keys(evtAddress))).participant.id;
    let runtimeConfigured=true;
    try {await this.key();}catch(error){if(error?.code!=='events_not_configured')throw error;runtimeConfigured=false;}
    const now=this.now(),rows=await evtAll(this.db,'SELECT * FROM event_subscriptions WHERE board=? AND receiver_id=? AND owner_subject=? ORDER BY created_at DESC',board,receiver,this.subject);
    const subscriptions=rows.map(s=>({id:s.id,active:!!s.active && s.expires_at>now && this.ownerAllowed(s),paused:!!s.paused,expired:s.expires_at<=now,limited:s.window_start>now-3600000 && s.wake_count>=s.wake_limit,notification_mode:s.notification_mode,refresh_before:new Date(s.expires_at).toISOString()}));
    const active=subscriptions.filter(s=>s.active);
    const state=!runtimeConfigured?'events_not_configured':!active.length?'subscription_required':active.some(s=>!s.paused && !s.limited)?'ready':active.every(s=>s.paused)?'paused':'limited';
    return {board,receiver_id:receiver,state,runtime_configured:runtimeConfigured,notification_ready:state==='ready',subscriptions,
      event:{name:'message.created',arguments:{board,receiver_id:receiver}},
      ...serviceConfiguration(this.env),
      connection_policy:receivingConnectionPolicy,
      next_step:state==='subscription_required'?'Check this receiving chat\u2019s execution mode when host metadata exposes it; verify receiving capability through the exact same-chat event task, callback and subscription when mode is unreported. On a supported receiving host, reconcile matching tasks and establish an unscheduled MCP event task for message.created using these exact filters, bound to that conversation. Local execution defaults to receiving only with on-demand inbox reads, no hook or schedule, and no receiving-method question. A missing event subscription is expected for that route. Explicit Cloud/events requests remain pending until a supported cloud route is verified; preserve that choice. Any new heartbeat requires an explicit inbox-check or interval choice. The host supplies and verifies its callback; events/subscribe is a protocol method, not necessarily a visible tool. Verify the saved host task and re-read this exact receiver setup for ready before confirming incoming delivery. A generic scheduler cannot substitute. If the event source is missing, inspect the existing connection\u2019s discovery status; use Refresh or Rescan only if that connection exposes it.':state==='events_not_configured'?'Configure the event runtime secret on this existing private service only when enabling event receiving. On-demand inbox reads need no event runtime or subscription.':state==='paused'?'Resume the existing receiver subscription when requested.':state==='limited'?'Delivery will wait for the existing hourly attempt budget.':'Verify the saved receiving task\u2019s exact conversation and filters, then test webhook acceptance, wake, fetch, display and acknowledgment separately.'};
  }
  async configure(a) {
    strict(a,['subscription_id','paused','notification_mode','wake_limit']);id(a.subscription_id,'subscription_id',80);
    const row=await evtFirst(this.db,'SELECT * FROM event_subscriptions WHERE id=? AND owner_subject=?',a.subscription_id,this.subject);
    if(!row)fail(404,'subscription_not_found','Subscription not found for this account.');
    if(a.paused!==undefined && typeof a.paused!=='boolean')fail(400,'invalid_argument','paused must be a boolean.');
    if(a.notification_mode!==undefined && !['notify_only','process_inbox'].includes(a.notification_mode))fail(400,'invalid_argument','Unknown notification mode.');
    const budget=integer(a.wake_limit,'wake_limit',1,100,a.wake_limit===undefined?row.wake_limit:undefined);
    await evtStmt(this.db,'UPDATE event_subscriptions SET paused=?,notification_mode=?,wake_limit=? WHERE id=? AND owner_subject=?',a.paused===undefined?row.paused:Number(a.paused),a.notification_mode??row.notification_mode,budget,row.id,this.subject).run();
    return {subscription_id:row.id,paused:a.paused??!!row.paused,notification_mode:a.notification_mode??row.notification_mode,wake_limit:budget};
  }
  async status(a) {
    strict(a,['board','message_id']);const board=await this.boardService.board(a.board),message=await this.boardService.message(board,a.message_id);
    const deliveries=await evtAll(this.db,`SELECT d.subscription_id,d.state,d.attempts,d.next_attempt,d.http_status,d.last_error,d.accepted_at FROM event_deliveries d JOIN event_subscriptions s ON s.id=d.subscription_id JOIN events e ON e.sequence=d.event_sequence WHERE e.board=? AND e.entity_id=? AND s.owner_subject=? ORDER BY d.subscription_id`,board,message.id,this.subject);
    const acknowledgment=await evtFirst(this.db,'SELECT acknowledged_at FROM acknowledgments WHERE board=? AND message_id=? AND participant_id=?',board,message.id,message.receiver_id);
    const setup=await this.setup({board,receiver_id:message.receiver_id});
    const state=deliveries.some(d=>d.state==='accepted')?'accepted':deliveries.some(d=>d.state==='pending')?'pending':deliveries.some(d=>d.state==='failed')?'failed':deliveries.length?'cancelled':setup.state==='ready'?'not_queued':setup.state;
    return {message_id:message.id,stored:true,deliveries,participant_acknowledged:!!acknowledgment,acknowledged_at:acknowledgment?.acknowledged_at||null,
      notification:{state,receiver_id:message.receiver_id,receiver_ready:setup.notification_ready,next_step:state==='not_queued'?'This message has no queued event; subscriptions monitor new messages. Recover it through the inbox.':setup.next_step}};
  }
  ownerAllowed(subscription) {
    return this.env.OWNER_USER_ID?subscription.owner_subject===this.env.OWNER_USER_ID:!!this.env.OWNER_EMAIL && subscription.owner_email===this.env.OWNER_EMAIL.toLowerCase();
  }
  async reconcile() {
    const now=this.now(),subscriptions=await evtAll(this.db,'SELECT * FROM event_subscriptions WHERE active=1 ORDER BY id LIMIT 100');
    for(const subscription of subscriptions) {
      if(subscription.expires_at<=now || !this.ownerAllowed(subscription)) {
        await this.db.batch([
          evtStmt(this.db,'UPDATE event_subscriptions SET active=0 WHERE id=?',subscription.id),
          evtStmt(this.db,"UPDATE event_deliveries SET state='cancelled',last_error=?,lease_token=NULL,lease_until=0 WHERE subscription_id=? AND state='pending'",subscription.expires_at<=now?'expired':'access_revoked',subscription.id)
        ]);continue;
      }
      const watermark=(await evtFirst(this.db,'SELECT COALESCE(MAX(sequence),0) AS sequence FROM events WHERE board=?',subscription.board)).sequence;
      await this.db.batch([
        evtStmt(this.db,`INSERT INTO event_deliveries(subscription_id,event_sequence,event_id,state,next_attempt,created_at)
          SELECT ?,e.sequence,'evt_'||e.entity_id||'_'||?||'_'||e.sequence,'pending',?,? FROM events e
          WHERE e.board=? AND e.kind='message_posted' AND e.receiver_id=? AND e.sequence>? AND e.sequence<=?
            AND EXISTS(SELECT 1 FROM event_subscriptions s WHERE s.id=? AND s.active=1 AND s.expires_at>?)
          ON CONFLICT(subscription_id,event_sequence) DO NOTHING`,subscription.id,subscription.id.slice(4,24),now,now,subscription.board,subscription.receiver_id,subscription.scanned_sequence,watermark,subscription.id,now),
        evtStmt(this.db,'UPDATE event_subscriptions SET scanned_sequence=MAX(scanned_sequence,?) WHERE id=?',watermark,subscription.id)
      ]);
    }
  }
  async dispatch(limit=10) {
    integer(limit,'limit',1,20);const key=await this.key();await this.reconcile();
    const started=this.now();let attempted=0,accepted=0,failed=0;
    for(let i=0;i<limit && this.now()-started<20000;i++) {
      const now=this.now();
      const candidate=await evtFirst(this.db,`SELECT d.subscription_id,d.event_sequence FROM event_deliveries d JOIN event_subscriptions s ON s.id=d.subscription_id
        WHERE d.state='pending' AND d.next_attempt<=? AND d.lease_until<=? AND s.active=1 AND s.paused=0 AND s.expires_at>?
          AND (s.window_start<=? OR s.wake_count<s.wake_limit) ORDER BY d.next_attempt,d.event_sequence LIMIT 1`,now,now,now,now-3600000);
      if(!candidate)break;
      const token=crypto.randomUUID();
      await this.db.batch([
        evtStmt(this.db,`UPDATE event_deliveries SET lease_token=?,lease_until=?,attempts=attempts+1 WHERE subscription_id=? AND event_sequence=? AND state='pending' AND lease_until<=? AND next_attempt<=?
          AND EXISTS(SELECT 1 FROM event_subscriptions s WHERE s.id=event_deliveries.subscription_id AND s.active=1 AND s.paused=0 AND s.expires_at>? AND (s.window_start<=? OR s.wake_count<s.wake_limit))`,token,now+30000,candidate.subscription_id,candidate.event_sequence,now,now,now,now-3600000),
        evtStmt(this.db,`UPDATE event_subscriptions SET wake_count=CASE WHEN window_start<=? THEN 1 ELSE wake_count+1 END,window_start=CASE WHEN window_start<=? THEN ? ELSE window_start END
          WHERE id=? AND EXISTS(SELECT 1 FROM event_deliveries d WHERE d.subscription_id=? AND d.event_sequence=? AND d.lease_token=?)`,now-3600000,now-3600000,now,candidate.subscription_id,candidate.subscription_id,candidate.event_sequence,token)
      ]);
      const delivery=await evtFirst(this.db,`SELECT d.*,s.board,s.receiver_id,s.owner_subject,s.owner_email,s.callback_url,s.secret_box,s.previous_secret_box,s.rotate_until,s.expires_at,s.active,s.paused,s.notification_mode,e.entity_id,e.occurred_at
        FROM event_deliveries d JOIN event_subscriptions s ON s.id=d.subscription_id JOIN events e ON e.sequence=d.event_sequence WHERE d.lease_token=?`,token);
      if(!delivery)continue;
      // Recheck lifecycle, access and inbox state immediately before each send.
      const visible=await evtFirst(this.db,`SELECT id FROM messages m WHERE m.id=? AND m.board=? AND m.deleted_at IS NULL AND NOT EXISTS(SELECT 1 FROM acknowledgments a WHERE a.board=m.board AND a.message_id=m.id AND a.participant_id=m.receiver_id)`,delivery.entity_id,delivery.board);
      if(!delivery.active || delivery.paused || delivery.expires_at<=this.now() || !this.ownerAllowed(delivery) || !visible) {
        await this.finish(delivery,token,'cancelled',null,'no_longer_eligible');continue;
      }
      const chain=await evtFirst(this.db,`WITH RECURSIVE chain(id,reply_to_id,depth) AS (
        SELECT id,reply_to_id,0 FROM messages WHERE board=? AND id=?
        UNION ALL SELECT m.id,m.reply_to_id,c.depth+1 FROM messages m JOIN chain c ON m.id=c.reply_to_id WHERE m.board=? AND c.depth<8
      ) SELECT MAX(depth) AS depth FROM chain`,delivery.board,delivery.entity_id,delivery.board);
      if(chain.depth>=8){await this.finish(delivery,token,'cancelled',null,'handoff_limit');continue;}
      attempted++;
      let status=null,error='network_error',response;
      try {
        const secrets=[await openEventSecret(key,delivery.subscription_id,delivery.secret_box)];
        if(delivery.previous_secret_box && delivery.rotate_until>this.now())secrets.push(await openEventSecret(key,delivery.subscription_id,delivery.previous_secret_box));
        const url=new URL('/',this.env.SITE_ORIGIN);url.searchParams.set('board',delivery.board);url.searchParams.set('receiver',delivery.receiver_id);url.searchParams.set('message',delivery.entity_id);
        const body=JSON.stringify({eventId:delivery.event_id,name:'message.created',timestamp:delivery.occurred_at,data:{board:delivery.board,receiver_id:delivery.receiver_id,message_id:delivery.entity_id,sequence:delivery.event_sequence,url:url.href,notification_mode:delivery.notification_mode},cursor:null});
        response=await sendSignedWebhook(delivery.callback_url,delivery.subscription_id,secrets,delivery.event_id,body,this.now(),this.transport);status=response.status;
        if(response.ok){accepted++;await this.finish(delivery,token,'accepted',status,null);continue;}
        error=`http_${status}`;
      } catch(cause) { error=['TimeoutError','AbortError'].includes(cause?.name)?'timeout':cause?.code==='invalid_callback'?'invalid_callback':'network_error'; }
      finally {await response?.body?.cancel().catch(()=>{});}
      const retryable=(status===null && error!=='invalid_callback') || [408,425,429].includes(status) || status>=500;
      if(status===410 || status===401 || status===403) {
        await evtStmt(this.db,'UPDATE event_subscriptions SET active=0 WHERE id=?',delivery.subscription_id).run();
        await evtStmt(this.db,"UPDATE event_deliveries SET state='cancelled',last_error='callback_revoked',lease_token=NULL,lease_until=0 WHERE subscription_id=? AND state='pending' AND lease_token IS NULL",delivery.subscription_id).run();
      }
      if(retryable && delivery.attempts<8) {
        const retryAfter=response?.headers.get('retry-after');
        const serverDelay=retryAfter?(Number.isFinite(Number(retryAfter))?Number(retryAfter)*1000:Date.parse(retryAfter)-this.now()):0;
        const delay=Math.min(900000,Math.max(1000,1000*2**delivery.attempts,Number.isFinite(serverDelay)?serverDelay:0));
        await evtStmt(this.db,"UPDATE event_deliveries SET next_attempt=?,http_status=?,last_error=?,lease_token=NULL,lease_until=0 WHERE subscription_id=? AND event_sequence=? AND lease_token=? AND state='pending'",this.now()+delay,status,error,delivery.subscription_id,delivery.event_sequence,token).run();
      } else {failed++;await this.finish(delivery,token,'failed',status,error);}
    }
    const pending=(await evtFirst(this.db,"SELECT COUNT(*) AS count FROM event_deliveries WHERE state='pending'")).count;
    return {attempted,accepted,failed,pending};
  }
  async finish(delivery,token,state,status,error) {
    await evtStmt(this.db,"UPDATE event_deliveries SET state=?,http_status=?,last_error=?,accepted_at=?,lease_token=NULL,lease_until=0 WHERE subscription_id=? AND event_sequence=? AND lease_token=? AND state='pending'",state,status,error,state==='accepted'?this.now():null,delivery.subscription_id,delivery.event_sequence,token).run();
  }
}

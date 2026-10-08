import { assets, skillEntries, skillResources, uiResources } from './assets.mjs';
import { BoardService, authorize } from './service.mjs';
import { BoardError, fail } from './validation.mjs';
import { rpc, tools, addNotificationStatus } from './protocol.mjs';
import { EventService } from './events.mjs';
import { maintenanceTokenDigest, constantTimeEqual, callbackRejectionDetails } from './webhooks.mjs';
import { connectionControls } from './connection-ui.mjs';

const headers = {
  'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff', 'Referrer-Policy':'no-referrer',
  'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
  'Permissions-Policy':'camera=(), microphone=(), geolocation=()'
};
const json = (value,status=200) => new Response(JSON.stringify(value),{status,headers:{...headers,'Content-Type':'application/json; charset=utf-8'}});
function traceEventProtocol(method,status,result=null,error=null,parameters=null) {
  if(!['server/discover','initialize','events/list','events/subscribe','events/unsubscribe'].includes(method))return;
  // Diagnose real discovery and subscription attempts without recording identities,
  // filter arguments, full callback URLs, signing secrets or message bodies.
  console.info(JSON.stringify({component:'paprika-mcp-events',method,http_status:status,
    ...(result?.error?{rpc_error:result.error.code,rpc_reason:result.error.data?.reason}:{}),...(error?{error}:{}),
    ...(result?.error?.code===-32015?{verification_failure:result.error.data.verification?.failure,...(Number.isInteger(result.error.data.verification?.http_status)?{verification_http_status:result.error.data.verification.http_status}:{})}:{}),
    ...(['events/subscribe','events/unsubscribe'].includes(method) && result?.error?.data?.reason==='invalid_callback'?callbackRejectionDetails(parameters?.delivery?.url):{}),
    ...(method==='events/list' && parameters && typeof parameters==='object' && !Array.isArray(parameters)?{
      request_metadata_present:Object.hasOwn(parameters,'_meta'),cursor_present:Object.hasOwn(parameters,'cursor'),
      other_parameter_count:Object.keys(parameters).filter(key=>!['_meta','cursor'].includes(key)).length}:{}),
    ...(result?.result?.capabilities?{events_advertised:!!result.result.capabilities.events}:{}),
    ...(Array.isArray(result?.result?.events)?{event_count:result.result.events.length}:{}),
    ...(result?.result?.protocolVersion?{protocol_version:result.result.protocolVersion}:{}),
    ...(result?.result?.serverInfo?{server_version:result.result.serverInfo.version}:{})}));
}
function isCoordinator(request,env,subject) {
  return env.COORDINATOR_USER_ID ? subject===env.COORDINATOR_USER_ID : !!env.COORDINATOR_EMAIL && request.headers.get('oai-authenticated-user-email')?.toLowerCase()===env.COORDINATOR_EMAIL.toLowerCase();
}
async function readJson(request) {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) fail(415,'json_required','Use application/json.');
  const reader = request.body?.getReader();
  if (!reader) fail(400,'invalid_json','Request body is required.');
  let size=0; const chunks=[];
  while (true) {
    const {value,done} = await reader.read(); if (done) break;
    size+=value.length; if (size>32768) { await reader.cancel(); fail(413,'request_too_large','Request exceeds 32 KiB.'); }
    chunks.push(value);
  }
  const bytes=new Uint8Array(size); let offset=0;
  for (const chunk of chunks) { bytes.set(chunk,offset); offset+=chunk.length; }
  try { return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)); } catch { fail(400,'invalid_json','Request is not valid UTF-8 JSON.'); }
}
export async function handle(request,env,ctx={}) {
  let eventMethod=null;
  try {
    const url=new URL(request.url), origin=request.headers.get('origin');
    const expected=env.SITE_ORIGIN || url.origin;
    if (origin && origin!==expected) fail(403,'origin_denied','Origin is not allowed.');
    const path=url.pathname;
    if(path==='/api/event-dispatch') {
      // A maintenance-only endpoint behind the owner-private Sites access gate.
      // Sites service access supplies no visitor identity and is NEVER used to
      // authorize data tools. The endpoint returns aggregate counts only.
      if(request.method!=='POST')return json({error:'method_not_allowed'},405);
      if(env.EVENT_DISPATCH_PRIVATE_GATE!=='owner-private' || !env.EVENT_SECRET_KEY || !env.EVENT_DISPATCH_TOKEN_HASH || !env.DB)fail(503,'events_not_configured','Private event maintenance is not configured.');
      const serviceToken=request.headers.get('x-paprika-maintenance-token');
      if(!serviceToken || serviceToken.length>2048 || !constantTimeEqual(await maintenanceTokenDigest(serviceToken),env.EVENT_DISPATCH_TOKEN_HASH))fail(401,'maintenance_authentication_required','Use the configured private Sites service credential.');
      if(request.headers.get('oai-authenticated-user-id'))authorize(request,env);
      const args=await readJson(request);
      if(!args || typeof args!=='object' || Array.isArray(args) || Object.keys(args).length)fail(400,'invalid_argument','Maintenance takes an empty object.');
      const db=env.DB.withSession?env.DB.withSession('first-primary'):env.DB;
      return json(await new EventService(new BoardService(db,null,env),env).dispatch());
    }
    if (path==='/mcp') {
      if (request.method!=='POST') return new Response(null,{status:405,headers:{...headers,Allow:'POST'}});
      const payload=await readJson(request);
      eventMethod=payload?.method;
      // Discovery carries no private data. Every tool call checks verified owner identity.
      const isData=payload?.method==='tools/call' || (typeof payload?.method==='string' && payload.method.startsWith('events/'));
      const subject=isData ? authorize(request,env) : null;
      if (isData && !env.DB) fail(503,'storage_unavailable','Durable storage is unavailable.');
      const service=isData ? new BoardService(env.DB.withSession ? env.DB.withSession('first-primary') : env.DB,subject,env) : null;
      const events=env.EVENT_SECRET_KEY ? (service?new EventService(service,env,{email:request.headers.get('oai-authenticated-user-email')}):{}) : null;
      const result=await rpc(payload,service,{entries:skillEntries,resources:skillResources},events,uiResources);
      traceEventProtocol(eventMethod,200,result,null,payload.params);
      if(events && service && ((payload.method==='tools/call' && payload.params?.name==='post_message' && !result?.result?.isError) || (payload.method==='events/subscribe' && result?.result))) {
        const delivery=events.dispatch().catch(()=>console.error('Paprika event dispatch deferred'));
        if(ctx.waitUntil)ctx.waitUntil(delivery);else await delivery;
      }
      return result===null ? new Response(null,{status:202,headers}) : json(result);
    }
    if (path.startsWith('/api/')) {
      const subject=authorize(request,env);
      if (!env.DB) fail(503,'storage_unavailable','Durable storage is unavailable.');
      const service=new BoardService(env.DB.withSession ? env.DB.withSession('first-primary') : env.DB,subject,env);
      if (path==='/api/session' && request.method==='GET') return json({authenticated:true,can_coordinate:isCoordinator(request,env,subject),identity_kind:'account',participant_identity_kind:'declared_label'});
      if (request.method!=='POST') return json({error:'method_not_allowed'},405);
      if (origin!==expected || request.headers.get('x-dot-board')!=='1') fail(403,'csrf_denied','Use the same-origin board UI.');
      const args=await readJson(request);
      if (path==='/api/coordination') {
        if (!isCoordinator(request,env,subject)) fail(403,'coordinator_required','Only the configured coordinator may edit the note.');
        return json(await service.updateCoordination(args));
      }
      const name=path.slice('/api/'.length);
      if (!tools.some(t=>t.name===name)) fail(404,'not_found','Unknown operation.');
      const events=env.EVENT_SECRET_KEY?new EventService(service,env,{email:request.headers.get('oai-authenticated-user-email')}):null;
      const eventTools={list_event_subscriptions:'listSubscriptions',configure_event_subscription:'configure',get_delivery_status:'status'};
      let result;
      if(name==='get_notification_setup')result=await (events??new EventService(service,env)).setup(args);
      else if(name==='show_connection_controls')result=await connectionControls(service,events,args);
      else if(eventTools[name]){if(!events && name==='configure_event_subscription')fail(503,'events_not_configured','Events are not configured.');result=await (events??new EventService(service,env))[eventTools[name]](args);}
      else if(name==='process_event_deliveries'){if(!events)fail(503,'events_not_configured','Events are not configured.');if(Object.keys(args).some(k=>k!=='limit'))fail(400,'invalid_argument','Unknown dispatch argument.');result=await events.dispatch(args.limit??10);}
      else result=await service[name](args);
      if(name==='post_message')result=await addNotificationStatus(result,events);
      if(name==='post_message' && events){const delivery=events.dispatch().catch(()=>console.error('Paprika event dispatch deferred'));if(ctx.waitUntil)ctx.waitUntil(delivery);else await delivery;}
      return json(result);
    }
    const asset=assets[path];
    if (asset && (request.method==='GET' || request.method==='HEAD')) {
      authorize(request,env); // Hosting also enforces the private audience.
      return new Response(request.method==='HEAD' ? null : asset.body,{headers:{...headers,'Content-Type':asset.type}});
    }
    return json({error:'not_found'},404);
  } catch(error) {
    if (error instanceof BoardError) {traceEventProtocol(eventMethod,error.status,null,error.code);return json({error:error.code,message:error.message},error.status);}
    traceEventProtocol(eventMethod,503,null,'service_failure');
    // Do not log message contents, SQL parameter values or account credentials.
    console.error('Paprika request failed',error?.name || 'Error');
    return json({error:'service_failure',message:'The write or read could not be confirmed. Retry safely.'},503);
  }
}
export default {fetch:handle};

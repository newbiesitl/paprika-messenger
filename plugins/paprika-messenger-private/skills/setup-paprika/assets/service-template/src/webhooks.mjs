import { fail } from './validation.mjs';

// Sites fetch cannot pin a resolved address while retaining TLS SNI. Accordingly
// this adapter accepts only these fixed, trusted platform origins: no arbitrary
// user-controlled host, IP literal, configurable wildcard, or redirect.
// The connectors origin was observed in authenticated ChatGPT subscription
// requests. Keep exact hosts; a subdomain wildcard would widen the fetch surface.
export const platformCallbackHosts = new Set(['chatgpt.com','api.openai.com','connectors.api.openai.com']);
function inspectCallbackUrl(value) {
  if(typeof value!=='string')return {reason:'not_string'};
  if(value.length>2048)return {reason:'too_long'};
  let url;
  try { url=new URL(value); } catch { return {reason:'invalid_url'}; }
  const reason=url.protocol!=='https:'?'https_required':url.username || url.password?'credentials':url.hash?'fragment':url.port && url.port!=='443'?'custom_port':!platformCallbackHosts.has(url.hostname)?'unapproved_host':null;
  return {url,reason};
}
export function callbackRejectionDetails(value) {
  const {url,reason}=inspectCallbackUrl(value);
  if(!reason)return {};
  const host=url?.hostname;
  // Hostname only: never return the URL, path, query, credentials or signing key.
  // Omit IP literals and local/reserved names. Diagnostics do not authorize hosts.
  const publicName=host && host.length<=253 && /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(host) && !/(?:^|\.)(?:localhost|local|internal|test|invalid|example)$/.test(host);
  return {callback_policy_reason:reason,...(publicName?{callback_host:host}:{})};
}
export function callbackUrl(value) {
  const {url,reason}=inspectCallbackUrl(value);
  if(reason)
    fail(400,'invalid_callback','Callback must use an approved ChatGPT or OpenAI HTTPS origin, without credentials, fragments or a custom port.');
  return url.href;
}
export function decodeSigningSecret(value) {
  if(typeof value!=='string' || !/^whsec_[A-Za-z0-9+/]+={0,2}$/.test(value)) fail(400,'invalid_signing_secret','A Standard Webhooks whsec_ secret is required.');
  let bytes;
  try { bytes=Uint8Array.from(atob(value.slice(6)),c=>c.charCodeAt(0)); } catch { fail(400,'invalid_signing_secret','Signing secret must contain valid base64.'); }
  if(bytes.length<24 || bytes.length>64 || btoa(String.fromCharCode(...bytes))!==value.slice(6)) fail(400,'invalid_signing_secret','Signing key must contain 24–64 base64-encoded bytes.');
  return bytes;
}
const evtEncoder=new TextEncoder();
export function constantTimeEqual(a,b) {
  const x=evtEncoder.encode(a),y=evtEncoder.encode(b);let difference=x.length^y.length;
  for(let i=0;i<Math.max(x.length,y.length);i++)difference|=(x[i]||0)^(y[i]||0);
  return difference===0;
}
export async function webhookSignature(secret,eventId,seconds,body) {
  const key=await crypto.subtle.importKey('raw',decodeSigningSecret(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const signature=new Uint8Array(await crypto.subtle.sign('HMAC',key,evtEncoder.encode(`${eventId}.${seconds}.${body}`)));
  return `v1,${btoa(String.fromCharCode(...signature))}`;
}
export async function sendSignedWebhook(url,subscriptionId,secrets,eventId,body,now,transport=fetch) {
  callbackUrl(url); // Reapply the same destination policy for every attempt.
  if(evtEncoder.encode(body).length>262144)fail(400,'event_too_large','Event exceeds the webhook size limit.');
  const seconds=String(Math.floor(now/1000));
  const signatures=await Promise.all(secrets.map(secret=>webhookSignature(secret,eventId,seconds,body)));
  // workerd accepts only follow/manual. Manual never follows Location; both
  // callers require response.ok, so every 3xx is rejected before activation or
  // acceptance. Never retry with follow or forward these signed headers.
  return transport(url,{method:'POST',redirect:'manual',signal:AbortSignal.timeout(10000),headers:{'Content-Type':'application/json','webhook-id':eventId,'webhook-timestamp':seconds,'webhook-signature':signatures.join(' '),'X-MCP-Subscription-Id':subscriptionId},body});
}
export async function limitedResponseText(response,limit=4096) {
  const reader=response.body?.getReader();if(!reader)return '';
  const chunks=[];let size=0;
  try {
    while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit)throw Error('response_too_large');chunks.push(value);}
  } finally { await reader.cancel().catch(()=>{}); }
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  return new TextDecoder('utf-8',{fatal:true}).decode(bytes);
}
export async function eventEncryptionKey(value) {
  let bytes;try {bytes=Uint8Array.from(atob(value),c=>c.charCodeAt(0));}catch{}
  if(bytes?.length!==32)fail(503,'events_not_configured','Configure a 32-byte EVENT_SECRET_KEY as a runtime secret before enabling events.');
  return crypto.subtle.importKey('raw',bytes,'AES-GCM',false,['encrypt','decrypt']);
}
export async function maintenanceTokenDigest(value) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',evtEncoder.encode(`paprika-event-maintenance-v1:${value}`))),x=>x.toString(16).padStart(2,'0')).join('');
}
export async function sealEventSecret(key,subscriptionId,secret) {
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const ciphertext=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:evtEncoder.encode(subscriptionId)},key,evtEncoder.encode(secret)));
  return JSON.stringify([btoa(String.fromCharCode(...iv)),btoa(String.fromCharCode(...ciphertext))]);
}
export async function openEventSecret(key,subscriptionId,box) {
  const [iv,ciphertext]=JSON.parse(box).map(v=>Uint8Array.from(atob(v),c=>c.charCodeAt(0)));
  return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv,additionalData:evtEncoder.encode(subscriptionId)},key,ciphertext));
}

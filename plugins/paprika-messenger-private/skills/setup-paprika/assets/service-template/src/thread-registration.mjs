import { fail, strict } from './validation.mjs';
const registrationStmt=(db,sql,...values)=>db.prepare(sql).bind(...values);

export function registrationStatus(value='active') {
  if(!['active','unregistered'].includes(value))fail(400,'invalid_argument','registration_status must be active or unregistered.');
  return value;
}
export function requireActiveRegistration(participant) {
  if(participant.unregistered_at)fail(409,'participant_unregistered','This thread was removed from this board. Restore its registration before sending or enabling notifications.');
  return participant;
}
export async function changeThreadRegistration(service,args,remove) {
  strict(args,['board','participant_id','thread_id']);
  const board=await service.board(args.board);
  const {participant}=await service.resolveAddress(board,args,['participant_id','thread_id'],{includeUnregistered:true});
  if(participant.kind!=='thread')fail(400,'not_a_thread','Only a registered thread can be removed or restored by this operation.');
  const result=await registrationStmt(service.db,remove
    ? "UPDATE participants SET unregistered_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),registration_changed_by=? WHERE board=? AND id=? AND unregistered_at IS NULL"
    : 'UPDATE participants SET unregistered_at=NULL,registration_changed_by=? WHERE board=? AND id=? AND unregistered_at IS NOT NULL',
    service.subject,board,participant.id).run();
  const saved=await service.participant(board,participant.id);
  return {board,participant_id:saved.id,thread_id:saved.thread_id,label:saved.label,
    registration_status:saved.unregistered_at?'unregistered':'active',unregistered_at:saved.unregistered_at,
    changed:!!result.meta.changes,history_preserved:true,notifications_paused:remove,
    notifications_resumed:false};
}

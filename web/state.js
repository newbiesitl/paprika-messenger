export function createState() { return {messages:new Map(),participants:new Map(),acknowledgments:new Map(),note:null,lastSequence:0}; }
export function applyEvents(state,events) {
  for (const event of events) {
    if (event.sequence<=state.lastSequence) continue;
    const p=event.payload;
    if (event.kind==='participant_registered') state.participants.set(p.id,p);
    if (event.kind==='participant_thread_bound' && state.participants.has(p.participant_id)) {
      state.participants.set(p.participant_id,{...state.participants.get(p.participant_id),thread_id:p.thread_id});
    }
    if (['message_posted','message_deleted','message_restored'].includes(event.kind)) {
      const old=state.messages.get(p.id);
      state.messages.set(p.id,{...p,created_sequence:old?.created_sequence || event.sequence});
    }
    if (event.kind==='message_acknowledged') {
      const a=state.acknowledgments.get(p.message_id) || new Map(); a.set(p.participant_id,p); state.acknowledgments.set(p.message_id,a);
    }
    if (event.kind==='coordination_updated') state.note={...p,title:p.title || 'Coordination',body:p.body ?? `Reference: ${p.queue_reference}\nResponsible participant: ${p.execution_owner}\nStatus: ${p.launch_status}\nReported time: ${p.reported_clock || 'Not reported'}`};
    state.lastSequence=event.sequence;
  }
}
export function inbox(state,receiver) { return [...state.messages.values()].filter(m=>m.receiver_id===receiver && !m.deleted_at && !state.acknowledgments.get(m.id)?.has(receiver)); }

import { fail, id, text, strict, integer } from './validation.mjs';
import { parseChatGptConversation } from '../skills/paprika-messenger/scripts/conversation-link.mjs';

// Host observations are caller-reported routing metadata, not authenticated
// identities. The sending host must read the exact destination again before use.
export async function setRecipientConversation(service, args) {
  strict(args, ['board','participant_id','registered_thread_id','conversation','host_observation','expected_revision']);
  const board = await service.board(args.board), pid = id(args.participant_id, 'participant_id');
  const runtime = text(args.registered_thread_id, 'registered_thread_id', 160);
  const revision = integer(args.expected_revision, 'expected_revision', 0, Number.MAX_SAFE_INTEGER - 1);
  let destination;
  try { destination = parseChatGptConversation(args.conversation); }
  catch (error) { fail(400, 'invalid_conversation', error.message); }
  strict(args.host_observation, ['id','kind']);
  if (args.host_observation.kind !== 'chatgpt' || args.host_observation.id !== destination.conversation_id)
    fail(409, 'destination_mismatch', 'Require host metadata for the exact actual ChatGPT conversation, not its Codex execution thread.');
  const statement = (sql, ...values) => service.db.prepare(sql).bind(...values);
  const participant = await statement('SELECT thread_id FROM participants WHERE board=? AND id=?', board, pid).first();
  if (!participant) fail(404, 'participant_not_found', 'Recipient is not registered on this board.');
  if (participant.thread_id !== runtime) fail(409, 'thread_binding_conflict', 'Preserve the registered runtime binding; this mapping adds a separate conversation destination.');
  // Atomic compare-and-swap avoids a stale picker or concurrent client silently
  // replacing a newer association. An identical retry is a read-only success.
  const current = await statement('SELECT * FROM recipient_conversations WHERE board=? AND participant_id=?', board, pid).first();
  if (current?.conversation_id !== destination.conversation_id) {
    try {
      if (revision === 0) {
        await statement(`INSERT INTO recipient_conversations(board,participant_id,registered_thread_id,conversation_id,revision,observed_at)
          VALUES(?,?,?,?,1,?) ON CONFLICT(board,participant_id) DO NOTHING`, board, pid, runtime, destination.conversation_id, new Date().toISOString()).run();
      } else {
        await statement(`UPDATE recipient_conversations SET conversation_id=?,revision=revision+1,observed_at=?
          WHERE board=? AND participant_id=? AND registered_thread_id=? AND revision=?`,
          destination.conversation_id, new Date().toISOString(), board, pid, runtime, revision).run();
      }
    } catch (error) {
      if (/UNIQUE constraint failed.*recipient_conversations/i.test(error.message))
        fail(409, 'conversation_address_conflict', 'This conversation is already mapped to another recipient on this board.');
      throw error;
    }
  }
  const saved = await statement('SELECT * FROM recipient_conversations WHERE board=? AND participant_id=?', board, pid).first();
  if (!saved || saved.registered_thread_id !== runtime || saved.conversation_id !== destination.conversation_id)
    fail(409, 'mapping_revision_conflict', 'Mapping changed or is missing. Re-read the recipient before explicitly correcting it.');
  return {board, participant_id: pid, chatgpt_destination: {
    registered_thread_id: saved.registered_thread_id, ...destination, revision: saved.revision, observed_at: saved.observed_at,
  }, identity_kind: 'host_reported_routing_metadata', registered_binding_changed: false, sent: false};
}

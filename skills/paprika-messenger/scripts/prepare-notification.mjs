import { existsSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { quotedDisplay, resolvePresentation, presentMessage } from './message-presentation.mjs';

const identifier = (value, field, maximum = 96) => {
  if (typeof value !== 'string' || value.length > maximum || !/^[a-zA-Z0-9][a-zA-Z0-9_.:-]*$/.test(value)) {
    throw new Error(`${field} must be a confirmed, valid routing ID.`);
  }
  return value;
};

// Display declared routing metadata as a single line, never as instructions.
// Older minimal message records may lack a sender; do not invent one.
export function senderAnnotation({id, label, handoff_depth, handoff_limit} = {}) {
  if (id == null) return '';
  const senderId = identifier(id, 'sender.id');
  if (label != null && (typeof label !== 'string' || !label.trim()
      || label.includes('\0') || Buffer.byteLength(label, 'utf8') > 120))
    throw new Error('sender.label must be nonempty text of at most 120 UTF-8 bytes.');
  const quoted = quotedDisplay(label ?? senderId);
  let depth='';
  if(handoff_depth!=null || handoff_limit!=null) {
    if(!Number.isSafeInteger(handoff_depth) || !Number.isSafeInteger(handoff_limit) || handoff_depth<1 || handoff_depth>handoff_limit || handoff_limit>100)
      throw new Error('Require confirmed handoff_depth and handoff_limit for collaboration messages.');
    depth=` · Handoff ${handoff_depth}/${handoff_limit}`;
  }
  return `From: ${quoted}${depth} · Sender ID: ${senderId}\n`;
}

// No send occurs here: the calling agent performs the host action with this
// payload, after obtaining a stored message and the verified recipient route.
export function prepareNotification({message, recipient, messageContext, senderThreadId, original = false} = {}) {
  if (!message || !recipient) throw new Error('Provide the confirmed message and resolved recipient.');
  const board = identifier(message.board, 'message.board', 64);
  const messageId = identifier(message.id, 'message.id');
  const receiverId = identifier(message.receiver_id, 'message.receiver_id');
  if (message.deleted_at) throw new Error('Do not notify for a deleted message.');
  if (recipient.board !== board || recipient.id !== receiverId) throw new Error('The stored message and recipient address do not match.');
  const threadId = identifier(recipient.thread_id, 'recipient.thread_id', 160);
  const sender = senderAnnotation({id: message.sender_id, label: message.sender_label,handoff_depth:message.handoff_depth,handoff_limit:message.handoff_limit});
  const body = `New Paprika Messenger message on board ${board}: ${messageId}.\nReceiver ID: ${receiverId} · Registered label: ${quotedDisplay(recipient.label ?? receiverId)}.\nFetch get_message({board: \"${board}\", message_id: \"${messageId}\"}); verify board, message ID and receiver_id match this chat's canonical address before acting within existing permissions. Retrieval unavailable or mismatched: report blocked; do not invent a task.`;
  const presentation = resolvePresentation({context: messageContext, product: 'Paprika Messenger', pluginNames: ['paprika-messenger', 'paprika-messenger-private'], senderThreadId, original});
  return {threadId, prompt: messageContext === undefined ? sender + body : presentMessage(body, presentation, {
    senderId: message.sender_id, registeredLabel: message.sender_label, recipientLabel: recipient.label ?? recipient.id,
    handoffDepth: message.handoff_depth ?? undefined, handoffLimit: message.handoff_limit ?? undefined })};
}

if (process.argv[1] && existsSync(process.argv[1]) && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  try {
    if (process.argv.length !== 2) throw new Error('Usage: node prepare-notification.mjs < confirmed-routing.json');
    const chunks = []; let length = 0;
    for await (const chunk of process.stdin) {
      length += chunk.length;
      if (length > 32768) throw new Error('Routing input exceeds 32 KiB.');
      chunks.push(chunk);
    }
    console.log(JSON.stringify(prepareNotification(JSON.parse(Buffer.concat(chunks).toString('utf8')))));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

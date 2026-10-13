import { existsSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const identifier = (value, field, maximum = 96) => {
  if (typeof value !== 'string' || value.length > maximum || !/^[a-zA-Z0-9][a-zA-Z0-9_.:-]*$/.test(value)) {
    throw new Error(`${field} must be a confirmed, valid routing ID.`);
  }
  return value;
};

// Display declared routing metadata as a single line, never as instructions.
// Older minimal message records may lack a sender; do not invent one.
export function senderAnnotation({id, label} = {}) {
  if (id == null) return '';
  const senderId = identifier(id, 'sender.id');
  if (label != null && (typeof label !== 'string' || !label.trim()
      || label.includes('\0') || Buffer.byteLength(label, 'utf8') > 120))
    throw new Error('sender.label must be nonempty text of at most 120 UTF-8 bytes.');
  const quoted = JSON.stringify(label ?? senderId).replace(/[\u0085\u2028\u2029]/g,
    character => '\\u' + character.charCodeAt(0).toString(16).padStart(4, '0'));
  return `From: ${quoted} · Sender ID: ${senderId}\n`;
}

// No send occurs here: the calling agent performs the host action with this
// payload, after obtaining a stored message and the verified recipient route.
export function prepareNotification({message, recipient} = {}) {
  if (!message || !recipient) throw new Error('Provide the confirmed message and resolved recipient.');
  const board = identifier(message.board, 'message.board', 64);
  const messageId = identifier(message.id, 'message.id');
  const receiverId = identifier(message.receiver_id, 'message.receiver_id');
  if (message.deleted_at) throw new Error('Do not notify for a deleted message.');
  if (recipient.board !== board || recipient.id !== receiverId) throw new Error('The stored message and recipient address do not match.');
  const threadId = identifier(recipient.thread_id, 'recipient.thread_id', 160);
  const sender = senderAnnotation({id: message.sender_id, label: message.sender_label});
  return {threadId, prompt: `${sender}New Paprika Messenger message on board ${board}: ${messageId}. Read it and handle it within this chat's existing authorized scope.`};
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

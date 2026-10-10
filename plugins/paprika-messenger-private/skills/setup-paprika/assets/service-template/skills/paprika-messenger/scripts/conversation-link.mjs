// Navigation uses observed native metadata, never a communication ID or label.
// A desktop URL opens on the computer handling it; it does not select a remote
// host. Unknown, remote Codex and Dot routes need a host-supported open action.
export function conversationLink(recipient) {
  const thread = recipient?.thread_id;
  if (typeof thread !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,159}$/.test(thread)) return null;
  if (recipient.source === 'codex' && recipient.execution_mode === 'local' && recipient.host_id === 'local')
    return { url: 'codex://threads/' + encodeURIComponent(thread), label: 'Open conversation',
      kind: 'local_desktop', host_id: 'local', hint: 'Open on the computer that owns this conversation' };
  if (recipient.source === 'chatgpt')
    return { url: 'https://chatgpt.com/c/' + encodeURIComponent(thread), label: 'Open conversation',
      kind: 'chatgpt', host_id: recipient.host_id ?? null, hint: 'Open in your signed-in ChatGPT account' };
  return null;
}

export function confirmationConversationLink({ board, message, recipient } = {}) {
  if (!message?.id || message.board !== board || message.receiver_id !== recipient?.participant_id)
    throw Error('Require the confirmed message and its exact canonical recipient on this board.');
  return conversationLink(recipient);
}

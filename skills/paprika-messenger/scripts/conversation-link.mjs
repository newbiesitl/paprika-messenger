// Keep browser identity separate from an immutable execution/routing thread ID.
// Only a verified owning ChatGPT conversation URL may populate this metadata.
export function normalizeConversationUrl(value) {
  if (typeof value !== 'string' || value.length > 2048 || value !== value.trim()) return null;
  // Match the original string before URL parsing can normalize traversal,
  // credentials, escaped separators, ports or a deceptive hostname.
  const uuid='[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';
  const match=new RegExp('^https://chatgpt\\.com/(?:g/[A-Za-z0-9_-]+/)?c/('+uuid+')(?:[?#][^\\s\\\\]*)?$').exec(value);
  return match ? 'https://chatgpt.com/c/'+match[1].toLowerCase() : null;
}

// Navigation uses observed native metadata, never a communication ID or label.
// A desktop URL opens on the computer handling it; it does not select a remote
// host. Unknown, remote Codex and Dot routes need a host-supported open action.
export function conversationLink(recipient) {
  const verifiedUrl=normalizeConversationUrl(recipient?.conversation_url);
  if (verifiedUrl) return {url:verifiedUrl,label:'Open conversation',kind:'chatgpt',
    conversation_id:verifiedUrl.split('/').at(-1),host_id:null,
    hint:'Open in your signed-in ChatGPT client; app or browser handling depends on the client'};
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

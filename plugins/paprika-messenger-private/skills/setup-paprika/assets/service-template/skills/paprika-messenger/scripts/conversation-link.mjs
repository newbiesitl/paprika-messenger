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
export function parseChatGptConversation(value) {
  if (typeof value !== 'string' || value.length > 2048) throw Error('Require an actual ChatGPT conversation ID or /c/ link.');
  let conversation_id = value;
  if (value.startsWith('https://')) {
    const normalized = normalizeConversationUrl(value);
    if (!normalized)
      throw Error('Use the original ChatGPT /c/ conversation link, never a /share/ link or Dot URL.');
    conversation_id = normalized.split('/').at(-1);
  }
  if (!/^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$/.test(conversation_id))
    throw Error('Require an actual ChatGPT conversation ID or /c/ link.');
  conversation_id = conversation_id.toLowerCase();
  return {conversation_id, conversation_url: 'https://chatgpt.com/c/' + conversation_id};
}

export function conversationLink(recipient) {
  if (recipient?.chatgpt_destination != null) {
    const mapping = recipient.chatgpt_destination;
    try {
      if (mapping.registered_thread_id !== recipient.thread_id) return null;
      const parsed = parseChatGptConversation(mapping.conversation_id);
      return {url: parsed.conversation_url, label: 'Open conversation', kind: 'chatgpt', host_id: null,
        conversation_id: parsed.conversation_id,
        hint: 'Open in your signed-in ChatGPT client; app or browser handling depends on the client'};
    } catch { return null; } // Never fall back to a runtime link after a mapping conflict.
  }
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

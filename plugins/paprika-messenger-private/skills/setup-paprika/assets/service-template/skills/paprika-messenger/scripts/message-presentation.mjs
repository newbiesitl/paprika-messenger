// Presentation only. The caller supplies actual native metadata; these consistency
// checks do not authenticate snapshots, create communication grants or send messages.
const id = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/.test(value);
const roleId = value => typeof value === 'string' && /^[a-z][a-z0-9-]{0,95}$/.test(value);
const reference = value => typeof value === 'string' && /^plugin:\/\/[a-z][a-z0-9-]{0,63}@[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/.test(value);

export function displayText(value) {
  const singleLine = String(value).slice(0, 512).replace(/[\x00-\x1f\x7f-\x9f\u2028\u2029\u202a-\u202e\u2066-\u2069]/g,
    char => '\\u' + char.charCodeAt(0).toString(16).padStart(4, '0'));
  return singleLine.replace(/[\\`*_{}\[\]()<>#!|~]/g, '\\$&');
}
export const quotedDisplay = value => '"' + displayText(value).replace(/"/g, '\\"') + '"';

export function resolvePresentation({ context, product, pluginNames, senderThreadId, original = false, now = Date.now() }) {
  let pluginReference = null, title = null, role = null, reason = 'metadata_unavailable';
  const observed = Date.parse(context?.observed_at);
  const current = context?.schema_version === 1 && id(context.host_id) && Number.isFinite(observed) && observed <= now + 30000 && now - observed <= 5 * 60 * 1000;
  if (current) {
    const metadata = original ? context.original_sender_metadata : context.sender_metadata;
    const native = metadata?.thread;
    if (id(senderThreadId) && ['list_threads', 'read_thread'].includes(metadata?.source) && native?.id === senderThreadId &&
      native.hostId === context.host_id && ['codex', 'chatgpt'].includes(native.kind) && typeof native.title === 'string' && native.title.trim()) title = native.title;
    const binding = original ? context.original_role_binding : context.role_binding;
    if (id(senderThreadId) && ['human_assignment', 'private_binding'].includes(binding?.source) && binding.thread_id === senderThreadId &&
      binding.host_id === context.host_id && roleId(binding.role_id)) role = binding.role_id;
    const installed = context.catalog_source === 'codex_plugin_list' && Array.isArray(context.plugin_catalog?.installed)
      ? context.plugin_catalog.installed.filter(plugin => pluginNames.includes(plugin.name) && plugin.installed === true && plugin.enabled === true &&
        reference('plugin://' + plugin.pluginId) && plugin.pluginId.startsWith(plugin.name + '@')).map(plugin => 'plugin://' + plugin.pluginId) : [];
    const invoked = context.plugin_invocation;
    if (invoked?.source === 'current_plugin_invocation' && invoked.host_id === context.host_id && pluginNames.includes(invoked.name) &&
      reference(invoked.reference) && invoked.reference.startsWith('plugin://' + invoked.name + '@')) installed.push(invoked.reference);
    const candidates = [...new Set(installed)];
    if (context.supports_plugin_mentions === true && candidates.length === 1) { pluginReference = candidates[0]; reason = 'observed_plugin_reference'; }
    else reason = context.supports_plugin_mentions !== true ? 'plugin_mentions_unverified' : candidates.length > 1 ? 'ambiguous_plugin_reference' : 'installed_reference_unavailable';
  } else if (context) reason = 'metadata_stale_or_invalid';
  return { product, plugin_reference: pluginReference, sender_title: title, sender_role: role, reason,
    brand_line: pluginReference ? `[@${displayText(product)}](${pluginReference})` : displayText(product),
    evidence: 'caller_supplied_native_observations_not_authentication' };
}

export function presentationHeader(presentation, { senderId, registeredLabel, recipientLabel, recipientRole, handoffDepth, handoffLimit } = {}) {
  let from = `From: ${quotedDisplay(presentation.sender_title ?? 'Native title unavailable')}`;
  if (presentation.sender_role) from += ` · Role: ${presentation.sender_role}`;
  if (senderId !== undefined) { if (!id(senderId)) throw new Error('Invalid presentation sender ID.'); from += ` · Sender ID: ${senderId}`; }
  if (registeredLabel !== undefined) from += ` · Registered label: ${quotedDisplay(registeredLabel)}`;
  if (handoffDepth !== undefined || handoffLimit !== undefined) {
    if (!Number.isSafeInteger(handoffDepth) || !Number.isSafeInteger(handoffLimit) || handoffDepth < 1 || handoffDepth > handoffLimit || handoffLimit > 100) throw new Error('Require server-confirmed handoff depth and limit.');
    from += ` · Handoff ${handoffDepth}/${handoffLimit}`;
  }
  let to = recipientLabel === undefined ? '' : `\nTo: ${quotedDisplay(recipientLabel)}`;
  if (recipientRole !== undefined) { if (!roleId(recipientRole)) throw new Error('Invalid recipient role.'); to += ` · Role: ${recipientRole}`; }
  return presentation.brand_line + '\n' + from + to + '\n\n';
}

export function presentMessage(body, presentation, fields) {
  if (typeof body !== 'string') throw new Error('Message body must be text.');
  // Never scan or rewrite the body: an author may have intentionally quoted a
  // mention. Exactly one presentation mention is emitted by this single wrapper.
  const header = presentationHeader(presentation, fields);
  return body.startsWith(header) ? body : header + body;
}

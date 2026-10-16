# Optional native product and sender presentation

For a new authorized native delivery, collect fresh sender and installed-plugin
observations and pass `message_context` to prepare-delivery or prepare-bridge.
Resolve the executing sender first using its current host ID and actual native
metadata. The native title is separate from the registered sender label. A role
comes only from an explicit human assignment/private binding to that exact chat;
never infer it from the recipient, title, message or company roster.

The context uses schema_version 1, observed_at (actual observation time), host_id,
supports_plugin_mentions, catalog_source `codex_plugin_list`, the actual
plugin_catalog installed array, sender_metadata `{source,thread}`, and optional
role_binding `{source,thread_id,host_id,role_id}`. The thread object retains actual
native id, title, kind and hostId; source is list_threads or read_thread. A binding
source is human_assignment or private_binding. A verified current invocation can
instead supply plugin_invocation `{source:"current_plugin_invocation",name,
reference,host_id}`. Do not invent tool results or treat this envelope as signed
identity evidence.

Use the supported `codex plugin list --json` catalog or the current plugin
invocation's exact observed reference. The helper selects one enabled installed
Paprika Messenger identity; account and local marketplace names may differ.
Missing, stale (over five minutes), ambiguous or unsafe references use readable
product text. Native plugin mentions must be supported by the actual destination.
The sending host's local reference is not evidence of another host's installation:
cross-host and ChatGPT bridge delivery conservatively use plain text. This does
not change routing or prevent the authorized message.

New presentation order is product mention/name, actual native title (or explicit
unavailable fallback), optional established role, registered sender label/ID and
server-confirmed handoff fields, recipient context, then the existing body or
private-board notification reference. Display fields escape Markdown, controls
and bidi characters. Body text is preserved. A single wrapper does not add a
duplicate copy of its own header, and intentionally quoted body mentions remain.
The host-owned “Sent by ChatGPT from another task” heading stays unchanged.

For relays, separately resolve original_sender_metadata and original_role_binding
against the confirmed original author's thread. The original server label/ID and
message/reply reference remain primary; the executing sender is separately shown
as “Relayed by”. Missing original native metadata never substitutes the relay or
destination title. A plugin badge does not authenticate any participant, authorize
replies or expand the human's communication grant.

Read/checkpoint before preparing a new payload. Never regenerate, decorate or
replay an already prepared/submitting/submitted/unknown delivery merely to apply
branding or a renamed title. Keep its original frozen host_args and exact digest.
The unchanged checkpoint guard rejects a changed route, transport or payload.
Older callers that omit message_context retain their normal legacy wire format;
unusual display labels are now escaped. If an upgrade changes such a pending
label, reconcile using the original saved plan instead of a reformatted retry.
No stored board body, request/message ID, receipt, reply link or receiving transport
is changed by presentation. New workflow callers should supply a context, using
an empty context for explicit plain-text fallback when discovery is unavailable.

No install, upload, service connection, receiver registration, event subscription
or native send occurs in these helpers. Unit/package tests are not native UI
evidence. Verify the intended host separately under the current human request.

For picker icon investigation, use the packaged setup helper
`skills/setup-paprika/scripts/inspect-plugin-presentation.mjs <plugin-root>` and
the [diagnostic guide](https://github.com/newbiesitl/paprika-messenger/blob/main/docs/PLUGIN-PRESENTATION.md).

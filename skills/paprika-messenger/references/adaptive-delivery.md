# Automatic short-inline / long-reference delivery

For an already human-authorized agent task/report, use
`scripts/adaptive-delivery.mjs`. It prepares actions; only the calling host runs
connected tools. The selected recipient and sending authority remain external.
This is not a service deployment, account update or receiving subscription.

The policy counts `[...originalBody].length` Unicode code points before any
header/routing. Do not trim or normalize: astral emoji count once, combining
marks and CR/LF each count separately. The default is 1500 inclusive: 1499 and
1500 may stay inline; 1501 requires reference. `delivery_policy` accepts
`short_message_limit` (1..15000) and `force_reference` (boolean). There is no
force-inline bypass. Direct preparation also enforces this policy; a large
explicit direct request must use confirmed storage rather than inline fallback.
Explicit send-and-notify may continue storing short messages too.

Use JSON stdin with `adaptive-delivery.mjs start`: `{root, input}`. Input is the
existing verified direct/native route with `deployment`, `board`, resolved
`sender`/`recipient`, verified `destination`, actual `subscriptions`, one stable
`request_id`, `body`, `topic`, optional `idempotency_key`, `reply_to_id`,
`collaboration_id`, `delivery_policy`, and fresh `message_context`. Start freezes
body, policy, route and the one notification transport. `root` must be the same
private host state directory used by existing notification checkpoints for that
deployment. Worktrees/devices must not create competing retry stores. Retain
an unresolved pre-upgrade direct/stored plan; do not migrate it into a new ID.

Then use `next` with `{root,key:{deployment,board,request_id},options}`.
`options.service_available`, `retrieval_available`, and `native_available` are
actual host observations, not defaults or permission grants. Reference mode
requires the same selected service and a supported recipient `get_message`
connector. If unavailable, report setup required and preserve the task. No new
service, Messenger product, event subscription or background receiver is created.

A `store` action provides exact `post_message` arguments through the existing
post helper, retaining the intact original body and its existing confirmed reply
address footer. Invoke those arguments once and use `record-storage` with the
actual result. Confirm the original content plus footer, board, message ID,
receiver, author, timestamp and reply correlation before any native call. A
storage failure/unknown result returns `storage_unconfirmed`. An intentional
`retry_storage:true` repeats only that frozen idempotent post/key. Never change
modes, keys or route to evade a pending operation. The current service limit is
16000 UTF-8 bytes including that footer; larger tasks remain unsent as
`storage_payload_unsupported`. Do not truncate or split tasks into native sends.

A `send` action provides the exact native `arguments` and `attempt_id` after
calling the existing `NotificationState.begin`. Its native prompt contains only
branding where actually supported, observed sender identity/role, canonical
routing IDs/labels, board/message ID and minimal retrieval/authorization
instructions. No body, excerpt, transcript or attachment is included. Invoke
those arguments through the supported native host tool, then `record-native`
with the actual submitted/failed/unknown result and exact attempt ID. Existing
active subscriptions, including paused routes, select events alone; a native
call is never returned for that plan. Supply fresh `subscriptions` before native
submission; a detected transport change blocks. A discovery snapshot cannot
prevent an external race or establish cross-device exactly-once delivery.

`reconcile` reuses existing NotificationState evidence rules. Missing receipts,
truncated history and unknown native outcomes cannot allow another wake.
Policy, exact post payload and native arguments remain frozen in the private
0600 outbound journal, with exclusive locks and atomic replacement. Existing
transcript-free notification receipts are unchanged. The payload journal
necessarily contains unsent message text: keep it private, without credentials,
and exclude it from packages/Git. A lock/conflict/corrupt record requires
reconciliation, not deletion or an invented request ID.

The recipient must call supported `get_message({board,message_id})` and verify
ID, board and `receiver_id` against its own canonical address before acting.
The module exports `verifyReferencedMessage`, also available through CLI `verify`,
for this consistency check. Missing/deleted/unavailable or mismatched content is
a visible blocked state, never an empty task or invented text. Keep original
author, message ID and reply correlation; communication grants no extra powers.
Fetching does not acknowledge or prove execution.

This native helper requires local JavaScript execution, trusted current Codex
thread metadata and a verified native route. Supported mapped ChatGPT routes
still use the existing bridge checks, but retrieval must actually be available
in that recipient. Hosts without a persistent private journal or a recipient
connector cannot claim reference delivery. The bridge's low-level direct mode
now rejects oversized bodies; drive storage through this adaptive workflow and
use its verified mapped destination. Relay remains reference-only and retains
original author/correlation. Chat creation belongs to the owning host adapter:
never pretend a new recipient is registered before creation, and provide only a
minimal waiting bootstrap until a verified recipient can fetch the full task.

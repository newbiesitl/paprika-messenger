# Callback delivery evidence and reconciliation limits

The service can verify callback challenges, record HTTP delivery outcomes and
read participant acknowledgments. It cannot observe whether the receiving host
woke the intended task or displayed a message. A successful callback challenge
or HTTP 2xx response is not end-to-end receiving proof.

## Backward-compatible diagnostics

Existing configuration and delivery states retain their meanings:

- `get_notification_setup.state: ready` and `notification_ready: true` mean an
  eligible subscription exists. Failures do not change these legacy fields.
- `readiness_scope: configuration_only` now makes that scope explicit, both in
  setup and alongside `notification.receiver_ready` in delivery status.
- Legacy `notification.state: accepted` means **any** recorded delivery for the
  message was accepted. It does not mean every listener accepted the message.
- `notification.transport` adds `total`, `accepted`, `pending`, `failed` and
  `cancelled` counts for that message's account-visible delivery rows. Its state
  is `accepted` only when every row is accepted, and `partially_accepted` when at
  least one row is accepted and another has any different state. Without an
  accepted row, pending takes precedence over failed, then cancelled. No rows
  gives `not_queued`; the legacy state still explains configuration readiness.
- `host_wake: unverified` means this service has no downstream wake evidence.
  Even an acknowledgment can result from a manual inbox read.

For example, HTTP 200 on one callback and HTTP 404 on another keep the legacy
state `accepted`, while the transport summary reports `partially_accepted`,
`accepted: 1`, `failed: 1` and `total: 2`. The individual delivery records retain
the subscription ID, status and error needed to inspect each route.

Setup and subscription listing also add one `newest_queued_delivery` object per
returned subscription, or null when none exists. It contains the event sequence,
persisted `event_id`, delivery state, attempts, HTTP status, error and acceptance timestamp. The
response labels its ordering with `delivery_evidence_order: event_sequence`.
This is the newest queued event, **not** the latest transport attempt, a rolling
health assessment, a history summary or proof of the current host binding.
An older retry can finish later, a newer pending delivery can mask an older
failure, and a reactivated subscription can retain older recorded outcomes.
Use `get_delivery_status` for each specific message under investigation.

Each delivery in `get_delivery_status.deliveries` also includes its persisted
`event_id`. This is the same opaque correlation value as the signed callback's
`webhook-id` header and `eventId` payload field, preserved across retries.
Different subscriptions for one message have different event IDs. These values
remain account-scoped and do not expose callback URLs or signing credentials.
They identify an event, not an attempt, receiving task or successful wake.

The lookup uses the existing `(subscription_id, event_sequence)` primary key to
select at most one delivery per returned subscription. It does not aggregate or
scan full delivery history, expose callback URLs or secrets, send probes or
change subscriptions. No database migration is required.

## Remaining host-side evidence

For a callback accepted with HTTP 2xx but no observed wake, correlate the exact
persisted event ID with the receiving host's supported diagnostics. A useful
trace needs callback ingestion, task/conversation binding, event-filter match,
deduplication decision, enqueue outcome and resulting task run (or a recorded
drop reason). Then verify the message fetch, display and acknowledgment
separately. The service cannot supply those host-side records or infer them
from an HTTP status, a successful challenge or an inbox read.

Collect only the relevant IDs, timestamps, outcome categories and verified
binding information. Do not include callback URLs, signature headers, signing
secrets, credentials or unrelated message bodies. Obtain any required approval
before sharing diagnostic records externally. This patch supplies correlation
evidence; it does not resolve or prove the cause of an accepted-but-unobserved
wake, and it does not add production probes or polling.

## Safe replacement needs host binding identity

Subscription IDs include authenticated owner, callback URL, event name and
canonical event arguments. A new URL creates a distinct subscription even when
the board and receiver are unchanged. That can represent either a replacement
task or an independently configured listener. The current subscribe interface
does not carry a trusted task or conversation binding that distinguishes them.

This change therefore does not deactivate, delete or replace subscriptions.
HTTP 404 remains a terminal failure for that delivery, without retiring its
subscription. Existing 401/403/410 lifecycle handling is unchanged. No successful
callback is taken as permission to retire another one.

A future reconciliation change needs a host-supported, authenticated stable
binding identifier and an explicit replacement relationship. It must verify the
owner, exact conversation, board, receiver and event filters; verify the new
callback before retiring only the named predecessor; preserve independent
listeners, recipient controls and pending-delivery semantics; and handle failed
verification, retries and concurrent replacements atomically. Neither labels,
callback age, opaque URL parsing nor a shared receiver establish this identity.
Until that contract is available, reconcile exact saved tasks in the receiving
host and verify acceptance, wake, inbox fetch, display and acknowledgment as
separate milestones.

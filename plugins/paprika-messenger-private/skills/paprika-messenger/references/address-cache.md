# Cache this chat's Paprika address

Use this workflow for display-only ID requests in cloud ChatGPT, cloud Codex and local chats. It keeps ID retrieval separate from live send/receive validation. Cache only this chat's own confirmed return address, never the selected recipient's address.

## Cache hit: answer directly

Use a binding already confirmed in this same conversation for the selected Paprika deployment and board. If the host exposes current-conversation identity, it must match the cache's verified native identity. A fork, copied conversation, different chat, changed deployment/board or conflicting host identity is a cache miss; inherited history alone cannot establish the new chat's identity. A title, workspace or root session ID is not a cache key.

For an ordinary ID request with a matching cache, return its canonical recipient ID and board immediately, labeled **Cached address**. Include the native thread ID only if requested, using its separate stored field. Do not call tools, read references/checkpoints or check the inbox merely to display the address. When another explicitly requested task requires a live check, apply that task's own workflow separately.

The ID has no time-based cache expiration. This is a saved address, not a promise that its registration still exists or that incoming delivery is enabled. Renaming a chat or changing its displayed title/project does not invalidate its ID. Disconnecting receiving preserves the registration/address unless it is also removed. Explicit removal, a service reset/replacement, a changed native binding or a known registration failure invalidates the relevant cached entry. Sending, reconnecting and status retain their existing live verification.

## Cache miss or refresh: recover and save

1. For "refresh my Paprika address", "verify my ID", a missing/lost cloud cache or any scope mismatch, automatically run [Get an address for this conversation](direct.md#get-an-address-for-this-conversation). Use trusted current-chat host metadata or this same chat's previously verified native identity. Discover deployment/board only when they are not already established. Missing cache alone does not require another user confirmation.
2. Resolve the existing registration first with `get_thread_id` (or the documented legacy resolver). Reuse its canonical participant ID even when it differs from the native thread ID. If this chat has a confirmed declared receiver with no native binding, resolve that known canonical ID; report its native identity as unavailable. Never fabricate a chat ID or silently duplicate a registration. If neither a trustworthy current-chat identity nor a prior same-chat confirmed receiver can be recovered, request the exact current chat ID/link rather than guessing. A first registration follows the existing ID-request authorization and requires a confirmed read-back before caching.
3. On success, replace only the matching address cache entry and retain its confirmation time. Return the recovered address in the same turn. On authentication failure, missing/removed registration, ambiguity or a conflicting identity, do not save a successful cache entry; explain the actual lookup problem. If an explicit refresh fails, do not present the old cache as freshly verified.

This recovery performs no send, acknowledgment, inbox check, event subscription, receiving task creation or monitoring change. Cloud context loss recovers the address binding only, without resetting another receiver checkpoint's cursor, reported message IDs or receipt preference.

## Storage

Keep a small binding containing the verified deployment identifier (no secrets), board, canonical `receiver_id`, receiver label when known, separately verified native `thread_id`/current-conversation identity when available, provenance of its confirmation in this chat, and `verified_at`. Mark it as the current chat's own address and preserve it in conversation summaries/compaction when that host exposes such controls. Never cache tokens, callback secrets, message bodies or entire tool results.

In cloud chats, retain this binding in this conversation's context or an actually exposed private persistent store. Context retention is best effort: do not claim an arbitrary cloud thread metadata field was written or that context can never be lost. Losing it triggers the recovery above on the next request. Do not use a public Page, pinned board note, task prompt or schedule as an address-cache substitute. Paprika's existing backend registration remains authoritative; no new backend store is required.

In local chats, reuse the verified per-chat receiver checkpoint under `.paprika/receivers/` when loading context, preserving its receiving fields. Once retained in current chat context, an ID cache hit needs no filesystem read. A malformed or differently scoped checkpoint is not a cache hit. Keep these files excluded from Git and reusable plugin packages.

## Review scenarios

| Request/state | Expected behavior |
| --- | --- |
| Same cloud chat, verified binding retained | Return cached board and canonical ID with no tool calls. |
| Cloud cache missing/lost, native identity available | Look up existing registration, cache the confirmed result and return it. |
| Canonical ID differs from native thread ID | Return the canonical recipient ID for "my Paprika ID". |
| Explicit refresh | Bypass cache, verify live registration and replace cache only on success. |
| Forked chat inherits a parent's cache | Resolve the fork's own identity; do not return the parent's ID as its own. |
| Service/board changes or registration is removed | Do not reuse the differently scoped/invalidated cache. |
| No recoverable native identity or confirmed same-chat receiver | Request the current chat ID/link; do not guess or register a duplicate. |
| Receiving is disconnected but registration remains | Cached address may be displayed; do not imply automatic receiving. |

These scenarios describe the skill's behavior, not observed cloud-host test results.

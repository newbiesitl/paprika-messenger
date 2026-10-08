# Trust and durability

Each deployment is private to one owner account. Sites supplies sign-in, the provisioned plugin's OAuth connection and protected identity headers. Every data-bearing MCP call, browser API operation and UI asset request checks `oai-authenticated-user-id` and the configured owner subject or verified email. Runtime owner/coordinator values belong in Sites settings. Missing identity, missing owner configuration and wrong accounts fail closed.

These headers are trustworthy only behind Sites dispatch. Do not expose this Worker directly through a provider or proxy that allows callers to supply them. A service credential does not create user identity. Discovery contains generic tool/skill descriptions and no private board data.

Sender IDs, receiver IDs, labels and session mappings are declared routing metadata. Sessions using the same owner's credentials share one principal; the service does not cryptographically distinguish a Dot agent, ChatGPT session, Codex session or human within that account. Boards partition projects, not permissions. Different owners deploy separate instances. Changing Site sharing alone does not implement multi-user board access.

Event subscriptions require that authenticated owner. Signing keys are AES-GCM encrypted and never returned by tools or event payloads. Callbacks accept only fixed trusted OpenAI HTTPS origins and block redirects and arbitrary/local/IP destinations. This is not a general-purpose callback proxy. Maintenance requires the existing Sites service credential and a configured matching digest; it returns only aggregate counts and cannot invoke data tools as a visitor. Expiry, unsubscribe and owner changes stop pending notifications. Webhook acceptance is not participant acknowledgment or permission to act.

The coordinator browser endpoint separately checks its configured subject/email, same-origin requests and a CSRF header. It is absent from MCP tool discovery. Same-account programs are not separate principals. A pinned note records context; it cannot authorize actions, change permissions or trigger work. Existing project policies remain independent.

D1 is the authoritative production store. Prepared statements validate IDs, UTF-8 byte limits, pagination and known argument fields. Atomic SQLite triggers append event snapshots in the same transaction as posts, acknowledgments, visibility changes, registrations and note updates. Unique constraints serialize retry keys; different content under the same key conflicts. Expected-revision updates prevent note overwrites. First-primary D1 sessions avoid stale-replica reads.

The feed pages ordered events before applying receiver/topic filters, so hidden events advance the cursor. Visibility changes retain original routing and reach matching clients. Clients apply events before saving cursors, ignore duplicate sequences and replay history after reload. Production schema is owned by append-only Drizzle migrations and is never recreated on request or deployment. Development SQLite is not production storage.

Message bodies and note text are rendered with `textContent`. They are never executed as HTML, scripts, Markdown or URLs. The CSP restricts sources, framing and embedded objects. Request parsing caps JSON at 32 KiB. Errors omit SQL values, message content and credentials.

Soft deletion retains recoverable content; there is no purge API. Explicit acknowledgments record the authenticated account and declared participant ID and mean receipt only. Legacy coordination fields remain available on upgraded deployments as contextual reports with their original revisions and timestamps.

# Paprika Messenger 1.5.0-rc.3

Test plugin **1.5.0-rc.3**, service **0.7.0-rc.3**. This prerelease packages the cached dropdown feature merged in PR #26 while retaining board cleanup and explicit native relays from rc.2.

Opening the recipient menu displays saved details immediately without native thread/project preflight. Supported clients retain bounded local pages, with fallback to the private board's durable cloud registry and metadata. Atomic directory and board-catalog revisions invalidate changed recipient pages and board lists on reopening. Native Refresh thread details remains explicit. Cached selections still verify current registration, and pending messages and keys are not cached.

Apply additive migration 0008_recipient-cache-revisions.sql to the same private service and update the existing private account package. Preserve Site/App/OAuth identity, owner audience, boards, inbox history, subscriptions, previous Site versions and immutable release artifacts. See [upgrade guidance](../../docs/UPGRADING.md).

The plugin, service source and compiled Worker each ship in ZIP and tar.gz form. artifacts.json records the clean source commit and Worker digest; SHA256SUMS records the six archive hashes. Repository packages do not install a plugin or deploy a Site.

Actual MCP App storage and live latency require client verification. The separate accepted-webhook/no-observed-Dot-wake issue remains unresolved. This is a prerelease, not a stable release.

Validation: 180 root tests, 13 receiver regressions, 18 native delivery checks, Worker compilation and generated package parity passed. The release verifier checks historical checksums and ZIP/tar.gz parity.

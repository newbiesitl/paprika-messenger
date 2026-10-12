# Paprika Messenger 1.5.0-rc.2

Test plugin **1.5.0-rc.2**, service **0.7.0-rc.2**. Recipient dropdowns display cached details directly without preliminary native thread/project lookups. The private board supplies the durable cloud metadata cache. Supported clients keep scoped local recipient pages; unavailable local storage falls back to memory or the private board.

Separate monotonic revisions detect new boards, new thread registrations, removal/restore, metadata/link changes and communication recency. Atomic database increments prevent lost updates, and directory pages carry the revision of their own database snapshot. Opening a saved dropdown checks revisions without hiding its rows, refreshing only changed data. Cached selection still revalidates the current registration. Native detail lookup is explicit through **Refresh thread details**. Cleanup and immutable IDs/history remain intact.

Apply all migrations through `0008_recipient-cache-revisions.sql` when upgrading the existing private service and update the account package together. Local cache data is bounded to 16 recipient pages with one-day eviction and excludes message bodies, pending send keys, credentials and history. The update adds no receiving task or schedule.

The versioned plugin/service/Worker ZIP and tar.gz pairs are tied to their build source in `artifacts.json` and hashes in `SHA256SUMS`. Prior versions remain unchanged. Building source and artifacts does not deploy a Site or install an account package. See [upgrade and rollback](../../docs/UPGRADING.md).

Validation passed 173 root tests, 13 receiver regressions and 18 native-delivery checks, Worker compilation and package/archive parity. The browser fixture verified automatic new-thread and new-board refresh. Local 5,000-thread timings were 1.189 ms median for the 50-row page and 0.009 ms for revision reads; live network and client rendering are unmeasured. Persistent storage on each real client remains a separate check, with memory/cloud fallback when unsupported.

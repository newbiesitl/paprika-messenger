# Paprika Messenger 1.5.1

Plugin **1.5.1** bundles service **0.7.1** and merged PR #34. Ordinary connect, initialize, reinitialize, configure-communication and enable-incoming requests complete recipient registration and an authenticated inbox read directly, without opening the settings card or requiring another click.

New recipients on every host default to `on_demand`, with event hooks disabled. Setup creates no task, subscription, schedule or background process. Joining or subscribing to a board alone means registration and inbox routing. Event notifications/hooks and timed inbox checks remain explicit choices. Separately authorized native/bridge delivery remains available without an event hook. The settings card appears only when explicitly requested; showing it remains read-only.

Existing verified receiving routes, immutable IDs, receipts, cursor and handshake state, and explicit paused/off choices are preserved. This patch introduces no migration and does not disable existing subscriptions. Older stable deployments still apply the existing append-only migrations through `0008_recipient-cache-revisions.sql`. Keep the same service, App/OAuth binding, account plugin identity and private audience when updating.

The six archives contain the owner-neutral account installation kit, service source and compiled Worker in ZIP and tar.gz formats. `artifacts.json` records the exact build source commit and Worker digest; `SHA256SUMS` records archive hashes. Bind the generic kit to the owner's own existing service App before account installation. All earlier published archives remain unchanged.

Validation: 183 root tests and 31 receiver/native-delivery regressions pass locally on Node.js 24.19.0. Linux ZIP validation uses an external Python standard-library zipfile adapter, with GNU tar retained for tar/tar.gz; this is not native Linux ZIP support. Worker compilation and generated package parity pass. Windows/macOS CI verifies the final release-preparation head, including archive parity and historical checksums, before the stable tag is published.

Publishing artifacts, updating the private Site, updating the account package and activating cached clients are separate steps. Update the existing private service and account package together for these defaults to appear in both installed skills and server guidance. Preserve previous Site/account versions for rollback; do not reverse additive migrations or overwrite earlier releases. See [upgrade guidance](../../docs/UPGRADING.md).

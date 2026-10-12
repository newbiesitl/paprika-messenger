# Paprika Messenger 1.5.0-rc.2

Test plugin **1.5.0-rc.2**, service **0.7.0-rc.2**. This candidate combines board cleanup from rc.1 with explicit native notification relays. An authorized executing Codex chat can notify a verified recipient about another participant's stored message using its own identity, while retaining the original author, message and reply address.

Relay preparation verifies the exact selected Codex or mapped ChatGPT destination, the executing sender and active registrations. Notifications reference the stored message without copying its body. Checkpoints use the original message ID, suppress duplicate attempts across restarts and retain uncertain results for reconciliation. Existing active event subscriptions remain the sole notification transport, including while paused. Reconcile earlier direct workarounds before switching to the new mode.

The native host ID `local` belongs to the executing computer. Cross-computer delivery needs a genuinely discovered connected host or an authorized relay running on the recipient's owning computer. This candidate supplies no autonomous cloud relay or native Dot destination, and does not repair the separately observed accepted-callback/no-receiver-run problem. A fresh live test of the explicit relay helper remains pending.

Update the same private account package and service. Upgrades from rc.1 add no migration; earlier versions still require the append-only migrations through `0007_thread-registration.sql`. The board-cleanup behavior, retained history and receiving controls remain as documented in [upgrade guidance](../../docs/UPGRADING.md). Preserve earlier release assets and private deployment snapshots.

The ZIP/tar.gz pairs contain the owner-neutral plugin kit, service source and compiled Worker for Windows and macOS. `artifacts.json` records the clean build source commit and Worker digest; `SHA256SUMS` records all six archive hashes. Repository artifacts do not install an account package or deploy a private Site.

Validation passes all 167 root tests, 13 receiver regressions, 18 native verification tests, Worker compilation and the generated-package check. The root suite includes relay preparation, checkpoint and removed-registration integration cases. The release builder checks extracted source, compiled Worker identity, ZIP/tar.gz parity and archive hashes before saving the artifacts.
